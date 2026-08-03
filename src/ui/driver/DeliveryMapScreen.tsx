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
import { DeliveryRouteMap } from './DeliveryRouteMap';

type DeliveryMapScreenProps = {
  canCompleteDelivery: boolean;
  depotCoordinate: DeliveryCoordinate | null;
  nextDeliveryStopId: string | null;
  onCompleteDelivery(deliveryStopId: string): Promise<void>;
  orders: DeliveryOrder[];
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
  timezone: string;
};

export function DeliveryMapScreen({
  canCompleteDelivery,
  depotCoordinate,
  nextDeliveryStopId,
  onCompleteDelivery,
  orders,
  serverRouteGeometry,
  timezone,
}: DeliveryMapScreenProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const summary = buildCurrentDeliverySummary(orders, nextDeliveryStopId);
  const isCompletionDisabled =
    summary === null || !canCompleteDelivery || isCompleting;

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

      <View style={styles.deliveryPanel}>
        <Text style={styles.panelLabel}>지금 가는 배송지</Text>
        <Text numberOfLines={1} style={styles.destinationName}>
          {summary?.destinationName ?? '배송 시작 전입니다'}
        </Text>

        <View style={styles.metrics}>
          <DeliveryMetric label="주문 수" value={`${summary?.orderCount ?? 0}건`} />
          <View style={styles.metricDivider} />
          <DeliveryMetric label="박스 수" value={`${summary?.boxCount ?? 0}개`} />
          <View style={styles.metricDivider} />
          <DeliveryMetric
            label="ETA"
            value={formatEta(summary?.estimatedArrivalAt ?? null, timezone)}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isCompletionDisabled }}
          disabled={isCompletionDisabled}
          onPress={confirmDeliveryCompletion}
          style={({ pressed }) => [
            styles.completeButton,
            isCompletionDisabled && styles.completeButtonDisabled,
            pressed && styles.completeButtonPressed,
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

function formatEta(estimatedArrivalAt: string | null, timezone: string): string {
  if (estimatedArrivalAt === null) {
    return '대기 중';
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
  panelLabel: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '800',
  },
  destinationName: {
    color: '#101828',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
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
  completeButton: {
    alignItems: 'center',
    backgroundColor: '#0b57d0',
    borderRadius: 12,
    height: 46,
    justifyContent: 'center',
  },
  completeButtonDisabled: {
    backgroundColor: '#b8c2d1',
  },
  completeButtonPressed: {
    opacity: 0.82,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});
