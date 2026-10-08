/** New reports use reason only. The legacy shape remains for durable pre-upgrade commands. */
export type DriverDeliveryExceptionDetails = { targetStopId: string } & (
  | { reason: string; reasonCode?: never; explanation?: never }
  | { reason?: never; reasonCode: string; explanation?: string | null }
);

export function deliveryExceptionReasonError(value: string): string | undefined {
  const reason = value.trim();
  if (reason === '') return '미배송 사유를 입력해 주세요. 공백만 입력할 수 없습니다.';
  if (reason.length > 1_000) return '미배송 사유는 1,000자 이하로 입력해 주세요.';
  if ([...reason].some((character) => {
    const code = character.codePointAt(0)!;
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  })) return '미배송 사유에는 줄바꿈과 탭 외의 제어 문자를 사용할 수 없습니다.';
  return undefined;
}

export function deliveryExceptionText(details: DriverDeliveryExceptionDetails): string {
  return details.reason ?? (details.explanation?.trim() ? details.explanation : details.reasonCode);
}
