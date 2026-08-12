import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));

describe('Driver push notification lifecycle wiring', () => {
  it('registers after authentication, refreshes delivery data, and revokes before logout', () => {
    const source = readFileSync(join(appDirectory, 'AppRoot.tsx'), 'utf8');

    assert.match(source, /registerExpoDriverPushNotifications/u);
    assert.match(source, /subscribeToExpoDriverPushNotifications/u);
    assert.match(source, /revokeExpoDriverPushNotifications/u);
    assert.match(source, /notificationRefreshKey/u);
    assert.match(source, /refreshRequestKey=\{notificationRefreshKey\}/u);
    assert.match(source, /await revokeExpoDriverPushNotifications/u);
  });

  it('makes a notification refresh reload the authenticated route', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );

    assert.match(source, /refreshRequestKey: number/u);
    assert.match(source, /refreshRequestKey,/u);
    assert.match(
      source,
      /authSession\.accessToken, loadAttempt, refreshRequestKey, selectedRoutePlanId/u,
    );
  });

  it('refreshes the authenticated route whenever the app becomes active', () => {
    const source = readFileSync(join(appDirectory, 'AppRoot.tsx'), 'utf8');

    assert.match(
      source,
      /if \(state === 'active'\) \{[\s\S]{0,240}setNotificationRefreshKey/u,
    );
  });
});
