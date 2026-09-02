import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
} from '../platform/expo/notifications/expoDriverNotificationService';
import { DriverAppUpdateScreen } from '../ui/appUpdate/DriverAppUpdateScreen';
import { AuthEntryScreen } from '../ui/auth/AuthEntryScreen';
import { DriverWorkspace } from '../ui/driver/DriverWorkspace';

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

export function AppRoot() {
  const [appUpdateState, setAppUpdateState] = useState<DriverAppUpdateState>(INITIAL_APP_UPDATE_STATE);
  const [dismissedOptionalVersionCode, setDismissedOptionalVersionCode] = useState<number | null>(null);
  const [authSession, setAuthSession] = useState<DriverAuthSession | null>(null);
  const [notificationRefreshKey, setNotificationRefreshKey] = useState(0);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(true);
  const [autoLoginAttempt, setAutoLoginAttempt] = useState(0);
  const [hasAutoLoginConnectionError, setHasAutoLoginConnectionError] =
    useState(false);
  const appUpdateCheckInFlight = useRef(false);
  const lastAppUpdateCheckAt = useRef<number | null>(null);
  const lastAppUpdateCheckSucceeded = useRef(false);
  const isMounted = useRef(true);

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

  const acceptAuthSession = useCallback(async (session: DriverAuthSession) => {
    await saveDriverAuthSession(session);
    setAutoLoginEnabled(true);
    setHasAutoLoginConnectionError(false);
    setAuthSession(session);
  }, []);

  const discardAuthSession = useCallback(async () => {
    setAutoLoginEnabled(false);
    setHasAutoLoginConnectionError(false);
    setIsRestoringSession(false);
    setAuthSession(null);
    await clearDriverAuthSession();
  }, []);

  const logout = useCallback(async () => {
    if (authSession !== null) {
      try {
        await revokeExpoDriverPushNotifications(authSession.accessToken);
      } catch {
        // Logout must remain available when the push-token endpoint is unavailable.
      }
    }
    await discardAuthSession();
  }, [authSession, discardAuthSession]);

  useEffect(() => {
    if (authSession === null) return undefined;
    void registerExpoDriverPushNotifications(authSession.accessToken).catch(() => undefined);
    return subscribeToExpoDriverPushNotifications(
      authSession.accessToken,
      () => setNotificationRefreshKey((key) => key + 1),
    );
  }, [authSession]);

  useEffect(() => {
    if (!autoLoginEnabled) {
      return undefined;
    }

    let isActive = true;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    void readDriverAuthRefreshToken()
      .then(async (refreshToken) => {
        if (refreshToken === null) {
          if (isActive) setAutoLoginEnabled(false);
          return;
        }
        const session = await refreshDriverAccountSession({ refreshToken });
        if (!isActive) return;
        await acceptAuthSession(session);
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
    const refreshAt = Date.parse(authSession.expiresAt) - 60_000;
    const delay = Math.max(0, Math.min(refreshAt - Date.now(), 2_147_000_000));
    let timeout: ReturnType<typeof setTimeout>;
    const refreshSession = () => {
      void refreshDriverAccountSession({
        refreshToken: authSession.refreshToken,
      })
        .then(acceptAuthSession)
        .catch((error: unknown) => {
          if (resolveDriverAuthRecoveryAction(error) === 'discard') {
            void discardAuthSession();
            return;
          }
          timeout = setTimeout(refreshSession, 30_000);
        });
    };
    timeout = setTimeout(refreshSession, delay);
    return () => clearTimeout(timeout);
  }, [acceptAuthSession, authSession, discardAuthSession]);

  const canPresentAppUpdate = authSession !== null || !isRestoringSession;
  const shouldShowAppUpdate = canPresentAppUpdate && shouldPresentDriverAppUpdate({
    dismissedOptionalVersionCode,
    state: appUpdateState,
  });

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
            <DriverWorkspace
              authSession={authSession}
              onLogout={logout}
              refreshRequestKey={notificationRefreshKey}
            />
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
