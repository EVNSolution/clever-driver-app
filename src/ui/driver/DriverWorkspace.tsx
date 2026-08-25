import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';

import type { DriverAuthSession } from '../../api/dsvDriverAuth';
import {
  acknowledgeDriverTimeConstraint,
  completeDriverDeliveryDestination,
  markDriverOrderMessageRead,
  startDriverDeliveryRoute,
} from '../../api/dsvDriverEvents';
import {
  uploadDriverProofPhoto,
  type DriverProofPhotoUpload,
} from '../../api/dsvDriverProofMedia';
import {
  DriverRouteApiError,
  loadDriverDeliveryRoute,
  updateDriverDestinationNotes,
  type DriverDeliveryRoute,
  type DriverDeliveryRouteChoice,
} from '../../api/dsvDriverRoute';
import { resolveDeliveryActivityForUpdate } from '../../domain/appUpdate/driverAppUpdate';
import type { DeliveryOrder } from '../../domain/delivery/deliveryPlan';
import type {
  DestinationNotes,
  DestinationNoteValues,
} from '../../domain/delivery/destinationNotesPreview';
import { resolveAndroidBackAction } from '../../domain/navigation/androidBackNavigation';
import { DeliveryScreen } from './DeliveryScreen';
import { DeliveryMapScreen } from './DeliveryMapScreen';
import { DriverSettingsModal } from './DriverSettingsModal';
import { DeliverySpaceScreen } from './DeliverySpaceScreen';

type DriverWorkspaceTab = 'delivery' | 'map';

type DriverWorkspaceProps = {
  authSession: DriverAuthSession;
  onDeliveryActivityChange(isActive: boolean | null): void;
  onLogout(): void;
  refreshRequestKey: number;
};

