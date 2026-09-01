import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  acquireDeliveryBundle,
  acceptDeliveryBundleHandoff,
  cancelDeliveryBundleHandoff,
  DriverDeliverySpaceApiError,
  loadDriverDeliverySpace,
  releaseDeliveryBundle,
  rejectDeliveryBundleHandoff,
  requestDeliveryBundleHandoff,
  type DriverDeliveryBundle,
  type DriverDeliveryIncomingHandoff,
  type DriverDeliveryOutgoingHandoff,
  type DriverDeliveryRecipient,
  type DriverDeliverySpace,
} from '../../api/dsvDriverDeliverySpace';
import { useAppDialog } from './AppDialog';
import {
  DriverRefreshControl,
  DriverRefreshUpdatedAt,
} from './DriverRefreshControl';

type SpaceSection = 'mine' | 'available';

export function DeliverySpaceScreen({
  accessToken,
  deliveryDateLabel,
  onAssignmentsChanged,
  onBack,
}: {
  accessToken: string;
  deliveryDateLabel: string;
  onAssignmentsChanged(): void;
  onBack(): void;
}) {
  const { dialog, showDialog } = useAppDialog();
  const [section, setSection] = useState<SpaceSection>('mine');
  const [space, setSpace] = useState<DriverDeliverySpace | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [message, setMessage] = useState<string>();
  const [activeDestinationId, setActiveDestinationId] = useState<string>();
  const [activeHandoffId, setActiveHandoffId] = useState<string>();
  const [transferBundle, setTransferBundle] = useState<DriverDeliveryBundle>();

  const refresh = useCallback(async () => {
    if (isRefreshing) return;

    if (space === null) setState('loading');
    setIsRefreshing(true);
    setMessage(undefined);
    try {
      const nextSpace = await loadDriverDeliverySpace(accessToken);
      setSpace(nextSpace);
      setLastUpdatedAt(new Date());
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '주문 목록을 불러오지 못했습니다.');
      setState('error');
    } finally {
      setIsRefreshing(false);
    }
  }, [accessToken, isRefreshing, space]);

  useEffect(() => {
    let isActive = true;
    void loadDriverDeliverySpace(accessToken).then((nextSpace) => {
      if (!isActive) return;
      setSpace(nextSpace);
      setLastUpdatedAt(new Date());
      setState('ready');
    }).catch((error: unknown) => {
      if (!isActive) return;
      setMessage(error instanceof Error ? error.message : '주문 목록을 불러오지 못했습니다.');
      setState('error');
    });
    return () => {
      isActive = false;
    };
  }, [accessToken]);

  function confirmRelease(bundle: DriverDeliveryBundle) {
    showDialog({
      actions: [
        { label: '취소', tone: 'secondary' },
        {
          onPress: () => void runCommand(bundle, 'release'),
          label: '반납',
          tone: 'danger',
        },
      ],
      message: `${bundle.destinationName} 배송지의 주문 ${bundle.orderCount}건을 공용 배송으로 반납할까요?`,
      title: '배송 반납',
      tone: 'warning',
    });
  }

  function startTransfer(bundle: DriverDeliveryBundle) {
    if (space === null || space.recipients.length === 0) {
      showDialog({
        message: '현재 배차에서 전달할 수 있는 다른 배송원이 없습니다.',
        title: '전달 대상 없음',
      });
      return;
    }
    setTransferBundle(bundle);
  }

  function confirmTransfer(bundle: DriverDeliveryBundle, recipient: DriverDeliveryRecipient) {
    setTransferBundle(undefined);
    showDialog({
      actions: [
        { label: '취소', tone: 'secondary' },
        {
          onPress: () => void runCommand(bundle, 'handoff', recipient),
          label: '요청',
          tone: 'primary',
        },
      ],
      message: `${recipient.driverName} 배송원에게 ${bundle.destinationName} 배송 인계를 요청할까요? 상대가 수락하면 배정이 변경됩니다.`,
      title: '배송 전달 요청',
    });
  }

  function confirmAcceptHandoff(handoff: DriverDeliveryIncomingHandoff) {
    showDialog({
      actions: [
        { label: '취소', tone: 'secondary' },
        {
          onPress: () => void runHandoffAction(
            handoff.requestId,
            'accept',
            `${handoff.bundle.destinationName} 배송을 받았습니다.`,
          ),
          label: '수락',
          tone: 'primary',
        },
      ],
      message: `${handoff.senderDriverName} 배송원의 ${handoff.bundle.destinationName} 배송 요청을 수락할까요? 수락하면 내 배송으로 배정이 변경됩니다.`,
      title: '전달 요청 수락',
    });
  }

  async function runCommand(
    bundle: DriverDeliveryBundle,
    action: 'acquire' | 'handoff' | 'release',
    recipient?: DriverDeliveryRecipient,
  ) {
    if (space === null || activeDestinationId !== undefined) return;
    setActiveDestinationId(bundle.destinationId);
    setMessage(undefined);
    try {
      if (action === 'release') {
        await releaseDeliveryBundle(
          accessToken,
          bundle.destinationId,
          space.version,
        );
      } else if (action === 'acquire') {
        await acquireDeliveryBundle(
          accessToken,
          bundle.destinationId,
          space.version,
        );
      } else if (recipient !== undefined) {
        await requestDeliveryBundleHandoff(
          accessToken,
          bundle.destinationId,
          space.version,
          recipient.driverId,
        );
      }
      setMessage(
        action === 'release'
          ? `${bundle.destinationName} 배송을 반납했습니다.`
          : action === 'handoff'
            ? `${recipient?.driverName ?? '다른 배송원'} 배송원에게 전달 요청을 보냈습니다.`
            : `${bundle.destinationName} 배송을 가져왔습니다.`,
      );
      const nextSpace = await loadDriverDeliverySpace(accessToken);
      setSpace(nextSpace);
      setLastUpdatedAt(new Date());
      if (action !== 'handoff') onAssignmentsChanged();
    } catch (error) {
      setMessage(commandErrorMessage(error));
      if (
        error instanceof DriverDeliverySpaceApiError &&
        (error.code === 'DESTINATION_BUNDLE_ALREADY_ACQUIRED' ||
          error.code === 'DESTINATION_BUNDLE_ASSIGNMENT_CHANGED')
      ) {
        try {
          const nextSpace = await loadDriverDeliverySpace(accessToken);
          setSpace(nextSpace);
          setLastUpdatedAt(new Date());
        } catch {
          // Keep the actionable conflict message when refresh also fails.
        }
      }
    } finally {
      setActiveDestinationId(undefined);
    }
  }

  async function runHandoffAction(
    requestId: string,
    action: 'accept' | 'cancel' | 'reject',
    label: string,
  ) {
    if (activeHandoffId !== undefined) return;
    setActiveHandoffId(requestId);
    setMessage(undefined);
    try {
      if (action === 'accept') await acceptDeliveryBundleHandoff(accessToken, requestId);
      else if (action === 'reject') await rejectDeliveryBundleHandoff(accessToken, requestId);
      else await cancelDeliveryBundleHandoff(accessToken, requestId);
      setMessage(label);
      const nextSpace = await loadDriverDeliverySpace(accessToken);
      setSpace(nextSpace);
      setLastUpdatedAt(new Date());
      if (action === 'accept') onAssignmentsChanged();
    } catch (error) {
      setMessage(commandErrorMessage(error));
      try {
        const nextSpace = await loadDriverDeliverySpace(accessToken);
        setSpace(nextSpace);
        setLastUpdatedAt(new Date());
      } catch {
        // Keep the action failure message when refresh also fails.
      }
    } finally {
      setActiveHandoffId(undefined);
    }
  }

  const bundles = space?.[section] ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="배송 화면으로 돌아가기"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>주문 목록</Text>
          <Text style={styles.description}>배송지 전체 묶음을 반납·전달하거나 가져옵니다</Text>
        </View>
      </View>

      <View style={styles.deliveryDateContext}>
        <Text style={styles.deliveryDateLabel}>배송일</Text>
        <Text style={styles.deliveryDateValue}>{deliveryDateLabel}</Text>
      </View>

      <View accessibilityRole="tablist" style={styles.sectionTabs}>
        <SectionTab
          count={space?.mine.length}
          isSelected={section === 'mine'}
          label="내 배송"
          onPress={() => setSection('mine')}
        />
        <SectionTab
          count={space?.available.length}
          isSelected={section === 'available'}
          label="공용 배송"
          onPress={() => setSection('available')}
        />
      </View>

      {message === undefined ? null : (
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}

      {state === 'loading' && space === null ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#0b57d0" />
          <Text style={styles.stateText}>주문 목록을 불러오는 중입니다.</Text>
        </View>
      ) : state === 'error' && space === null ? (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>주문 목록을 불러오지 못했습니다.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refresh()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>다시 불러오기</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={(
            <DriverRefreshControl
              onRefresh={() => void refresh()}
              refreshing={isRefreshing}
            />
          )}
          showsVerticalScrollIndicator={false}
        >
          <DriverRefreshUpdatedAt
            lastUpdatedAt={lastUpdatedAt}
            refreshing={isRefreshing}
          />
          {section === 'mine' && (space?.incomingHandoffs.length ?? 0) > 0 ? (
            <HandoffPanel
              activeHandoffId={activeHandoffId}
              incoming={space?.incomingHandoffs ?? []}
              onAccept={confirmAcceptHandoff}
              onReject={(handoff) => void runHandoffAction(
                handoff.requestId,
                'reject',
                `${handoff.senderDriverName} 배송원의 전달 요청을 거절했습니다.`,
              )}
            />
          ) : null}
          <Text style={styles.sectionGuide}>
            {section === 'mine'
              ? '전달은 상대 배송원이 수락할 때 배정이 변경됩니다.'
              : '다른 배송원보다 먼저 가져오면 내 배송으로 전체 묶음이 배정됩니다.'}
          </Text>
          {bundles.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {section === 'mine' ? '반납할 배송이 없습니다.' : '현재 공용 배송이 없습니다.'}
              </Text>
              <Text style={styles.emptyText}>목록을 새로고침하면 최신 배정을 확인합니다.</Text>
            </View>
          ) : bundles.map((bundle) => (
            <BundleCard
              action={section === 'mine' ? 'release' : 'acquire'}
              bundle={bundle}
              isBusy={activeDestinationId === bundle.destinationId}
              isDisabled={activeDestinationId !== undefined}
              key={bundle.destinationId}
              onPress={() => {
                if (section === 'mine') confirmRelease(bundle);
                else void runCommand(bundle, 'acquire');
              }}
              onCancelHandoff={section === 'mine' ? (handoff) => void runHandoffAction(
                handoff.requestId,
                'cancel',
                `${handoff.targetDriverName} 배송원에게 보낸 전달 요청을 취소했습니다.`,
              ) : undefined}
              pendingHandoff={section === 'mine'
                ? space?.outgoingHandoffs.find((handoff) => handoffDestinationId(handoff) === bundle.destinationId)
                : undefined}
              onTransfer={section === 'mine' ? () => startTransfer(bundle) : undefined}
            />
          ))}
        </ScrollView>
      )}
      {transferBundle === undefined || space === null ? null : (
        <TransferRecipientModal
          bundle={transferBundle}
          onClose={() => setTransferBundle(undefined)}
          onSelect={(recipient) => confirmTransfer(transferBundle, recipient)}
          recipients={space.recipients}
        />
      )}
      {dialog}
    </View>
  );
}

