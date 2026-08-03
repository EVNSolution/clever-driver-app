import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

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
import { AuthEntryScreen } from '../ui/auth/AuthEntryScreen';
import { DriverWorkspace } from '../ui/driver/DriverWorkspace';

export function AppRoot() {
  const [authSession, setAuthSession] = useState<DriverAuthSession | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [autoLoginEnabled, setAutoLoginEnabled] = useState(true);
  const [autoLoginAttempt, setAutoLoginAttempt] = useState(0);
  const [hasAutoLoginConnectionError, setHasAutoLoginConnectionError] =
    useState(false);

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

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="dark" />
          {authSession === null && hasAutoLoginConnectionError ? (
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
              onLogout={discardAuthSession}
            />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
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
