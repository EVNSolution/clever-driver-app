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
