import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { DriverCompletedRouteHistory } from '../../api/dsvDriverRoute';
import {
  groupDeliveryOrdersByDestination,
  moveDeliveryOrderToIndex,
  resolveDeliveryDestinationProgressState,
  type DeliveryConditionCode,
  type DeliveryDestinationGroup,
  type DeliveryOrder,
  type DeliveryRouteMarkerState,
  type ServerDeliveryRouteGeometry,
} from '../../domain/delivery/deliveryPlan';
import {
  EMPTY_DESTINATION_NOTES,
  type DestinationNotes,
  type DestinationNoteValues,
} from '../../domain/delivery/destinationNotesPreview';
import {
  createDeliveryOrderPositions,
  moveDeliveryOrderPosition,
  resolveDeliveryOrderDragTarget,
  type DeliveryOrderPositions,
} from '../../domain/delivery/sortableOrder';
import { useAppDialog } from './AppDialog';
import { DriverRefreshControl } from './DriverRefreshControl';
import { DeliveryRouteMap } from './DeliveryRouteMap';
import { DestinationNotesSheet } from './DestinationNotesSheet';

const EDITOR_ORDER_ROW_HEIGHT = 72;
const EDITOR_ORDER_ROW_GAP = 6;
const EDITOR_ORDER_ROW_STEP =
  EDITOR_ORDER_ROW_HEIGHT + EDITOR_ORDER_ROW_GAP;
const EDITOR_LIST_PADDING_TOP = 8;
const EDITOR_LIST_PADDING_BOTTOM = 18;
const NEIGHBOR_MOVE_DURATION_MS = 170;
const DRAG_SETTLE_DURATION_MS = 140;
const DRAG_ACTIVATION_DISTANCE = 2;

type DeliveryScreenProps = {
  deliveryDate: string;
  destinationNotesById: Record<string, DestinationNotes>;
  historySummary?: DriverCompletedRouteHistory;
  isEditing: boolean;
  isReadOnly: boolean;
  lastUpdatedAt: Date | null;
  nextDeliveryStopId: string | null;
  onAcknowledgeTimeConstraint(deliveryStopId: string): Promise<void>;
  onEditingChange(isEditing: boolean): void;
  onOpenDeliverySpace(): void;
  onOrdersChange(orders: DeliveryOrder[]): void;
  onReadDriverMessage(messageId: string): Promise<void>;
  onRefresh(): void;
  onSaveDestinationNotes(
    destinationId: string,
    previous: DestinationNotes,
    values: DestinationNoteValues,
  ): Promise<DestinationNotes>;
  orders: DeliveryOrder[];
  refreshing: boolean;
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
  timezone: string;
};

