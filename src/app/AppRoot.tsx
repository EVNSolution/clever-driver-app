import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchDriverAndroidAppRelease,
} from '../api/dsvDriverAppRelease';
import {
  refreshDriverAccountSession,
  type DriverAuthSession,
} from '../api/dsvDriverAuth';
import {
  AUTO_LOGIN_RETRY_DELAY_MS,
  resolveDriverAuthRecoveryAction,
} from '../auth/driverAuthRecovery';
import {
  clearDriverAuthSession,
  readDriverAuthRefreshToken,
  saveDriverAuthSession,
} from '../auth/driverAuthSessionStore';
import {
  DRIVER_APP_INSTALL_PAGE_URL,
  isProductionDriverAndroidPackage,
} from '../config/driverAppInstall';
import {
  classifyDriverAppUpdate,
  retainDriverAppUpdateAfterLookupFailure,
  shouldPresentDriverAppUpdate,
  shouldRecheckDriverAppUpdate,
  type DriverAppUpdateState,
} from '../domain/appUpdate/driverAppUpdate';
import { readInstalledDriverAppVersion } from '../platform/expo/application/expoAppVersionService';
import {
  registerExpoDriverPushNotifications,
  revokeExpoDriverPushNotifications,
  subscribeToExpoDriverPushNotifications,
  subscribeToExpoDriverNotificationClicks,
  createExpoDriverNotificationRecovery,
  clearExpoDriverNotificationResponse,
  type DriverPushRegistrationState,
} from '../platform/expo/notifications/expoDriverNotificationService';
import { DriverAppUpdateScreen } from '../ui/appUpdate/DriverAppUpdateScreen';
import { AuthEntryScreen } from '../ui/auth/AuthEntryScreen';
import { DriverWorkspace } from '../ui/driver/DriverWorkspace';
import { DriverNotificationNotice, DriverOperationalInbox } from '../ui/driver/DriverOperationalInbox';
import { DRIVER_OPERATIONAL_ENABLED } from '../config/driverOperational';
import { acknowledgeDriverOperationalNotification, DriverOperationalApiError, loadDriverOperationalInbox } from '../api/dsvDriverOperational';
import { isDriverOperationalPushNotification } from '../domain/notifications/driverPushNotification';
import type { DriverNotificationClickLease } from '../domain/notifications/driverNotificationRecovery';
import { resolveDriverNotificationClick, type DriverNotificationDestination } from './driverNotificationNavigation';

const INSTALLED_APP_VERSION = readInstalledDriverAppVersion();
const CAN_CHECK_ANDROID_APP_UPDATE =
  Platform.OS === 'android'
  && INSTALLED_APP_VERSION !== null
  && isProductionDriverAndroidPackage(INSTALLED_APP_VERSION.packageId);
const INITIAL_APP_UPDATE_STATE: DriverAppUpdateState =
  CAN_CHECK_ANDROID_APP_UPDATE
    ? { kind: 'checking' }
    : { kind: 'unavailable' };
const APP_UPDATE_RECHECK_INTERVAL_MS = 5 * 60 * 1_000;
const APP_UPDATE_FAILURE_RETRY_INTERVAL_MS = 5 * 60 * 1_000;

