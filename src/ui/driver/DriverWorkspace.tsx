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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DriverAuthSession } from '../../api/dsvDriverAuth';
import {
  acknowledgeDriverTimeConstraint,
  completeDriverDeliveryDestination,
  completeDriverDeliveryRoute,
  markDriverOrderMessageRead,
  startDriverDeliveryRoute,
} from '../../api/dsvDriverEvents';
import {
  uploadDriverProofPhoto,
  type DriverProofPhotoUpload,
} from '../../api/dsvDriverProofMedia';
import {
  DriverRouteApiError,
  loadDriverCompletedRouteHistory,
  loadDriverDeliveryRoute,
  loadDriverDeliveryRouteChoices,
  updateDriverDestinationNotes,
  type DriverDeliveryRoute,
  type DriverDeliveryRouteChoice,
  type DriverCompletedRouteHistory,
  type DriverRouteExecutionStatus,
} from '../../api/dsvDriverRoute';
import {
  completesDeliveryRoute,
  isTerminalDeliveryStatus,
  type DeliveryOrder,
} from '../../domain/delivery/deliveryPlan';
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
type DriverRouteGroup = 'active' | 'terminal';

type DriverWorkspaceProps = {
  authSession: DriverAuthSession;
  onLogout(): void;
  refreshRequestKey: number;
};

