type IsolatedDriverVerificationInput = {
  applicationId?: string | null;
  enabled?: string;
  operational?: string;
  apiBaseUrl?: string;
};

export function isIsolatedDriverVerification(input: IsolatedDriverVerificationInput): boolean {
  if (input.applicationId !== 'com.evnsolution.clever.driver.integration'
    || input.enabled !== 'true' || input.operational !== 'true') return false;
  try {
    const url = new URL(input.apiBaseUrl ?? '');
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch { return false; }
}
