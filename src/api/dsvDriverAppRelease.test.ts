import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { fetchDriverAndroidAppRelease } from './dsvDriverAppRelease';

const originalBaseUrl = process.env.EXPO_PUBLIC_DSV_API_BASE_URL;
const originalFetch = global.fetch;

afterEach(() => {
  process.env.EXPO_PUBLIC_DSV_API_BASE_URL = originalBaseUrl;
  global.fetch = originalFetch;
});

describe('DSV Driver app release client', () => {
  it('loads the public Android release endpoint', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    global.fetch = (async (input, init) => {
      assert.equal(input, 'https://dsv.example.test/api/dsv/driver/app-release/android');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.credentials, 'omit');
      assert.ok(init?.signal instanceof AbortSignal);
      assert.deepEqual(init?.headers, {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      });
      return new Response(JSON.stringify({
        data: {
          apkSha256: 'a'.repeat(64),
          installUrl: 'https://download.example.test/driver.apk',
          latestVersionCode: 2,
          latestVersionName: '0.1.1',
          minimumSupportedVersionCode: 2,
          packageId: 'com.evnsolution.clever.driver',
          platform: 'android',
          publishedAt: '2026-08-05T01:00:00.000Z',
        },
        error: null,
      }), { status: 200 });
    }) as typeof fetch;

    const release = await fetchDriverAndroidAppRelease();
    assert.equal(release.latestVersionCode, 2);
  });

  it('aborts a release lookup that exceeds its timeout', async () => {
    process.env.EXPO_PUBLIC_DSV_API_BASE_URL = 'https://dsv.example.test';
    global.fetch = ((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    })) as typeof fetch;

    await assert.rejects(
      fetchDriverAndroidAppRelease({ timeoutMs: 1 }),
      (error: unknown) => error instanceof Error && error.name === 'AbortError',
    );
  });
});
