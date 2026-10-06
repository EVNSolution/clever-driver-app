import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerDriverOperationalCapability } from '../../../api/dsvDriverOperational';
import { registerDriverPushTokenWithCapability, revokeDriverPushToken } from '../../../api/dsvDriverPushToken';
import { DRIVER_OPERATIONAL_ENABLED } from '../../../config/driverOperational';
import { createDriverNotificationRecovery } from '../../../domain/notifications/driverNotificationRecovery';
import {
  classifyDriverNotificationClick,
  parseDriverPushNotification,
  type DriverNotificationClick,
  type DriverPushNotification,
} from '../../../domain/notifications/driverPushNotification';

const DRIVER_ANDROID_APP_ID = 'com.evnsolution.clever.driver';
const ROUTE_UPDATES_CHANNEL_ID = 'route-updates';
const STORED_PUSH_TOKEN_KEY = 'driver.push.device-token';
let pushSession: { accessToken: string; generation: number } | null = null;
let pushGeneration = 0;
let pushOwnerAccessToken: string | null = null;
let registrationTail: Promise<unknown> = Promise.resolve();

export type DriverPushRegistrationState = {
  status: 'registered' | 'permission-denied' | 'unsupported-device' | 'token-unavailable' | 'registration-error';
  canAskAgain?: boolean;
};

export function createExpoDriverNotificationRecovery() {
  return createDriverNotificationRecovery(AsyncStorage);
}
export function configureExpoDriverPushNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true,
    }),
  });
  if (isSupportedAndroid()) void ensureAndroidNotificationChannel().catch(() => undefined);
}

export async function registerExpoDriverPushNotifications(accessToken: string): Promise<DriverPushRegistrationState> {
  if (!isSupportedAndroid()) return { status: 'unsupported-device' };
  const session = beginPushSession(accessToken);
  await ensureAndroidNotificationChannel();
  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted && permissions.canAskAgain) permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) return { status: 'permission-denied', canAskAgain: permissions.canAskAgain };
  if (!isCurrentSession(session)) return { status: 'registration-error' };
  const token = await Notifications.getDevicePushTokenAsync();
  if (typeof token.data !== 'string' || token.data.trim() === '') return { status: 'token-unavailable' };
  await registerToken(session, token.data);
  return { status: isCurrentSession(session) ? 'registered' : 'registration-error' };
}

export function revokeExpoDriverPushNotifications(accessToken: string): Promise<void> {
  // An old account or access-token generation must not invalidate the current registration.
  if (pushOwnerAccessToken !== null && pushOwnerAccessToken !== accessToken) return Promise.resolve();
  pushGeneration += 1;
  pushSession = null;
  pushOwnerAccessToken = null;
  // Append the complete revocation now. A later account's PUT must wait for this DELETE.
  const operation = registrationTail.catch(() => undefined).then(async () => {
    const token = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
    if (token === null) return;
    await revokeDriverPushToken(accessToken, token);
    if (await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY) === token) {
      await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
    }
  });
  registrationTail = operation;
  return operation;
}

/** Subscribed before authentication. Receipt is separate from a user's notification click. */
export function subscribeToExpoDriverNotificationClicks(onClick: (notification: DriverNotificationClick) => void): () => void {
  if (!isSupportedAndroid()) return () => undefined;
  let active = true;
  const emit = (event: Notifications.NotificationResponse) => {
    if (!active) return;
    onClick(classifyDriverNotificationClick(
      event.notification.request.identifier,
      event.notification.request.content.data ?? {},
    ));
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(emit);
  void Notifications.getLastNotificationResponseAsync().then((event) => {
    if (event !== null) emit(event);
  }).catch(() => undefined);
  return () => { active = false; subscription.remove(); };
}

export async function clearExpoDriverNotificationResponse(): Promise<void> {
  if (isSupportedAndroid()) await Notifications.clearLastNotificationResponseAsync();
}

/** Receipts refresh the inbox only. They never resolve a destination or acknowledge OPENED. */
export function subscribeToExpoDriverPushNotifications(
  accessToken: string,
  onNotification: (notification: DriverPushNotification) => void,
  onRegistrationState?: (state: DriverPushRegistrationState) => void,
): () => void {
  if (!isSupportedAndroid()) return () => undefined;
  const session = beginPushSession(accessToken);
  let active = true;
  const received = Notifications.addNotificationReceivedListener((notification) => {
    if (!active || !isCurrentSession(session)) return;
    const parsed = parseDriverPushNotification(notification.request.identifier, notification.request.content.data ?? {});
    if (parsed !== null) onNotification(parsed);
  });
  const token = Notifications.addPushTokenListener((nextToken) => {
    if (typeof nextToken.data !== 'string' || !active || !isCurrentSession(session)) return;
    void registerToken(session, nextToken.data).then(() => {
      if (active && isCurrentSession(session)) onRegistrationState?.({ status: 'registered' });
    }).catch(() => {
      if (active && isCurrentSession(session)) onRegistrationState?.({ status: 'registration-error' });
    });
  });
  return () => {
    active = false;
    received.remove();
    token.remove();
    if (isCurrentSession(session)) { pushGeneration += 1; pushSession = null; }
  };
}

function registerToken(session: NonNullable<typeof pushSession>, devicePushToken: string): Promise<void> {
  const operation = registrationTail.catch(() => undefined).then(async () => {
    if (!isCurrentSession(session)) return;
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted || !isCurrentSession(session)) return;
    const localeAndTimezone = Intl.DateTimeFormat().resolvedOptions();
    await registerDriverPushTokenWithCapability(session.accessToken, {
      appId: DRIVER_ANDROID_APP_ID,
      appVersion: Application.nativeApplicationVersion ?? undefined,
      deviceId: Application.getAndroidId(),
      devicePushToken,
      locale: localeAndTimezone.locale,
      platform: 'android',
      timezone: localeAndTimezone.timeZone,
    }, {
      isCurrent: () => isCurrentSession(session),
      operationalEnabled: DRIVER_OPERATIONAL_ENABLED,
      registerCapability: registerDriverOperationalCapability,
      onTokenRegistered: () => AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, devicePushToken),
    });
  });
  registrationTail = operation;
  return operation;
}
function beginPushSession(accessToken: string): NonNullable<typeof pushSession> {
  if (pushSession?.accessToken === accessToken) return pushSession;
  pushOwnerAccessToken = accessToken;
  pushSession = { accessToken, generation: ++pushGeneration };
  return pushSession;
}
function isCurrentSession(session: NonNullable<typeof pushSession>): boolean {
  return pushSession?.generation === session.generation;
}
function isSupportedAndroid(): boolean {
  return Platform.OS === 'android' && Application.applicationId === DRIVER_ANDROID_APP_ID;
}
async function ensureAndroidNotificationChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(ROUTE_UPDATES_CHANNEL_ID, {
    importance: Notifications.AndroidImportance.HIGH,
    name: '배송 변경 알림',
    vibrationPattern: [0, 250, 150, 250],
  });
}
