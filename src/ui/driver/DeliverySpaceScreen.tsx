import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  acquireDeliveryBundle,
  DriverDeliverySpaceApiError,
  loadDriverDeliverySpace,
  releaseDeliveryBundle,
  type DriverDeliveryBundle,
  type DriverDeliverySpace,
} from '../../api/dsvDriverDeliverySpace';
import { useAppDialog } from './AppDialog';

type SpaceSection = 'mine' | 'available';

export function DeliverySpaceScreen({
  accessToken,
  onAssignmentsChanged,
  onBack,
}: {
  accessToken: string;
  onAssignmentsChanged(): void;
  onBack(): void;
}) {
  const { dialog, showDialog } = useAppDialog();
  const [section, setSection] = useState<SpaceSection>('mine');
  const [space, setSpace] = useState<DriverDeliverySpace | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string>();
  const [activeDestinationId, setActiveDestinationId] = useState<string>();

  const refresh = useCallback(async () => {
    setState('loading');
    setMessage(undefined);
    try {
      setSpace(await loadDriverDeliverySpace(accessToken));
      setState('ready');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '주문 목록을 불러오지 못했습니다.');
      setState('error');
    }
  }, [accessToken]);

  useEffect(() => {
    let isActive = true;
    void loadDriverDeliverySpace(accessToken).then((nextSpace) => {
      if (!isActive) return;
      setSpace(nextSpace);
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

  async function runCommand(
    bundle: DriverDeliveryBundle,
    action: 'acquire' | 'release',
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
      } else {
        await acquireDeliveryBundle(
          accessToken,
          bundle.destinationId,
          space.version,
        );
      }
      setMessage(
        action === 'release'
          ? `${bundle.destinationName} 배송을 반납했습니다.`
          : `${bundle.destinationName} 배송을 가져왔습니다.`,
      );
      setSpace(await loadDriverDeliverySpace(accessToken));
      onAssignmentsChanged();
    } catch (error) {
      setMessage(commandErrorMessage(error));
      if (
        error instanceof DriverDeliverySpaceApiError &&
        (error.code === 'DESTINATION_BUNDLE_ALREADY_ACQUIRED' ||
          error.code === 'DESTINATION_BUNDLE_ASSIGNMENT_CHANGED')
      ) {
        try {
          setSpace(await loadDriverDeliverySpace(accessToken));
        } catch {
          // Keep the actionable conflict message when refresh also fails.
        }
      }
    } finally {
      setActiveDestinationId(undefined);
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
          <Text style={styles.description}>배송지 전체 묶음으로 반납하거나 가져옵니다</Text>
        </View>
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
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionGuide}>
            {section === 'mine'
              ? '반납하면 이 배송지의 모든 주문이 공용 배송으로 이동합니다.'
              : '다른 배송원보다 먼저 선택한 배송원에게 전체 묶음이 배정됩니다.'}
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
            />
          ))}
        </ScrollView>
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

function BundleCard({
  action,
  bundle,
  isBusy,
  isDisabled,
  onPress,
}: {
  action: 'acquire' | 'release';
  bundle: DriverDeliveryBundle;
  isBusy: boolean;
  isDisabled: boolean;
  onPress(): void;
}) {
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
      </View>
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
    </View>
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
    return error.message;
  }
  return '배송 배정을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f7f9fc', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#ffffff', borderBottomColor: '#e5e7eb', borderBottomWidth: 1, flexDirection: 'row', minHeight: 68, paddingHorizontal: 12 },
  backButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: 44 },
  backText: { color: '#0b57d0', fontSize: 34, fontWeight: '400', lineHeight: 38 },
  headingCopy: { flex: 1, gap: 1 },
  title: { color: '#101828', fontSize: 18, fontWeight: '900' },
  description: { color: '#667085', fontSize: 10, fontWeight: '600' },
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
  releaseAction: { backgroundColor: '#fff1f0', borderColor: '#fecdca', borderWidth: 1 },
  bundleActionText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  releaseActionText: { color: '#b42318' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
