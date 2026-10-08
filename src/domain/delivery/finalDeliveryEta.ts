import type { DeliveryOrder } from './deliveryPlan';

type DeliveryEtaStatus = 'FAILED' | 'PRE_PICKUP' | 'READY';
type RouteExecutionStatus = 'CANCELLED' | 'COMPLETED' | 'IN_PROGRESS' | 'READY';

export type FinalDeliveryEtaSummary = {
  primaryText: string;
  secondaryText: string | null;
};

export function buildFinalDeliveryEtaSummary(input: {
  etaStatus: DeliveryEtaStatus;
  executionStatus: RouteExecutionStatus;
  orders: DeliveryOrder[];
  pickupCompletedAt: string | null;
  timezone: string;
}): FinalDeliveryEtaSummary | null {
  if (
    input.executionStatus === 'COMPLETED'
    || input.executionStatus === 'CANCELLED'
    || input.orders.length === 0
  ) {
    return null;
  }

  const finalStop = input.orders.reduce((latest, order) => (
    order.sequence > latest.sequence ? order : latest
  ));
  const rawArrival = finalStop.estimatedArrivalAt ?? null;
  if (rawArrival === null) {
    return waitingSummary(input.etaStatus);
  }

  const arrivalMs = Date.parse(rawArrival);
  const arrivalTime = Number.isFinite(arrivalMs)
    ? formatRouteTime(arrivalMs, input.timezone)
    : null;
  if (arrivalTime === null) {
    return waitingSummary('READY', '대기 중');
  }

  let secondaryText: string | null = null;
  if (input.etaStatus === 'PRE_PICKUP') {
    secondaryText = '배송 시작 전';
  } else if (input.etaStatus === 'FAILED') {
    secondaryText = '최신 ETA 계산 실패';
  } else if (input.pickupCompletedAt !== null) {
    const pickupMs = Date.parse(input.pickupCompletedAt);
    if (Number.isFinite(pickupMs) && arrivalMs >= pickupMs) {
      secondaryText = `배송 시작 후 약 ${formatDuration(arrivalMs - pickupMs)}`;
    }
  }

  return {
    primaryText: `마지막 배송 예상 도착 ${arrivalTime}`,
    secondaryText,
  };
}

function waitingSummary(
  etaStatus: DeliveryEtaStatus,
  override?: string,
): FinalDeliveryEtaSummary {
  const state = override ?? (
    etaStatus === 'PRE_PICKUP'
      ? '출발 전'
      : etaStatus === 'FAILED'
        ? '계산 실패'
        : '계산 중'
  );
  return {
    primaryText: `마지막 배송 예상 도착 ${state}`,
    secondaryText: null,
  };
}

function formatRouteTime(value: number, timezone: string): string | null {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      timeZone: timezone,
    }).format(value);
  } catch {
    return null;
  }
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.round(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}
