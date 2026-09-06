import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { DriverProofPhotoUpload } from '../../api/dsvDriverProofMedia';
import type { CurrentDeliverySummary } from '../../domain/delivery/deliveryPlan';
import { openDestinationMap } from '../../platform/destinationMap';
import { useAppDialog } from './AppDialog';
import { DeliveryProofModal } from './DeliveryProofModal';

type DeliveryExecutionActionsProps = {
  etaStatus: 'FAILED' | 'PRE_PICKUP' | 'READY';
  isReadOnly: boolean;
  onCompleteDelivery(destinationId: string, deliveryStopIds: string[]): Promise<boolean>;
  onCompleteRoute(): Promise<void>;
  onStartDelivery(): Promise<void>;
  onUploadProof(
    deliveryStopId: string,
    photo: Omit<DriverProofPhotoUpload, 'deliveryStopId' | 'routePlanId'>,
  ): Promise<void>;
  orderCount: number;
  summary: CurrentDeliverySummary | null;
  variant: 'delivery' | 'map';
};

export function DeliveryExecutionActions({
  etaStatus,
  isReadOnly,
  onCompleteDelivery,
  onCompleteRoute,
  onStartDelivery,
  onUploadProof,
  orderCount,
  summary,
  variant,
}: DeliveryExecutionActionsProps) {
  const { dialog, showDialog } = useAppDialog();
  const [isCompleting, setIsCompleting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [proofDelivery, setProofDelivery] = useState<{
    completesRoute: boolean;
    deliveryStopId: string;
    destinationName: string;
  } | null>(null);
  const canStart = !isReadOnly && etaStatus === 'PRE_PICKUP' && orderCount > 0;
  const isCompletionDisabled =
    isReadOnly || etaStatus === 'PRE_PICKUP' || summary === null ||
    isCompleting || isStarting || proofDelivery !== null;
  const shouldShowActions = !isReadOnly && (canStart || summary !== null);

  async function handleOpenMap() {
    if (summary === null) return;

    try {
      await openDestinationMap(summary.address);
    } catch {
      showDialog({
        message: '지도 앱을 열지 못했습니다. 다른 지도 앱에서 주소를 붙여넣어 주세요.',
        title: '주소를 복사했습니다',
        tone: 'info',
      });
    }
  }

  function confirmDeliveryCompletion() {
    if (summary === null || isCompletionDisabled) return;

    showDialog({
      actions: [
        { label: '취소', tone: 'secondary' },
        {
          onPress: () => {
            setIsCompleting(true);
            void onCompleteDelivery(summary.destinationId, summary.deliveryStopIds)
              .then((completesRoute) => {
                setProofDelivery({
                  completesRoute,
                  deliveryStopId: summary.deliveryStopId,
                  destinationName: summary.destinationName,
                });
              })
              .catch((error: unknown) => {
                showDialog({
                  message: error instanceof Error
                    ? error.message
                    : '배송 완료 상태를 저장하지 못했습니다.',
                  title: '배송 완료 실패',
                  tone: 'danger',
                });
              })
              .finally(() => setIsCompleting(false));
          },
          label: '완료',
          tone: 'primary',
        },
      ],
      message: `${summary.destinationName}의 주문 ${summary.deliveryStopIds.length}건을 모두 배송 완료 처리할까요?`,
      title: '배송 완료',
      tone: 'success',
    });
  }

  function closeProofDelivery() {
    const completesRoute = proofDelivery?.completesRoute === true;
    setProofDelivery(null);
    if (!completesRoute) return;

    setIsCompleting(true);
    void onCompleteRoute()
      .catch((error: unknown) => {
        showDialog({
          message: error instanceof Error
            ? error.message
            : '배차 완료 상태를 저장하지 못했습니다.',
          title: '배차 완료 실패',
          tone: 'danger',
        });
      })
      .finally(() => setIsCompleting(false));
  }

  function confirmDeliveryStart() {
    if (!canStart || isStarting || proofDelivery !== null) return;

    showDialog({
      actions: [
        { label: '취소', tone: 'secondary' },
        {
          onPress: () => {
            setIsStarting(true);
            void onStartDelivery()
              .catch((error: unknown) => {
                showDialog({
                  message: error instanceof Error
                    ? error.message
                    : '배송 시작 상태를 저장하지 못했습니다.',
                  title: '배송 시작 실패',
                  tone: 'danger',
                });
              })
              .finally(() => setIsStarting(false));
          },
          label: '시작',
          tone: 'primary',
        },
      ],
      message: '픽업을 완료하고 배송을 시작할까요?',
      title: '배송 시작',
      tone: 'info',
    });
  }

  if (!shouldShowActions && proofDelivery === null) return null;

  return (
    <>
      {shouldShowActions ? (
        <View style={[
          styles.container,
          variant === 'delivery' && styles.deliveryContainer,
        ]}>
          {variant === 'delivery' && summary !== null ? (
            <View style={styles.destinationCopy}>
              <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>
                지금 가는 배송지
              </Text>
              <Text numberOfLines={2} style={styles.destinationName}>
                {summary.destinationName}
              </Text>
              <Text numberOfLines={3} style={styles.destinationAddress}>
                {summary.address}
              </Text>
            </View>
          ) : null}

          {canStart ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isStarting, disabled: isStarting }}
              disabled={isStarting}
              onPress={confirmDeliveryStart}
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.buttonPressed,
              ]}
            >
              {isStarting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Text maxFontSizeMultiplier={1.3} style={styles.primaryButtonText}>
                    배송 시작
                  </Text>
                  <Text maxFontSizeMultiplier={1.3} style={styles.startCaption}>
                    픽업 완료
                  </Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={styles.actionButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => void handleOpenMap()}
                style={({ pressed }) => [
                  styles.mapButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text maxFontSizeMultiplier={1.3} style={styles.mapButtonText}>
                  지도 열기
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isCompletionDisabled }}
                disabled={isCompletionDisabled}
                onPress={confirmDeliveryCompletion}
                style={({ pressed }) => [
                  styles.completeButton,
                  isCompletionDisabled && styles.completeButtonDisabled,
                  pressed && styles.buttonPressed,
                ]}
              >
                {isCompleting ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text maxFontSizeMultiplier={1.3} style={styles.primaryButtonText}>
                    배송 완료
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      {proofDelivery === null ? null : (
        <DeliveryProofModal
          destinationName={proofDelivery.destinationName}
          onClose={closeProofDelivery}
          onUpload={(photo) => (
            onUploadProof(proofDelivery.deliveryStopId, photo)
          )}
        />
      )}
      {dialog}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  deliveryContainer: {
    borderColor: '#bfdbfe',
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 14,
    marginHorizontal: 18,
  },
  destinationCopy: {
    gap: 3,
  },
  eyebrow: {
    color: '#0b57d0',
    fontSize: 11,
    fontWeight: '800',
  },
  destinationName: {
    color: '#101828',
    fontSize: 19,
    fontWeight: '900',
    lineHeight: 25,
  },
  destinationAddress: {
    color: '#475467',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  mapButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#0b57d0',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  mapButtonText: {
    color: '#0b57d0',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  completeButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  completeButtonDisabled: {
    backgroundColor: '#b8c2d1',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  startCaption: {
    color: '#dbeafe',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  buttonPressed: {
    opacity: 0.82,
  },
});
