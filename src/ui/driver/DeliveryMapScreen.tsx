import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  buildCurrentDeliverySummary,
  type DeliveryCoordinate,
  type DeliveryOrder,
  type ServerDeliveryRouteGeometry,
} from '../../domain/delivery/deliveryPlan';
import { openDestinationMap } from '../../platform/destinationMap';
import type { DriverProofPhotoUpload } from '../../api/dsvDriverProofMedia';
import { useAppDialog } from './AppDialog';
import {
  DriverRefreshControl,
  DriverRefreshUpdatedAt,
} from './DriverRefreshControl';
import { DeliveryProofModal } from './DeliveryProofModal';
import { DeliveryRouteMap } from './DeliveryRouteMap';

type DeliveryMapScreenProps = {
  depotCoordinate: DeliveryCoordinate | null;
  etaStatus: 'FAILED' | 'PRE_PICKUP' | 'READY';
  lastUpdatedAt: Date | null;
  nextDeliveryStopId: string | null;
  onCompleteDelivery(destinationId: string, deliveryStopIds: string[]): Promise<void>;
  onStartDelivery(): Promise<void>;
  onRefresh(): void;
  onUploadProof(
    deliveryStopId: string,
    photo: Omit<DriverProofPhotoUpload, 'deliveryStopId' | 'routePlanId'>,
  ): Promise<void>;
  orders: DeliveryOrder[];
  refreshing: boolean;
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
  timezone: string;
};

