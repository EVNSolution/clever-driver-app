import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DriverAuthSession } from '../../api/dsvDriverAuth';
import {
  loadDriverDeliveryRoute,
  type DriverDeliveryRoute,
  type DriverDeliveryRouteChoice,
} from '../../api/dsvDriverRoute';
import type { DeliveryOrder } from '../../domain/delivery/deliveryPlan';
import { DeliveryScreen } from './DeliveryScreen';
import { DeliveryMapScreen } from './DeliveryMapScreen';

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

      <View style={styles.screenArea}>
        {loadState !== 'ready' || route === null ? (
          <RouteLoadState onRetry={retryRouteLoad} state={loadState} />
        ) : (
          <>
            {activeTab === 'delivery' ? (
              <>
                <RouteDateSelector
                  onSelect={selectRoute}
                  routes={route.availableRoutes}
                  selectedRoutePlanId={route.routePlanId}
                />
                <DeliveryScreen
                  deliveryDate={route.deliveryDate}
                  onOrdersChange={setOrders}
                  orders={orders}
                  serverRouteGeometry={route.serverRouteGeometry}
                />
              </>
            ) : (
              <DeliveryMapScreen
                orders={orders}
                serverRouteGeometry={route.serverRouteGeometry}
              />
            )}
          </>
        )}
      </View>

      <View accessibilityRole="tablist" style={styles.tabBar}>
        <TabButton
          icon={<DeliveryPackageIcon isSelected={activeTab === 'delivery'} />}
          isSelected={activeTab === 'delivery'}
          label="배송"
          onPress={() => setActiveTab('delivery')}
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
          onPress={() => setActiveTab('map')}
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
  return (
    <ScrollView
      contentContainerStyle={styles.dateSelectorContent}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.dateSelector}
    >
      {routes.map((routeChoice) => {
        const isSelected = routeChoice.routePlanId === selectedRoutePlanId;

        return (
          <Pressable
            accessibilityLabel={`${formatDeliveryDate(routeChoice.deliveryDate)} 배송 선택`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={routeChoice.routePlanId}
            onPress={() => onSelect(routeChoice.routePlanId)}
            style={({ pressed }) => [
              styles.datePill,
              isSelected && styles.datePillSelected,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[
              styles.datePillText,
              isSelected && styles.datePillTextSelected,
            ]}>
              {formatDeliveryDate(routeChoice.deliveryDate)}
            </Text>
            <Text style={[
              styles.datePillMeta,
              isSelected && styles.datePillTextSelected,
            ]}>
              {routeChoice.routeName}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
  dateSelector: {
    backgroundColor: '#ffffff',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    maxHeight: 51,
  },
  dateSelectorContent: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  datePill: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderColor: '#e5e7eb',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  datePillSelected: {
    backgroundColor: '#e8f1ff',
    borderColor: '#0b57d0',
  },
  datePillText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '900',
  },
  datePillMeta: {
    color: '#667085',
    fontSize: 10,
    fontWeight: '800',
  },
  datePillTextSelected: {
    color: '#0b57d0',
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
