import { LocationManager } from '@maplibre/maplibre-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchDriverAndroidAppRelease } from '../../api/dsvDriverAppRelease';
import type { DriverAppRelease } from '../../domain/appUpdate/driverAppUpdate';
import {
  readInstalledDriverAppVersion,
  type InstalledDriverAppVersion,
} from '../../platform/expo/application/expoAppVersionService';
import { useAppDialog } from './AppDialog';

type PermissionKey = 'camera' | 'location' | 'photos';
type PermissionState = {
  canAskAgain: boolean;
  status: 'denied' | 'granted' | 'unknown';
};

const INITIAL_PERMISSION: PermissionState = {
  canAskAgain: true,
  status: 'unknown',
};

type DriverSettingsModalProps = {
  onClose(): void;
};

type VersionCheckState =
  | { kind: 'checking'; installed: InstalledDriverAppVersion | null }
  | { kind: 'ready'; installed: InstalledDriverAppVersion; release: DriverAppRelease }
  | { kind: 'unavailable'; installed: InstalledDriverAppVersion | null };

export function DriverSettingsModal({ onClose }: DriverSettingsModalProps) {
  const { dialog, showDialog } = useAppDialog();
  const insets = useSafeAreaInsets();
  const [permissions, setPermissions] = useState<Record<PermissionKey, PermissionState>>({
    camera: INITIAL_PERMISSION,
    location: INITIAL_PERMISSION,
    photos: INITIAL_PERMISSION,
  });
  const [requestingPermission, setRequestingPermission] =
    useState<PermissionKey | null>(null);
  const [versionCheck, setVersionCheck] = useState<VersionCheckState>({
    installed: readInstalledDriverAppVersion(),
    kind: 'checking',
  });

  useEffect(() => {
    void readPermissionSnapshot().then(setPermissions).catch(() => undefined);
    void checkAppVersion();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void readPermissionSnapshot().then(setPermissions).catch(() => undefined);
        void checkAppVersion();
      }
    });
    return () => subscription.remove();
  }, []);

  async function checkAppVersion() {
    const installed = readInstalledDriverAppVersion();
    setVersionCheck({ installed, kind: 'checking' });
    if (installed === null || Platform.OS !== 'android') {
      setVersionCheck({ installed, kind: 'unavailable' });
      return;
    }
    try {
      const release = await fetchDriverAndroidAppRelease();
      setVersionCheck({ installed, kind: 'ready', release });
    } catch {
      setVersionCheck({ installed, kind: 'unavailable' });
    }
  }

  async function openUpdateLink() {
    if (versionCheck.kind !== 'ready') return;
    try {
      await Linking.openURL(versionCheck.release.installUrl);
    } catch {
      showDialog({
        message: '설치 링크를 열지 못했습니다. 잠시 후 다시 시도해 주세요.',
        title: '업데이트 링크 오류',
        tone: 'danger',
      });
    }
  }

  async function openAppSettings() {
    try {
      await Linking.openSettings();
    } catch {
      showDialog({
        message: '기기 설정에서 CLEVER Driver 권한을 확인해 주세요.',
        title: '설정을 열 수 없습니다',
        tone: 'danger',
      });
    }
  }

  function showOpenSettingsDialog() {
    showDialog({
      actions: [
        { label: '취소', tone: 'secondary' },
        {
          label: '설정 열기',
          onPress: () => void openAppSettings(),
          tone: 'primary',
        },
      ],
      message: '이 권한은 앱에서 다시 요청할 수 없습니다.',
      title: '기기 설정에서 허용해 주세요',
      tone: 'warning',
    });
  }

  async function requestPermission(key: PermissionKey) {
    if (requestingPermission !== null) return;
    if (permissions[key].status === 'granted' || !permissions[key].canAskAgain) {
      await openAppSettings();
      return;
    }

    setRequestingPermission(key);
    try {
      const result = key === 'location'
        ? await requestLocationPermission()
        : key === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      const granted = typeof result === 'boolean' ? result : result.granted;
      const canAskAgain = typeof result === 'boolean' ? true : result.canAskAgain;
      if (!granted && !canAskAgain) {
        showOpenSettingsDialog();
      }
      setPermissions(await readPermissionSnapshot());
    } catch {
      showDialog({
        message: '기기 설정에서 앱 권한을 확인해 주세요.',
        title: '권한을 확인하지 못했습니다',
        tone: 'danger',
      });
    } finally {
      setRequestingPermission(null);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="환경설정 닫기"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom + 12, 24) },
          ]}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>환경설정</Text>
              <Text style={styles.subtitle}>앱 권한</Text>
            </View>
            <Pressable
              accessibilityLabel="환경설정 닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.permissionList}>
            <PermissionRow
              description="지도에서 현재 위치를 표시합니다."
              isRequesting={requestingPermission === 'location'}
              label="위치"
              onPress={() => void requestPermission('location')}
              permission={permissions.location}
            />
            <PermissionRow
              description="배송 완료 증빙을 촬영합니다."
              isRequesting={requestingPermission === 'camera'}
              label="카메라"
              onPress={() => void requestPermission('camera')}
              permission={permissions.camera}
            />
            <PermissionRow
              description="배송 완료 증빙 사진을 선택합니다."
              isRequesting={requestingPermission === 'photos'}
              label="사진 앨범"
              onPress={() => void requestPermission('photos')}
              permission={permissions.photos}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void openAppSettings()}
            style={({ pressed }) => [
              styles.systemSettingsButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.systemSettingsText}>기기 설정에서 권한 관리</Text>
          </Pressable>

          <View style={styles.updateSection}>
            <View style={styles.updateHeader}>
              <Text style={styles.updateTitle}>업데이트 확인</Text>
              <VersionStatus state={versionCheck} />
            </View>
            <View style={styles.versionList}>
              <VersionRow
                label="최신 버전"
                value={versionCheck.kind === 'ready'
                  ? formatVersion(
                    versionCheck.release.latestVersionName,
                    versionCheck.release.latestVersionCode,
                  )
                  : versionCheck.kind === 'checking' ? '확인 중' : '확인 불가'}
              />
              <VersionRow
                label="기기 버전"
                value={versionCheck.installed === null
                  ? '확인 불가'
                  : formatVersion(
                    versionCheck.installed.versionName,
                    versionCheck.installed.versionCode,
                  )}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={versionCheck.kind === 'checking'}
              onPress={() => {
                if (isUpdateAvailable(versionCheck)) void openUpdateLink();
                else void checkAppVersion();
              }}
              style={({ pressed }) => [
                styles.updateButton,
                isUpdateAvailable(versionCheck) && styles.updateButtonAvailable,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={[
                styles.updateButtonText,
                isUpdateAvailable(versionCheck) && styles.updateButtonTextAvailable,
              ]}>
                {versionCheck.kind === 'checking'
                  ? '버전 확인 중'
                  : isUpdateAvailable(versionCheck) ? '업데이트 링크 열기' : '버전 다시 확인'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      {dialog}
    </Modal>
  );
}

function VersionStatus({ state }: { state: VersionCheckState }) {
  const updateAvailable = isUpdateAvailable(state);
  const label = state.kind === 'checking'
    ? '확인 중'
    : state.kind === 'unavailable'
      ? '확인 불가'
      : updateAvailable ? '업데이트 필요' : '최신 버전';
  return (
    <Text style={[
      styles.updateStatus,
      state.kind === 'ready' && !updateAvailable && styles.updateStatusCurrent,
      updateAvailable && styles.updateStatusAvailable,
    ]}>
      {label}
    </Text>
  );
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.versionRow}>
      <Text style={styles.versionLabel}>{label}</Text>
      <Text style={styles.versionValue}>{value}</Text>
    </View>
  );
}