export function DeliveryScreen({
  deliveryDate,
  destinationNotesById: initialDestinationNotesById,
  historySummary,
  isEditing,
  isReadOnly,
  lastUpdatedAt,
  nextDeliveryStopId,
  onAcknowledgeTimeConstraint,
  onEditingChange,
  onOpenDeliverySpace,
  onOrdersChange,
  onReadDriverMessage,
  onRefresh,
  onSaveDestinationNotes,
  orders,
  refreshing,
  serverRouteGeometry,
  timezone,
}: DeliveryScreenProps) {
  const { dialog, showDialog } = useAppDialog();
  const deliveryScrollRef = useRef<ScrollView>(null);
  const orderListTopRef = useRef(0);
  const revealedDeliveryStopIdRef = useRef<string | null>(nextDeliveryStopId);
  const [draftOrders, setDraftOrders] = useState(orders);
  const [isOrderActionPending, setIsOrderActionPending] = useState(false);
  const [selectedDestinationId, setSelectedDestinationId] =
    useState<string | null>(null);
  const totalBoxes = orders.reduce(
    (sum, order) => sum + order.shippedBoxes,
    0,
  );
  const destinationGroups = groupDeliveryOrdersByDestination(orders);
  const selectedDestinationGroup = selectedDestinationId === null
    ? null
    : destinationGroups.find(
      (group) => group.destinationId === selectedDestinationId,
    ) ?? null;

  function startEditing() {
    setDraftOrders(orders);
    onEditingChange(true);
  }

  function cancelEditing() {
    setDraftOrders(orders);
    onEditingChange(false);
  }

  function finishEditing() {
    onOrdersChange(draftOrders);
    onEditingChange(false);
  }

  function handleDrop(orderId: string, targetIndex: number) {
    setDraftOrders((currentOrders) => {
      const reordered = moveDeliveryOrderToIndex(
        currentOrders,
        orderId,
        targetIndex,
      );

      if (reordered === currentOrders) {
        return currentOrders;
      }

      return reordered;
    });
  }

  function revealCurrentDestination(event: LayoutChangeEvent) {
    if (
      nextDeliveryStopId === null ||
      revealedDeliveryStopIdRef.current === nextDeliveryStopId
    ) {
      return;
    }

    revealedDeliveryStopIdRef.current = nextDeliveryStopId;
    const destinationTop = event.nativeEvent.layout.y;
    requestAnimationFrame(() => {
      deliveryScrollRef.current?.scrollTo({
        animated: false,
        y: Math.max(0, orderListTopRef.current + destinationTop - 12),
      });
    });
  }

  async function runOrderAction(action: () => Promise<void>) {
    setIsOrderActionPending(true);
    try {
      await action();
    } catch (error) {
      showDialog({
        message: error instanceof Error ? error.message : '다시 시도해 주세요.',
        title: '확인하지 못했습니다',
        tone: 'warning',
      });
    } finally {
      setIsOrderActionPending(false);
    }
  }

  if (isEditing && !isReadOnly) {
    return (
      <OrderSequenceEditor
        currentDeliveryStopId={nextDeliveryStopId}
        onCancel={cancelEditing}
        onDone={finishEditing}
        onDrop={handleDrop}
        orders={draftOrders}
        serverRouteGeometry={serverRouteGeometry}
      />
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.deliveryContent}
        ref={deliveryScrollRef}
        refreshControl={(
          <DriverRefreshControl
            lastUpdatedAt={lastUpdatedAt}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.deliveryHeader}>
        <View style={styles.deliveryHeadingCopy}>
          <Text style={styles.title}>
            {formatDeliveryDate(deliveryDate)} 배송
          </Text>
          <View style={styles.summaryItems}>
            {historySummary === undefined ? (
              <>
                <Text style={styles.summaryText}>주문 {orders.length}건</Text>
                <View style={styles.summaryDivider} />
                <Text style={styles.summaryText}>배송지 {destinationGroups.length}곳</Text>
                <View style={styles.summaryDivider} />
                <Text style={styles.summaryText}>{totalBoxes}박스</Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryText}>배송 {historySummary.stopCount}건</Text>
                <View style={styles.summaryDivider} />
                <Text style={styles.summaryText}>
                  완료 {historySummary.completedStopCount}건
                </Text>
                <View style={styles.summaryDivider} />
                <Text style={styles.summaryText}>
                  실패 {historySummary.failedStopCount}건
                </Text>
              </>
            )}
          </View>
        </View>
        {!isReadOnly ? <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="주문 목록 열기"
            accessibilityRole="button"
            onPress={onOpenDeliverySpace}
            style={({ pressed }) => [
              styles.headerActionButton,
              styles.spaceButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.headerActionText, styles.spaceButtonText]}>
              주문 목록
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="배송 순서 편집"
            accessibilityRole="button"
            accessibilityState={{ disabled: orders.length === 0 }}
            disabled={orders.length === 0}
            onPress={startEditing}
            style={({ pressed }) => [
              styles.headerActionButton,
              styles.editButton,
              orders.length === 0 && styles.editButtonDisabled,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.headerActionText, styles.editButtonText]}>
              순서 편집
            </Text>
          </Pressable>
        </View> : null}
      </View>

      <View
        onLayout={(event) => {
          orderListTopRef.current = event.nativeEvent.layout.y;
        }}
        style={styles.orderList}
      >
        {destinationGroups.length === 0 ? (
          <View style={styles.emptyState}>
            {historySummary === undefined ? (
              <>
                <Text style={styles.emptyStateTitle}>이 배차에 배정된 배송이 없습니다.</Text>
                <Text style={styles.emptyStateText}>
                  주문 목록에서 공용 배송을 확인할 수 있습니다.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyStateTitle}>완료된 배차입니다.</Text>
                <Text style={styles.emptyStateText}>
                  완료 이력에는 배송 결과 요약만 표시됩니다.
                </Text>
              </>
            )}
          </View>
        ) : null}
        {destinationGroups.map((group, index) => {
          const progressState = resolveDeliveryDestinationProgressState(
            group,
            nextDeliveryStopId,
          );

          return (
            <DestinationGroupRow
              group={group}
              index={index}
              isLast={index === destinationGroups.length - 1}
              key={`${group.key}:${progressState}`}
              onCurrentLayout={revealCurrentDestination}
              onOpenDeliveryInformation={() => {
                setSelectedDestinationId(group.destinationId);
              }}
              progressState={progressState}
            />
          );
        })}
      </View>
      </ScrollView>
      {selectedDestinationGroup === null ? null : (
        <DestinationNotesSheet
          address={selectedDestinationGroup.address}
          destinationName={selectedDestinationGroup.destinationName}
          isOrderActionPending={isOrderActionPending}
          isReadOnly={isReadOnly}
          orders={selectedDestinationGroup.orders}
          notes={initialDestinationNotesById[selectedDestinationGroup.destinationId]
            ?? EMPTY_DESTINATION_NOTES}
          onAcknowledgeTimeConstraint={(deliveryStopId) => runOrderAction(
            () => onAcknowledgeTimeConstraint(deliveryStopId),
          )}
          onClose={() => setSelectedDestinationId(null)}
          onReadDriverMessage={(messageId) => runOrderAction(
            () => onReadDriverMessage(messageId),
          )}
          onSave={async (values) => {
            const destinationId = selectedDestinationGroup.destinationId;
            const previous = initialDestinationNotesById[destinationId]
              ?? EMPTY_DESTINATION_NOTES;
            try {
              await onSaveDestinationNotes(destinationId, previous, values);
              setSelectedDestinationId(null);
            } catch (error) {
              showDialog({
                message: error instanceof Error ? error.message : '다시 시도해 주세요.',
                title: '배송지 정보를 저장하지 못했습니다',
                tone: 'warning',
              });
            }
          }}
          timezone={timezone}
        />
      )}
      {dialog}
    </>
  );
}

