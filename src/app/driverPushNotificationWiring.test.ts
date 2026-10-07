import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const appDirectory = dirname(fileURLToPath(import.meta.url));

describe('Driver push notification lifecycle wiring', () => {
  it('registers after authentication, separates inbox refresh, and revokes before logout', () => {
    const source = readFileSync(join(appDirectory, 'AppRoot.tsx'), 'utf8');

    assert.match(source, /registerExpoDriverPushNotifications/u);
    assert.match(source, /subscribeToExpoDriverPushNotifications/u);
    assert.match(source, /revokeExpoDriverPushNotifications/u);
    assert.match(source, /inboxRefreshKey/u);
    assert.match(source, /refreshRequestKey=\{inboxRefreshKey\}/u);
    assert.match(source, /refreshRequestKey=\{notificationRefreshKey\}/u);
    const logoutStart = source.indexOf('const logout =');
    const logout = source.slice(logoutStart, source.indexOf('\n  useEffect(', logoutStart));
    assert.ok(logout.indexOf('revokeExpoDriverPushNotifications(') < logout.indexOf('await discardAuthSession()'));
    assert.match(logout, /await revoke;/u);
  });

  it('defers requested business refresh while driver work is protected', () => {
    const source = readFileSync(
      join(appDirectory, '../ui/driver/DriverWorkspace.tsx'),
      'utf8',
    );

    assert.match(source, /if \(isWorkProtected\) return undefined;/u);
    assert.match(source, /refreshRequestKey: number/u);
    assert.match(source, /refreshRequestKey,/u);
    assert.match(
      source,
      /authSession\.accessToken,[\s\S]{0,160}loadAttempt,[\s\S]{0,160}refreshRequestKey,[\s\S]{0,160}selectedRoutePlanId/u,
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


const servicePath = join(appDirectory, '../platform/expo/notifications/expoDriverNotificationService.ts');

describe('Authenticated notification destination boundaries', () => {
  it('receives cold-start clicks before login without a handled marker', () => {
    const source = readFileSync(join(appDirectory, 'AppRoot.tsx'), 'utf8');
    assert.match(source, /notificationRecovery\.restore\(\)/u);
    assert.match(source, /subscribeToExpoDriverNotificationClicks/u);
    assert.match(source, /notificationRecovery\.receiveClick/u);
    assert.match(source, /notificationRecovery\.setAccount\(session\.account\.id\)/u);
    const platform = readFileSync(servicePath, 'utf8');
    assert.match(platform, /addNotificationResponseReceivedListener/u);
    assert.match(platform, /getLastNotificationResponseAsync/u);
    assert.doesNotMatch(platform, /LAST_HANDLED_NOTIFICATION|last-handled-notification/u);
  });

  it('keeps notification receipts separate from click resolution and token capability', () => {
    const platform = readFileSync(servicePath, 'utf8');
    const receiptFunction = platform.slice(platform.indexOf('export function subscribeToExpoDriverPushNotifications'), platform.indexOf('function registerToken'));
    assert.match(receiptFunction, /addNotificationReceivedListener/u);
    assert.match(receiptFunction, /addPushTokenListener/u);
    assert.doesNotMatch(receiptFunction, /addNotificationResponseReceivedListener|getLastNotificationResponseAsync/u);
    assert.match(platform, /registerDriverPushTokenWithCapability/u);
    assert.match(platform, /operationalEnabled: DRIVER_OPERATIONAL_ENABLED/u);
    assert.match(platform, /deviceId: Application\.getAndroidId\(\)/u);
    assert.match(platform, /ROUTE_UPDATES_CHANNEL_ID = 'route-updates'/u);
    assert.doesNotMatch(platform, /getExpoPushTokenAsync|scheduleNotificationAsync/u);
  });

  it('holds the click until authenticated destination acceptance and clears logout state', () => {
    const source = readFileSync(join(appDirectory, 'AppRoot.tsx'), 'utf8');
    assert.match(source, /notificationRecovery\.acquirePending\(\)/u);
    assert.match(source, /notificationRecovery\.isCurrent\(lease\)/u);
    assert.match(source, /onNotificationDestinationAccepted/u);
    assert.match(source, /notificationRecovery\.clearForLogout\(\)/u);
    assert.match(source, /clearExpoDriverNotificationResponse/u);
  });
});