function isUpdateAvailable(state: VersionCheckState): boolean {
  return state.kind === 'ready'
    && state.installed.versionCode < state.release.latestVersionCode;
}

function formatVersion(versionName: string, versionCode: number): string {
  return `${versionName} (${versionCode})`;
}

function PermissionRow({
  description,
  isRequesting,
  label,
  onPress,
  permission,
}: {
  description: string;
  isRequesting: boolean;
  label: string;
  onPress(): void;
  permission: PermissionState;
}) {
  const isGranted = permission.status === 'granted';
  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionTextGroup}>
        <View style={styles.permissionTitleRow}>
          <Text style={styles.permissionLabel}>{label}</Text>
          <Text style={[
            styles.permissionStatus,
            isGranted && styles.permissionStatusGranted,
          ]}>
            {isGranted ? '허용됨' : permission.status === 'unknown' ? '확인 필요' : '허용 필요'}
          </Text>
        </View>
        <Text style={styles.permissionDescription}>{description}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={isRequesting}
        onPress={onPress}
        style={({ pressed }) => [
          styles.permissionButton,
          isGranted && styles.permissionButtonGranted,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={[
          styles.permissionButtonText,
          isGranted && styles.permissionButtonTextGranted,
        ]}>
          {isRequesting ? '확인 중' : isGranted ? '설정' : '허용'}
        </Text>
      </Pressable>
    </View>
  );
}