export function DeliveryMapScreen({
  depotCoordinate,
  etaStatus,
  lastUpdatedAt,
  nextDeliveryStopId,
  onCompleteDelivery,
  onStartDelivery,
  onRefresh,
  onUploadProof,
  orders,
  refreshing,
  serverRouteGeometry,
  timezone,
}: DeliveryMapScreenProps) {
  const { dialog, showDialog } = useAppDialog();
  const [isCompleting, setIsCompleting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [proofDelivery, setProofDelivery] = useState<{
    deliveryStopId: string;
    destinationName: string;
  } | null>(null);
  const summary = buildCurrentDeliverySummary(orders, nextDeliveryStopId);
  const isCompletionDisabled =
    etaStatus === 'PRE_PICKUP' || summary === null || isCompleting || isStarting;

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
    if (summary === null || isCompletionDisabled) {
      return;
    }

    showDialog({
      actions: [
        { label: '취소', tone: 'secondary' },
        {
          onPress: () => {
            setIsCompleting(true);
            void onCompleteDelivery(summary.destinationId, summary.deliveryStopIds)
              .then(() => {
                setProofDelivery({
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

  function confirmDeliveryStart() {
    if (isStarting) return;

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

  return (
    <View style={styles.screen}>
      <View style={styles.mapArea}>
        <DeliveryRouteMap
          currentDeliveryStopId={nextDeliveryStopId}
          depotCoordinate={depotCoordinate}
          interactionMode="explore"
          orders={orders}
          serverRouteGeometry={serverRouteGeometry}
          style={styles.map}
        />

        {summary === null ? null : (
          <DeliveryAttentionBanner summary={summary} timezone={timezone} />
        )}

        {etaStatus === 'PRE_PICKUP' && orders.length > 0 ? (
          <View pointerEvents="box-none" style={styles.startOverlay}>
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
                  <Text style={styles.startButtonText}>배송 시작</Text>
                  <Text style={styles.startButtonCaption}>픽업 완료</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.detailsArea}>
        <ScrollView
          contentContainerStyle={styles.deliveryPanelContent}
          refreshControl={(
            <DriverRefreshControl
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.deliveryPanel}
        >
          <DriverRefreshUpdatedAt
            lastUpdatedAt={lastUpdatedAt}
            refreshing={refreshing}
          />
          <Text style={styles.panelLabel}>지금 가는 배송지</Text>
          <View style={styles.destinationRow}>
            {summary === null ? null : (
              <View style={styles.destinationSequenceBadge}>
                <Text style={styles.destinationSequenceText}>
                  {summary.destinationSequence}
                </Text>
              </View>
            )}
            <Text numberOfLines={1} style={styles.destinationName}>
              {summary?.destinationName ?? '배송 시작 전입니다'}
            </Text>
            {summary === null ? null : (
              <Text numberOfLines={2} style={styles.destinationAddress}>
                {summary.address}
              </Text>
            )}
          </View>

          <View style={styles.metrics}>
            <DeliveryMetric label="주문 수" value={`${summary?.orderCount ?? 0}건`} />
            <View style={styles.metricDivider} />
            <DeliveryMetric label="박스 수" value={`${summary?.boxCount ?? 0}개`} />
            <View style={styles.metricDivider} />
            <DeliveryMetric
              label="ETA"
              value={formatEta(
                summary?.estimatedArrivalAt ?? null,
                timezone,
                etaStatus,
              )}
            />
          </View>

          {summary === null ? null : (
            <View style={styles.conditionSection}>
              <Text style={styles.conditionSectionTitle}>주문 정보</Text>
              <View style={styles.conditionList}>
                {summary.orderBoxes.map(({ boxCount, conditionCode, orderId }) => (
                  <View key={orderId} style={styles.conditionRow}>
                    <View style={[
                      styles.conditionDot,
                      conditionDotStyle(conditionCode),
                    ]} />
                    <Text style={styles.conditionLabel}>
                      {formatConditionLabel(conditionCode)}
                    </Text>
                    <Text style={styles.conditionBoxCount}>{boxCount}박스</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <View style={styles.actionFooter}>
          <View style={styles.actionButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: summary === null }}
            disabled={summary === null}
            onPress={() => void handleOpenMap()}
            style={({ pressed }) => [
              styles.mapButton,
              summary === null && styles.mapButtonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.mapButtonText}>지도 열기</Text>
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
              <Text style={styles.completeButtonText}>배송 완료</Text>
            )}
          </Pressable>
          </View>
        </View>
      </View>

      {proofDelivery === null ? null : (
        <DeliveryProofModal
          destinationName={proofDelivery.destinationName}
          onClose={() => setProofDelivery(null)}
          onUpload={(photo) => (
            onUploadProof(proofDelivery.deliveryStopId, photo)
          )}
        />
      )}
      {dialog}
    </View>
  );
}

function DeliveryAttentionBanner({
  summary,
  timezone,
}: {
  summary: NonNullable<ReturnType<typeof buildCurrentDeliverySummary>>;
  timezone: string;
}) {
  const badges: string[] = [];
  if (summary.timeWindowEnd !== null || summary.timeWindowStart !== null) {
    const start = formatConstraintTime(summary.timeWindowStart, timezone);
    const end = formatConstraintTime(summary.timeWindowEnd, timezone);
    const window = start !== null && end !== null
      ? `${start}–${end}`
      : `${end ?? start}까지`;
    badges.push(
      `시간 지정 ${window}${summary.timeWindowOrderCount > 1 ? ` · ${summary.timeWindowOrderCount}건` : ''}`,
    );
  }
  for (const conditionCode of summary.conditionCodes) {
    const label = formatSpecialCondition(conditionCode);
    if (label !== null) badges.push(label);
  }
  if (summary.notes.length > 0) badges.push(summary.notes[0] as string);

  if (badges.length === 0) return null;

  return (
    <View pointerEvents="none" style={styles.attentionBanner}>
      {badges.map((badge) => (
        <View key={badge} style={styles.attentionBadge}>
          <Text numberOfLines={1} style={styles.attentionText}>{badge}</Text>
        </View>
      ))}
    </View>
  );
}

function DeliveryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatEta(
  estimatedArrivalAt: string | null,
  timezone: string,
  etaStatus: 'FAILED' | 'PRE_PICKUP' | 'READY',
): string {
  if (estimatedArrivalAt === null) {
    if (etaStatus === 'PRE_PICKUP') return '출발 전';
    if (etaStatus === 'FAILED') return '계산 실패';
    return '계산 중';
  }

  const date = new Date(estimatedArrivalAt);
  if (Number.isNaN(date.getTime())) {
    return '대기 중';
  }

  try {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
    }).format(date);
  }
}

function formatConstraintTime(value: string | null, timezone: string): string | null {
  if (value === null) return null;
  if (/^\d{2}:\d{2}$/u.test(value)) return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : formatEta(value, timezone, 'READY');
}

function formatSpecialCondition(conditionCode: string): string | null {
  const normalized = conditionCode.trim().toUpperCase();
  if (normalized === 'COLD' || normalized === 'CHILLED') return '냉장 배송';
  if (normalized === 'FROZEN') return '냉동 배송';
  return null;
}

function formatConditionLabel(conditionCode: string): string {
  const normalized = conditionCode.trim().toUpperCase();
  if (normalized === 'COLD' || normalized === 'CHILLED') return 'Cold';
  if (normalized === 'FROZEN') return 'Frozen';
  if (normalized === 'AMBIENT') return 'Ambient';
  return conditionCode;
}

function conditionDotStyle(conditionCode: string) {
  const normalized = conditionCode.trim().toUpperCase();
  if (normalized === 'COLD' || normalized === 'CHILLED') {
    return styles.conditionDotCold;
  }
  if (normalized === 'FROZEN') return styles.conditionDotFrozen;
  return styles.conditionDotAmbient;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  mapArea: {
    height: '56%',
    position: 'relative',
  },
  startOverlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 3,
    elevation: 10,
    height: 76,
    justifyContent: 'center',
    minWidth: 196,
    paddingHorizontal: 32,
    shadowColor: '#101828',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  startButtonCaption: {
    color: '#dbeafe',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  detailsArea: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: 1,
    elevation: 8,
    flex: 1,
  },
  deliveryPanel: {
    flex: 1,
  },
  deliveryPanelContent: {
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  attentionBanner: {
    alignItems: 'flex-start',
    gap: 6,
    left: 12,
    position: 'absolute',
    right: 12,
    top: 12,
  },
  attentionBadge: {
    backgroundColor: 'rgba(255, 247, 237, 0.96)',
    borderColor: '#fdba74',
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  attentionText: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '800',
  },
  panelLabel: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '800',
  },
  destinationName: {
    color: '#101828',
    fontSize: 18,
    fontWeight: '900',
    flex: 0.38,
  },
  destinationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  destinationSequenceBadge: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 11,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  destinationSequenceText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  destinationAddress: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    flex: 0.62,
    textAlign: 'right',
  },
  metrics: {
    alignItems: 'center',
    flexDirection: 'row',
    marginVertical: 10,
  },
  metric: {
    flex: 1,
    gap: 1,
  },
  metricDivider: {
    backgroundColor: '#e5e7eb',
    height: 28,
    width: 1,
  },
  metricLabel: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  metricValue: {
    color: '#1d2939',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  conditionSection: {
    gap: 7,
  },
  conditionSectionTitle: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '800',
  },
  conditionList: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  conditionRow: {
    alignItems: 'center',
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  conditionDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 9,
    width: 8,
  },
  conditionDotAmbient: {
    backgroundColor: '#f59e0b',
  },
  conditionDotCold: {
    backgroundColor: '#0ea5e9',
  },
  conditionDotFrozen: {
    backgroundColor: '#6366f1',
  },
  conditionLabel: {
    color: '#344054',
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  conditionBoxCount: {
    color: '#101828',
    fontSize: 13,
    fontWeight: '900',
  },
  actionFooter: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
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
    height: 46,
    justifyContent: 'center',
  },
  mapButtonDisabled: {
    borderColor: '#cbd5e1',
  },
  mapButtonText: {
    color: '#0b57d0',
    fontSize: 14,
    fontWeight: '900',
  },
  completeButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 12,
    flex: 1,
    height: 46,
    justifyContent: 'center',
  },
  completeButtonDisabled: {
    backgroundColor: '#b8c2d1',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});
