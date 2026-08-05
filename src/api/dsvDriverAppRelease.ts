import { readDriverAppRelease, type DriverAppRelease } from '../domain/appUpdate/driverAppUpdate';
import { resolveDsvApiUrl } from './dsvApiUrl';

export async function fetchDriverAndroidAppRelease(): Promise<DriverAppRelease> {
  const response = await fetch(resolveDsvApiUrl('/api/dsv/driver/app-release/android'), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Driver app release lookup failed (${response.status})`);
  const envelope = (await response.json()) as { data?: unknown };
  return readDriverAppRelease(envelope.data);
}
