import { useReducer, useRef, type ReactNode } from 'react';
import { uuid } from 'expo-modules-core';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { DriverProofPhotoUpload } from '../../api/dsvDriverProofMedia';
import { DriverDeliveryCompletionApiError, type DriverLifecycleCommandIdentity } from '../../api/dsvDriverEvents';
import type { CurrentDeliverySummary } from '../../domain/delivery/deliveryPlan';
import {
  INITIAL_DELIVERY_EXECUTION_STATE,
  isDeliveryExecutionLocked,
  reduceDeliveryExecutionState,
} from '../../domain/delivery/deliveryExecutionState';
import { openDestinationMap } from '../../platform/destinationMap';
import { useAppDialog } from './AppDialog';
import { DeliveryProofModal } from './DeliveryProofModal';

type UseDeliveryExecutionOptions = {
  etaStatus: 'FAILED' | 'PRE_PICKUP' | 'READY';
  isReadOnly: boolean;
  onCompleteDelivery(
    destinationId: string,
    deliveryStopIds: string[],
    identity: DriverLifecycleCommandIdentity,
  ): Promise<boolean>;
  onCompleteRoute(): Promise<void>;
  onResolveDeliveryCompletion?(
    destinationId: string,
    deliveryStopIds: string[],
    identity: DriverLifecycleCommandIdentity,
  ): Promise<boolean>;
  onRefreshAssignment?(deliveryStopIds: string[]): void;
  onStartDelivery(): Promise<void>;
  onUploadProof(
    deliveryStopId: string,
    photo: Omit<DriverProofPhotoUpload, 'deliveryStopId' | 'routePlanId'>,
  ): Promise<void>;
  onWorkStarted?(): void;
  orderCount: number;
  summary: CurrentDeliverySummary | null;
};

