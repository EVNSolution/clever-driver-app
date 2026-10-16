import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { destinationCompletionTime } from '../../domain/delivery/deliveryCompletionTime';
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

// Share of the screen the open sheet covers, leaving the selected pin visible above it; large text gets more room.
const SHEET_OPEN_SHARE = 0.6;
const SHEET_OPEN_SHARE_LARGE_TEXT = 0.72;
const SHEET_SETTLE = { duration: 260, easing: Easing.out(Easing.cubic) };
const SHEET_FLICK_VELOCITY = 600;

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
  const deliveryScrollRef = useRef<ScrollView>(null);
  const previousDeliveryStopIdRef = useRef<string | null>(nextDeliveryStopId);
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [screenHeight, setScreenHeight] = useState(0);
  const [peekHeight, setPeekHeight] = useState(0);

  const currentDestinationId = orders.find(({ id }) => id === nextDeliveryStopId)?.destinationId ?? null;
  const shownDestinationId = selectedDestinationId !== null
    && orders.some(({ destinationId }) => destinationId === selectedDestinationId)
    ? selectedDestinationId
    : currentDestinationId;
  const isCurrentShown = shownDestinationId === currentDestinationId;
  const destinationOrders = orders.filter(({ destinationId }) => destinationId === shownDestinationId);
  const summary = buildCurrentDeliverySummary(
    orders,
    isCurrentShown ? nextDeliveryStopId : destinationOrders[0]?.id ?? null,
  );
  const completionTime = destinationCompletionTime(destinationOrders);
  const totalBoxes = orders.reduce((total, order) => total + order.shippedBoxes, 0);

  const openHeight = Math.round(
    screenHeight * (fontScale > 1.3 ? SHEET_OPEN_SHARE_LARGE_TEXT : SHEET_OPEN_SHARE),
  );
  const closedOffset = Math.max(0, openHeight - peekHeight);
  const sheetOffset = useSharedValue(0);
  const dragStartOffset = useSharedValue(0);
  const maxOffset = useSharedValue(0);

  useEffect(() => {
    maxOffset.set(closedOffset);
    sheetOffset.set(withTiming(isSheetOpen ? 0 : closedOffset, SHEET_SETTLE));
  }, [closedOffset, isSheetOpen, maxOffset, sheetOffset]);

  useEffect(() => {
    if (previousDeliveryStopIdRef.current === nextDeliveryStopId) return;
    previousDeliveryStopIdRef.current = nextDeliveryStopId;
    setSelectedDestinationId(null);
    deliveryScrollRef.current?.scrollTo({ animated: false, y: 0 });
  }, [nextDeliveryStopId]);

  const sheetDrag = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      dragStartOffset.set(sheetOffset.get());
    })
    .onUpdate((event) => {
      sheetOffset.set(Math.max(0, Math.min(maxOffset.get(), dragStartOffset.get() + event.translationY)));
    })
    .onEnd((event) => {
      const open = event.velocityY < -SHEET_FLICK_VELOCITY
        || (event.velocityY <= SHEET_FLICK_VELOCITY && sheetOffset.get() < maxOffset.get() / 2);
      sheetOffset.set(withTiming(open ? 0 : maxOffset.get(), SHEET_SETTLE));
      scheduleOnRN(setIsSheetOpen, open);
    });
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetOffset.get() }],
  }));

  function selectDestination(destinationId: string) {
    setSelectedDestinationId(destinationId);
    setIsSheetOpen(true);
    deliveryScrollRef.current?.scrollTo({ animated: false, y: 0 });
  }

  return (
    <View
      onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
      style={styles.screen}
    >
      <DeliveryRouteMap
        bottomInset={isSheetOpen ? openHeight : peekHeight}
        currentDeliveryStopId={nextDeliveryStopId}
        depotCoordinate={depotCoordinate}
        interactionMode="explore"
        onSelectDestination={selectDestination}
        orders={orders}
        selectedDestinationId={isCurrentShown ? null : shownDestinationId}
        serverRouteGeometry={serverRouteGeometry}
        style={styles.map}
      />

      {summary === null ? null : (
        <DeliveryAttentionBanner summary={summary} timezone={timezone} />
      )}

      <Animated.View
        style={[
          styles.sheet,
          screenHeight > 0 && { height: openHeight },
          sheetStyle,
        ]}
      >
        <View onLayout={(event) => setPeekHeight(event.nativeEvent.layout.height)}>
          <GestureDetector gesture={sheetDrag}>
            <View style={styles.sheetHeader}>
              <Pressable
                accessibilityLabel={isSheetOpen ? '배송 정보 접기' : '배송 정보 펼치기'}
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => setIsSheetOpen((open) => !open)}
                style={styles.sheetHandleArea}
              >
                <View style={styles.sheetHandle} />
              </Pressable>
              <Text maxFontSizeMultiplier={1.3} style={styles.panelLabel}>
                {isReadOnly ? '완료된 배차' : isCurrentShown ? '지금 가는 배송지' : '선택한 배송지'}
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
                  <Text numberOfLines={isSheetOpen ? undefined : 1} style={styles.destinationName}>
                    {summary?.destinationName ?? (
                      isReadOnly ? '모든 배송을 완료했습니다' : '배송 시작 전입니다'
                    )}
                    {completionTime === null ? '' : ` (${completionTime})`}
                  </Text>
                  {summary === null ? null : (
                    <Text numberOfLines={isSheetOpen ? undefined : 1} style={styles.destinationAddress}>
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
            </View>
          </GestureDetector>

          {isCurrentShown ? (
            <DeliveryExecutionActions
              controller={executionController}
              variant="map"
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setSelectedDestinationId(null);
                setIsSheetOpen(false);
              }}
              style={styles.backToCurrentButton}
            >
              <Text maxFontSizeMultiplier={1.3} style={styles.backToCurrentText}>
                지금 가는 배송지 보기
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          contentContainerStyle={styles.deliveryPanelContent}
          ref={deliveryScrollRef}
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
          {destinationOrders.length === 0 ? null : (
            <View style={styles.conditionSection}>
              <Text maxFontSizeMultiplier={1.3} style={styles.conditionSectionTitle}>
                상품 정보
              </Text>
              <View style={styles.conditionList}>
                {destinationOrders.map((order) => (
                  <View key={order.id} style={styles.conditionRow}>
                    <View style={styles.conditionHeader}>
                      <View style={[
                        styles.conditionDot,
                        conditionDotStyle(order.conditionCode),
                      ]} />
                      <Text maxFontSizeMultiplier={1.3} style={styles.conditionLabel}>
                        {formatConditionLabel(order.conditionCode)}
                      </Text>
                      <Text maxFontSizeMultiplier={1.3} style={styles.conditionBoxCount}>
                        {order.shippedBoxes}박스
                      </Text>
                    </View>
                    {(order.items ?? []).map((item, index) => (
                      <Text
                        key={`${order.id}:${index}`}
                        maxFontSizeMultiplier={1.3}
                        style={styles.itemLine}
                      >
                        {item.name}
                        {item.options.length === 0
                          ? ''
                          : ` (${item.options.map(({ key, value }) => `${key}: ${value}`).join(', ')})`}
                        {` × ${item.quantity}`}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
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
    backgroundColor: '#e8eef7',
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    bottom: 0,
    elevation: 12,
    left: 0,
    position: 'absolute',
    right: 0,
    shadowColor: '#101828',
    shadowOffset: { height: -4, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
  },
  sheetHeader: {
    paddingHorizontal: 18,
  },
  sheetHandleArea: {
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 10,
  },
  sheetHandle: {
    backgroundColor: '#d0d5dd',
    borderRadius: 3,
    height: 5,
    width: 44,
  },
  backToCurrentButton: {
    alignItems: 'center',
    backgroundColor: '#eff4ff',
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 18,
    paddingVertical: 13,
  },
  backToCurrentText: {
    color: '#0b57d0',
    fontSize: 14,
    fontWeight: '800',
  },
  deliveryPanel: {
    flex: 1,
  },
  deliveryPanelContent: {
    paddingBottom: 24,
    paddingHorizontal: 18,
    paddingTop: 4,
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
    borderBottomColor: '#e2e8f0',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  conditionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  itemLine: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    paddingLeft: 17,
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
