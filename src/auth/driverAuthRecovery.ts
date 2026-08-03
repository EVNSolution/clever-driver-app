import { AuthApiError } from '../api/dsvDriverAuth';

export const AUTO_LOGIN_RETRY_DELAY_MS = 5_000;

export type DriverAuthRecoveryAction = 'discard' | 'retry';

export function resolveDriverAuthRecoveryAction(
  error: unknown,
): DriverAuthRecoveryAction {
  return error instanceof AuthApiError && error.code === 'SESSION_EXPIRED'
    ? 'discard'
    : 'retry';
}
