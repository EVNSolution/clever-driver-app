import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DriverAppRelease } from '../../domain/appUpdate/driverAppUpdate';

export function DriverAppUpdateScreen({
  currentVersionName,
  isRequired,
  onDismiss,
  onUpdate,
  release,
}: {
  currentVersionName: string;
  isRequired: boolean;
  onDismiss: () => void;
  onUpdate: () => void;
  release: DriverAppRelease;
}) {
  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconCircle}><Text style={styles.icon}>↥</Text></View>
        <Text style={styles.title}>{isRequired ? '앱 업데이트가 필요합니다' : '새 버전이 있습니다'}</Text>
        <Text style={styles.body}>
          {isRequired
            ? '계속 사용하려면 최신 CLEVER Driver를 설치해 주세요.'
            : '최신 기능과 안정성 개선을 적용할 수 있습니다.'}
        </Text>
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>{currentVersionName}</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.latestVersion}>{release.latestVersionName}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onUpdate} style={styles.updateButton}>
          <Text style={styles.updateButtonText}>업데이트 링크 열기</Text>
        </Pressable>
        {!isRequired ? (
          <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.laterButton}>
            <Text style={styles.laterButtonText}>나중에</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  arrow: { color: '#98a2b3', fontSize: 16 },
  body: { color: '#667085', fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: 'center' },
  card: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 24, padding: 24, width: '100%' },
  icon: { color: '#0b57d0', fontSize: 28, fontWeight: '900' },
  iconCircle: { alignItems: 'center', backgroundColor: '#eaf2ff', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  laterButton: { alignItems: 'center', marginTop: 8, paddingVertical: 12, width: '100%' },
  laterButtonText: { color: '#475467', fontSize: 14, fontWeight: '700' },
  latestVersion: { color: '#0b57d0', fontSize: 14, fontWeight: '800' },
  overlay: { backgroundColor: 'rgba(16, 24, 40, 0.52)', flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { color: '#101828', fontSize: 21, fontWeight: '900', marginTop: 18 },
  updateButton: { alignItems: 'center', backgroundColor: '#0b57d0', borderRadius: 14, marginTop: 24, paddingVertical: 15, width: '100%' },
  updateButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  versionRow: { alignItems: 'center', backgroundColor: '#f2f4f7', borderRadius: 12, flexDirection: 'row', gap: 12, marginTop: 20, paddingHorizontal: 18, paddingVertical: 11 },
  versionText: { color: '#667085', fontSize: 14, fontWeight: '700' },
});