export function DriverWorkspace({
  authSession,
  onLogout,
  refreshRequestKey,
}: DriverWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<DriverWorkspaceTab>('delivery');
  const [isDeliverySpaceOpen, setIsDeliverySpaceOpen] = useState(false);
  const [isSequenceEditing, setIsSequenceEditing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [route, setRoute] = useState<DriverDeliveryRoute | null>(null);
  const [routeChoices, setRouteChoices] =
    useState<DriverDeliveryRouteChoice[]>([]);
  const terminalRoutesRef = useRef<Record<string, DriverDeliveryRoute>>({});
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [routeGroup, setRouteGroup] = useState<DriverRouteGroup>('active');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isRefreshingRoute, setIsRefreshingRoute] = useState(false);
  const [lastRouteUpdatedAt, setLastRouteUpdatedAt] = useState<Date | null>(null);
  const [selectedRoutePlanId, setSelectedRoutePlanId] = useState<string>();
  const [loadErrorMessage, setLoadErrorMessage] = useState<string>();
  const [loadState, setLoadState] = useState<
    'loading' | 'select' | 'ready' | 'empty' | 'error'
  >(
    'loading',
  );
  const lastRootBackAtRef = useRef<number | null>(null);
  const driverName =
    authSession.account.linkedDrivers[0]?.name ?? authSession.account.name;
  const isRouteReadOnly = route !== null &&
    routeStatusGroup(route.executionStatus) === 'terminal';

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

    if (selectedRoutePlanId === undefined) {
      void Promise.resolve().then(() => {
        if (isActive) setLoadState('loading');
      });
    }
    const cachedTerminalRoute = selectedRoutePlanId === undefined
      ? undefined
      : terminalRoutesRef.current[selectedRoutePlanId];
    const routeRequest = selectedRoutePlanId === undefined
      ? loadDriverDeliveryRouteChoices(authSession.accessToken)
        .then(async (nextRouteChoices) => {
          const historyAccessRoute = nextRouteChoices[0];
          const historyRoutes = historyAccessRoute === undefined
            ? []
            : await loadDriverCompletedRouteHistory(
                historyAccessRoute.routeAccessToken,
              )
              .then((history) => history.map((summary) => (
                completedRouteFromHistory(
                  summary,
                  historyAccessRoute,
                  nextRouteChoices,
                )
              )))
              .catch(() => []);
          const reconciledRoutes = await reconcileCompletedRoutes(
            authSession.accessToken,
            nextRouteChoices,
          );
          if (!isActive) return;
          const completedRoutes = [...historyRoutes, ...reconciledRoutes];
          if (completedRoutes.length > 0) {
            terminalRoutesRef.current = {
              ...terminalRoutesRef.current,
              ...Object.fromEntries(completedRoutes.map((completedRoute) => [
                completedRoute.routePlanId,
                completedRoute,
              ])),
            };
          }
          const mergedRouteChoices = mergeRouteChoices(
            nextRouteChoices,
            Object.values(terminalRoutesRef.current),
          );
          setRouteChoices(mergedRouteChoices);
          setRoute(null);
          setOrders([]);
          setLoadErrorMessage(undefined);
          setLoadState(mergedRouteChoices.length === 0 ? 'empty' : 'select');
        })
      : (cachedTerminalRoute === undefined
          ? loadDriverDeliveryRoute(authSession.accessToken, selectedRoutePlanId)
          : Promise.resolve(cachedTerminalRoute)
        ).then(async (loadedRoute) => {
        let nextRoute = loadedRoute;
        if (
          nextRoute.executionStatus === 'IN_PROGRESS' &&
          completesDeliveryRoute(nextRoute.orders, [])
        ) {
          await completeDriverDeliveryRoute(
            nextRoute.routeAccessToken,
            nextRoute.routePlanId,
          );
          nextRoute = completedDeliveryRoute(nextRoute, nextRoute.orders);
        }
        if (!isActive) return;
        if (routeStatusGroup(nextRoute.executionStatus) === 'terminal') {
          if (terminalRoutesRef.current[nextRoute.routePlanId] !== nextRoute) {
            terminalRoutesRef.current = {
              ...terminalRoutesRef.current,
              [nextRoute.routePlanId]: nextRoute,
            };
          }
          setRouteGroup('terminal');
        }
        setRoute(nextRoute);
        setRouteChoices(mergeRouteChoices(
          nextRoute.availableRoutes,
          [
            ...Object.values(terminalRoutesRef.current),
            ...(routeStatusGroup(nextRoute.executionStatus) === 'terminal'
              ? [nextRoute]
              : []),
          ],
        ));
        setOrders(nextRoute.orders);
        setIsSequenceEditing(false);
        setLoadErrorMessage(undefined);
        setLastRouteUpdatedAt(new Date());
        setLoadState('ready');
      });

    void routeRequest.catch((error: unknown) => {
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
  }, [
    authSession.accessToken,
    loadAttempt,
    refreshRequestKey,
    selectedRoutePlanId,
  ]);

  function retryRouteLoad() {
    setLoadState('loading');
    setLoadAttempt((attempt) => attempt + 1);
  }

  function refreshRoute() {
    if (isRouteReadOnly || isRefreshingRoute || loadState === 'loading') return;

    setIsRefreshingRoute(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  function selectRoute(routePlanId: string) {
    if (routePlanId === selectedRoutePlanId) {
      return;
    }

    setLoadState('loading');
    setIsSequenceEditing(false);
    setIsDeliverySpaceOpen(false);
    setRoute(null);
    setOrders([]);
    setSelectedRoutePlanId(routePlanId);
  }

  function selectRouteGroup(nextGroup: DriverRouteGroup) {
    if (nextGroup === routeGroup) return;
    setIsSequenceEditing(false);
    setIsDeliverySpaceOpen(false);
    setRoute(null);
    setOrders([]);
    setSelectedRoutePlanId(undefined);
    setLoadState('select');
    setRouteGroup(nextGroup);
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

  async function completeDelivery(
    destinationId: string,
    deliveryStopIds: string[],
  ): Promise<boolean> {
    if (route === null) {
      return false;
    }

    const completesRoute = completesDeliveryRoute(orders, deliveryStopIds);
    await completeDriverDeliveryDestination(
      route.routeAccessToken,
      route.routeId,
      destinationId,
      deliveryStopIds,
    );
    if (!completesRoute) {
      setLoadAttempt((attempt) => attempt + 1);
    }
    return completesRoute;
  }

  async function completeRoute() {
    if (route === null || isRouteReadOnly) return;

    await completeDriverDeliveryRoute(
      route.routeAccessToken,
      route.routePlanId,
    );
    const completedRoute = completedDeliveryRoute(route, orders);
    terminalRoutesRef.current = {
      ...terminalRoutesRef.current,
      [completedRoute.routePlanId]: completedRoute,
    };
    setRouteChoices((currentChoices) => mergeRouteChoices(
      currentChoices.filter(({ routePlanId }) => (
        routePlanId !== completedRoute.routePlanId
      )),
      [completedRoute],
    ));
    setRoute(completedRoute);
    setOrders(completedRoute.orders);
    setIsSequenceEditing(false);
    setIsDeliverySpaceOpen(false);
    setLastRouteUpdatedAt(new Date());
    setRouteGroup('terminal');
    setLoadState('ready');
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
        {activeTab === 'delivery' &&
        loadState !== 'loading' &&
        !isDeliverySpaceOpen &&
        routeChoices.length > 0 ? (
          <RouteDateSelector
            onSelect={selectRoute}
            onGroupSelect={selectRouteGroup}
            routeGroup={routeGroup}
            routes={routeChoices}
            selectedRoutePlanId={selectedRoutePlanId}
          />
        ) : null}
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
              <DeliveryScreen
                deliveryDate={route.deliveryDate}
                destinationNotesById={route.destinationNotesById}
                historySummary={route.historySummary}
                isEditing={isSequenceEditing}
                isReadOnly={isRouteReadOnly}
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
            ) : (
              <DeliveryMapScreen
                depotCoordinate={route.depotCoordinate}
                etaStatus={route.etaStatus}
                isReadOnly={isRouteReadOnly}
                lastUpdatedAt={lastRouteUpdatedAt}
                nextDeliveryStopId={route.nextDeliveryStopId}
                onCompleteDelivery={completeDelivery}
                onCompleteRoute={completeRoute}
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
          accessToken={authSession.accessToken}
          onClose={() => {
            resetRootBackPress();
            setIsSettingsOpen(false);
          }}
          onAccountDeletionRequested={onLogout}
        />
      ) : null}

      <View
        accessibilityRole="tablist"
        style={[
          styles.tabBar,
          { paddingBottom: Platform.OS === 'ios' ? 0 : insets.bottom },
        ]}
      >
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

function completedDeliveryRoute(
  route: DriverDeliveryRoute,
  orders: DeliveryOrder[],
): DriverDeliveryRoute {
  return {
    ...route,
    executionStatus: 'COMPLETED',
    nextDeliveryStopId: null,
    orders: orders.map((order) => (
      isTerminalDeliveryStatus(order.status)
        ? order
        : { ...order, status: 'DELIVERED' }
    )),
  };
}

function completedRouteFromHistory(
  summary: DriverCompletedRouteHistory,
  accessRoute: DriverDeliveryRouteChoice,
  availableRoutes: DriverDeliveryRouteChoice[],
): DriverDeliveryRoute {
  return {
    availableRoutes,
    deliveryDate: summary.deliveryDate,
    depotCoordinate: null,
    destinationNotesById: {},
    etaStatus: 'READY',
    executionStatus: 'COMPLETED',
    historySummary: summary,
    nextDeliveryStopId: null,
    orders: [],
    pickupCompletedAt: null,
    routeAccessToken: accessRoute.routeAccessToken,
    routeContext: summary.routePlanId,
    routeId: summary.routePlanId,
    routeName: summary.routeName,
    routePlanId: summary.routePlanId,
    serverRouteGeometry: null,
    timezone: summary.timezone,
  };
}

async function reconcileCompletedRoutes(
  accountAccessToken: string,
  routeChoices: DriverDeliveryRouteChoice[],
): Promise<DriverDeliveryRoute[]> {
  const candidates = routeChoices.filter(({ executionStatus }) => (
    executionStatus === 'IN_PROGRESS'
  ));
  const reconciledRoutes = await Promise.all(candidates.map(async (choice) => {
    try {
      // ponytail: active route counts are small; reuse the existing verified loader.
      const route = await loadDriverDeliveryRoute(
        accountAccessToken,
        choice.routePlanId,
      );
      if (!completesDeliveryRoute(route.orders, [])) return null;
      await completeDriverDeliveryRoute(
        route.routeAccessToken,
        route.routePlanId,
      );
      return completedDeliveryRoute(route, route.orders);
    } catch {
      return null;
    }
  }));

  return reconciledRoutes.filter(
    (route): route is DriverDeliveryRoute => route !== null,
  );
}

function mergeRouteChoices(
  serverChoices: DriverDeliveryRouteChoice[],
  terminalRoutes: DriverDeliveryRoute[],
): DriverDeliveryRouteChoice[] {
  const choicesById = new Map(serverChoices.map((choice) => [
    choice.routePlanId,
    choice,
  ]));
  for (const terminalRoute of terminalRoutes) {
    choicesById.set(terminalRoute.routePlanId, {
      deliveryDate: terminalRoute.deliveryDate,
      executionStatus: terminalRoute.executionStatus,
      routeAccessToken: terminalRoute.routeAccessToken,
      routeContext: terminalRoute.routeContext,
      routeName: terminalRoute.routeName,
      routePlanId: terminalRoute.routePlanId,
    });
  }

  return [...choicesById.values()].sort((left, right) => (
    right.deliveryDate.localeCompare(left.deliveryDate) ||
    left.routeName.localeCompare(right.routeName)
  ));
}

function RouteDateSelector({
  onGroupSelect,
  onSelect,
  routeGroup,
  routes,
  selectedRoutePlanId,
}: {
  onGroupSelect(group: DriverRouteGroup): void;
  onSelect(routePlanId: string): void;
  routeGroup: DriverRouteGroup;
  routes: DriverDeliveryRouteChoice[];
  selectedRoutePlanId?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleRoutes = routes.filter(({ executionStatus }) => (
    routeStatusGroup(executionStatus) === routeGroup
  ));
  const selectedRoute = visibleRoutes.find((routeChoice) => (
    routeChoice.routePlanId === selectedRoutePlanId
  ));

  function selectRoute(routePlanId: string) {
    onSelect(routePlanId);
    setIsExpanded(false);
  }

  return (
    <View style={styles.dateAccordion}>
      <View accessibilityRole="tablist" style={styles.routeGroupTabs}>
        <RouteGroupButton
          isSelected={routeGroup === 'active'}
          label="진행 배차"
          onPress={() => onGroupSelect('active')}
        />
        <RouteGroupButton
          isSelected={routeGroup === 'terminal'}
          label="종료 배차"
          onPress={() => onGroupSelect('terminal')}
        />
      </View>

      <Pressable
        accessibilityLabel={selectedRoute === undefined
          ? `배송 날짜 선택 목록 ${isExpanded ? '접기' : '펼치기'}`
          : `배송 날짜 ${formatDeliveryDate(selectedRoute.deliveryDate)} 목록 ${isExpanded ? '접기' : '펼치기'}`}
        accessibilityRole="button"
        accessibilityState={{
          disabled: visibleRoutes.length === 0,
          expanded: isExpanded,
        }}
        disabled={visibleRoutes.length === 0}
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
              {selectedRoute === undefined
                ? '배송 날짜 선택'
                : formatDeliveryDate(selectedRoute.deliveryDate)}
            </Text>
            <Text numberOfLines={1} style={styles.dateAccordionMeta}>
              {selectedRoute === undefined
                ? visibleRoutes.length === 0
                  ? '이 상태의 배차는 조회되지 않습니다.'
                  : '날짜를 선택해 주세요.'
                : `${selectedRoute.routeName} · ${routeStatusLabel(selectedRoute.executionStatus)}`}
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
          showsVerticalScrollIndicator={visibleRoutes.length > 3}
          style={styles.dateAccordionList}
        >
          {visibleRoutes.map((routeChoice) => {
            const isSelected = routeChoice.routePlanId === selectedRoutePlanId;
            const deliveryDate = routeChoice.deliveryDate;

            return (
              <Pressable
                accessibilityLabel={`${formatDeliveryDate(deliveryDate)} ${routeStatusLabel(routeChoice.executionStatus)} 배송 선택`}
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
                    {routeChoice.routeName} · {routeStatusLabel(routeChoice.executionStatus)}
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

function RouteGroupButton({
  isSelected,
  label,
  onPress,
}: {
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
        styles.routeGroupTab,
        isSelected && styles.routeGroupTabSelected,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[
        styles.routeGroupTabText,
        isSelected && styles.routeGroupTabTextSelected,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function routeStatusGroup(
  status: DriverRouteExecutionStatus,
): DriverRouteGroup {
  return status === 'READY' || status === 'IN_PROGRESS'
    ? 'active'
    : 'terminal';
}

function routeStatusLabel(status: DriverRouteExecutionStatus): string {
  switch (status) {
    case 'READY':
      return '진행 전';
    case 'IN_PROGRESS':
      return '진행 중';
    case 'COMPLETED':
      return '완료';
    case 'CANCELLED':
      return '취소';
  }
}

function RouteLoadState({
  message,
  onRetry,
  state,
}: {
  message?: string;
  onRetry(): void;
  state: 'loading' | 'select' | 'ready' | 'empty' | 'error';
}) {
  const isLoading = state === 'loading';

  if (state === 'select') {
    return (
      <View style={styles.routeState}>
        <View style={styles.routePlaceholderIcon}>
          <DeliveryPackageIcon isSelected={false} />
        </View>
        <Text style={styles.routePlaceholderText}>
          배송 날짜를 선택해 주세요
        </Text>
      </View>
    );
  }

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
  routeGroupTabs: {
    backgroundColor: '#f2f4f7',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 3,
  },
  routeGroupTab: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
  },
  routeGroupTabSelected: {
    backgroundColor: '#ffffff',
    borderColor: '#b2ccff',
    borderWidth: 1,
  },
  routeGroupTabText: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '800',
  },
  routeGroupTabTextSelected: {
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
  routePlaceholderIcon: {
    marginBottom: 14,
    opacity: 0.3,
    transform: [{ scale: 2.6 }],
  },
  routePlaceholderText: {
    color: '#98a2b3',
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