export function AppRoot({ deliveryExceptionReasons = [] }: { shell?: boolean; deliveryExceptionReasons?: readonly { code: string; label: string; requiresExplanation?: boolean }[] } = {}) {
  const [appUpdateState, setAppUpdateState] = useState<DriverAppUpdateState>(INITIAL_APP_UPDATE_STATE);
  const [dismissedOptionalVersionCode, setDismissedOptionalVersionCode] = useState<number | null>(null);
  const [authSession, setAuthSession] = useState<DriverAuthSession | null>(null);
  const [notificationRefreshKey, setNotificationRefreshKey] = useState(0);
  const [inboxRefreshKey, setInboxRefreshKey] = useState(0);
  const [pushRegistrationRefreshKey, setPushRegistrationRefreshKey] = useState(0);
  const [isWorkProtected, setIsWorkProtected] = useState(false);
  const workProtectedRef = useRef(false);
  const workspaceVisibleRef = useRef(false);
  const [notificationHold, setNotificationHold] = useState<{ notificationId: string; continueWorking: boolean; moveRequested: boolean }>();
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(true);
  const [autoLoginAttempt, setAutoLoginAttempt] = useState(0);
  const [hasAutoLoginConnectionError, setHasAutoLoginConnectionError] =
    useState(false);
  const appUpdateCheckInFlight = useRef(false);
  const lastAppUpdateCheckAt = useRef<number | null>(null);
  const lastAppUpdateCheckSucceeded = useRef(false);
  const isMounted = useRef(true);
  const [notificationRecovery] = useState(createExpoDriverNotificationRecovery);
  const [clickAttempt, setClickAttempt] = useState(0);
  const [notificationRefreshId, setNotificationRefreshId] = useState<string>();
  const [notificationDestination, setNotificationDestination] = useState<DriverNotificationDestination>();
  const [notificationNotice, setNotificationNotice] = useState<{ message: string; retryable: boolean; ackOnClose?: boolean }>();
  const [pushRegistration, setPushRegistration] = useState<DriverPushRegistrationState>();
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const clickLease = useRef<DriverNotificationClickLease | null>(null);
  const authGeneration = useRef(0);
  const authWrites = useRef<Promise<unknown>>(Promise.resolve());
  const accountIdRef = useRef<string | null>(null);
  const authRecoveryInFlight = useRef<{ generation: number; promise: Promise<void> } | null>(null);

  useEffect(() => {
    void notificationRecovery.restore().then(() => setClickAttempt((value) => value + 1)).catch(() => setNotificationNotice({ message: '저장된 알림을 복구하지 못했습니다. 다시 눌러 주세요.', retryable: false }));
    return subscribeToExpoDriverNotificationClicks((notification) => {
      void notificationRecovery.receiveClick(notification)
        .then(() => setClickAttempt((value) => value + 1))
        .catch(() => setNotificationNotice({ message: '알림 이동을 저장하지 못했습니다. 다시 눌러 주세요.', retryable: false }));
    });
  }, [notificationRecovery]);

  const checkForAppUpdate = useCallback(async (force = false) => {
    if (!CAN_CHECK_ANDROID_APP_UPDATE || INSTALLED_APP_VERSION === null) {
      return;
    }
    const now = Date.now();
    if (
      appUpdateCheckInFlight.current
      || !shouldRecheckDriverAppUpdate({
        force,
        intervalMs: lastAppUpdateCheckSucceeded.current
          ? APP_UPDATE_RECHECK_INTERVAL_MS
          : APP_UPDATE_FAILURE_RETRY_INTERVAL_MS,
        lastCheckedAt: lastAppUpdateCheckAt.current,
        now,
      })
    ) {
      return;
    }
    appUpdateCheckInFlight.current = true;
    try {
      const release = await fetchDriverAndroidAppRelease();
      if (isMounted.current) {
        setAppUpdateState(classifyDriverAppUpdate({
          currentPackageId: INSTALLED_APP_VERSION.packageId,
          currentVersionCode: INSTALLED_APP_VERSION.versionCode,
          release,
        }));
      }
      lastAppUpdateCheckSucceeded.current = true;
    } catch {
      lastAppUpdateCheckSucceeded.current = false;
      if (isMounted.current) {
        setAppUpdateState(retainDriverAppUpdateAfterLookupFailure);
      }
    } finally {
      lastAppUpdateCheckAt.current = Date.now();
      appUpdateCheckInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    const initialCheck = setTimeout(() => {
      void checkForAppUpdate(true);
    }, 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkForAppUpdate(true);
        setNotificationRefreshKey((key) => key + 1);
        setInboxRefreshKey((key) => key + 1);
        setPushRegistrationRefreshKey((key) => key + 1);
      }
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void checkForAppUpdate();
    }, APP_UPDATE_RECHECK_INTERVAL_MS);
    return () => {
      isMounted.current = false;
      clearTimeout(initialCheck);
      clearInterval(interval);
      subscription.remove();
    };
  }, [checkForAppUpdate]);

  const acceptAuthSession = useCallback(async (session: DriverAuthSession, expectedGeneration?: number) => {
    if (expectedGeneration === undefined && accountIdRef.current !== null && accountIdRef.current !== session.account.id) authGeneration.current += 1;
    const generation = expectedGeneration ?? authGeneration.current;
    const write = authWrites.current.then(async () => {
      if (generation !== authGeneration.current) return;
      if (expectedGeneration !== undefined && accountIdRef.current !== null && accountIdRef.current !== session.account.id) throw new Error('AUTH_ACCOUNT_CHANGED');
      await saveDriverAuthSession(session);
      if (generation !== authGeneration.current) return;
      const accountChanged = accountIdRef.current !== null && accountIdRef.current !== session.account.id;
      await notificationRecovery.setAccount(session.account.id);
      if (generation !== authGeneration.current) return;
      if (accountChanged) {
        await clearExpoDriverNotificationResponse();
        clickLease.current = null;
        setNotificationDestination(undefined);
        setNotificationRefreshId(undefined);
        setNotificationHold(undefined);
        workProtectedRef.current = false;
        setIsWorkProtected(false);
        setNotificationNotice(undefined);
        setIsInboxOpen(false);
      }
      accountIdRef.current = session.account.id;
      setAutoLoginEnabled(true);
      setHasAutoLoginConnectionError(false);
      setAuthSession(session);
      setClickAttempt((value) => value + 1);
    });
    authWrites.current = write.catch(() => undefined);
    await write;
  }, [notificationRecovery]);

  const discardAuthSession = useCallback(async () => {
    authGeneration.current += 1;
    await notificationRecovery.setAccount(null);
    clickLease.current = null;
    setNotificationDestination(undefined);
    setNotificationRefreshId(undefined);
    setNotificationHold(undefined);
    workProtectedRef.current = false;
    setIsWorkProtected(false);
    setNotificationNotice(undefined);
    setIsInboxOpen(false);
    setAutoLoginEnabled(false);
    setHasAutoLoginConnectionError(false);
    setIsRestoringSession(false);
    setAuthSession(null);
    const write = authWrites.current.then(clearDriverAuthSession);
    authWrites.current = write.catch(() => undefined);
    await write;
  }, [notificationRecovery]);

  const logout = useCallback(async () => {
    const previous = authSession;
    const revoke = previous === null ? Promise.resolve() : revokeExpoDriverPushNotifications(previous.accessToken).catch(() => undefined);
    // Clear identity synchronously before any remote revocation can wait.
    const clearClicks = notificationRecovery.clearForLogout();
    accountIdRef.current = null;
    await discardAuthSession();
    await clearClicks;
    await clearExpoDriverNotificationResponse();
    await revoke;
  }, [authSession, discardAuthSession, notificationRecovery]);

  const recoverAuthentication = useCallback(async () => {
    if (authSession === null) return;
    const generation = authGeneration.current;
    if (authRecoveryInFlight.current?.generation === generation) return authRecoveryInFlight.current.promise;
    const promise = refreshDriverAccountSession({ refreshToken: authSession.refreshToken })
      .then((session) => acceptAuthSession(session, generation))
      .catch(async (error: unknown) => {
        if (generation !== authGeneration.current) return;
        if (resolveDriverAuthRecoveryAction(error) === 'discard') await discardAuthSession();
        else throw error;
      })
      .finally(() => { if (authRecoveryInFlight.current?.promise === promise) authRecoveryInFlight.current = null; });
    authRecoveryInFlight.current = { generation, promise };
    await promise;
  }, [acceptAuthSession, authSession, discardAuthSession]);

  const recoverCommandAuthentication = useCallback(() => {
    void recoverAuthentication().catch(() => setNotificationNotice({ message: '로그인 연결을 복구하지 못했습니다. 연결 후 다시 시도해 주세요.', retryable: true }));
  }, [recoverAuthentication]);

  useEffect(() => {
    if (authSession === null) return undefined;
    let active = true;
    const registrationChanged = (state: DriverPushRegistrationState) => { if (active) setPushRegistration(state); };
    void registerExpoDriverPushNotifications(authSession.accessToken).then(registrationChanged).catch(() => registrationChanged({ status: 'registration-error' }));
    const unsubscribe = subscribeToExpoDriverPushNotifications(
      authSession.accessToken,
      (notification) => {
        setInboxRefreshKey((key) => key + 1);
        if (!isDriverOperationalPushNotification(notification)) setNotificationRefreshKey((key) => key + 1);
      },
      registrationChanged,
    );
    return () => { active = false; unsubscribe(); };
  }, [authSession, pushRegistrationRefreshKey]);

  useEffect(() => {
    if (!autoLoginEnabled) {
      return undefined;
    }

    let isActive = true;
    const generation = authGeneration.current;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    void readDriverAuthRefreshToken()
      .then(async (refreshToken) => {
        if (refreshToken === null) {
          if (isActive) setAutoLoginEnabled(false);
          return;
        }
        const session = await refreshDriverAccountSession({ refreshToken });
        if (!isActive) return;
        await acceptAuthSession(session, generation);
      })
      .catch(async (error: unknown) => {
        if (resolveDriverAuthRecoveryAction(error) === 'discard') {
          await clearDriverAuthSession();
          if (isActive) setAutoLoginEnabled(false);
          return;
        }
        if (isActive) {
          setHasAutoLoginConnectionError(true);
          retryTimeout = setTimeout(
            () => {
              setIsRestoringSession(true);
              setAutoLoginAttempt((attempt) => attempt + 1);
            },
            AUTO_LOGIN_RETRY_DELAY_MS,
          );
        }
      })
      .finally(() => {
        if (isActive) setIsRestoringSession(false);
      });
    return () => {
      isActive = false;
      if (retryTimeout !== undefined) clearTimeout(retryTimeout);
    };
  }, [acceptAuthSession, autoLoginAttempt, autoLoginEnabled]);

  useEffect(() => {
    if (authSession === null) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recoverAuthentication().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [authSession, recoverAuthentication]);

  useEffect(() => {
    if (authSession === null) return undefined;
    const refreshAt = Date.parse(authSession.expiresAt) - 60_000;
    const delay = Math.max(0, Math.min(refreshAt - Date.now(), 2_147_000_000));
    let timeout: ReturnType<typeof setTimeout>;
    let active = true;
    const generation = authGeneration.current;
    const refreshSession = () => {
      void recoverAuthentication()
        .catch((error: unknown) => {
          if (!active || generation !== authGeneration.current) return;
          if (resolveDriverAuthRecoveryAction(error) === 'discard') {
            void discardAuthSession();
            return;
          }
          timeout = setTimeout(refreshSession, 30_000);
        });
    };
    timeout = setTimeout(refreshSession, delay);
    return () => { active = false; clearTimeout(timeout); };
  }, [authSession, discardAuthSession, recoverAuthentication]);

  useEffect(() => {
    if (authSession === null || clickLease.current !== null) return;
    const lease = notificationRecovery.acquirePending();
    if (lease === null) return;
    clickLease.current = lease;
    if (workProtectedRef.current) {
      setIsInboxOpen(false);
      setNotificationHold({ notificationId: lease.notification.notificationId, continueWorking: false, moveRequested: false });
      return;
    }
    if (!DRIVER_OPERATIONAL_ENABLED && isDriverOperationalPushNotification(lease.notification)) {
      void Promise.resolve().then(() => {
        if (notificationRecovery.isCurrent(lease)) {
          setIsInboxOpen(false);
          setNotificationNotice({ message: '운영 알림 기능은 검증 서버 연결 후 사용할 수 있습니다.', retryable: false });
        }
      });
      return;
    }
    const generation = authGeneration.current;
    void resolveDriverNotificationClick(lease.notification, authSession.accessToken)
      .then(async (navigation) => {
        if (!notificationRecovery.isCurrent(lease)) return;
        if (workProtectedRef.current) {
          setNotificationHold({ notificationId: lease.notification.notificationId, continueWorking: false, moveRequested: false });
          return;
        }
        setIsInboxOpen(false);
        if (navigation.kind === 'destination') {
          setNotificationNotice(undefined);
          setNotificationHold(undefined);
          setNotificationDestination(navigation.destination);
        }
        else if (navigation.kind === 'notice') setNotificationNotice({ message: navigation.message, retryable: false, ackOnClose: navigation.acknowledgeOpened });
        else {
          setNotificationNotice(undefined);
          setNotificationHold(undefined);
          setNotificationRefreshId(lease.notification.notificationId);
          setNotificationRefreshKey((key) => key + 1);
        }
      })
      .catch(async (error: unknown) => {
        if (!notificationRecovery.isCurrent(lease)) return;
        if (workProtectedRef.current) {
          setNotificationHold({ notificationId: lease.notification.notificationId, continueWorking: false, moveRequested: false });
          return;
        }
        if (error instanceof DriverOperationalApiError && error.status === 401) {
          notificationRecovery.release(lease);
          clickLease.current = null;
          try { await recoverAuthentication(); }
          catch { if (generation === authGeneration.current) setNotificationNotice({ message: '로그인 연결을 복구하지 못했습니다. 다시 시도해 주세요.', retryable: true }); }
          return;
        }
        const unavailable = error instanceof DriverOperationalApiError && [403, 404, 409, 410].includes(error.status);
        setNotificationNotice({ message: unavailable
          ? '배차가 취소·재배정되었거나 알림이 만료되었습니다. 최신 알림함을 확인해 주세요.'
          : '알림 화면을 확인하지 못했습니다. 연결 복구 후 다시 시도해 주세요.', retryable: !unavailable });
      });
  }, [authSession, clickAttempt, notificationRecovery, recoverAuthentication]);

  const acceptNotificationDestination = useCallback(async (notificationId: string) => {
    const generation = authGeneration.current;
    const lease = clickLease.current;
    if (!workspaceVisibleRef.current || workProtectedRef.current || lease === null || authSession === null || lease.notification.notificationId !== notificationId || !notificationRecovery.isCurrent(lease)) return;
    try {
      if (isDriverOperationalPushNotification(lease.notification)) {
        await acknowledgeDriverOperationalNotification(authSession.accessToken, notificationId, 'OPENED');
      }
      if (!notificationRecovery.isCurrent(lease)) return;
      const accepted = await notificationRecovery.accept(lease);
      if (!accepted || generation !== authGeneration.current || accountIdRef.current !== lease.accountId) return;
      await clearExpoDriverNotificationResponse().catch(() => undefined);
      if (generation !== authGeneration.current || clickLease.current !== lease || accountIdRef.current !== lease.accountId) return;
      clickLease.current = null;
      setNotificationDestination(undefined);
      setNotificationRefreshId(undefined);
      setNotificationNotice(undefined);
      setClickAttempt((value) => value + 1);
    } catch {
      if (notificationRecovery.isCurrent(lease)) setNotificationNotice({ message: '알림 열람 기록을 저장하지 못했습니다. 다시 시도해 주세요.', retryable: true });
    }
  }, [authSession, notificationRecovery]);

  const rejectNotificationDestination = useCallback((notificationId: string) => {
    const lease = clickLease.current;
    if (lease === null || lease.notification.notificationId !== notificationId || !notificationRecovery.isCurrent(lease)) return;
    setNotificationNotice({ message: '현재 배정된 배송지를 확인할 수 없습니다. 최신 배차를 확인해 주세요.', retryable: false });
  }, [notificationRecovery]);

  function retryNotification() {
    setNotificationHold(undefined);
    const lease = clickLease.current;
    if (lease !== null) notificationRecovery.release(lease);
    clickLease.current = null;
    setNotificationDestination(undefined);
    setNotificationRefreshId(undefined);
    setNotificationNotice(undefined);
    setClickAttempt((value) => value + 1);
  }

  const reportWorkProtection = useCallback((value: boolean) => {
    workProtectedRef.current = value;
    setIsWorkProtected(value);
  }, []);

  const deferNotificationDestination = useCallback((notificationId: string) => {
    const lease = clickLease.current;
    if (lease === null || lease.notification.notificationId !== notificationId || !notificationRecovery.isCurrent(lease)) return;
    setNotificationDestination(undefined);
    setNotificationRefreshId(undefined);
    setNotificationHold({ notificationId, continueWorking: false, moveRequested: false });
  }, [notificationRecovery]);

  useEffect(() => {
    if (notificationHold?.moveRequested && !isWorkProtected) {
      const lease = clickLease.current;
      if (lease !== null && lease.notification.notificationId === notificationHold.notificationId && notificationRecovery.isCurrent(lease)) {
        notificationRecovery.release(lease);
        clickLease.current = null;
        setNotificationDestination(undefined);
        setNotificationRefreshId(undefined);
        setNotificationNotice(undefined);
        setNotificationHold(undefined);
        setClickAttempt((value) => value + 1);
      }
    }
  }, [isWorkProtected, notificationHold, notificationRecovery]);

  const dismissNotification = useCallback(async () => {
    const lease = clickLease.current;
    const generation = authGeneration.current;
    const notice = notificationNotice;
    const remainsCurrent = () => generation === authGeneration.current && clickLease.current === lease
      && (lease === null || accountIdRef.current === lease.accountId);
    if (lease !== null) {
      if (notice?.ackOnClose && authSession !== null) {
        try { await acknowledgeDriverOperationalNotification(authSession.accessToken, lease.notification.notificationId, 'OPENED'); }
        catch {
          if (remainsCurrent() && notificationRecovery.isCurrent(lease)) setNotificationNotice({ message: '알림 열람 기록을 저장하지 못했습니다. 다시 시도해 주세요.', retryable: true });
          return;
        }
        if (!remainsCurrent() || !notificationRecovery.isCurrent(lease)) return;
      }
      if (notice?.retryable) notificationRecovery.release(lease);
      else {
        try {
          const accepted = await notificationRecovery.accept(lease);
          if (!accepted || !remainsCurrent()) return;
        } catch {
          if (remainsCurrent()) setNotificationNotice({ message: '알림 처리 기록을 저장하지 못했습니다. 다시 시도해 주세요.', retryable: true });
          return;
        }
      }
    }
    if (!remainsCurrent()) return;
    clickLease.current = null;
    setNotificationDestination(undefined);
    setNotificationRefreshId(undefined);
    setNotificationNotice(undefined);
    if (!notice?.retryable) {
      await clearExpoDriverNotificationResponse().catch(() => undefined);
      if (generation === authGeneration.current && clickLease.current === null) setClickAttempt((value) => value + 1);
    }
  }, [authSession, notificationNotice, notificationRecovery]);

  useEffect(() => {
    if (Platform.OS !== 'android' || authSession === null || (!isInboxOpen && notificationNotice === undefined)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (notificationNotice !== undefined) void dismissNotification();
      else setIsInboxOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [authSession, dismissNotification, isInboxOpen, notificationNotice]);

  async function openInboxNotification(notificationId: string) {
    if (authSession === null) return;
    const generation = authGeneration.current;
    const accountId = authSession.account.id;
    // Inbox identity is reloaded from the authenticated list; its summary is never a destination.
    try {
      let page = await loadDriverOperationalInbox(authSession.accessToken);
      let item = page.items.find((entry) => entry.id === notificationId);
      while (item === undefined && page.nextCursor !== null) {
        if (generation !== authGeneration.current || accountIdRef.current !== accountId) return;
        page = await loadDriverOperationalInbox(authSession.accessToken, page.nextCursor);
        item = page.items.find((entry) => entry.id === notificationId);
      }
      if (item === undefined || generation !== authGeneration.current || accountIdRef.current !== accountId) return;
      await notificationRecovery.receiveClick({ kind: item.kind, notificationId, schemaVersion: '1', expiresAt: item.expiresAt, status: Date.parse(item.expiresAt) > Date.now() ? 'current' : 'expired' }, { reopen: true });
      if (generation !== authGeneration.current || accountIdRef.current !== accountId) return;
      setClickAttempt((value) => value + 1);
      setIsInboxOpen(false);
    } catch { if (generation === authGeneration.current && accountIdRef.current === accountId) setNotificationNotice({ message: '알림을 확인하지 못했습니다. 다시 시도해 주세요.', retryable: true }); }
  }

  const canPresentAppUpdate = authSession !== null || !isRestoringSession;
  const shouldShowAppUpdate = canPresentAppUpdate && shouldPresentDriverAppUpdate({
    dismissedOptionalVersionCode,
    state: appUpdateState,
  });

  const isWorkspaceVisible = authSession !== null && !isRestoringSession && !shouldShowAppUpdate &&
    notificationNotice === undefined && !isInboxOpen;
  useLayoutEffect(() => { workspaceVisibleRef.current = isWorkspaceVisible; }, [isWorkspaceVisible]);

  const protectedNotificationOverlay = (
    notificationHold !== undefined ? (
      <SafeAreaView accessibilityRole="alert" edges={['bottom', 'left', 'right']} style={styles.notificationHold}>
        {notificationHold.continueWorking ? (
          <Pressable accessibilityRole="button" onPress={() => setNotificationHold({ ...notificationHold, continueWorking: false })}>
            <Text>보류된 알림</Text>
          </Pressable>
        ) : (
          <>
            <Text>알림 이동을 보류했습니다. 현재 입력과 화면을 유지합니다.</Text>
            <Text>{notificationHold.moveRequested
              ? '현재 작업을 저장하거나 종료하면 알림 목적지를 다시 확인하고 이동합니다.'
              : '알림으로 이동하려면 현재 작업을 저장하거나 종료해 주세요.'}</Text>
            <View style={styles.notificationHoldActions}>
              <Pressable accessibilityRole="button" onPress={() => setNotificationHold({ ...notificationHold, continueWorking: true, moveRequested: false })} style={styles.notificationHoldButton}>
                <Text style={styles.notificationHoldButtonText}>현재 작업 계속</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setNotificationHold({ ...notificationHold, moveRequested: true })} style={[styles.notificationHoldButton, styles.notificationHoldMoveButton]}>
                <Text style={[styles.notificationHoldButtonText, styles.notificationHoldMoveButtonText]}>알림으로 이동</Text>
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    ) : null
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <SafeAreaView
            edges={authSession !== null && !shouldShowAppUpdate
              ? ['top', 'left', 'right']
              : ['top', 'right', 'bottom', 'left']}
            style={styles.safeArea}
          >
          <StatusBar style="dark" />
          {shouldShowAppUpdate && (
            appUpdateState.kind === 'required_update'
            || appUpdateState.kind === 'optional_update'
          ) ? (
            <DriverAppUpdateScreen
              currentVersionName={INSTALLED_APP_VERSION?.versionName ?? '-'}
              isRequired={appUpdateState.kind === 'required_update'}
              onDismiss={() => {
                setDismissedOptionalVersionCode(appUpdateState.release.latestVersionCode);
              }}
              onUpdate={() => {
                void Linking.openURL(DRIVER_APP_INSTALL_PAGE_URL).catch(() => {
                  Alert.alert(
                    '업데이트 링크 오류',
                    '설치 페이지를 열지 못했습니다. 잠시 후 다시 시도해 주세요.',
                  );
                });
              }}
              release={appUpdateState.release}
            />
          ) : authSession === null && hasAutoLoginConnectionError ? (
            <View style={styles.recoveryState}>
              <ActivityIndicator color="#0b57d0" size="large" />
              <Text style={styles.recoveryTitle}>
                자동 로그인을 다시 연결하고 있습니다.
              </Text>
              <Text style={styles.recoveryText}>
                저장된 로그인은 유지됩니다. 서버 연결이 복구되면 자동으로
                들어갑니다.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setIsRestoringSession(true);
                  setAutoLoginAttempt((attempt) => attempt + 1);
                }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>지금 다시 시도</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setAutoLoginEnabled(false);
                  setHasAutoLoginConnectionError(false);
                  setIsRestoringSession(false);
                }}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>아이디로 로그인</Text>
              </Pressable>
            </View>
          ) : isRestoringSession ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#0b57d0" size="large" />
            </View>
          ) : authSession === null ? (
            <AuthEntryScreen onAuthenticated={acceptAuthSession} />
          ) : (
            <View style={styles.root}>
              <View style={[styles.root, (notificationNotice !== undefined || isInboxOpen) && styles.hiddenWorkspace]}>
                {pushRegistration?.status === 'permission-denied' ? <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings(); }} style={styles.inboxButton}><Text>알림 권한이 꺼져 있습니다. 설정 열기</Text></Pressable> : null}
                {DRIVER_OPERATIONAL_ENABLED ? <Pressable accessibilityRole="button" onPress={() => setIsInboxOpen(true)} style={styles.inboxButton}><Text style={styles.secondaryButtonText}>알림함</Text></Pressable> : null}
                <DriverWorkspace
                  key={authSession.account.id}
                  authSession={authSession}
                  isVisible={isWorkspaceVisible}
                  deliveryExceptionReasons={deliveryExceptionReasons}
                  notificationDestination={notificationDestination}
                  notificationRefreshId={notificationRefreshId}
                  onNotificationDestinationAccepted={acceptNotificationDestination}
                  onNotificationDestinationRejected={rejectNotificationDestination}
                  onNotificationDestinationDeferred={deferNotificationDestination}
                  onWorkProtectionChange={reportWorkProtection}
                  protectedNotificationOverlay={protectedNotificationOverlay}
                  onAuthenticationRequired={recoverCommandAuthentication}
                  onLogout={logout}
                  refreshRequestKey={notificationRefreshKey}
                />
              </View>
              {notificationNotice !== undefined ? (
                <DriverNotificationNotice message={notificationNotice.message} onClose={() => { void dismissNotification(); }} onRetry={notificationNotice.retryable ? retryNotification : undefined} />
              ) : isInboxOpen ? (
                <DriverOperationalInbox refreshRequestKey={inboxRefreshKey} accessToken={authSession.accessToken} key={authSession.account.id} onClose={() => setIsInboxOpen(false)} onOpen={(id) => { void openInboxNotification(id); }} />
              ) : null}
            </View>
          )}
          </SafeAreaView>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hiddenWorkspace: { display: 'none' },
  notificationHold: {
    backgroundColor: '#fff4db',
    gap: 8,
    paddingBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  notificationHoldActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  notificationHoldButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d0d5dd',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  notificationHoldButtonText: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '700',
  },
  notificationHoldMoveButton: {
    backgroundColor: '#0b57d0',
    borderColor: '#0b57d0',
  },
  notificationHoldMoveButtonText: { color: '#ffffff' },
  inboxButton: { alignItems: 'flex-end', paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#fff' },
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f9fc',
  },
  loadingState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#0b57d0',
    borderRadius: 12,
    marginTop: 28,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  recoveryState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  recoveryText: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  recoveryTitle: {
    color: '#1d2939',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 18,
    textAlign: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderColor: '#d0d5dd',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '700',
  },
});
