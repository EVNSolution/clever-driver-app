export function formatDeliveryCompletionTime(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function resolveDeliveryCompletionOccurredAt(
  time: string,
  baseDate: Date,
): string | null {
  const match = /^(?<hour>\d{2}):(?<minute>\d{2})$/u.exec(time);
  const hour = Number(match?.groups?.hour);
  const minute = Number(match?.groups?.minute);
  if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute) || minute > 59) {
    return null;
  }

  const occurredAt = new Date(baseDate);
  occurredAt.setHours(hour, minute, 0, 0);
  return occurredAt.toISOString();
}

/** The latest 배송완료 time among one destination's orders, as HH:MM on this device. */
export function destinationCompletionTime(
  orders: readonly { completedAt?: string | null }[],
): string | null {
  const latest = orders
    .map(({ completedAt }) => (completedAt ? new Date(completedAt) : null))
    .filter((value): value is Date => value !== null && !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0];
  return latest === undefined ? null : formatDeliveryCompletionTime(latest);
}

export type CompletedRouteDestination = {
  completionTime: string | null;
  destinationId: string;
  destinationName: string;
};

/** A completed route's stops as destinations, in delivery order, each with its 배송완료 time. */
export function completedRouteDestinations(
  stops: readonly {
    completedAt: string | null;
    destinationId: string;
    destinationName: string;
    sequence: number;
  }[],
): CompletedRouteDestination[] {
  const groups = new Map<string, { destinationName: string; stops: { completedAt: string | null }[] }>();
  for (const stop of [...stops].sort((left, right) => left.sequence - right.sequence)) {
    const group = groups.get(stop.destinationId);
    if (group === undefined) {
      groups.set(stop.destinationId, { destinationName: stop.destinationName, stops: [stop] });
    } else {
      group.stops.push(stop);
    }
  }
  return [...groups].map(([destinationId, group]) => ({
    completionTime: destinationCompletionTime(group.stops),
    destinationId,
    destinationName: group.destinationName,
  }));
}