export function DriverWorkspace({
  authSession,
  onDeliveryActivityChange,
  onLogout,
  refreshRequestKey,
}: DriverWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<DriverWorkspaceTab>('delivery');
  const [isDeliverySpaceOpen, setIsDeliverySpaceOpen] = useState(false);
  const [isSequenceEditing, setIsSequenceEditing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [route, setRoute] = useState<DriverDeliveryRoute | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isRefreshingRoute, setIsRefreshingRoute] = useState(false);
  const [lastRouteUpdatedAt, setLastRouteUpdatedAt] = useState<Date | null>(null);
  const [selectedRoutePlanId, setSelectedRoutePlanId] = useState<string>();
  const [loadErrorMessage, setLoadErrorMessage] = useState<string>();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'empty' | 'error'>(
    'loading',
  );
  const lastRootBackAtRef = useRef<number | null>(null);
  const driverName =
    authSession.account.linkedDrivers[0]?.name ?? authSession.account.name;

  useEffect(() => {
    onDeliveryActivityChange(resolveDeliveryActivityForUpdate({
      loadState,
      nextDeliveryStopId: route?.nextDeliveryStopId ?? null,
      pickupCompletedAt: route?.pickupCompletedAt ?? null,
    }));
  }, [loadState, onDeliveryActivityChange, route]);

  useEffect(() => () => onDeliveryActivityChange(null), [onDeliveryActivityChange]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        const now = Date.now();
        const action = resolveAndroidBackAction({
          isDeliverySpaceOpen,
          isSequenceEditing,
          lastRootBackAt: lastRootBackAtRef.current,
          now,
        });

        if (action === 'close-delivery-space') {
          lastRootBackAtRef.current = null;
          setIsDeliverySpaceOpen(false);
        } else if (action === 'close-sequence-editor') {
          lastRootBackAtRef.current = null;
          setIsSequenceEditing(false);
        } else if (action === 'exit-app') {
          lastRootBackAtRef.current = null;
          BackHandler.exitApp();
        } else {
          lastRootBackAtRef.current = now;
          ToastAndroid.show(
            '앱을 종료하려면 뒤로가기를 한 번 더 누르세요.',
            ToastAndroid.SHORT,
          );
        }

        return true;
      },
    );

    return () => backSubscription.remove();
  }, [isDeliverySpaceOpen, isSequenceEditing]);

  useEffect(() => {
    let isActive = true;

    void loadDriverDeliveryRoute(
      authSession.accessToken,
      selectedRoutePlanId,
    ).then((nextRoute) => {
      if (!isActive) {
        return;
      }

      setRoute(nextRoute);
      setOrders(nextRoute?.orders ?? []);
      setIsSequenceEditing(false);
      setLoadErrorMessage(undefined);
      setSelectedRoutePlanId(nextRoute?.routePlanId);
      setLastRouteUpdatedAt(new Date());
      setLoadState(nextRoute === null ? 'empty' : 'ready');
    }).catch((error: unknown) => {
      if (!isActive) {
        return;
      }

      setRoute(null);
      setOrders([]);
      setLoadErrorMessage(
        error instanceof DriverRouteApiError ? error.message : undefined,
      );
      setLoadState('error');
    }).finally(() => {
      if (isActive) setIsRefreshingRoute(false);
    });

    return () => {
      isActive = false;
    };
  }, [authSession.accessToken, loadAttempt, refreshRequestKey, selectedRoutePlanId]);

  function retryRouteLoad() {
    setLoadState('loading');
    setLoadAttempt((attempt) => attempt + 1);
  }

  function refreshRoute() {
    if (isRefreshingRoute || loadState === 'loading') return;

    setIsRefreshingRoute(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  function selectRoute(routePlanId: string) {
    if (routePlanId === selectedRoutePlanId) {
      return;
    }

    setLoadState('loading');
    setIsSequenceEditing(false);
    setSelectedRoutePlanId(routePlanId);
  }

  function resetRootBackPress() {
    lastRootBackAtRef.current = null;
  }

  function changeSequenceEditing(isEditing: boolean) {
    resetRootBackPress();
    setIsSequenceEditing(isEditing);
  }

  function openDeliverySpace() {
    resetRootBackPress();
    setIsSequenceEditing(false);
    setIsDeliverySpaceOpen(true);
  }

  function closeDeliverySpace() {
    resetRootBackPress();
    setIsDeliverySpaceOpen(false);
  }

  async function completeDelivery(destinationId: string, deliveryStopIds: string[]) {
    if (route === null) {
      return;
    }

    await completeDriverDeliveryDestination(
      route.routeAccessToken,
      route.routeId,
      destinationId,
      deliveryStopIds,
    );
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function startDelivery() {
    if (route === null) {
      return;
    }

    await startDriverDeliveryRoute(route.routeAccessToken, route.routeId);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function acknowledgeTimeConstraint(deliveryStopId: string) {
    if (route === null) return;

    await acknowledgeDriverTimeConstraint(
      route.routeAccessToken,
      route.routeId,
      deliveryStopId,
    );
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function readDriverMessage(messageId: string) {
    if (route === null) return;

    await markDriverOrderMessageRead(route.routeAccessToken, messageId);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function saveDestinationNotes(
    destinationId: string,
    previous: DestinationNotes,
    values: DestinationNoteValues,
  ): Promise<DestinationNotes> {
    if (route === null) return previous;
    const notes = await updateDriverDestinationNotes(
      route.routeAccessToken,
      destinationId,
      previous,
      values,
    );
    setRoute((currentRoute) => currentRoute === null
      ? null
      : {
          ...currentRoute,
          destinationNotesById: {
            ...currentRoute.destinationNotesById,
            [destinationId]: notes,
          },
        });
    return notes;
  }

  async function uploadDeliveryProof(
    deliveryStopId: string,
    photo: Omit<DriverProofPhotoUpload, 'deliveryStopId' | 'routePlanId'>,
  ) {
    if (route === null) return;

    await uploadDriverProofPhoto(route.routeAccessToken, {
      ...photo,
      deliveryStopId,
      routePlanId: route.routeId,
    });
  }

  return (
    <View style={styles.workspace}>
      <View style={styles.appHeader}>
        <View style={styles.brandGroup}>
          <Text style={styles.brandName}>
            <Text style={styles.brandBlue}>Clever</Text>{' '}
            <Text style={styles.brandGreen}>Driver</Text>
          </Text>
          <Text numberOfLines={1} style={styles.driverName}>
            {driverName} 배송원
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="환경설정"
            accessibilityRole="button"
            onPress={() => {
              resetRootBackPress();
              setIsSettingsOpen(true);
            }}
            style={({ pressed }) => [
              styles.settingsButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <SymbolView
              name={{ android: 'settings', ios: 'gearshape.fill', web: 'settings' }}
              size={18}
              tintColor="#475467"
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onLogout}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.logoutButtonText}>로그아웃</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.screenArea}>
        {loadState !== 'ready' || route === null ? (
          <RouteLoadState
            message={loadErrorMessage}
            onRetry={retryRouteLoad}
            state={loadState}
          />
        ) : (
          <>
            {isDeliverySpaceOpen ? (
              <DeliverySpaceScreen
                accessToken={route.routeAccessToken}
                deliveryDateLabel={formatDeliveryDate(route.deliveryDate)}
                onAssignmentsChanged={() => setLoadAttempt((attempt) => attempt + 1)}
                onBack={closeDeliverySpace}
              />
            ) : activeTab === 'delivery' ? (
              <>
                <RouteDateSelector
                  onSelect={selectRoute}
                  routes={route.availableRoutes}
                  selectedRoutePlanId={route.routePlanId}
                />
                <DeliveryScreen
                  deliveryDate={route.deliveryDate}
                  destinationNotesById={route.destinationNotesById}
                  isEditing={isSequenceEditing}
                  lastUpdatedAt={lastRouteUpdatedAt}
                  nextDeliveryStopId={route.nextDeliveryStopId}
                  onAcknowledgeTimeConstraint={acknowledgeTimeConstraint}
                  onEditingChange={changeSequenceEditing}
                  onOpenDeliverySpace={openDeliverySpace}
                  onOrdersChange={setOrders}
                  onReadDriverMessage={readDriverMessage}
                  onRefresh={refreshRoute}
                  onSaveDestinationNotes={saveDestinationNotes}
                  orders={orders}
                  refreshing={isRefreshingRoute}
                  serverRouteGeometry={route.serverRouteGeometry}
                  timezone={route.timezone}
                />
              </>
            ) : (
              <DeliveryMapScreen
                depotCoordinate={route.depotCoordinate}
                etaStatus={route.etaStatus}
                lastUpdatedAt={lastRouteUpdatedAt}
                nextDeliveryStopId={route.nextDeliveryStopId}
                onCompleteDelivery={completeDelivery}
                onStartDelivery={startDelivery}
                onRefresh={refreshRoute}
                onUploadProof={uploadDeliveryProof}
                orders={orders}
                refreshing={isRefreshingRoute}
                serverRouteGeometry={route.serverRouteGeometry}
                timezone={route.timezone}
              />
            )}
          </>
        )}
      </View>

      {isSettingsOpen ? (
        <DriverSettingsModal
          onClose={() => {
            resetRootBackPress();
            setIsSettingsOpen(false);
          }}
        />
      ) : null}

      <View accessibilityRole="tablist" style={styles.tabBar}>
        <TabButton
          icon={<DeliveryPackageIcon isSelected={activeTab === 'delivery'} />}
          isSelected={activeTab === 'delivery'}
          label="배송"
          onPress={() => {
            resetRootBackPress();
            setActiveTab('delivery');
            setIsDeliverySpaceOpen(false);
            setIsSequenceEditing(false);
          }}
        />
        <TabButton
          icon={
            <Text style={[
              styles.tabSymbol,
              activeTab === 'map' && styles.tabTextSelected,
            ]}>
              ⌖
            </Text>
          }
          isSelected={activeTab === 'map'}
          label="지도"
          onPress={() => {
            resetRootBackPress();
            setActiveTab('map');
            setIsDeliverySpaceOpen(false);
            setIsSequenceEditing(false);
          }}
        />
      </View>
    </View>
  );
}

function RouteDateSelector({
  onSelect,
  routes,
  selectedRoutePlanId,
}: {
  onSelect(routePlanId: string): void;
  routes: DriverDeliveryRouteChoice[];
  selectedRoutePlanId: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedRoute =
    routes.find((routeChoice) => (
      routeChoice.routePlanId === selectedRoutePlanId
    )) ?? routes[0];

  if (selectedRoute === undefined) {
    return null;
  }
  const selectedDeliveryDate = selectedRoute.deliveryDate;

  function selectRoute(routePlanId: string) {
    onSelect(routePlanId);
    setIsExpanded(false);
  }

  return (
    <View style={styles.dateAccordion}>
      <Pressable
        accessibilityLabel={`배송 날짜 ${formatDeliveryDate(selectedDeliveryDate)} 목록 ${isExpanded ? '접기' : '펼치기'}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => setIsExpanded((expanded) => !expanded)}
        style={({ pressed }) => [
          styles.dateAccordionHeader,
          pressed && styles.buttonPressed,
        ]}
      >
        <View style={styles.dateAccordionSelection}>
          <Text style={styles.dateAccordionLabel}>배송 날짜</Text>
          <View style={styles.dateAccordionValueRow}>
            <Text style={styles.dateAccordionValue}>
              {formatDeliveryDate(selectedDeliveryDate)}
            </Text>
            <Text numberOfLines={1} style={styles.dateAccordionMeta}>
              {selectedRoute.routeName}
            </Text>
          </View>
        </View>
        <Text accessibilityElementsHidden style={styles.dateAccordionChevron}>
          {isExpanded ? '▲' : '▼'}
        </Text>
      </Pressable>

      {isExpanded ? (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={routes.length > 3}
          style={styles.dateAccordionList}
        >
          {routes.map((routeChoice) => {
            const isSelected = routeChoice.routePlanId === selectedRoutePlanId;
            const deliveryDate = routeChoice.deliveryDate;

            return (
              <Pressable
                accessibilityLabel={`${formatDeliveryDate(deliveryDate)} 배송 선택`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                key={routeChoice.routePlanId}
                onPress={() => selectRoute(routeChoice.routePlanId)}
                style={({ pressed }) => [
                  styles.dateAccordionOption,
                  isSelected && styles.dateAccordionOptionSelected,
                  pressed && styles.buttonPressed,
                ]}
              >
                <View style={styles.dateAccordionOptionText}>
                  <Text style={[
                    styles.dateAccordionOptionDate,
                    isSelected && styles.dateAccordionOptionDateSelected,
                  ]}>
                    {formatDeliveryDate(deliveryDate)}
                  </Text>
                  <Text numberOfLines={1} style={styles.dateAccordionOptionMeta}>
                    {routeChoice.routeName}
                  </Text>
                </View>
                {isSelected ? (
                  <Text style={styles.dateAccordionCheck}>✓</Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function RouteLoadState({
  message,
  onRetry,
  state,
}: {
  message?: string;
  onRetry(): void;
  state: 'loading' | 'ready' | 'empty' | 'error';
}) {
  const isLoading = state === 'loading';

  return (
    <View style={styles.routeState}>
      <Text style={styles.routeStateTitle}>
        {isLoading
          ? '배송 정보를 불러오는 중입니다.'
          : state === 'empty'
            ? '배정된 배송이 없습니다.'
            : message ?? '배송 정보를 불러오지 못했습니다.'}
      </Text>
      {!isLoading ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.retryButtonText}>다시 불러오기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TabButton({
  icon,
  isSelected,
  label,
  onPress,
}: {
  icon: ReactNode;
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
        styles.tabButton,
        pressed && styles.buttonPressed,
      ]}
    >
      {icon}
      <Text style={[styles.tabText, isSelected && styles.tabTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DeliveryPackageIcon({ isSelected }: { isSelected: boolean }) {
  return (
    <SymbolView
      name={{
        android: 'inventory_2',
        ios: 'shippingbox.fill',
        web: 'inventory_2',
      }}
      size={20}
      style={styles.packageIcon}
      tintColor={isSelected ? '#0b57d0' : '#98a2b3'}
    />
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

const styles = StyleSheet.create({
  workspace: {
    backgroundColor: '#f7f9fc',
    flex: 1,
  },
  appHeader: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: 18,
  },
  brandGroup: {
    flex: 1,
    gap: 2,
  },
  brandName: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  brandBlue: {
    color: '#0b57d0',
  },
  brandGreen: {
    color: '#079455',
  },
  driverName: {
    color: '#667085',
    fontSize: 11,
    maxWidth: 220,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  settingsButton: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 13,
  },
  logoutButtonText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '800',
  },
  screenArea: {
    flex: 1,
  },
  dateAccordion: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
  },
  dateAccordionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  dateAccordionSelection: {
    flex: 1,
    gap: 1,
  },
  dateAccordionLabel: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '700',
  },
  dateAccordionValueRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
  },
  dateAccordionValue: {
    color: '#101828',
    fontSize: 14,
    fontWeight: '900',
  },
  dateAccordionMeta: {
    color: '#667085',
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  dateAccordionChevron: {
    color: '#667085',
    fontSize: 10,
    marginLeft: 12,
  },
  dateAccordionList: {
    borderTopColor: '#eaecf0',
    borderTopWidth: 1,
    maxHeight: 168,
  },
  dateAccordionOption: {
    alignItems: 'center',
    borderBottomColor: '#f2f4f7',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dateAccordionOptionSelected: {
    backgroundColor: '#f0f6ff',
  },
  dateAccordionOptionText: {
    flex: 1,
    gap: 2,
  },
  dateAccordionOptionDate: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '800',
  },
  dateAccordionOptionDateSelected: {
    color: '#0b57d0',
  },
  dateAccordionOptionMeta: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '600',
  },
  dateAccordionCheck: {
    color: '#0b57d0',
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 12,
  },
  routeState: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
  },
  routeStateTitle: {
    color: '#475467',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#0b57d0',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopColor: '#e5e7eb',
    borderTopWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    paddingHorizontal: 34,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  tabSymbol: {
    color: '#98a2b3',
    fontSize: 18,
    fontWeight: '900',
  },
  tabText: {
    color: '#667085',
    fontSize: 11,
    fontWeight: '700',
  },
  tabTextSelected: {
    color: '#0b57d0',
  },
  packageIcon: {
    height: 20,
    width: 20,
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
