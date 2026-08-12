import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseDriverPushNotification } from './driverPushNotification';

describe('Driver push notification payload', () => {
  it('accepts any route change with the server route identifier', () => {
    assert.deepEqual(parseDriverPushNotification('notification-1', {
      destinationAddress: 'must not escape',
      orderMessageId: 'message-1',
      routePlanId: 'route-1',
      type: 'driver_route_changed',
    }), {
      kind: 'route_changed',
      notificationId: 'notification-1',
    });
  });

  it('accepts a destination bundle handoff event using identifiers only', () => {
    assert.deepEqual(parseDriverPushNotification('notification-2', {
      handoffEvent: 'proposed',
      handoffRequestId: 'handoff-1',
      orderCount: '53',
      type: 'driver_bundle_handoff',
    }), {
      event: 'proposed',
      handoffRequestId: 'handoff-1',
      kind: 'bundle_handoff',
      notificationId: 'notification-2',
    });
  });

  it('rejects unknown, incomplete, and non-string payloads', () => {
    assert.equal(parseDriverPushNotification('notification-3', {
      type: 'driver_bundle_handoff',
    }), null);
    assert.equal(parseDriverPushNotification('notification-4', {
      routePlanId: 123,
      type: 'driver_route_changed',
    }), null);
    assert.equal(parseDriverPushNotification('notification-5', {
      type: 'unknown',
    }), null);
  });
});
