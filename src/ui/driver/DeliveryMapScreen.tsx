import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  buildCurrentDeliverySummary,
  type DeliveryCoordinate,
  type DeliveryOrder,
  type ServerDeliveryRouteGeometry,
} from '../../domain/delivery/deliveryPlan';
import { DriverRefreshControl } from './DriverRefreshControl';
import {
  DeliveryExecutionActions,
  type DeliveryExecutionController,
} from './DeliveryExecutionActions';
import { DeliveryRouteMap } from './DeliveryRouteMap';

type DeliveryMapScreenProps = {
  depotCoordinate: DeliveryCoordinate | null;
  executionController: DeliveryExecutionController;
  etaStatus: 'FAILED' | 'PRE_PICKUP' | 'READY';
  isReadOnly: boolean;
  lastUpdatedAt: Date | null;
  nextDeliveryStopId: string | null;
  onRefresh(): void;
  orders: DeliveryOrder[];
  refreshing: boolean;
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
  timezone: string;
};

export function DeliveryMapScreen({
  depotCoordinate,
  executionController,
  etaStatus,
  isReadOnly,
  lastUpdatedAt,
  nextDeliveryStopId,
  onRefresh,
  orders,
  refreshing,
  serverRouteGeometry,
  timezone,
}: DeliveryMapScreenProps) {
  const { fontScale } = useWindowDimensions();
  const summary = buildCurrentDeliverySummary(orders, nextDeliveryStopId);
  const totalBoxes = orders.reduce((total, order) => total + order.shippedBoxes, 0);

  return (
    <View style={styles.screen}>
      <View style={[
        styles.mapArea,
        fontScale > 1.3 && styles.mapAreaLargeText,
      ]}>
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

      </View>

      <View style={styles.detailsArea}>
        <ScrollView
          contentContainerStyle={styles.deliveryPanelContent}
          refreshControl={(
            <DriverRefreshControl
              lastUpdatedAt={lastUpdatedAt}
              onRefresh={onRefresh}
              refreshing={refreshing}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.deliveryPanel}
        >
          <Text maxFontSizeMultiplier={1.3} style={styles.panelLabel}>
            {isReadOnly ? '완료된 배차' : '지금 가는 배송지'}
          </Text>
          <View style={styles.destinationRow}>
            {summary === null ? null : (
              <View style={styles.destinationSequenceBadge}>
                <Text maxFontSizeMultiplier={1.3} style={styles.destinationSequenceText}>
                  {summary.destinationSequence}
                </Text>
              </View>
            )}
            <View style={styles.destinationCopy}>
              <Text style={styles.destinationName}>
                {summary?.destinationName ?? (
                  isReadOnly ? '모든 배송을 완료했습니다' : '배송 시작 전입니다'
                )}
              </Text>
              {summary === null ? null : (
                <Text style={styles.destinationAddress}>
                  {summary.address}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.metrics}>
            <DeliveryMetric
              label="주문 수"
              value={`${isReadOnly ? orders.length : summary?.orderCount ?? 0}건`}
            />
            <View style={styles.metricDivider} />
            <DeliveryMetric
              label="박스 수"
              value={`${isReadOnly ? totalBoxes : summary?.boxCount ?? 0}개`}
            />
            <View style={styles.metricDivider} />
            <DeliveryMetric
              label="ETA"
              value={isReadOnly
                ? '종료'
                : formatEta(
                    summary?.estimatedArrivalAt ?? null,
                    timezone,
                    etaStatus,
                  )}
            />
          </View>

          {summary === null ? null : (
            <View style={styles.conditionSection}>
              <Text maxFontSizeMultiplier={1.3} style={styles.conditionSectionTitle}>
                주문 정보
              </Text>
              <View style={styles.conditionList}>
                {summary.orderBoxes.map(({ boxCount, conditionCode, orderId }) => (
                  <View key={orderId} style={styles.conditionRow}>
                    <View style={[
                      styles.conditionDot,
                      conditionDotStyle(conditionCode),
                    ]} />
                    <Text maxFontSizeMultiplier={1.3} style={styles.conditionLabel}>
                      {formatConditionLabel(conditionCode)}
                    </Text>
                    <Text maxFontSizeMultiplier={1.3} style={styles.conditionBoxCount}>
                      {boxCount}박스
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        <DeliveryExecutionActions
          controller={executionController}
          variant="map"
        />
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
          <Text
            maxFontSizeMultiplier={1.3}
            numberOfLines={2}
            style={styles.attentionText}
          >
            {badge}
          </Text>
        </View>
      ))}
    </View>
  );
}

function DeliveryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text maxFontSizeMultiplier={1.3} style={styles.metricLabel}>{label}</Text>
      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
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
  mapAreaLargeText: {
    height: '42%',
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
    lineHeight: 24,
  },
  destinationRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  destinationCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
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
    color: '#475467',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
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
});
