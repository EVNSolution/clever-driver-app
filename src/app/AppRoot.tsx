import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import type { DriverAuthSession } from '../api/dsvDriverAuth';
import { AuthEntryScreen } from '../ui/auth/AuthEntryScreen';
import { DriverWorkspace } from '../ui/driver/DriverWorkspace';

export function AppRoot() {
  const [authSession, setAuthSession] = useState<DriverAuthSession | null>(null);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="dark" />
          {authSession === null ? (
            <AuthEntryScreen onAuthenticated={setAuthSession} />
          ) : (
            <DriverWorkspace
              authSession={authSession}
              onLogout={() => setAuthSession(null)}
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
});
