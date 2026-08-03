import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  AuthApiError,
  refreshDriverAccountSession,
  type DriverAuthSession,
} from '../api/dsvDriverAuth';
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

  const acceptAuthSession = useCallback(async (session: DriverAuthSession) => {
    await saveDriverAuthSession(session);
    setAuthSession(session);
  }, []);

  const discardAuthSession = useCallback(async () => {
    setAuthSession(null);
    await clearDriverAuthSession();
  }, []);

  useEffect(() => {
    let isActive = true;
    void readDriverAuthRefreshToken()
      .then(async (refreshToken) => {
        if (refreshToken === null) return;
        const session = await refreshDriverAccountSession({ refreshToken });
        if (!isActive) return;
        await acceptAuthSession(session);
      })
      .catch(async (error: unknown) => {
        if (error instanceof AuthApiError && error.code === 'SESSION_EXPIRED') {
          await clearDriverAuthSession();
        }
      })
      .finally(() => {
        if (isActive) setIsRestoringSession(false);
      });
    return () => {
      isActive = false;
    };
  }, [acceptAuthSession]);

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
          if (error instanceof AuthApiError && error.code === 'SESSION_EXPIRED') {
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
          {isRestoringSession ? (
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
});
