import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  registerDriverPushToken,
  revokeDriverPushToken,
} from '../../../api/dsvDriverPushToken';
import {
  parseDriverPushNotification,
  type DriverPushNotification,
} from '../../../domain/notifications/driverPushNotification';

const DRIVER_ANDROID_APP_ID = 'com.evnsolution.clever.driver';
const ROUTE_UPDATES_CHANNEL_ID = 'route-updates';
const STORED_PUSH_TOKEN_KEY = 'driver.push.device-token';
const LAST_HANDLED_NOTIFICATION_KEY = 'driver.push.last-handled-notification';

export function configureExpoDriverPushNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') void ensureAndroidNotificationChannel();
}

export async function registerExpoDriverPushNotifications(
  accessToken: string,
): Promise<void> {
  if (Platform.OS !== 'android' || Application.applicationId !== DRIVER_ANDROID_APP_ID) {
    return;
  }
  await ensureAndroidNotificationChannel();
  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) {
    permissions = await Notifications.requestPermissionsAsync();
  }
  if (!permissions.granted) return;

  const token = await Notifications.getDevicePushTokenAsync();
  if (typeof token.data !== 'string' || token.data.trim() === '') return;
  await registerToken(accessToken, token.data);
}

export async function revokeExpoDriverPushNotifications(
  accessToken: string,
): Promise<void> {
  const token = await AsyncStorage.getItem(STORED_PUSH_TOKEN_KEY);
  if (token === null) return;
  await revokeDriverPushToken(accessToken, token);
  await AsyncStorage.removeItem(STORED_PUSH_TOKEN_KEY);
}

export function subscribeToExpoDriverPushNotifications(
  accessToken: string,
  onNotification: (notification: DriverPushNotification) => void,
): () => void {
  if (Platform.OS !== 'android' || Application.applicationId !== DRIVER_ANDROID_APP_ID) {
    return () => undefined;
  }
  const received = Notifications.addNotificationReceivedListener((notification) => {
    const parsed = parseNotification(notification);
    if (parsed !== null) onNotification(parsed);
  });
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    void handleNotificationResponse(event, onNotification);
  });
  const token = Notifications.addPushTokenListener((nextToken) => {
    if (typeof nextToken.data === 'string') {
      void registerToken(accessToken, nextToken.data).catch(() => undefined);
    }
  });
  void Notifications.getLastNotificationResponseAsync()
    .then((event) => {
      if (event !== null) return handleNotificationResponse(event, onNotification);
    })
    .catch(() => undefined);

  return () => {
    received.remove();
    response.remove();
    token.remove();
  };
}

async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  onNotification: (notification: DriverPushNotification) => void,
): Promise<void> {
  const parsed = parseNotification(response.notification);
  if (parsed === null) return;
  const lastHandled = await AsyncStorage.getItem(LAST_HANDLED_NOTIFICATION_KEY);
  if (lastHandled === parsed.notificationId) return;
  await AsyncStorage.setItem(LAST_HANDLED_NOTIFICATION_KEY, parsed.notificationId);
  onNotification(parsed);
}

function parseNotification(
  notification: Notifications.Notification,
): DriverPushNotification | null {
  return parseDriverPushNotification(
    notification.request.identifier,
    notification.request.content.data ?? {},
  );
}

async function registerToken(accessToken: string, devicePushToken: string): Promise<void> {
  const localeAndTimezone = Intl.DateTimeFormat().resolvedOptions();
  await registerDriverPushToken(accessToken, {
    appId: DRIVER_ANDROID_APP_ID,
    appVersion: Application.nativeApplicationVersion ?? undefined,
    deviceId: Application.getAndroidId(),
    devicePushToken,
    locale: localeAndTimezone.locale,
    platform: 'android',
    timezone: localeAndTimezone.timeZone,
  });
  await AsyncStorage.setItem(STORED_PUSH_TOKEN_KEY, devicePushToken);
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(ROUTE_UPDATES_CHANNEL_ID, {
    importance: Notifications.AndroidImportance.HIGH,
    name: '배송 변경 알림',
    vibrationPattern: [0, 250, 150, 250],
  });
}
