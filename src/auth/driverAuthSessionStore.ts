import * as SecureStore from 'expo-secure-store';

import type { DriverAuthSession } from '../api/dsvDriverAuth';

const DRIVER_AUTH_SESSION_KEY = 'clever-driver.auth-session.v1';

type StoredDriverAuthSession = Pick<
  DriverAuthSession,
  'refreshToken' | 'refreshTokenExpiresAt'
>;

export async function saveDriverAuthSession(
  session: DriverAuthSession,
): Promise<void> {
  const storedSession: StoredDriverAuthSession = {
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
  await SecureStore.setItemAsync(
    DRIVER_AUTH_SESSION_KEY,
    JSON.stringify(storedSession),
  );
}

export async function readDriverAuthRefreshToken(): Promise<string | null> {
  const storedValue = await SecureStore.getItemAsync(DRIVER_AUTH_SESSION_KEY);
  if (storedValue === null) return null;

  try {
    const storedSession = JSON.parse(storedValue) as Partial<StoredDriverAuthSession>;
    if (
      typeof storedSession.refreshToken !== 'string'
      || storedSession.refreshToken.length === 0
      || typeof storedSession.refreshTokenExpiresAt !== 'string'
      || !Number.isFinite(Date.parse(storedSession.refreshTokenExpiresAt))
      || Date.parse(storedSession.refreshTokenExpiresAt) <= Date.now()
    ) {
      await clearDriverAuthSession();
      return null;
    }
    return storedSession.refreshToken;
  } catch {
    await clearDriverAuthSession();
    return null;
  }
}

export async function clearDriverAuthSession(): Promise<void> {
  await SecureStore.deleteItemAsync(DRIVER_AUTH_SESSION_KEY);
}
