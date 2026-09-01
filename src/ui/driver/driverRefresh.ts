export function formatDriverRefreshUpdatedAt(date: Date | null): string {
  if (date === null) return '마지막 갱신 —';

  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('.');
  const timePart = [
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':');

  return `마지막 갱신 ${datePart} ${timePart}`;
}

export function isDriverRefreshPulling(contentOffsetY: number): boolean {
  return contentOffsetY < -12;
}