export function useDeliveryExecution({
  etaStatus,
  isReadOnly,
  onCompleteDelivery,
  onCompleteRoute,
  onResolveDeliveryCompletion,
  onRefreshAssignment,
  onStartDelivery,
  onUploadProof,
  orderCount,
  summary,
  onWorkStarted,
}: UseDeliveryExecutionOptions) {
  const { dialog, showDialog } = useAppDialog();
  const [executionState, dispatch] = useReducer(
    reduceDeliveryExecutionState,
    INITIAL_DELIVERY_EXECUTION_STATE,
  );
  const actionRef = useRef<'proof' | 'route' | 'start' | 'stop' | null>(null);
  const transactionCallbacksRef = useRef<{
    onCompleteDelivery(
      destinationId: string,
      deliveryStopIds: string[],
      identity: DriverLifecycleCommandIdentity,
    ): Promise<boolean>;
    onCompleteRoute(): Promise<void>;
    onResolveDeliveryCompletion?(
      destinationId: string,
      deliveryStopIds: string[],
      identity: DriverLifecycleCommandIdentity,
    ): Promise<boolean>;
    onRefreshAssignment?(deliveryStopIds: string[]): void;
    onUploadProof(
      deliveryStopId: string,
      photo: Omit<DriverProofPhotoUpload, 'deliveryStopId' | 'routePlanId'>,
    ): Promise<void>;
  } | null>(null);
  const completionTransactionRef = useRef<{
    identity: DriverLifecycleCommandIdentity; approved: boolean; hadUnknownOutcome: boolean;
  } | null>(null);
  const canStart = !isReadOnly && etaStatus === 'PRE_PICKUP' && orderCount > 0;
  const isCompletionDisabled =
    isReadOnly || etaStatus === 'PRE_PICKUP' || summary === null ||
    executionState.phase !== 'idle' || executionState.proof !== null;
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
    if (summary === null || isCompletionDisabled || completionTransactionRef.current !== null) return;

    onWorkStarted?.();
    transactionCallbacksRef.current = {
      onCompleteDelivery,
      onCompleteRoute,
      onResolveDeliveryCompletion,
      onRefreshAssignment,
      onUploadProof,
    };
    dispatch({
      proof: {
        completesRoute: null,
        completedAt: null,
        deliveryStopId: summary.deliveryStopId,
        deliveryStopIds: summary.deliveryStopIds,
        destinationId: summary.destinationId,
        destinationName: summary.destinationName,
        proofUploaded: false,
      },
      type: 'COMPLETION_OPENED',

    });
  }

  async function completeFinalRoute(proof = executionState.proof) {
    const completeRoute = transactionCallbacksRef.current?.onCompleteRoute;
    if (
      proof?.completesRoute !== true ||
      completeRoute === undefined ||
      actionRef.current !== null
    ) return;

    onWorkStarted?.();
    actionRef.current = 'route';
    dispatch({ type: 'ROUTE_COMPLETION_STARTED' });
    try {
      await completeRoute();
      transactionCallbacksRef.current = null;
      completionTransactionRef.current = null;
      dispatch({ type: 'ROUTE_COMPLETED' });
    } catch (error) {
      dispatch({ type: 'ROUTE_COMPLETION_FAILED' });
      showDialog({
        actions: [
          { label: '닫기', tone: 'secondary' },
          {
            label: '다시 시도',
            onPress: () => void completeFinalRoute(proof),
            tone: 'primary',
          },
        ],
        message: error instanceof Error
          ? error.message
          : '배차 완료 상태를 저장하지 못했습니다.',
        title: '배차 완료 실패',
        tone: 'danger',
      });
    } finally {
      actionRef.current = null;
    }
  }

  function closeProofDelivery() {
    if (actionRef.current !== null || (completionTransactionRef.current !== null && !completionTransactionRef.current.approved)) return;
    if (executionState.phase === 'completing-route') return;
    if (executionState.proof?.completesRoute === true && !executionState.proof.requiresAssignmentRefresh) {
      void completeFinalRoute();
      return;
    }

    const refreshAssignment = executionState.proof?.requiresAssignmentRefresh
      ? transactionCallbacksRef.current?.onRefreshAssignment : undefined;
    const completedStopIds = executionState.proof?.deliveryStopIds ?? [];
    transactionCallbacksRef.current = null;
    completionTransactionRef.current = null;
    dispatch({ type: 'PROOF_CLOSED' });
    refreshAssignment?.(completedStopIds);
  }

  function confirmDeliveryStart() {
    if (!canStart || actionRef.current !== null || executionState.proof !== null) return;

    onWorkStarted?.();
    showDialog({
      actions: [
        { label: '취소', tone: 'secondary' },
        {
          onPress: () => {
            if (actionRef.current !== null || executionState.proof !== null) return;
            onWorkStarted?.();
            actionRef.current = 'start';
            dispatch({ type: 'START_STARTED' });
            void onStartDelivery()
              .then(() => dispatch({ type: 'START_COMPLETED' }))
              .catch((error: unknown) => {
                dispatch({ type: 'ACTION_FAILED' });
                showDialog({
                  message: error instanceof Error
                    ? error.message
                    : '배송 시작 상태를 저장하지 못했습니다.',
                  title: '배송 시작 실패',
                  tone: 'danger',
                });
              })
              .finally(() => {
                actionRef.current = null;
              });
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

  async function submitDeliveryCompletion(
    occurredAt: string,
    photo: Omit<DriverProofPhotoUpload, 'deliveryStopId' | 'routePlanId'> | null,
  ) {
    const callbacks = transactionCallbacksRef.current;
    let proof = executionState.proof;
    if (proof === null || callbacks === null || actionRef.current !== null) return;
    if (proof.requiresAssignmentRefresh) return;

    if (proof.completesRoute === null) {
      const identity = completionTransactionRef.current?.identity ?? proof.completionIdentity ?? {
        clientEventId: `${proof.destinationId}:delivered:${uuid.v4()}`,
        occurredAt,
      };
      const transaction = completionTransactionRef.current ?? { identity, approved: false, hadUnknownOutcome: false };
      completionTransactionRef.current = transaction;
      proof = { ...proof, completionIdentity: identity };
      actionRef.current = 'stop';
      dispatch({ type: 'STOP_COMPLETION_STARTED', completionIdentity: identity });
      try {
        const completesRoute = await callbacks.onCompleteDelivery(
          proof.destinationId,
          proof.deliveryStopIds,
          identity,
        );
        completionTransactionRef.current.approved = true;
        proof = { ...proof, completesRoute, completedAt: identity.occurredAt };
        dispatch({ proof, type: 'STOP_COMPLETED' });
      } catch (error) {
        const rejected = error instanceof DriverDeliveryCompletionApiError && error.outcome === 'rejected';
        if (rejected && !transaction.hadUnknownOutcome) {
          completionTransactionRef.current = null;
          dispatch({ type: 'STOP_COMPLETION_REJECTED' });
        } else {
          // A later rejection says nothing about an earlier attempt whose response was lost.
          const shouldResolve = rejected && transaction.hadUnknownOutcome;
          transaction.hadUnknownOutcome = true;
          if (shouldResolve && callbacks.onResolveDeliveryCompletion !== undefined) {
            try {
              const applied = await callbacks.onResolveDeliveryCompletion(
                proof.destinationId, proof.deliveryStopIds, identity,
              );
              if (applied) {
                transaction.approved = true;
                proof = {
                  ...proof, completesRoute: false, completedAt: identity.occurredAt, requiresAssignmentRefresh: true,
                };
                dispatch({ proof, type: 'STOP_COMPLETED' });
                showDialog({
                  message: '배송 완료 결과를 확인했습니다. 현재 배정을 확인한 뒤 증빙을 등록해 주세요.',
                  title: '배송 완료 결과 확인',
                  tone: 'info',
                });
                return;
              }
            } catch { /* Unknown, denied or unavailable receipts keep the original transaction. */ }
          }
          dispatch({ type: 'STOP_COMPLETION_FAILED' });
        }
        showDialog({
          message: error instanceof Error
            ? error.message
            : '배송 완료 상태를 저장하지 못했습니다.',
          title: '배송 완료 실패',
          tone: 'danger',
        });
        return;
      } finally {
        actionRef.current = null;
      }
    }

    if (photo !== null && !proof.proofUploaded) {
      actionRef.current = 'proof';
      dispatch({ type: 'PROOF_UPLOAD_STARTED' });
      try {
        await callbacks.onUploadProof(proof.deliveryStopId, photo);
        proof = { ...proof, proofUploaded: true };
        dispatch({ proof, type: 'PROOF_UPLOADED' });
      } catch (error) {
        dispatch({ type: 'PROOF_UPLOAD_FAILED' });
        showDialog({
          message: error instanceof Error
            ? error.message
            : '배송 증빙 사진을 업로드하지 못했습니다.',
          title: '증빙 업로드 실패',
          tone: 'danger',
        });
        return;
      } finally {
        actionRef.current = null;
      }
    }

    if (proof.completesRoute) {
      await completeFinalRoute(proof);
    } else {
      transactionCallbacksRef.current = null;
      completionTransactionRef.current = null;
      dispatch({ type: 'PROOF_CLOSED' });
    }
  }

  return {
    canStart,
    closeProofDelivery,
    confirmDeliveryCompletion,
    confirmDeliveryStart,
    dialog,
    executionState,
    handleOpenMap,
    isCompletionDisabled,
    isLocked: dialog !== null || isDeliveryExecutionLocked(executionState) || actionRef.current !== null,
    shouldShowActions,
    summary,
    submitDeliveryCompletion,
  };
}

export type DeliveryExecutionController = ReturnType<typeof useDeliveryExecution>;

export function DeliveryExecutionActions({
  controller,
  variant,
}: {
  controller: DeliveryExecutionController;
  variant: 'delivery' | 'map';
}) {
  const {
    canStart,
    confirmDeliveryCompletion,
    confirmDeliveryStart,
    executionState,
    handleOpenMap,
    isCompletionDisabled,
    shouldShowActions,
    summary,
  } = controller;

  if (!shouldShowActions) return null;

  return (
    <View style={[
      styles.container,
      variant === 'delivery' && styles.deliveryContainer,
    ]}>
          {variant === 'delivery' && summary !== null ? (
            <View style={styles.destinationCopy}>
              <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>
                지금 가는 배송지
              </Text>
              <Text style={styles.destinationName}>
                {summary.destinationName}
              </Text>
              <Text style={styles.destinationAddress}>
                {summary.address}
              </Text>
            </View>
          ) : null}

          {canStart ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                busy: executionState.phase === 'starting',
                disabled: executionState.phase === 'starting',
              }}
              disabled={executionState.phase === 'starting'}
              onPress={confirmDeliveryStart}
              style={({ pressed }) => [
                styles.startButton,
                pressed && styles.buttonPressed,
              ]}
            >
              {executionState.phase === 'starting' ? (
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
                {executionState.phase === 'completing-stop' ? (
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
  );
}

export function DeliveryExecutionOverlay({
  controller,
  protectedNotificationOverlay,
}: {
  controller: DeliveryExecutionController;
  protectedNotificationOverlay?: ReactNode;
}) {
  const proof = controller.executionState.proof;

  if (proof === null) return <>{controller.dialog}<View style={styles.notificationHold}>{protectedNotificationOverlay}</View></>;

  return (
    <DeliveryProofModal
      destinationName={proof.destinationName}
      savedCompletionOccurredAt={proof.completedAt}
      submittedCompletionOccurredAt={proof.completionIdentity?.occurredAt}
      requiresAssignmentRefresh={proof.requiresAssignmentRefresh}
      executionDialog={controller.dialog}
      protectedNotificationOverlay={protectedNotificationOverlay}
      executionPending={[
        'completing-route',
        'completing-stop',
        'uploading-proof',
      ].includes(controller.executionState.phase)}
      onClose={controller.closeProofDelivery}
      onConfirm={controller.submitDeliveryCompletion}
    />
  );
}

const styles = StyleSheet.create({
  notificationHold: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
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
