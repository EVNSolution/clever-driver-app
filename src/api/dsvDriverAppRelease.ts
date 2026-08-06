import { readDriverAppRelease, type DriverAppRelease } from '../domain/appUpdate/driverAppUpdate';
import { resolveDsvApiUrl } from './dsvApiUrl';

const DEFAULT_RELEASE_LOOKUP_TIMEOUT_MS = 3_000;

export async function fetchDriverAndroidAppRelease(options: {
  timeoutMs?: number;
} = {}): Promise<DriverAppRelease> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_RELEASE_LOOKUP_TIMEOUT_MS,
  );
  try {
    const response = await fetch(resolveDsvApiUrl('/api/dsv/driver/app-release/android'), {
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Driver app release lookup failed (${response.status})`);
    const envelope = (await response.json()) as { data?: unknown };
    return readDriverAppRelease(envelope.data);
  } finally {
    clearTimeout(timeout);
  }
}