async function readLocationPermission(): Promise<PermissionState> {
  if (Platform.OS !== 'android') return INITIAL_PERMISSION;
  const granted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return { canAskAgain: true, status: granted ? 'granted' : 'denied' };
}

async function readPermissionSnapshot(): Promise<
  Record<PermissionKey, PermissionState>
> {
  const [camera, photos, location] = await Promise.all([
    ImagePicker.getCameraPermissionsAsync(),
    ImagePicker.getMediaLibraryPermissionsAsync(),
    readLocationPermission(),
  ]);
  return {
    camera: {
      canAskAgain: camera.canAskAgain,
      status: camera.granted ? 'granted' : 'denied',
    },
    location,
    photos: {
      canAskAgain: photos.canAskAgain,
      status: photos.granted ? 'granted' : 'denied',
    },
  };
}

async function requestLocationPermission(): Promise<boolean> {
  return LocationManager.requestPermissions();
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#101828',
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closeButtonText: {
    color: '#475467',
    fontSize: 25,
    fontWeight: '500',
    lineHeight: 27,
  },
  permissionList: {
    borderColor: '#eaecf0',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    overflow: 'hidden',
  },
  permissionRow: {
    alignItems: 'center',
    borderBottomColor: '#eaecf0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  permissionTextGroup: {
    flex: 1,
    gap: 4,
  },
  permissionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  permissionLabel: {
    color: '#101828',
    fontSize: 15,
    fontWeight: '900',
  },
  permissionStatus: {
    color: '#b54708',
    fontSize: 10,
    fontWeight: '800',
  },
  permissionStatusGranted: {
    color: '#027a48',
  },
  permissionDescription: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '600',
  },
  permissionButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 64,
    paddingHorizontal: 12,
  },
  permissionButtonGranted: {
    backgroundColor: '#ecfdf3',
    borderColor: '#a6f4c5',
    borderWidth: 1,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  permissionButtonTextGranted: {
    color: '#027a48',
  },
  systemSettingsButton: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    marginTop: 14,
  },
  systemSettingsText: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '900',
  },
  updateSection: {
    backgroundColor: '#f8fafc',
    borderColor: '#e4e7ec',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  updateHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  updateTitle: {
    color: '#101828',
    fontSize: 15,
    fontWeight: '900',
  },
  updateStatus: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '900',
  },
  updateStatusAvailable: {
    color: '#b42318',
  },
  updateStatusCurrent: {
    color: '#027a48',
  },
  versionList: {
    gap: 8,
    marginTop: 14,
  },
  versionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  versionLabel: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  versionValue: {
    color: '#101828',
    fontSize: 12,
    fontWeight: '900',
  },
  updateButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d0d5dd',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 42,
  },
  updateButtonAvailable: {
    backgroundColor: '#0b57d0',
    borderColor: '#0b57d0',
  },
  updateButtonText: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '900',
  },
  updateButtonTextAvailable: {
    color: '#ffffff',
  },
  buttonPressed: {
    opacity: 0.75,
  },
});