function formatDeliveryDate(deliveryDate: string): string {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(
    deliveryDate,
  );

  if (match?.groups === undefined) {
    return deliveryDate;
  }

  return `${Number(match.groups.month)}월 ${Number(match.groups.day)}일`;
}

function DestinationGroupRow({
  group,
  index,
  isLast,
  onCurrentLayout,
  onOpenDeliveryInformation,
  progressState,
}: {
  group: DeliveryDestinationGroup;
  index: number;
  isLast: boolean;
  onCurrentLayout(event: LayoutChangeEvent): void;
  onOpenDeliveryInformation(): void;
  progressState: DeliveryRouteMarkerState;
}) {
  const isCompleted = progressState === 'completed';
  const isCurrent = progressState === 'current';

  return (
    <View
      onLayout={isCurrent ? onCurrentLayout : undefined}
      style={[
        !isLast && !isCompleted && !isCurrent && styles.orderRowDivider,
        (isCompleted || isCurrent) && styles.destinationGroupEmphasis,
        isCompleted && styles.destinationGroupCompleted,
        isCurrent && styles.destinationGroupCurrent,
      ]}
    >
      <Pressable
        accessibilityLabel={`${group.destinationName} 배송 정보 열기`}
        accessibilityRole="button"
        onPress={onOpenDeliveryInformation}
        style={({ pressed }) => [
          styles.orderRow,
          pressed && styles.groupRowPressed,
        ]}
      >
        <View
          style={[
            styles.sequenceBadge,
            isCompleted && styles.sequenceBadgeCompleted,
            isCurrent && styles.sequenceBadgeCurrent,
          ]}
        >
          <Text
            style={[
              styles.sequenceBadgeText,
              (isCompleted || isCurrent) && styles.sequenceBadgeTextInverse,
            ]}
          >
            {index + 1}
          </Text>
        </View>
        <View style={styles.orderCopy}>
          <Text
            numberOfLines={1}
            style={[
              styles.destinationName,
              isCompleted && styles.completedPrimaryText,
            ]}
          >
            {group.destinationName}
          </Text>
          <Text
            numberOfLines={2}
            style={[styles.address, isCompleted && styles.completedSecondaryText]}
          >
            {group.address}
          </Text>
          <Text
            style={[
              styles.groupOrderCount,
              isCompleted && styles.completedSecondaryText,
            ]}
          >
            주문 {group.orderCount}건
          </Text>
        </View>
        <View style={styles.orderRight}>
          {isCurrent ? (
            <View style={styles.currentDeliveryBadge}>
              <Text style={styles.currentDeliveryBadgeText}>배송 중</Text>
            </View>
          ) : null}
          <View style={styles.orderRightDetails}>
            <Text
              numberOfLines={1}
              style={[
                styles.groupConditions,
                isCompleted && styles.completedSecondaryText,
              ]}
            >
              {group.conditionCodes.join(' · ')}
            </Text>
            <Text style={[styles.boxCount, isCompleted && styles.completedBoxText]}>
              {group.boxCount}박스
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function ConditionBadge({ conditionCode }: {
  conditionCode: DeliveryConditionCode;
}) {
  const isCold = conditionCode === 'COLD';

  return (
    <View
      style={[
        styles.conditionBadge,
        isCold && styles.conditionBadgeCold,
      ]}
    >
      <Text
        style={[
          styles.conditionBadgeText,
          isCold && styles.conditionBadgeTextCold,
        ]}
      >
        {conditionCode}
      </Text>
    </View>
  );
}

function OrderSequenceEditor({
  currentDeliveryStopId,
  onCancel,
  onDone,
  onDrop,
  orders,
  serverRouteGeometry,
}: {
  currentDeliveryStopId: string | null;
  onCancel(): void;
  onDone(): void;
  onDrop(orderId: string, targetIndex: number): void;
  orders: DeliveryOrder[];
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
}) {
  const positions = useSharedValue(
    createDeliveryOrderPositions(orders.map(({ id }) => id)),
  );
  const activeOrderId = useSharedValue<string | null>(null);
  const listHeight =
    EDITOR_LIST_PADDING_TOP +
    Math.max(0, orders.length * EDITOR_ORDER_ROW_STEP - EDITOR_ORDER_ROW_GAP) +
    EDITOR_LIST_PADDING_BOTTOM;

  useEffect(() => {
    positions.set(createDeliveryOrderPositions(
      orders.map(({ id }) => id),
    ));
  }, [orders, positions]);

  return (
    <View style={styles.editorScreen}>
      <View style={styles.editorHeader}>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [
            styles.headerAction,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
        <View style={styles.editorHeadingCopy}>
          <Text style={styles.editorTitle}>주문 순서 편집</Text>
          <Text style={styles.editorDescription}>
            핸들을 누른 채 주문을 이동하세요
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          style={({ pressed }) => [
            styles.headerAction,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.doneText}>완료</Text>
        </Pressable>
      </View>

      <View style={styles.editorMapFrame}>
        <DeliveryRouteMap
          currentDeliveryStopId={currentDeliveryStopId}
          interactionMode="pan-only"
          orders={orders}
          serverRouteGeometry={serverRouteGeometry}
          style={styles.editorMap}
        />
        <View pointerEvents="none" style={styles.editorMapBadge}>
          <Text style={styles.editorMapBadgeTitle}>지도 미리보기</Text>
          <Text style={styles.editorMapBadgeText}>이동만 가능</Text>
        </View>
      </View>

      <View style={styles.editorListHeading}>
        <Text style={styles.editorListTitle}>주문 {orders.length}건</Text>
        <Text style={styles.editorListHint}>홀드 중 바로 순서가 바뀝니다</Text>
      </View>
      <ScrollView
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
        style={styles.editorListScroll}
      >
        <View style={[styles.editorList, { height: listHeight }]}>
          {orders.map((order, index) => (
            <DraggableOrderRow
              activeOrderId={activeOrderId}
              initialIndex={index}
              key={order.id}
              onDrop={onDrop}
              order={order}
              positions={positions}
              rowCount={orders.length}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DraggableOrderRow({
  activeOrderId,
  initialIndex,
  onDrop,
  order,
  positions,
  rowCount,
}: {
  activeOrderId: SharedValue<string | null>;
  initialIndex: number;
  onDrop(orderId: string, targetIndex: number): void;
  order: DeliveryOrder;
  positions: SharedValue<DeliveryOrderPositions>;
  rowCount: number;
}) {
  const rowTop = useSharedValue(initialIndex * EDITOR_ORDER_ROW_STEP);
  const dragStartTop = useSharedValue(initialIndex * EDITOR_ORDER_ROW_STEP);
  const startPositions = useSharedValue<DeliveryOrderPositions>({});

  useAnimatedReaction(
    () => positions.get()[order.id],
    (nextIndex, previousIndex) => {
      if (
        nextIndex === undefined ||
        nextIndex === previousIndex ||
        activeOrderId.get() === order.id
      ) {
        return;
      }

      rowTop.set(withTiming(nextIndex * EDITOR_ORDER_ROW_STEP, {
        duration: NEIGHBOR_MOVE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      }));
    },
    [order.id],
  );

  const dragGesture = Gesture.Pan()
    .minDistance(DRAG_ACTIVATION_DISTANCE)
    .onStart(() => {
      cancelAnimation(rowTop);
      dragStartTop.set(rowTop.get());
      startPositions.set(positions.get());
      activeOrderId.set(order.id);
    })
    .onUpdate((event) => {
      const maxTop = Math.max(0, (rowCount - 1) * EDITOR_ORDER_ROW_STEP);
      const nextTop = Math.max(
        0,
        Math.min(maxTop, dragStartTop.get() + event.translationY),
      );
      const currentIndex = positions.get()[order.id] ?? initialIndex;
      const targetIndex = resolveDeliveryOrderDragTarget({
        absoluteTop: nextTop,
        currentIndex,
        rowCount,
        rowStep: EDITOR_ORDER_ROW_STEP,
      });

      rowTop.set(nextTop);

      if (targetIndex !== currentIndex) {
        positions.set(moveDeliveryOrderPosition(
          positions.get(),
          order.id,
          targetIndex,
        ));
      }
    })
    .onEnd(() => {
      const targetIndex = positions.get()[order.id] ?? initialIndex;

      rowTop.set(withTiming(
        targetIndex * EDITOR_ORDER_ROW_STEP,
        {
          duration: DRAG_SETTLE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (finished && activeOrderId.get() === order.id) {
            activeOrderId.set(null);
          }
        },
      ));
      scheduleOnRN(onDrop, order.id, targetIndex);
    })
    .onFinalize((_event, success) => {
      if (success) {
        return;
      }

      positions.set(startPositions.get());
      const originalIndex = startPositions.get()[order.id] ?? initialIndex;
      rowTop.set(withTiming(
        originalIndex * EDITOR_ORDER_ROW_STEP,
        {
          duration: DRAG_SETTLE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (finished && activeOrderId.get() === order.id) {
            activeOrderId.set(null);
          }
        },
      ));
    });

  const animatedCardStyle = useAnimatedStyle(() => {
    const isActive = activeOrderId.get() === order.id;

    return {
      borderColor: isActive ? '#0b57d0' : '#e5e7eb',
      elevation: isActive ? 6 : 1,
      transform: [
        { translateY: rowTop.get() },
        {
          scale: withTiming(isActive ? 1.012 : 1, {
            duration: 110,
            easing: Easing.out(Easing.cubic),
          }),
        },
      ],
      zIndex: isActive ? 10 : 1,
    };
  }, [order.id]);

  return (
    <Animated.View
      style={[styles.editorOrderCard, animatedCardStyle]}
    >
      <GestureDetector gesture={dragGesture}>
        <View
          accessibilityHint="누른 채 위아래로 이동해 이 주문의 순서를 변경합니다."
          accessibilityLabel={`${order.destinationName} 주문 순서 이동 핸들`}
          accessibilityRole="button"
          style={styles.dragHandle}
        >
          <Text style={styles.dragHandleIcon}>≡</Text>
        </View>
      </GestureDetector>
      <View style={styles.sequenceBadge}>
        <Text style={styles.sequenceBadgeText}>{initialIndex + 1}</Text>
      </View>
      <View style={styles.editorOrderCopy}>
        <Text numberOfLines={1} style={styles.editorDestinationName}>
          {order.destinationName}
        </Text>
        <Text numberOfLines={2} style={styles.editorAddress}>
          {order.address}
        </Text>
      </View>
      <View style={styles.editorOrderRight}>
        <ConditionBadge conditionCode={order.conditionCode} />
        <Text style={styles.editorBoxCount}>{order.shippedBoxes}박스</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  deliveryContent: {
    paddingBottom: 88,
  },
  deliveryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  deliveryHeadingCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  summaryText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryItems: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  summaryDivider: {
    backgroundColor: '#d0d5dd',
    height: 12,
    width: 1,
  },
  headerActionButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    width: 74,
  },
  editButton: {
    backgroundColor: '#0b57d0',
  },
  editButtonDisabled: {
    backgroundColor: '#98a2b3',
  },
  editButtonText: {
    color: '#ffffff',
  },
  headerActionText: {
    fontSize: 13,
    fontWeight: '800',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginLeft: 8,
  },
  spaceButton: {
    backgroundColor: '#e8f1ff',
  },
  spaceButtonText: {
    color: '#0b57d0',
  },
  orderList: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#e5e7eb',
    borderTopColor: '#e5e7eb',
    borderBottomWidth: 1,
    borderTopWidth: 1,
    paddingHorizontal: 18,
  },
  emptyState: {
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 18,
    paddingVertical: 40,
  },
  emptyStateText: {
    color: '#667085',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyStateTitle: {
    color: '#344054',
    fontSize: 15,
    fontWeight: '800',
  },
  orderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    paddingVertical: 12,
  },
  orderRowDivider: {
    borderBottomColor: '#eaecf0',
    borderBottomWidth: 1,
  },
  destinationGroupCompleted: {
    backgroundColor: '#f2f4f7',
    borderColor: '#d0d5dd',
    borderWidth: 1,
  },
  destinationGroupEmphasis: {
    borderRadius: 10,
    marginVertical: 3,
    overflow: 'hidden',
    paddingHorizontal: 9,
  },
  destinationGroupCurrent: {
    backgroundColor: '#ecfdf3',
    borderColor: '#12b76a',
    borderWidth: 1,
  },
  groupRowPressed: {
    opacity: 0.7,
  },
  orderCopy: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 48,
  },
  destinationName: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  currentDeliveryBadge: {
    backgroundColor: '#6ce9a6',
    borderColor: '#079455',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentDeliveryBadgeText: {
    color: '#05603a',
    fontSize: 9,
    fontWeight: '900',
  },
  completedPrimaryText: {
    color: '#475467',
  },
  completedSecondaryText: {
    color: '#667085',
  },
  conditionBadge: {
    backgroundColor: '#f2f4f7',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  conditionBadgeCold: {
    backgroundColor: '#e8f1ff',
  },
  conditionBadgeText: {
    color: '#475467',
    fontSize: 10,
    fontWeight: '900',
  },
  conditionBadgeTextCold: {
    color: '#0b57d0',
  },
  orderRight: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    maxWidth: '34%',
    minHeight: 48,
    minWidth: 70,
  },
  orderRightDetails: {
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 'auto',
  },
  groupOrderCount: {
    color: '#344054',
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
    marginTop: 2,
  },
  groupConditions: {
    color: '#475467',
    fontSize: 10,
    fontWeight: '900',
  },
  boxCount: {
    color: '#027a48',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  completedBoxText: {
    color: '#667085',
  },
  address: {
    color: '#667085',
    fontSize: 11,
    lineHeight: 15,
  },
  editorScreen: {
    backgroundColor: '#f7f9fc',
    flex: 1,
  },
  editorHeader: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 10,
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 52,
  },
  cancelText: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '700',
  },
  doneText: {
    color: '#0b57d0',
    fontSize: 14,
    fontWeight: '900',
  },
  editorHeadingCopy: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
  },
  editorTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  editorDescription: {
    color: '#667085',
    fontSize: 10,
  },
  editorMapFrame: {
    backgroundColor: '#e8eef7',
    borderBottomColor: '#d0d5dd',
    borderBottomWidth: 1,
    height: 214,
  },
  editorMap: {
    flex: 1,
  },
  editorMapBadge: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    elevation: 3,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    top: 10,
  },
  editorMapBadgeTitle: {
    color: '#344054',
    fontSize: 11,
    fontWeight: '900',
  },
  editorMapBadgeText: {
    color: '#667085',
    fontSize: 9,
    marginTop: 1,
  },
  editorListHeading: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#eaecf0',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  editorListTitle: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '900',
  },
  editorListHint: {
    color: '#667085',
    fontSize: 10,
  },
  editorListScroll: {
    flex: 1,
  },
  editorList: {
    position: 'relative',
  },
  editorOrderCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 10,
    borderWidth: 1,
    elevation: 1,
    flexDirection: 'row',
    height: EDITOR_ORDER_ROW_HEIGHT,
    left: 12,
    paddingRight: 8,
    position: 'absolute',
    right: 12,
    top: EDITOR_LIST_PADDING_TOP,
  },
  dragHandle: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minWidth: 40,
  },
  dragHandleIcon: {
    color: '#667085',
    fontSize: 21,
    fontWeight: '900',
    transform: [{ rotate: '90deg' }],
  },
  sequenceBadge: {
    alignItems: 'center',
    backgroundColor: '#e8f1ff',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  sequenceBadgeText: {
    color: '#0b57d0',
    fontSize: 11,
    fontWeight: '900',
  },
  sequenceBadgeCompleted: {
    backgroundColor: '#667085',
  },
  sequenceBadgeCurrent: {
    backgroundColor: '#12b76a',
  },
  sequenceBadgeTextInverse: {
    color: '#ffffff',
  },
  editorOrderCopy: {
    flex: 1,
    gap: 2,
    paddingLeft: 7,
  },
  editorDestinationName: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  editorAddress: {
    color: '#667085',
    fontSize: 9,
    lineHeight: 12,
  },
  editorOrderRight: {
    alignItems: 'flex-end',
    gap: 4,
    paddingLeft: 4,
  },
  editorBoxCount: {
    color: '#027a48',
    fontSize: 10,
    fontWeight: '900',
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
