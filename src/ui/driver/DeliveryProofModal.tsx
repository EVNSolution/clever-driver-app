import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  DriverProofPhotoSource,
  DriverProofPhotoUpload,
} from '../../api/dsvDriverProofMedia';
import { useAppDialog } from './AppDialog';

const MAX_PROOF_PHOTO_BYTES = 10 * 1024 * 1024;

type SelectedProofPhoto = Omit<
  DriverProofPhotoUpload,
  'deliveryStopId' | 'routePlanId'
>;

type DeliveryProofModalProps = {
  destinationName: string;
  onClose(): void;
  onUpload(photo: SelectedProofPhoto): Promise<void>;
};

export function DeliveryProofModal({
  destinationName,
  onClose,
  onUpload,
}: DeliveryProofModalProps) {
  const { dialog, showDialog } = useAppDialog();
  const insets = useSafeAreaInsets();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedProofPhoto | null>(null);

  async function selectPhoto(source: DriverProofPhotoSource) {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showDialog({
            message: '배송 증빙을 촬영하려면 환경설정에서 카메라 권한을 허용해 주세요.',
            title: '카메라 권한이 필요합니다',
            tone: 'warning',
          });
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showDialog({
            message: '배송 증빙을 선택하려면 환경설정에서 사진 앨범 권한을 허용해 주세요.',
            title: '사진 앨범 권한이 필요합니다',
            tone: 'warning',
          });
          return;
        }
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            mediaTypes: ['images'],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: false,
            mediaTypes: ['images'],
            quality: 0.8,
          });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (asset === undefined) return;
      if (asset.fileSize !== undefined && asset.fileSize > MAX_PROOF_PHOTO_BYTES) {
        showDialog({
          message: '10MB 이하의 사진을 선택해 주세요.',
          title: '사진이 너무 큽니다',
          tone: 'warning',
        });
        return;
      }

      setSelectedPhoto({
        fileName: asset.fileName ?? `delivery-proof-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        source,
        uri: asset.uri,
      });
    } catch {
      showDialog({
        message: '잠시 후 다시 시도해 주세요.',
        title: '사진을 열 수 없습니다',
        tone: 'danger',
      });
    }
  }

  async function uploadPhoto() {
    if (selectedPhoto === null || isUploading) return;

    setIsUploading(true);
    try {
      await onUpload(selectedPhoto);
      showDialog({
        actions: [{ label: '확인', onPress: onClose, tone: 'primary' }],
        dismissible: false,
        message: '배송 증빙 사진을 저장했습니다.',
        title: '증빙 업로드 완료',
        tone: 'success',
      });
    } catch (error) {
      showDialog({
        message: error instanceof Error
          ? error.message
          : '배송 증빙 사진을 업로드하지 못했습니다.',
        title: '증빙 업로드 실패',
        tone: 'danger',
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={isUploading ? undefined : onClose}
      transparent
      visible
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="배송 증빙 닫기"
          disabled={isUploading}
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
          <View style={styles.handle} />
          <Text style={styles.title}>배송 증빙 추가</Text>
          <Text numberOfLines={2} style={styles.description}>
            {destinationName} 배송을 완료했습니다. 사진을 남겨 주세요.
          </Text>

          {selectedPhoto === null ? (
            <View style={styles.emptyPreview}>
              <Text style={styles.emptyPreviewIcon}>▧</Text>
              <Text style={styles.emptyPreviewText}>등록된 사진이 없습니다</Text>
            </View>
          ) : (
            <Image
              accessibilityLabel="선택한 배송 증빙 사진"
              resizeMode="cover"
              source={{ uri: selectedPhoto.uri }}
              style={styles.preview}
            />
          )}

          <View style={styles.sourceActions}>
            <ProofSourceButton
              icon="●"
              label="사진 촬영"
              onPress={() => void selectPhoto('camera')}
            />
            <ProofSourceButton
              icon="▣"
              label="앨범에서 선택"
              onPress={() => void selectPhoto('library')}
            />
          </View>

          {selectedPhoto === null ? (
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.closeButtonText}>나중에 등록</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isUploading, disabled: isUploading }}
              disabled={isUploading}
              onPress={() => void uploadPhoto()}
              style={({ pressed }) => [
                styles.uploadButton,
                pressed && styles.buttonPressed,
              ]}
            >
              {isUploading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.uploadButtonText}>증빙 사진 업로드</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
      {dialog}
    </Modal>
  );
}

function ProofSourceButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sourceButton,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.sourceIcon}>{icon}</Text>
      <Text style={styles.sourceLabel}>{label}</Text>
    </Pressable>
  );
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
    paddingBottom: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#d0d5dd',
    borderRadius: 3,
    height: 5,
    marginBottom: 18,
    width: 44,
  },
  title: {
    color: '#101828',
    fontSize: 22,
    fontWeight: '900',
  },
  description: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 6,
  },
  emptyPreview: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#d0d5dd',
    borderRadius: 16,
    borderStyle: 'dashed',
    borderWidth: 1,
    height: 170,
    justifyContent: 'center',
    marginTop: 18,
  },
  emptyPreviewIcon: {
    color: '#98a2b3',
    fontSize: 36,
    fontWeight: '800',
  },
  emptyPreviewText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  preview: {
    backgroundColor: '#f2f4f7',
    borderRadius: 16,
    height: 170,
    marginTop: 18,
    width: '100%',
  },
  sourceActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  sourceButton: {
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    height: 72,
    justifyContent: 'center',
  },
  sourceIcon: {
    color: '#0b57d0',
    fontSize: 20,
    fontWeight: '900',
  },
  sourceLabel: {
    color: '#0b57d0',
    fontSize: 13,
    fontWeight: '900',
  },
  closeButton: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    marginTop: 12,
  },
  closeButtonText: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '800',
  },
  uploadButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    marginTop: 12,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
