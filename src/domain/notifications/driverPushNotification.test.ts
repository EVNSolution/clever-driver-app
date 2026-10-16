import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifyDriverNotificationClick, isDriverOperationalPushNotification, parseDriverPushNotification } from './driverPushNotification';

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

const OPERATIONAL_ID = '31200000-0000-4000-8000-000000000001';
const NOW = Date.parse('2026-10-07T00:00:00.000Z');

describe('Operational push schema v1', () => {
  it('parses N01 through N06 using the server notification identity', () => {
    for (const kind of ['N01', 'N02', 'N03', 'N04', 'N05', 'N06']) {
      assert.deepEqual(parseDriverPushNotification('provider-id', {
        expiresAt: '2026-10-07T01:00:00.000Z', kind,
        notificationId: OPERATIONAL_ID, schemaVersion: '1',
      }, NOW), {
        expiresAt: '2026-10-07T01:00:00.000Z', kind,
        notificationId: OPERATIONAL_ID, schemaVersion: '1', status: 'current',
      });
    }
  });

  it('retains an expired identity for a safe visible click result', () => {
    const parsed = parseDriverPushNotification('provider-id', {
      expiresAt: '2026-10-06T00:00:00.000Z', kind: 'N05',
      notificationId: OPERATIONAL_ID, schemaVersion: '1',
    }, NOW);
    assert.equal(parsed !== null && isDriverOperationalPushNotification(parsed) ? parsed.status : null, 'expired');
  });

  it('rejects invalid IDs, versions, instants, kinds, and payload destinations', () => {
    const valid = { expiresAt: '2026-10-07T01:00:00.000Z', kind: 'N06', notificationId: OPERATIONAL_ID, schemaVersion: '1' };
    for (const patch of [
      { schemaVersion: 1 }, { schemaVersion: '2' }, { notificationId: 'symbolic-id' },
      { expiresAt: '2026-10-07T01:00:00+00:00' }, { expiresAt: '2026-02-30T01:00:00.000Z' },
      { kind: 'N07' }, { routePlanId: OPERATIONAL_ID }, { targetStopId: OPERATIONAL_ID },
    ]) assert.equal(parseDriverPushNotification('provider-id', { ...valid, ...patch }, NOW), null);
  });
});


it('provides a visible safe click for unsupported payload without forwarding details', () => {
  assert.deepEqual(classifyDriverNotificationClick('provider-unsupported', {
    kind: 'N07', schemaVersion: '2', routePlanId: 'unsafe-route', targetStopId: 'unsafe-stop', customer: 'private',
  }), { kind: 'unsupported', notificationId: 'provider-unsupported', reason: 'UNSUPPORTED_PAYLOAD' });
});

it('aligns operational push IDs with the API UUID version and RFC variant rules', () => {
  const payload = { kind: 'N06', schemaVersion: '1', expiresAt: '2099-10-07T01:00:00.000Z' };
  for (const notificationId of [
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-8000-000000000001',
    '10000000-0000-6000-8000-000000000001',
    '10000000-0000-4000-0000-000000000001',
    '10000000-0000-4000-c000-000000000001',
  ]) {
    assert.equal(parseDriverPushNotification('provider-id', { ...payload, notificationId }), null);
    assert.deepEqual(classifyDriverNotificationClick('provider-id', { ...payload, notificationId }), {
      kind: 'unsupported', notificationId: 'provider-id', reason: 'UNSUPPORTED_PAYLOAD',
    });
  }
  for (const version of ['1', '2', '3', '4', '5']) {
    for (const variant of ['8', '9', 'a', 'b']) {
      const notificationId = `10000000-0000-${version}000-${variant}000-000000000001`;
      assert.equal(parseDriverPushNotification('provider-id', { ...payload, notificationId })?.notificationId, notificationId);
    }
  }
});
