import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { DeliveryRouteMap } from './DeliveryRouteMap';

type DeliveryMapScreenProps = {
  depotCoordinate: DeliveryCoordinate | null;
  etaStatus: 'FAILED' | 'PRE_PICKUP' | 'READY';
  nextDeliveryStopId: string | null;
  onCompleteDelivery(deliveryStopId: string): Promise<void>;
  orders: DeliveryOrder[];
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
  timezone: string;
};

export function DeliveryMapScreen({
  depotCoordinate,
  etaStatus,
  nextDeliveryStopId,
  onCompleteDelivery,
  orders,
  serverRouteGeometry,
  timezone,
}: DeliveryMapScreenProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const summary = buildCurrentDeliverySummary(orders, nextDeliveryStopId);
  const isCompletionDisabled = summary === null || isCompleting;

  async function handleOpenMap() {
    if (summary === null) return;

    try {
      await openDestinationMap(summary.address);
    } catch {
      Alert.alert(
        '주소를 복사했습니다',
        '지도 앱을 열지 못했습니다. 다른 지도 앱에서 주소를 붙여넣어 주세요.',
      );
    }
  }

  function confirmDeliveryCompletion() {
    if (summary === null || isCompletionDisabled) {
      return;
    }

    Alert.alert(
      '배송 완료',
      `${summary.destinationName} 배송을 완료 처리할까요?`,
      [
        { style: 'cancel', text: '취소' },
        {
          onPress: () => {
            setIsCompleting(true);
            void onCompleteDelivery(summary.deliveryStopId)
              .catch((error: unknown) => {
                Alert.alert(
                  '배송 완료 실패',
                  error instanceof Error
                    ? error.message
                    : '배송 완료 상태를 저장하지 못했습니다.',
                );
              })
              .finally(() => setIsCompleting(false));
          },
          text: '완료',
        },
      ],
    );
  }

  return (
    <View style={styles.screen}>
      <DeliveryRouteMap
        depotCoordinate={depotCoordinate}
        interactionMode="explore"
        orders={orders}
        serverRouteGeometry={serverRouteGeometry}
        style={styles.map}
      />

      {summary === null ? null : (
        <DeliveryAttentionBanner summary={summary} timezone={timezone} />
      )}

      <View style={styles.deliveryPanel}>
        <Text style={styles.panelLabel}>지금 가는 배송지</Text>
        <View style={styles.destinationRow}>
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

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  map: {
    flex: 1,
    width: '100%',
  },
  deliveryPanel: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: 1,
    elevation: 8,
    paddingBottom: 12,
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
    flex: 0.42,
  },
  destinationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  destinationAddress: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    flex: 0.58,
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
