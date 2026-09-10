import * as ImagePicker from 'expo-image-picker';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  DriverProofPhotoSource,
  DriverProofPhotoUpload,
} from '../../api/dsvDriverProofMedia';
import {
  formatDeliveryCompletionTime,
  resolveDeliveryCompletionOccurredAt,
} from '../../domain/delivery/deliveryCompletionTime';
import { useAppDialog } from './AppDialog';

const MAX_PROOF_PHOTO_BYTES = 10 * 1024 * 1024;

type SelectedProofPhoto = Omit<
  DriverProofPhotoUpload,
  'deliveryStopId' | 'routePlanId'
>;

type DeliveryProofModalProps = {
  destinationName: string;
  executionDialog?: ReactNode;
  executionPending?: boolean;
  onClose(): void;
  onConfirm(occurredAt: string, photo: SelectedProofPhoto | null): Promise<void>;
};

export function DeliveryProofModal({
  destinationName,
  executionDialog,
  executionPending = false,
  onClose,
  onConfirm,
}: DeliveryProofModalProps) {
  const { dialog, showDialog } = useAppDialog();
  const insets = useSafeAreaInsets();
  const [openedAt] = useState(() => new Date());
  const [completionTime, setCompletionTime] = useState(
    () => formatDeliveryCompletionTime(openedAt),
  );
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
      } else if (Platform.OS !== 'android') {
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

  function updateCompletionTime(value: string) {
    const digits = value.replace(/\D/gu, '').slice(0, 4);
    setCompletionTime(
      digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits,
    );
  }

  async function confirmCompletion() {
    if (executionPending) return;
    const occurredAt = resolveDeliveryCompletionOccurredAt(completionTime, openedAt);
    if (occurredAt === null) {
      showDialog({
        message: '완료 시간을 24시간 형식으로 입력해 주세요. 예: 14:30',
        title: '완료 시간을 확인해 주세요',
        tone: 'warning',
      });
      return;
    }

    await onConfirm(occurredAt, selectedPhoto);
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={executionPending ? undefined : onClose}
      transparent
      visible
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="배송 증빙 닫기"
          disabled={executionPending}
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
          <Text style={styles.title}>배송 완료</Text>
          <Text style={styles.description}>
            {destinationName}의 완료 시간과 증빙을 확인해 주세요.
          </Text>

          <View style={styles.timeSection}>
            <View style={styles.timeHeading}>
              <Text style={styles.sectionLabel}>완료 시간</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setCompletionTime(formatDeliveryCompletionTime(new Date()))}
              >
                <Text style={styles.nowButtonText}>현재 시간</Text>
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="배송 완료 시간"
              editable={!executionPending}
              keyboardType="number-pad"
              maxLength={5}
              onChangeText={updateCompletionTime}
              placeholder={formatDeliveryCompletionTime(openedAt)}
              selectTextOnFocus
              style={styles.timeInput}
              value={completionTime}
            />
            <Text style={styles.timeHint}>24시간 형식 · 시:분</Text>
          </View>

          <Text style={styles.sectionLabel}>배송 증빙 사진 · 선택</Text>

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

          {executionPending ? (
            <View accessibilityLiveRegion="polite" style={styles.executionPending}>
              <ActivityIndicator color="#0b57d0" size="small" />
              <Text style={styles.executionPendingText}>배송 완료 처리 중</Text>
            </View>
          ) : (
            <>
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

              <View style={styles.completionActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.closeButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.closeButtonText}>취소</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void confirmCompletion()}
                  style={({ pressed }) => [
                    styles.uploadButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.uploadButtonText}>완료 확정</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
      {executionDialog}
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
  timeSection: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    marginTop: 18,
    padding: 14,
  },
  timeHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '800',
  },
  nowButtonText: {
    color: '#0b57d0',
    fontSize: 12,
    fontWeight: '800',
  },
  timeInput: {
    backgroundColor: '#ffffff',
    borderColor: '#bfdbfe',
    borderRadius: 12,
    borderWidth: 1,
    color: '#101828',
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    height: 52,
    marginTop: 10,
    paddingHorizontal: 14,
    textAlign: 'center',
  },
  timeHint: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
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
    borderColor: '#d0d5dd',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    height: 48,
    justifyContent: 'center',
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
    flex: 1.5,
    height: 52,
    justifyContent: 'center',
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  executionPending: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 14,
  },
  completionActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  executionPendingText: {
    color: '#0b57d0',
    fontSize: 14,
    fontWeight: '900',
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
