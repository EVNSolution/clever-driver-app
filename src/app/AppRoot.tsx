import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export function AppRoot() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.content}>
          <Text style={styles.eyebrow}>EV&amp; SOLUTION</Text>
          <Text style={styles.title}>CLEVER Driver</Text>
          <Text style={styles.description}>
            DSV 배송원을 위한 앱 기반 구성이 완료되었습니다.
          </Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F8F2',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  eyebrow: {
    marginBottom: 12,
    color: '#5A6417',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  title: {
    color: '#171914',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  description: {
    marginTop: 14,
    maxWidth: 320,
    color: '#53574C',
    fontSize: 17,
    lineHeight: 25,
  },
});
