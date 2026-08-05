import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DriverAuthSession } from '../../api/dsvDriverAuth';
import {
  completeDriverDeliveryDestination,
  startDriverDeliveryRoute,
} from '../../api/dsvDriverEvents';
import {
  uploadDriverProofPhoto,
  type DriverProofPhotoUpload,
} from '../../api/dsvDriverProofMedia';
import {
  loadDriverDeliveryRoute,
  type DriverDeliveryRoute,
  type DriverDeliveryRouteChoice,
} from '../../api/dsvDriverRoute';
import type { DeliveryOrder } from '../../domain/delivery/deliveryPlan';
import { DeliveryScreen } from './DeliveryScreen';
import { DeliveryMapScreen } from './DeliveryMapScreen';
import { DriverSettingsModal } from './DriverSettingsModal';
import { DeliverySpaceScreen } from './DeliverySpaceScreen';

type DriverWorkspaceTab = 'delivery' | 'map';

type DriverWorkspaceProps = {
  authSession: DriverAuthSession;
  onLogout(): void;
};

export function DriverWorkspace({
  authSession,
  onLogout,
}: DriverWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<DriverWorkspaceTab>('delivery');
  const [isDeliverySpaceOpen, setIsDeliverySpaceOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [route, setRoute] = useState<DriverDeliveryRoute | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedRoutePlanId, setSelectedRoutePlanId] = useState<string>();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'empty' | 'error'>(
    'loading',
  );
  const driverName =
    authSession.account.linkedDrivers[0]?.name ?? authSession.account.name;

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
      setSelectedRoutePlanId(nextRoute?.routePlanId);
      setLoadState(nextRoute === null ? 'empty' : 'ready');
    }).catch(() => {
      if (!isActive) {
        return;
      }

      setRoute(null);
      setOrders([]);
      setLoadState('error');
    });

    return () => {
      isActive = false;
    };
  }, [authSession.accessToken, loadAttempt, selectedRoutePlanId]);

  function retryRouteLoad() {
    setLoadState('loading');
    setLoadAttempt((attempt) => attempt + 1);
  }

  function selectRoute(routePlanId: string) {
    if (routePlanId === selectedRoutePlanId) {
      return;
    }

    setLoadState('loading');
    setSelectedRoutePlanId(routePlanId);
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
            onPress={() => setIsSettingsOpen(true)}
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
          <RouteLoadState onRetry={retryRouteLoad} state={loadState} />
        ) : (
          <>
            {isDeliverySpaceOpen ? (
              <DeliverySpaceScreen
                accessToken={route.routeAccessToken}
                onAssignmentsChanged={() => setLoadAttempt((attempt) => attempt + 1)}
                onBack={() => setIsDeliverySpaceOpen(false)}
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
                  nextDeliveryStopId={route.nextDeliveryStopId}
                  onOpenDeliverySpace={() => setIsDeliverySpaceOpen(true)}
                  onOrdersChange={setOrders}
                  orders={orders}
                  serverRouteGeometry={route.serverRouteGeometry}
                />
              </>
            ) : (
              <DeliveryMapScreen
                depotCoordinate={route.depotCoordinate}
                etaStatus={route.etaStatus}
                nextDeliveryStopId={route.nextDeliveryStopId}
                onCompleteDelivery={completeDelivery}
                onStartDelivery={startDelivery}
                onUploadProof={uploadDeliveryProof}
                orders={orders}
                serverRouteGeometry={route.serverRouteGeometry}
                timezone={route.timezone}
              />
            )}
          </>
        )}
      </View>

      {isSettingsOpen ? (
        <DriverSettingsModal onClose={() => setIsSettingsOpen(false)} />
      ) : null}

      <View accessibilityRole="tablist" style={styles.tabBar}>
        <TabButton
          icon={<DeliveryPackageIcon isSelected={activeTab === 'delivery'} />}
          isSelected={activeTab === 'delivery'}
          label="배송"
          onPress={() => {
            setActiveTab('delivery');
            setIsDeliverySpaceOpen(false);
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
            setActiveTab('map');
            setIsDeliverySpaceOpen(false);
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

  function selectRoute(routePlanId: string) {
    onSelect(routePlanId);
    setIsExpanded(false);
  }

  return (
    <View style={styles.dateAccordion}>
      <Pressable
        accessibilityLabel={`배송 날짜 ${formatDeliveryDate(selectedRoute.deliveryDate)} 목록 ${isExpanded ? '접기' : '펼치기'}`}
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
              {formatDeliveryDate(selectedRoute.deliveryDate)}
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

            return (
              <Pressable
                accessibilityLabel={`${formatDeliveryDate(routeChoice.deliveryDate)} 배송 선택`}
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
                    {formatDeliveryDate(routeChoice.deliveryDate)}
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
  onRetry,
  state,
}: {
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
            : '배송 정보를 불러오지 못했습니다.'}
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
