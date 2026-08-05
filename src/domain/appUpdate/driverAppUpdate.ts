export type DriverAppRelease = {
  apkSha256: string;
  installUrl: string;
  latestVersionCode: number;
  latestVersionName: string;
  minimumSupportedVersionCode: number;
  packageId: string;
  platform: 'android';
  publishedAt: string;
};

export type DriverAppUpdateState =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'up_to_date'; release: DriverAppRelease }
  | { kind: 'optional_update'; release: DriverAppRelease }
  | { kind: 'required_update'; release: DriverAppRelease };

export function classifyDriverAppUpdate(input: {
  currentPackageId: string;
  currentVersionCode: number;
  release: DriverAppRelease;
}): DriverAppUpdateState {
  if (
    input.currentPackageId !== input.release.packageId
    || input.currentVersionCode < input.release.minimumSupportedVersionCode
  ) {
    return { kind: 'required_update', release: input.release };
  }
  if (input.currentVersionCode < input.release.latestVersionCode) {
    return { kind: 'optional_update', release: input.release };
  }
  return { kind: 'up_to_date', release: input.release };
}

export function readDriverAppRelease(value: unknown): DriverAppRelease {
  if (!isRecord(value)) throw new Error('Invalid driver app release response');
  const release = value as Partial<DriverAppRelease>;
  if (
    release.platform !== 'android'
    || !isNonEmptyString(release.packageId)
    || !isPositiveInteger(release.latestVersionCode)
    || !isPositiveInteger(release.minimumSupportedVersionCode)
    || release.minimumSupportedVersionCode > release.latestVersionCode
    || !isNonEmptyString(release.latestVersionName)
    || !isHttpsUrl(release.installUrl)
    || !isNonEmptyString(release.publishedAt)
    || !isSha256(release.apkSha256)
  ) {
    throw new Error('Invalid driver app release response');
  }
  return release as DriverAppRelease;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
