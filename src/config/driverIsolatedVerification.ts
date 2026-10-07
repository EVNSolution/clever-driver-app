/** Synthetic D05 fixture only. This does not approve an operational reason policy. */
export function isolatedDeliveryExceptionReasons(input: {
  enabled?: string;
  operational?: string;
  apiBaseUrl?: string;
}): readonly { code: string; label: string; requiresExplanation: boolean }[] {
  if (input.enabled !== 'true' || input.operational !== 'true') return [];
  try {
    const url = new URL(input.apiBaseUrl ?? '');
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) return [];
  } catch { return []; }
  return [{ code: 'UNDELIVERABLE', label: '합성 검증 사유', requiresExplanation: true }];
}