function SectionTab({
  count,
  isSelected,
  label,
  onPress,
}: {
  count?: number;
  isSelected: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sectionTab,
        isSelected && styles.sectionTabSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.sectionTabText, isSelected && styles.sectionTabTextSelected]}>
        {label}{count === undefined ? '' : ` ${count}`}
      </Text>
    </Pressable>
  );
}

function HandoffPanel({
  activeHandoffId,
  incoming,
  onAccept,
  onReject,
}: {
  activeHandoffId?: string;
  incoming: DriverDeliveryIncomingHandoff[];
  onAccept(handoff: DriverDeliveryIncomingHandoff): void;
  onReject(handoff: DriverDeliveryIncomingHandoff): void;
}) {
  return (
    <View style={styles.handoffPanel}>
      <Text style={styles.handoffPanelTitle}>받은 전달 요청</Text>
      {incoming.map((handoff) => (
        <View key={handoff.requestId} style={styles.handoffCard}>
          <View style={styles.bundleCopy}>
            <Text style={styles.handoffFrom}>{handoff.senderDriverName} 배송원</Text>
            <Text numberOfLines={1} style={styles.destinationName}>{handoff.bundle.destinationName}</Text>
            <Text numberOfLines={2} style={styles.address}>{handoff.bundle.address}</Text>
            <View style={styles.bundleMetaRow}>
              <Text style={styles.bundleMeta}>주문 {handoff.bundle.orderCount}건</Text>
              <Text style={styles.bundleMeta}>박스 {handoff.bundle.boxCount}개</Text>
              <Text style={styles.expiresText}>{formatExpiresAt(handoff.expiresAt)}까지</Text>
            </View>
          </View>
          <View style={styles.bundleActions}>
            <Pressable
              accessibilityLabel={`${handoff.bundle.destinationName} 전달 요청 거절`}
              accessibilityRole="button"
              disabled={activeHandoffId !== undefined}
              onPress={() => onReject(handoff)}
              style={({ pressed }) => [
                styles.bundleAction,
                styles.rejectAction,
                pressed && styles.pressed,
                activeHandoffId !== undefined && styles.disabled,
              ]}
            >
              <Text style={styles.rejectActionText}>거절</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`${handoff.bundle.destinationName} 전달 요청 수락`}
              accessibilityRole="button"
              accessibilityState={{ busy: activeHandoffId === handoff.requestId }}
              disabled={activeHandoffId !== undefined}
              onPress={() => onAccept(handoff)}
              style={({ pressed }) => [
                styles.bundleAction,
                pressed && styles.pressed,
                activeHandoffId !== undefined && styles.disabled,
              ]}
            >
              {activeHandoffId === handoff.requestId ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.bundleActionText}>수락</Text>
              )}
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

function BundleCard({
  action,
  bundle,
  isBusy,
  isDisabled,
  onCancelHandoff,
  onPress,
  pendingHandoff,
  onTransfer,
}: {
  action: 'acquire' | 'release';
  bundle: DriverDeliveryBundle;
  isBusy: boolean;
  isDisabled: boolean;
  onCancelHandoff?(handoff: DriverDeliveryOutgoingHandoff): void;
  onPress(): void;
  pendingHandoff?: DriverDeliveryOutgoingHandoff;
  onTransfer?(): void;
}) {
  const hasPendingHandoff = pendingHandoff !== undefined;
  return (
    <View style={styles.bundleCard}>
      <View style={styles.bundleCopy}>
        <Text numberOfLines={1} style={styles.destinationName}>{bundle.destinationName}</Text>
        <Text numberOfLines={2} style={styles.address}>{bundle.address}</Text>
        <View style={styles.bundleMetaRow}>
          <Text style={styles.bundleMeta}>주문 {bundle.orderCount}건</Text>
          <Text style={styles.bundleMeta}>박스 {bundle.boxCount}개</Text>
          <Text numberOfLines={1} style={styles.conditions}>{bundle.conditionCodes.join(' · ')}</Text>
        </View>
        {hasPendingHandoff ? (
          <Text style={styles.pendingHandoffText}>
            {pendingHandoff.targetDriverName} 배송원 수락 대기 중
          </Text>
        ) : null}
      </View>
      <View style={styles.bundleActions}>
        {hasPendingHandoff ? (
          <>
            <View
              accessibilityLabel={`${bundle.destinationName} 전달 요청 중`}
              accessibilityRole="text"
              style={[styles.bundleAction, styles.transferAction, styles.disabled]}
            >
              <Text style={styles.transferActionText}>요청 중</Text>
            </View>
            <Pressable
              accessibilityLabel={`${bundle.destinationName} 전달 요청 취소`}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDisabled }}
              disabled={isDisabled}
              onPress={() => onCancelHandoff?.(pendingHandoff)}
              style={({ pressed }) => [
                styles.bundleAction,
                styles.releaseAction,
                pressed && styles.pressed,
                isDisabled && styles.disabled,
              ]}
            >
              <Text style={styles.releaseActionText}>취소</Text>
            </Pressable>
          </>
        ) : onTransfer === undefined ? null : (
          <Pressable
            accessibilityLabel={`${bundle.destinationName} 배송 전달`}
            accessibilityRole="button"
            accessibilityState={{ disabled: isDisabled }}
            disabled={isDisabled}
            onPress={onTransfer}
            style={({ pressed }) => [
              styles.bundleAction,
              styles.transferAction,
              pressed && styles.pressed,
              isDisabled && styles.disabled,
            ]}
          >
            <Text style={styles.transferActionText}>전달</Text>
          </Pressable>
        )}
        {hasPendingHandoff ? null : (
        <Pressable
          accessibilityLabel={`${bundle.destinationName} 배송 ${action === 'release' ? '반납' : '가져오기'}`}
          accessibilityRole="button"
          accessibilityState={{ busy: isBusy, disabled: isDisabled }}
          disabled={isDisabled}
          onPress={onPress}
          style={({ pressed }) => [
            styles.bundleAction,
            action === 'release' && styles.releaseAction,
            pressed && styles.pressed,
            isDisabled && styles.disabled,
          ]}
        >
          {isBusy ? (
            <ActivityIndicator color={action === 'release' ? '#b42318' : '#ffffff'} size="small" />
          ) : (
            <Text style={[styles.bundleActionText, action === 'release' && styles.releaseActionText]}>
              {action === 'release' ? '반납' : '가져오기'}
            </Text>
          )}
        </Pressable>
        )}
      </View>
    </View>
  );
}

