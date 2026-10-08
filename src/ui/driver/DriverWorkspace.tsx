import { SymbolView } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuid } from 'expo-modules-core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  DriverOperationalApiError,
  loadDriverExecutionContexts,
  reportDriverDeliveryException,
  startDriverExecution,
  type DriverExecutionContext,
} from '../../api/dsvDriverOperational';
import { DRIVER_OPERATIONAL_ENABLED } from '../../config/driverOperational';
import {
  DriverCommandQueue,
  type DriverQueuedCommand,
} from '../../domain/delivery/driverCommandQueue';
import { createDriverCommandStore } from '../../platform/expo/storage/driverCommandStore';
import {
  acknowledgeDriverTimeConstraint,
  completeDriverDeliveryDestination,
  completeDriverDeliveryRoute,
  DriverDeliveryCompletionApiError,
  lookupDriverDeliveryCompletionResult,
  markDriverOrderMessageRead,
  startDriverDeliveryRoute,
  type DriverLifecycleCommandIdentity,
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
  updateDriverDeliveryOrder,
  updateDriverDestinationNotes,
  type DriverDeliveryRoute,
  type DriverDeliveryRouteChoice,
  type DriverCompletedRouteHistory,
  type DriverRouteExecutionStatus,
} from '../../api/dsvDriverRoute';
import {
  buildCurrentDeliverySummary,
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
import {
  DeliveryExecutionOverlay,
  useDeliveryExecution,
} from './DeliveryExecutionActions';
import { DriverRefreshControl } from './DriverRefreshControl';
import { DriverSettingsModal } from './DriverSettingsModal';
import { DeliverySpaceScreen } from './DeliverySpaceScreen';
import { DriverDeliveryException } from './DriverDeliveryException';
import { deliveryExceptionReasonError } from '../../domain/delivery/driverDeliveryException';

type DriverWorkspaceTab = 'delivery' | 'map';
type DriverRouteGroup = 'active' | 'terminal';

type DriverWorkspaceProps = {
  authSession: DriverAuthSession;
  isVisible?: boolean;
  onLogout(): void;
  refreshRequestKey: number;
  notificationRefreshId?: string;
  notificationDestination?: {
    notificationId: string;
    executionContextId: string;
    routePlanId: string;
    targetStopId?: string;
  };
  onNotificationDestinationAccepted?(notificationId: string): void;
  onNotificationDestinationRejected?(notificationId: string): void;
  onNotificationDestinationDeferred?(notificationId: string): void;
  onWorkProtectionChange?(isProtected: boolean): void;
  onAuthenticationRequired?(): void;
  protectedNotificationOverlay?: ReactNode;
};

export function DriverWorkspace({
  authSession,
  isVisible = true,
  onLogout,
  refreshRequestKey,
  notificationDestination,
  notificationRefreshId,
  onNotificationDestinationAccepted,
  onNotificationDestinationRejected,
  onAuthenticationRequired,
  onNotificationDestinationDeferred,
  onWorkProtectionChange,
  protectedNotificationOverlay,
}: DriverWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<DriverWorkspaceTab>('delivery');
  const [isDeliverySpaceOpen, setIsDeliverySpaceOpen] = useState(false);
  const [isSequenceEditing, setIsSequenceEditing] = useState(false);
  const [isSequenceSaving, setIsSequenceSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasDeliveryInput, setHasDeliveryInput] = useState(false);
  const [hasExceptionInput, setHasExceptionInput] = useState(false);
  const displayedNotificationRef = useRef<DriverWorkspaceProps['notificationDestination']>(undefined);
  const displayedRefreshRef = useRef<string | undefined>(undefined);
  const notifiedRefreshRef = useRef<string | undefined>(undefined);
  const [route, setRoute] = useState<DriverDeliveryRoute | null>(null);
  const routeRef = useRef<DriverDeliveryRoute | null>(null);
  const [executionContext, setExecutionContext] = useState<DriverExecutionContext | null>(null);
  const [queuedCommands, setQueuedCommands] = useState<DriverQueuedCommand[]>([]);
  const [commandError, setCommandError] = useState<string>();
  const [isRetryingCommands, setIsRetryingCommands] = useState(false);
  const [isRecoveringCompletion, setIsRecoveringCompletion] = useState(false);
  const recoveryLockRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionRef = useRef(authSession);
  const commandSessionGenerationRef = useRef(uuid.v4());
  const authenticationRequiredRef = useRef(onAuthenticationRequired);
  const commandQueueRef = useRef<DriverCommandQueue | null>(null);
  const [notificationTarget, setNotificationTarget] = useState<{
    notificationId: string; routePlanId: string; targetStopId: string;
    executionContext: DriverExecutionContext;
  } | null>(null);
  const notificationTargetRef = useRef<typeof notificationTarget>(null);
  const notifiedRef = useRef<string | undefined>(undefined);
  const [routeChoices, setRouteChoices] =
    useState<DriverDeliveryRouteChoice[]>([]);
  const terminalRoutesRef = useRef<Record<string, DriverDeliveryRoute>>({});
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [routeGroup, setRouteGroup] = useState<DriverRouteGroup>('active');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isRefreshingRoute, setIsRefreshingRoute] = useState(false);
  const isPullRefreshingRouteRef = useRef(false);
  const sequenceSaveReloadBaselineRef = useRef<{
    loadAttempt: number;
    refreshRequestKey: number;
    selectedRoutePlanId: string | undefined;
  } | null>(null);
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

  const [workProtectionRevision, setWorkProtectionRevision] = useState(0);
  const workProtectedRef = useRef(false);
  const protectWorkNow = useCallback(() => {
    workProtectedRef.current = true;
    setWorkProtectionRevision((revision) => revision + 1);
    onWorkProtectionChange?.(true);
  }, [onWorkProtectionChange]);
  const reportDeliveryInput = useCallback((value: boolean) => {
    if (value) protectWorkNow();
    setHasDeliveryInput(value);
  }, [protectWorkNow]);
  const reportExceptionInput = useCallback((value: boolean) => {
    if (value) protectWorkNow();
    setHasExceptionInput(value);
  }, [protectWorkNow]);

  const activeDeliveryStopId = notificationTarget !== null && route !== null && notificationTarget.routePlanId === route.routePlanId
    ? notificationTarget.targetStopId : route?.nextDeliveryStopId ?? null;
  const pendingCommands = queuedCommands.filter((command) => command.status !== 'confirmed');
  const savedReportCommand = [...queuedCommands].reverse().find((command): command is Extract<DriverQueuedCommand, { type: 'REPORT_DELIVERY_EXCEPTION' }> =>
    command.type === 'REPORT_DELIVERY_EXCEPTION' && command.payload.targetStopId === activeDeliveryStopId
    && command.executionContextId === executionContext?.executionContextId
    && command.payload.assignmentEpoch === executionContext.assignmentEpoch
    && command.payload.assignmentGeneration === executionContext.assignmentGeneration
    && command.payload.expectedRouteVersionId === executionContext.expectedRouteVersionId
    && command.payload.routeVersion === executionContext.routeVersion);
  const reportDraftKey = executionContext === null ? '' : [authSession.account.id, executionContext.executionContextId,
    executionContext.assignmentEpoch, executionContext.assignmentGeneration, executionContext.expectedRouteVersionId,
    executionContext.routeVersion, activeDeliveryStopId].join(':');
  const deliveryExecution = useDeliveryExecution({
    etaStatus: route?.etaStatus ?? 'READY',
    isReadOnly: isRouteReadOnly,
    onCompleteDelivery: completeDelivery,
    onResolveDeliveryCompletion: resolveDeliveryCompletion,
    onRefreshAssignment: refreshAssignmentAfterCompletion,
    onCompleteRoute: completeRoute,
    onStartDelivery: startDelivery,
    onUploadProof: uploadDeliveryProof,
    onWorkStarted: protectWorkNow,
    orderCount: orders.length,
    summary: route === null
      ? null
      : buildCurrentDeliverySummary(orders, activeDeliveryStopId),
  });

  const isWorkProtected = isSequenceEditing || isSequenceSaving || deliveryExecution.isLocked ||
    isRecoveringCompletion || isRetryingCommands || isDeliverySpaceOpen || isSettingsOpen ||
    hasDeliveryInput || hasExceptionInput;
  useLayoutEffect(() => {
    workProtectedRef.current = isWorkProtected;
    onWorkProtectionChange?.(isWorkProtected);
  }, [isWorkProtected, workProtectionRevision, onWorkProtectionChange]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    sessionRef.current = authSession;
  }, [authSession]);

  useEffect(() => {
    authenticationRequiredRef.current = onAuthenticationRequired;
  }, [onAuthenticationRequired]);

  useEffect(() => {
    notificationTargetRef.current = notificationTarget;
  }, [notificationTarget]);

  useEffect(() => {
    mountedRef.current = true;
    if (DRIVER_OPERATIONAL_ENABLED) {
      const queue = new DriverCommandQueue({
        store: createDriverCommandStore(),
        getSession: () => mountedRef.current ? {
          accountId: sessionRef.current.account.id,
          generation: commandSessionGenerationRef.current,
        } : null,
        loadContexts: () => loadDriverExecutionContexts(sessionRef.current.accessToken),
        send: (command) => command.type === 'START_EXECUTION'
          ? startDriverExecution(sessionRef.current.accessToken, command.executionContextId, command.payload)
          : reportDriverDeliveryException(sessionRef.current.accessToken, command.executionContextId, command.payload),
        createCommandId: () => uuid.v4(),
        onAuthenticationRequired: () => authenticationRequiredRef.current?.(),
        onChange: (commands) => {
          if (mountedRef.current) setQueuedCommands(commands);
        },
      });
      commandQueueRef.current = queue;
      void queue.initialize().then(() => queue.retryPending()).then(() => {
        if (mountedRef.current) setLoadAttempt((attempt) => attempt + 1);
      }).catch(() => {
        if (mountedRef.current) setCommandError('저장된 명령을 확인하지 못했습니다. 다시 시도해 주세요.');
      });
    }
    return () => {
      commandQueueRef.current?.suspendSession();
      mountedRef.current = false;
      routeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const queue = commandQueueRef.current;
    if (queue === null) return;
    let active = true;
    const hasPending = queue.listForAccount(authSession.account.id).some((command) => command.status === 'pending');
    if (hasPending) void queue.retryPending().then(() => {
      if (active) setLoadAttempt((attempt) => attempt + 1);
    }).catch(() => {
      if (active) setCommandError('인증 복구 후 명령을 확인하지 못했습니다. 다시 시도해 주세요.');
    });
    return () => { active = false; };
  }, [authSession.accessToken, authSession.account.id]);

  useEffect(() => {
    notifiedRefreshRef.current = undefined;
    if (notificationRefreshId !== undefined && isWorkProtected) {
      onNotificationDestinationDeferred?.(notificationRefreshId);
    }
  }, [notificationRefreshId, isWorkProtected, onNotificationDestinationDeferred]);

  useEffect(() => {
    if (notificationDestination === undefined) return;
    if (isWorkProtected) {
      onNotificationDestinationDeferred?.(notificationDestination.notificationId);
      return;
    }
    displayedNotificationRef.current = undefined;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active || workProtectedRef.current) return;
      notifiedRef.current = undefined;
      setActiveTab('delivery');
      setIsDeliverySpaceOpen(false);
      setIsSequenceEditing(false);
      setNotificationTarget(null);
      setRoute(null);
      routeRef.current = null;
      setOrders([]);
      setLoadState('loading');
      setSelectedRoutePlanId(notificationDestination.routePlanId);
      setLoadAttempt((attempt) => attempt + 1);
    });
    return () => { active = false; };
  }, [notificationDestination, isWorkProtected, onNotificationDestinationDeferred]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        const now = Date.now();
        const action = resolveAndroidBackAction({
          isDeliverySpaceOpen,
          isSequenceEditing,
          isSequenceSaving,
          lastRootBackAt: lastRootBackAtRef.current,
          now,
        });

        if (action === 'keep-sequence-editor-open') {
          lastRootBackAtRef.current = null;
        } else if (action === 'close-delivery-space') {
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
  }, [isDeliverySpaceOpen, isSequenceEditing, isSequenceSaving]);

  useEffect(() => {
    // Defer reads as well as navigation: their responses replace the editing surface.
    if (isWorkProtected) return undefined;

    const sequenceSaveBaseline = sequenceSaveReloadBaselineRef.current;
    if (sequenceSaveBaseline !== null) {
      sequenceSaveReloadBaselineRef.current = null;
      if (
        sequenceSaveBaseline.loadAttempt === loadAttempt &&
        sequenceSaveBaseline.refreshRequestKey === refreshRequestKey &&
        sequenceSaveBaseline.selectedRoutePlanId === selectedRoutePlanId
      ) {
        return undefined;
      }
    }

    let isActive = true;

    if (
      selectedRoutePlanId === undefined &&
      !isPullRefreshingRouteRef.current
    ) {
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
          if (!isActive || workProtectedRef.current) return;
          const completedRoutes = historyRoutes;
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
          setLastRouteUpdatedAt(new Date());
          displayedRefreshRef.current = notificationRefreshId;
          setLoadState(mergedRouteChoices.length === 0 ? 'empty' : 'select');
        })
      : (cachedTerminalRoute === undefined
          ? loadDriverDeliveryRoute(authSession.accessToken, selectedRoutePlanId)
          : Promise.resolve(cachedTerminalRoute)
        ).then(async (nextRoute) => {
        const contexts = DRIVER_OPERATIONAL_ENABLED
          ? await loadDriverExecutionContexts(authSession.accessToken) : [];
        if (!isActive || workProtectedRef.current) return;
        const context = contexts.find((candidate) => candidate.routePlanId === nextRoute.routePlanId);
        const previousTarget = notificationTargetRef.current;
        if (notificationDestination === undefined && previousTarget?.routePlanId === nextRoute.routePlanId) {
          const target = nextRoute.orders.find((order) => order.id === previousTarget.targetStopId);
          if (target === undefined || isTerminalDeliveryStatus(target.status) || context === undefined ||
            context.status !== 'ACTIVE' || context.expectedRouteVersionId !== nextRoute.routeVersionId ||
            !sameExecutionFences(context, previousTarget.executionContext)) {
            setRoute(null); routeRef.current = null; setOrders([]); setExecutionContext(null);
            setLoadErrorMessage('알림 배송지는 이미 처리됐거나 배정이 변경됐습니다. 현재 배차를 다시 확인해 주세요.');
            setLoadState('error'); return;
          }
        }
        if (notificationDestination !== undefined && notificationDestination.routePlanId === nextRoute.routePlanId) {
          const exactContext = context?.executionContextId === notificationDestination.executionContextId &&
            context.status === 'ACTIVE' && context.expectedRouteVersionId === nextRoute.routeVersionId;
          const target = notificationDestination.targetStopId === undefined ? undefined
            : nextRoute.orders.find((order) => order.id === notificationDestination.targetStopId);
          if (!exactContext || routeStatusGroup(nextRoute.executionStatus) === 'terminal' ||
            (notificationDestination.targetStopId !== undefined &&
              (target === undefined || isTerminalDeliveryStatus(target.status)))) {
            setRoute(null); setOrders([]); setExecutionContext(null);
            setLoadErrorMessage('알림의 배차 또는 배송지를 더 이상 확인할 수 없습니다.');
            setLoadState('error');
            onNotificationDestinationRejected?.(notificationDestination.notificationId);
            return;
          }
          if (notificationDestination.targetStopId !== undefined && context !== undefined) setNotificationTarget({
            notificationId: notificationDestination.notificationId,
            routePlanId: nextRoute.routePlanId,
            targetStopId: notificationDestination.targetStopId,
            executionContext: context,
          });
        }
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
        routeRef.current = nextRoute;
        setExecutionContext(context ?? null);
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
        displayedNotificationRef.current = notificationDestination;
        displayedRefreshRef.current = notificationRefreshId;
        setLoadState('ready');
      });

    void routeRequest.catch((error: unknown) => {
      if (!isActive || workProtectedRef.current) {
        return;
      }

      setRoute(null);
      routeRef.current = null;
      setExecutionContext(null);
      setOrders([]);
      if (error instanceof DriverOperationalApiError && error.status === 401) {
        authenticationRequiredRef.current?.();
      }
      setLoadErrorMessage(
        error instanceof DriverRouteApiError ? error.message : undefined,
      );
      setLoadState('error');
    }).finally(() => {
      if (isActive) {
        isPullRefreshingRouteRef.current = false;
        setIsRefreshingRoute(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, [
    authSession.accessToken,
    loadAttempt,
    refreshRequestKey,
    selectedRoutePlanId,
    isWorkProtected,
    workProtectionRevision,
    notificationDestination,
    notificationRefreshId,
    onNotificationDestinationRejected,
  ]);

  useEffect(() => {
    if (!isVisible || isWorkProtected || activeTab !== 'delivery' || isDeliverySpaceOpen ||
      loadState !== 'ready' || route === null || notificationDestination === undefined ||
      displayedNotificationRef.current !== notificationDestination ||
      route.routePlanId !== notificationDestination.routePlanId ||
      executionContext?.executionContextId !== notificationDestination.executionContextId ||
      (notificationDestination.targetStopId !== undefined &&
        notificationTarget?.targetStopId !== notificationDestination.targetStopId) ||
      notifiedRef.current === notificationDestination.notificationId) return;
    notifiedRef.current = notificationDestination.notificationId;
    onNotificationDestinationAccepted?.(notificationDestination.notificationId);
  }, [isVisible, isWorkProtected, activeTab, isDeliverySpaceOpen, loadState, route, executionContext, notificationDestination, notificationTarget, onNotificationDestinationAccepted]);

  useEffect(() => {
    if (!isVisible || isWorkProtected || notificationRefreshId === undefined ||
      !['ready', 'select', 'empty'].includes(loadState) ||
      displayedRefreshRef.current !== notificationRefreshId || notifiedRefreshRef.current === notificationRefreshId) return;
    notifiedRefreshRef.current = notificationRefreshId;
    onNotificationDestinationAccepted?.(notificationRefreshId);
  }, [isVisible, isWorkProtected, notificationRefreshId, loadState, lastRouteUpdatedAt, onNotificationDestinationAccepted]);

  async function retryCommands() {
    if (isRetryingCommands || commandQueueRef.current === null) return;
    const hadPending = commandQueueRef.current.listForAccount(authSession.account.id)
      .some((command) => command.status === 'pending');
    protectWorkNow();
    setIsRetryingCommands(true); setCommandError(undefined);
    try {
      await commandQueueRef.current.retryPending();
      if (mountedRef.current && hadPending) setLoadAttempt((attempt) => attempt + 1);
    } catch {
      if (mountedRef.current) setCommandError('명령을 다시 전송하지 못했습니다. 연결 후 다시 시도해 주세요.');
    } finally {
      if (mountedRef.current) setIsRetryingCommands(false);
    }
  }

  function retryRouteLoad() {
    if (notificationDestination === undefined) {
      setNotificationTarget(null);
      notificationTargetRef.current = null;
    }
    setLoadState('loading');
    setLoadAttempt((attempt) => attempt + 1);
  }

  function refreshRoute() {
    if (isRouteReadOnly || isRefreshingRoute || loadState === 'loading') return;

    isPullRefreshingRouteRef.current = true;
    setIsRefreshingRoute(true);
    setLoadAttempt((attempt) => attempt + 1);
    void retryCommands();
  }

  function selectRoute(routePlanId: string) {
    if (deliveryExecution.isLocked || isSequenceEditing) return;
    if (routePlanId === selectedRoutePlanId) {
      return;
    }

    setLoadState('loading');
    setIsSequenceEditing(false);
    setIsDeliverySpaceOpen(false);
    setRoute(null);
    routeRef.current = null;
    setExecutionContext(null);
    setNotificationTarget(null);
    setOrders([]);
    setSelectedRoutePlanId(routePlanId);
  }

  function selectRouteGroup(nextGroup: DriverRouteGroup) {
    if (deliveryExecution.isLocked || isSequenceEditing) return;
    if (nextGroup === routeGroup) return;
    setIsSequenceEditing(false);
    setIsDeliverySpaceOpen(false);
    setRoute(null);
    routeRef.current = null;
    setExecutionContext(null);
    setNotificationTarget(null);
    setOrders([]);
    setSelectedRoutePlanId(undefined);
    setLoadState('select');
    setRouteGroup(nextGroup);
  }

  function resetRootBackPress() {
    lastRootBackAtRef.current = null;
  }

  function changeSequenceEditing(isEditing: boolean) {
    if (deliveryExecution.isLocked) return;
    resetRootBackPress();
    if (isEditing) protectWorkNow();
    setIsSequenceEditing(isEditing);
  }

  function changeSequenceSaving(isSaving: boolean) {
    if (isSaving) {
      protectWorkNow();
      sequenceSaveReloadBaselineRef.current = {
        loadAttempt,
        refreshRequestKey,
        selectedRoutePlanId,
      };
    }
    setIsSequenceSaving(isSaving);
  }

  function openDeliverySpace() {
    if (deliveryExecution.isLocked) return;
    protectWorkNow();
    resetRootBackPress();
    setIsSequenceEditing(false);
    setIsDeliverySpaceOpen(true);
  }

  function closeDeliverySpace() {
    if (deliveryExecution.isLocked) return;
    resetRootBackPress();
    setIsDeliverySpaceOpen(false);
  }

  async function completeDelivery(
    destinationId: string,
    deliveryStopIds: string[],
    identity: DriverLifecycleCommandIdentity,
  ): Promise<boolean> {
    if (route === null) throw new DriverDeliveryCompletionApiError(0, 'COMPLETION_NOT_SENT', 'rejected', '현재 배차를 확인해 주세요.');
    const completingRoute = route;

    const completesRoute = completesDeliveryRoute(orders, deliveryStopIds);
    await completeDriverDeliveryDestination(
      route.routeAccessToken,
      route.routeId,
      destinationId,
      deliveryStopIds,
      identity,
    );
    const completedTarget = notificationTargetRef.current;
    if (mountedRef.current && completedTarget?.routePlanId === completingRoute.routePlanId
      && deliveryStopIds.includes(completedTarget.targetStopId)) {
      notificationTargetRef.current = null;
      setNotificationTarget(null);
    }
    if (!completesRoute && mountedRef.current && routeRef.current?.routePlanId === completingRoute.routePlanId &&
      routeRef.current.routeVersionId === completingRoute.routeVersionId) {
      setLoadAttempt((attempt) => attempt + 1);
    }
    return completesRoute;
  }

  async function resolveDeliveryCompletion(
    destinationId: string,
    deliveryStopIds: string[],
    identity: DriverLifecycleCommandIdentity,
  ): Promise<boolean> {
    if (route === null || !mountedRef.current || sessionRef.current.account.id !== authSession.account.id) return false;
    const accountId = authSession.account.id;
    try {
      const applied = await lookupDriverDeliveryCompletionResult(
        sessionRef.current.accessToken, route.routeId, destinationId, deliveryStopIds, identity,
      );
      return applied && mountedRef.current && sessionRef.current.account.id === accountId;
    } catch (error) {
      if (error instanceof DriverDeliveryCompletionApiError && error.status === 401
        && mountedRef.current && sessionRef.current.account.id === accountId) {
        authenticationRequiredRef.current?.();
      }
      throw error;
    }
  }

  function refreshAssignmentAfterCompletion(completedStopIds: string[]) {
    if (!mountedRef.current || sessionRef.current.account.id !== authSession.account.id) return;
    const completedTarget = notificationTargetRef.current;
    if (completedTarget !== null && completedTarget.routePlanId === route?.routePlanId
      && completedStopIds.includes(completedTarget.targetStopId)) {
      notificationTargetRef.current = null;
      setNotificationTarget(null);
    }
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function completeRoute() {
    if (route === null || isRouteReadOnly) return;
    const completingRoute = route;
    const identityKey = `driver:completion:${authSession.account.id}:${route.routePlanId}`;
    const stored = await AsyncStorage.getItem(identityKey);
    let identity: DriverLifecycleCommandIdentity | undefined;
    if (stored !== null) {
      try {
        const previous = JSON.parse(stored) as DriverLifecycleCommandIdentity & { routeVersionId: string | null };
        if (previous.routeVersionId === route.routeVersionId &&
          typeof previous.clientEventId === 'string' && typeof previous.occurredAt === 'string') {
          identity = previous;
        }
      } catch { /* A malformed command cannot authorize a business event. */ }
    }
    identity ??= { clientEventId: `${route.routePlanId}:completed:${uuid.v4()}`, occurredAt: new Date().toISOString() };
    await AsyncStorage.setItem(identityKey, JSON.stringify({ ...identity, routeVersionId: route.routeVersionId }));
    if (!mountedRef.current || routeRef.current?.routePlanId !== completingRoute.routePlanId ||
      routeRef.current.routeVersionId !== completingRoute.routeVersionId) {
      throw new Error('배차가 변경됐습니다. 현재 배차를 확인해 주세요.');
    }
    await completeDriverDeliveryRoute(
      route.routeAccessToken,
      route.routePlanId,
      identity,
    );
    if (!mountedRef.current || routeRef.current?.routePlanId !== completingRoute.routePlanId ||
      routeRef.current.routeVersionId !== completingRoute.routeVersionId) return;
    await AsyncStorage.removeItem(identityKey);
    if (!mountedRef.current || routeRef.current?.routePlanId !== completingRoute.routePlanId ||
      routeRef.current.routeVersionId !== completingRoute.routeVersionId) return;
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
    const startingRoute = route;
    const atomicRouteKey = `driver:atomic-route:${authSession.account.id}:${startingRoute.routePlanId}`;
    const previousAtomicExecution = await AsyncStorage.getItem(atomicRouteKey);
    if (DRIVER_OPERATIONAL_ENABLED) {
      if (!mountedRef.current || routeRef.current?.routePlanId !== startingRoute.routePlanId ||
        routeRef.current.routeVersionId !== startingRoute.routeVersionId) {
        throw new Error('배차가 변경됐습니다. 현재 배차를 확인해 주세요.');
      }
      if (executionContext?.routePlanId === startingRoute.routePlanId) {
        const context = executionContext;
        if (context.status !== 'ACTIVE' || context.expectedRouteVersionId !== startingRoute.routeVersionId) {
          throw new Error('배차 버전이 변경됐습니다. 새로고침 후 시작해 주세요.');
        }
        const queue = commandQueueRef.current;
        if (queue === null) throw new Error('명령 저장소를 확인하지 못했습니다.');
        await AsyncStorage.setItem(atomicRouteKey, context.executionContextId);
        const command = await queue.enqueueStart(context);
        if (command.status !== 'confirmed') throw new Error(command.status === 'blocked'
          ? '배차가 변경되어 시작 명령이 차단됐습니다. 현재 배차를 확인해 주세요.'
          : '서버 승인을 기다리고 있습니다. 연결 후 저장된 명령을 다시 시도해 주세요.');
        if (mountedRef.current) setLoadAttempt((attempt) => attempt + 1);
        return;
      }
      const contexts = await loadDriverExecutionContexts(authSession.accessToken);
      if (contexts.some((context) => context.routePlanId === startingRoute.routePlanId)) {
        throw new Error('실행 배차가 변경됐습니다. 새로고침 후 시작해 주세요.');
      }
    }
    if (previousAtomicExecution !== null || executionContext?.routePlanId === startingRoute.routePlanId ||
      commandQueueRef.current?.listForAccount(authSession.account.id).some((command) =>
        command.type === 'START_EXECUTION' && command.payload.expectedRouteVersionId === startingRoute.routeVersionId)) {
      throw new Error('기존 시작 명령의 서버 승인을 확인할 수 없습니다. 현재 배차를 새로고침해 주세요.');
    }
    if (!mountedRef.current || routeRef.current?.routePlanId !== startingRoute.routePlanId ||
      routeRef.current.routeVersionId !== startingRoute.routeVersionId) {
      throw new Error('배차가 변경됐습니다. 현재 배차를 확인해 주세요.');
    }
    await startDriverDeliveryRoute(startingRoute.routeAccessToken, startingRoute.routeId);
    if (mountedRef.current && routeRef.current?.routePlanId === startingRoute.routePlanId) {
      setLoadAttempt((attempt) => attempt + 1);
    }
  }

  async function reportDeliveryException(reason: string) {
    if (route === null || executionContext === null || isRouteReadOnly) throw new Error('현재 배차를 확인해 주세요.');
    const targetStopId = activeDeliveryStopId;
    const target = orders.find((order) => order.id === targetStopId);
    if (target === undefined || isTerminalDeliveryStatus(target.status)) throw new Error('이미 처리됐거나 변경된 배송지는 보고할 수 없습니다.');
    const validationError = deliveryExceptionReasonError(reason);
    if (validationError !== undefined) throw new Error(validationError);
    const reportingRoute = route;
    const context = executionContext;
    if (!mountedRef.current || context.status !== 'ACTIVE' ||
      context.routePlanId !== reportingRoute.routePlanId || context.expectedRouteVersionId !== reportingRoute.routeVersionId ||
      routeRef.current?.routePlanId !== reportingRoute.routePlanId ||
      routeRef.current.routeVersionId !== reportingRoute.routeVersionId) {
      throw new Error('배차가 변경됐습니다. 현재 배차를 확인해 주세요.');
    }
    const queue = commandQueueRef.current;
    if (queue === null) throw new Error('명령 저장소를 확인하지 못했습니다.');
    let command: DriverQueuedCommand | undefined = savedReportCommand;
    if (command?.status === 'pending') {
      await queue.retryPending();
      command = queue.listForAccount(authSession.account.id).find((item) => item.payload.commandId === savedReportCommand!.payload.commandId);
    } else if (command === undefined) {
      command = await queue.enqueueDeliveryException(context, { targetStopId: target.id, reason: reason.trim() });
    }
    if (command === undefined) throw new Error('저장된 보고 명령을 확인하지 못했습니다.');
    if (command.status !== 'confirmed') throw new Error(command.status === 'blocked'
      ? '배차 또는 배송지가 변경되어 보고 명령이 차단됐습니다.'
      : '서버 승인을 기다리고 있습니다. 연결 후 저장된 명령을 다시 시도해 주세요.');
  }

  async function acknowledgeTimeConstraint(deliveryStopId: string) {
    if (route === null) return;
    const acknowledgingRoute = route;

    await acknowledgeDriverTimeConstraint(
      route.routeAccessToken,
      route.routeId,
      deliveryStopId,
    );
    if (mountedRef.current && routeRef.current?.routePlanId === acknowledgingRoute.routePlanId) {
      setLoadAttempt((attempt) => attempt + 1);
    }
  }

  async function readDriverMessage(messageId: string) {
    if (route === null) return;
    const readingRoute = route;

    await markDriverOrderMessageRead(route.routeAccessToken, messageId);
    if (mountedRef.current && routeRef.current?.routePlanId === readingRoute.routePlanId) {
      setLoadAttempt((attempt) => attempt + 1);
    }
  }

  async function saveDestinationNotes(
    destinationId: string,
    previous: DestinationNotes,
    values: DestinationNoteValues,
  ): Promise<DestinationNotes> {
    if (route === null) return previous;
    const savingRoute = route;
    const notes = await updateDriverDestinationNotes(
      route.routeAccessToken,
      destinationId,
      previous,
      values,
    );
    if (!mountedRef.current) return notes;
    setRoute((currentRoute) => currentRoute === null || currentRoute.routePlanId !== savingRoute.routePlanId ||
      currentRoute.routeVersionId !== savingRoute.routeVersionId
      ? currentRoute
      : {
          ...currentRoute,
          destinationNotesById: {
            ...currentRoute.destinationNotesById,
            [destinationId]: notes,
          },
        });
    return notes;
  }

  async function saveDeliveryOrder(nextOrders: DeliveryOrder[]) {
    const savingRoute = routeRef.current;
    if (savingRoute === null) {
      throw new DriverRouteApiError(
        'ROUTE_NOT_AVAILABLE',
        '배송 경로를 확인할 수 없습니다.',
      );
    }
    if (savingRoute.routeVersionId === null) {
      throw new DriverRouteApiError(
        'ROUTE_ORDER_UNSUPPORTED',
        '이 배송 경로는 수동 순서 저장을 지원하지 않습니다.',
      );
    }

    const expectedVersion = savingRoute.routeVersionId;
    let savedOrder: Awaited<ReturnType<typeof updateDriverDeliveryOrder>>;
    try {
      savedOrder = await updateDriverDeliveryOrder(
        savingRoute.routeAccessToken,
        savingRoute.routePlanId,
        expectedVersion,
        nextOrders,
      );
    } catch (error) {
      if (mountedRef.current &&
        error instanceof DriverRouteApiError &&
        [
          'COMMAND_IN_PROGRESS',
          'INVALID_STOP_SET',
          'ROUTE_COMPLETED',
          'ROUTE_SCOPE_REJECTED',
          'VERSION_CONFLICT',
        ].includes(error.code)
      ) {
        setLoadAttempt((attempt) => attempt + 1);
      }
      throw error;
    }

    const latestRoute = routeRef.current;
    if (
      latestRoute === null ||
      latestRoute.routePlanId !== savingRoute.routePlanId ||
      (
        latestRoute.routeVersionId !== expectedVersion &&
        latestRoute.routeVersionId !== savedOrder.routeVersionId
      )
    ) {
      if (mountedRef.current) setLoadAttempt((attempt) => attempt + 1);
      throw new DriverRouteApiError(
        'ROUTE_CHANGED_DURING_ORDER_SAVE',
        '배송 경로가 변경됐습니다. 최신 순서를 확인해 주세요.',
      );
    }

    const savedRoute: DriverDeliveryRoute = {
      ...latestRoute,
      etaStatus: latestRoute.pickupCompletedAt === null ? 'PRE_PICKUP' : 'FAILED',
      nextDeliveryStopId: null,
      orders: savedOrder.orders,
      routeVersionId: savedOrder.routeVersionId,
      serverRouteGeometry: null,
    };
    routeRef.current = savedRoute;
    setRoute(savedRoute);
    setOrders(savedOrder.orders);
    setLastRouteUpdatedAt(new Date());
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

  function handleLogout() {
    // Block account-scoped commands immediately; root owns session and UI teardown.
    void commandQueueRef.current?.invalidateSession().catch(() => undefined);
    onLogout();
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
            accessibilityState={{ disabled: isSequenceSaving }}
            disabled={isSequenceSaving}
            onPress={() => {
              protectWorkNow();
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
            accessibilityState={{ disabled: isSequenceSaving }}
            disabled={isSequenceSaving}
            onPress={handleLogout}
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
        {pendingCommands.length > 0 || commandError !== undefined ? (
          <View accessibilityRole="alert" style={styles.commandStatus}>
            {pendingCommands.map((command) => (
              <Text key={command.payload.commandId}>{command.type === 'START_EXECUTION' ? '배송 시작' : '미배송 보고'}: {command.status === 'blocked' ? '배차 변경 또는 서버 거부로 차단됨' : '서버 승인 대기'}</Text>
            ))}
            {commandError ? <Text>{commandError}</Text> : null}
            <Pressable accessibilityRole="button" disabled={isRetryingCommands} onPress={() => { void retryCommands(); }}>
              <Text>{isRetryingCommands ? '확인 중' : '저장된 명령 다시 시도'}</Text>
            </Pressable>
          </View>
        ) : null}
        {route?.executionStatus === 'IN_PROGRESS' && completesDeliveryRoute(orders, []) ? (
          <Pressable
            accessibilityLabel="배차 완료 복구"
            accessibilityRole="button"
            disabled={deliveryExecution.isLocked || isRecoveringCompletion}
            onPress={() => {
              if (recoveryLockRef.current) return;
              protectWorkNow();
              recoveryLockRef.current = true; setIsRecoveringCompletion(true);
              void completeRoute().catch((error: unknown) => {
                if (mountedRef.current) setLoadErrorMessage(error instanceof Error ? error.message : '배차 완료 상태를 저장하지 못했습니다.');
              }).finally(() => {
                recoveryLockRef.current = false;
                if (mountedRef.current) setIsRecoveringCompletion(false);
              });
            }}
            style={styles.recoveryButton}
          >
            <Text style={styles.recoveryButtonText}>배차 완료 복구</Text>
            <Text>모든 배송지 처리가 끝났습니다. 확인 후 배차를 완료합니다.</Text>
            {loadErrorMessage ? <Text>{loadErrorMessage}</Text> : null}
          </Pressable>
        ) : null}
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
            lastUpdatedAt={lastRouteUpdatedAt}
            message={loadErrorMessage}
            onRefresh={refreshRoute}
            onRetry={retryRouteLoad}
            refreshing={isRefreshingRoute}
            state={loadState}
          />
        ) : (
          <>
            {DRIVER_OPERATIONAL_ENABLED && executionContext?.expectedRouteVersionId === route.routeVersionId &&
              !isRouteReadOnly && activeDeliveryStopId !== null ? (
              <DriverDeliveryException
                key={reportDraftKey}
                draftKey={reportDraftKey}
                savedCommand={savedReportCommand}
                destinationName={orders.find((order) => order.id === activeDeliveryStopId)?.destinationName ?? '배송지'}
                onSubmit={reportDeliveryException}
                onWorkProtectionChange={reportExceptionInput}
              />
            ) : null}
            {isDeliverySpaceOpen ? (
              <DeliverySpaceScreen
                key={`${route.routePlanId}:${route.deliveryDate}`}
                selectedRoute={route}
                onAssignmentsChanged={() => setLoadAttempt((attempt) => attempt + 1)}
                onBack={closeDeliverySpace}
              />
            ) : activeTab === 'delivery' ? (
              <DeliveryScreen
                deliveryDate={route.deliveryDate}
                destinationNotesById={route.destinationNotesById}
                etaStatus={route.etaStatus}
                executionController={deliveryExecution}
                executionStatus={route.executionStatus}
                historySummary={route.historySummary}
                isEditing={isSequenceEditing}
                isReadOnly={isRouteReadOnly}
                isSequenceEditingSupported={route.routeVersionId !== null}
                lastUpdatedAt={lastRouteUpdatedAt}
                nextDeliveryStopId={activeDeliveryStopId}
                onAcknowledgeTimeConstraint={acknowledgeTimeConstraint}
                onEditingChange={changeSequenceEditing}
                onOpenDeliverySpace={openDeliverySpace}
                onReadDriverMessage={readDriverMessage}
                onRefresh={refreshRoute}
                onSequenceSavingChange={changeSequenceSaving}
                onWorkProtectionChange={reportDeliveryInput}
                onSaveDestinationNotes={saveDestinationNotes}
                onSaveDeliveryOrder={saveDeliveryOrder}
                orders={orders}
                pickupCompletedAt={route.pickupCompletedAt}
                refreshing={isRefreshingRoute}
                serverRouteGeometry={route.serverRouteGeometry}
                timezone={route.timezone}
              />
            ) : (
              <DeliveryMapScreen
                depotCoordinate={route.depotCoordinate}
                executionController={deliveryExecution}
                etaStatus={route.etaStatus}
                isReadOnly={isRouteReadOnly}
                lastUpdatedAt={lastRouteUpdatedAt}
                nextDeliveryStopId={activeDeliveryStopId}
                onRefresh={refreshRoute}
                orders={orders}
                refreshing={isRefreshingRoute}
                serverRouteGeometry={route.serverRouteGeometry}
                timezone={route.timezone}
              />
            )}
          </>
        )}
      </View>

      <DeliveryExecutionOverlay controller={deliveryExecution} protectedNotificationOverlay={protectedNotificationOverlay} />

      {isSettingsOpen ? (
        <DriverSettingsModal
          accessToken={authSession.accessToken}
          key={authSession.account.id}
          onClose={() => {
            resetRootBackPress();
            setIsSettingsOpen(false);
          }}
          onAccountDeletionRequested={handleLogout}
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
          disabled={isSequenceSaving}
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
          disabled={isSequenceSaving}
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

function sameExecutionFences(left: DriverExecutionContext, right: DriverExecutionContext): boolean {
  return left.executionContextId === right.executionContextId && left.routePlanId === right.routePlanId &&
    left.routeVersion === right.routeVersion && left.assignmentEpoch === right.assignmentEpoch &&
    left.assignmentGeneration === right.assignmentGeneration && left.expectedRouteVersionId === right.expectedRouteVersionId;
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
    routeVersionId: null,
    serverRouteGeometry: null,
    timezone: summary.timezone,
  };
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
  lastUpdatedAt,
  message,
  onRefresh,
  onRetry,
  refreshing,
  state,
}: {
  lastUpdatedAt: Date | null;
  message?: string;
  onRefresh(): void;
  onRetry(): void;
  refreshing: boolean;
  state: 'loading' | 'select' | 'ready' | 'empty' | 'error';
}) {
  const isLoading = state === 'loading';
  const canPullRefresh = state === 'select' || state === 'empty';

  return (
    <ScrollView
      alwaysBounceVertical={canPullRefresh}
      contentContainerStyle={styles.routeState}
      refreshControl={canPullRefresh ? (
        <DriverRefreshControl
          lastUpdatedAt={lastUpdatedAt}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      ) : undefined}
      style={styles.routeStateScroll}
    >
      {state === 'select' ? (
        <>
          <View style={styles.routePlaceholderIcon}>
            <DeliveryPackageIcon isSelected={false} />
          </View>
          <Text style={styles.routePlaceholderText}>
            배송 날짜를 선택해 주세요
          </Text>
        </>
      ) : (
        <>
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
        </>
      )}
    </ScrollView>
  );
}

function TabButton({
  disabled,
  icon,
  isSelected,
  label,
  onPress,
}: {
  disabled: boolean;
  icon: ReactNode;
  isSelected: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ disabled, selected: isSelected }}
      disabled={disabled}
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
  commandStatus: { backgroundColor: '#FFF4D6', padding: 12, gap: 6 },
  recoveryButton: { backgroundColor: '#FFF4D6', margin: 12, padding: 12, borderRadius: 12, gap: 6 },
  recoveryButtonText: { fontSize: 16, fontWeight: '700', color: '#7A4B00' },
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
  routeStateScroll: {
    flex: 1,
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