function TransferRecipientModal({
  bundle,
  onClose,
  onSelect,
  recipients,
}: {
  bundle: DriverDeliveryBundle;
  onClose(): void;
  onSelect(recipient: DriverDeliveryRecipient): void;
  recipients: DriverDeliveryRecipient[];
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={styles.transferBackdrop}>
        <Pressable
          accessibilityLabel="전달 대상 선택 닫기"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.transferCard}>
          <Text style={styles.transferTitle}>전달할 배송원 선택</Text>
          <Text numberOfLines={1} style={styles.transferDestination}>{bundle.destinationName}</Text>
          <ScrollView contentContainerStyle={styles.recipientList} showsVerticalScrollIndicator={false}>
            {recipients.map((recipient) => (
              <Pressable
                accessibilityLabel={`${recipient.driverName} 배송원에게 전달`}
                accessibilityRole="button"
                key={recipient.driverId}
                onPress={() => onSelect(recipient)}
                style={({ pressed }) => [styles.recipientButton, pressed && styles.pressed]}
              >
                <Text style={styles.recipientName}>{recipient.driverName}</Text>
                <Text style={styles.recipientChevron}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.transferCancel}>
            <Text style={styles.transferCancelText}>취소</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function commandErrorMessage(error: unknown): string {
  if (error instanceof DriverDeliverySpaceApiError) {
    if (error.code === 'DESTINATION_BUNDLE_ALREADY_ACQUIRED') {
      return '다른 배송원이 먼저 가져갔습니다. 최신 목록으로 갱신했습니다.';
    }
    if (error.code === 'DESTINATION_BUNDLE_TRANSFER_CLOSED') {
      return '이미 배송을 시작해 배정을 변경할 수 없습니다.';
    }
    if (error.code === 'DRIVER_BUNDLE_HANDOFF_EXPIRED') {
      return '전달 요청 시간이 지나 최신 목록으로 갱신했습니다.';
    }
    return error.message;
  }
  return '배송 배정을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

function formatExpiresAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '만료 시간';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function handoffDestinationId(handoff: DriverDeliveryOutgoingHandoff): string | undefined {
  return handoff.bundle?.destinationId ?? handoff.destinationId;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f7f9fc', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#ffffff', borderBottomColor: '#e5e7eb', borderBottomWidth: 1, flexDirection: 'row', minHeight: 68, paddingHorizontal: 12 },
  backButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: 44 },
  backText: { color: '#0b57d0', fontSize: 34, fontWeight: '400', lineHeight: 38 },
  headingCopy: { flex: 1, gap: 1 },
  title: { color: '#101828', fontSize: 18, fontWeight: '900' },
  description: { color: '#667085', fontSize: 10, fontWeight: '600' },
  deliveryDateContext: { alignItems: 'center', backgroundColor: '#eef4ff', borderBottomColor: '#d1e0ff', borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  deliveryDateLabel: { color: '#475467', fontSize: 11, fontWeight: '800' },
  deliveryDateValue: { color: '#1849a9', fontSize: 15, fontWeight: '900' },
  sectionTabs: { backgroundColor: '#ffffff', flexDirection: 'row', paddingHorizontal: 14, paddingTop: 8 },
  sectionTab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 3, flex: 1, justifyContent: 'center', minHeight: 44 },
  sectionTabSelected: { borderBottomColor: '#0b57d0' },
  sectionTabText: { color: '#667085', fontSize: 13, fontWeight: '800' },
  sectionTabTextSelected: { color: '#0b57d0' },
  messageBox: { backgroundColor: '#eef4ff', borderBottomColor: '#d1e0ff', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 9 },
  messageText: { color: '#1849a9', fontSize: 11, fontWeight: '700' },
  centerState: { alignItems: 'center', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  stateText: { color: '#475467', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  retryButton: { backgroundColor: '#0b57d0', borderRadius: 10, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  retryText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  listContent: { gap: 8, padding: 14, paddingBottom: 28 },
  sectionGuide: { color: '#667085', fontSize: 11, lineHeight: 17, marginBottom: 2 },
  emptyCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: 12, borderWidth: 1, gap: 5, padding: 28 },
  emptyTitle: { color: '#344054', fontSize: 14, fontWeight: '800' },
  emptyText: { color: '#667085', fontSize: 11, textAlign: 'center' },
  bundleCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e5e7eb', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 100, padding: 13 },
  bundleCopy: { flex: 1, gap: 4 },
  destinationName: { color: '#101828', fontSize: 15, fontWeight: '900' },
  address: { color: '#475467', fontSize: 11, lineHeight: 16 },
  bundleMetaRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  bundleMeta: { color: '#344054', fontSize: 10, fontWeight: '800' },
  conditions: { color: '#667085', flex: 1, fontSize: 9, fontWeight: '700' },
  bundleAction: { alignItems: 'center', backgroundColor: '#0b57d0', borderRadius: 9, justifyContent: 'center', minHeight: 44, minWidth: 72, paddingHorizontal: 10 },
  bundleActions: { flexDirection: 'row', gap: 6 },
  releaseAction: { backgroundColor: '#fff1f0', borderColor: '#fecdca', borderWidth: 1 },
  bundleActionText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  releaseActionText: { color: '#b42318' },
  transferAction: { backgroundColor: '#eef4ff', borderColor: '#b2ccff', borderWidth: 1, minWidth: 58 },
  transferActionText: { color: '#1849a9', fontSize: 12, fontWeight: '900' },
  transferBackdrop: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.56)', flex: 1, justifyContent: 'center', padding: 24 },
  transferCard: { backgroundColor: '#ffffff', borderRadius: 20, maxHeight: '70%', maxWidth: 380, padding: 20, width: '100%' },
  transferTitle: { color: '#101828', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  transferDestination: { color: '#667085', fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  recipientList: { gap: 8, paddingTop: 18 },
  recipientButton: { alignItems: 'center', backgroundColor: '#f8fafc', borderColor: '#e4e7ec', borderRadius: 12, borderWidth: 1, flexDirection: 'row', minHeight: 52, paddingHorizontal: 16 },
  recipientName: { color: '#101828', flex: 1, fontSize: 14, fontWeight: '800' },
  recipientChevron: { color: '#667085', fontSize: 24 },
  transferCancel: { alignItems: 'center', backgroundColor: '#f2f4f7', borderRadius: 12, justifyContent: 'center', marginTop: 14, minHeight: 46 },
  transferCancelText: { color: '#344054', fontSize: 13, fontWeight: '800' },
  handoffPanel: { gap: 8, marginBottom: 4 },
  handoffPanelTitle: { color: '#344054', fontSize: 12, fontWeight: '900' },
  handoffCard: { alignItems: 'center', backgroundColor: '#fffbeb', borderColor: '#fedf89', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 13 },
  handoffFrom: { color: '#7a2e0e', fontSize: 11, fontWeight: '900' },
  expiresText: { color: '#667085', fontSize: 10, fontWeight: '800' },
  pendingHandoffText: { color: '#1849a9', fontSize: 10, fontWeight: '900' },
  rejectAction: { backgroundColor: '#ffffff', borderColor: '#fedf89', borderWidth: 1, minWidth: 58 },
  rejectActionText: { color: '#93370d', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
