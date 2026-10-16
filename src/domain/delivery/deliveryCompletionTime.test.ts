import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  completedRouteDestinations,
  destinationCompletionTime,
  formatDeliveryCompletionTime,
  resolveDeliveryCompletionOccurredAt,
} from './deliveryCompletionTime';

describe('delivery completion time', () => {
  it('uses the current local time as the editable default', () => {
    assert.equal(
      formatDeliveryCompletionTime(new Date(2026, 8, 10, 14, 7)),
      '14:07',
    );
  });

  it('resolves a valid local HH:mm value on the completion date', () => {
    const occurredAt = resolveDeliveryCompletionOccurredAt(
      '13:25',
      new Date(2026, 8, 10, 14, 7),
    );
    const resolved = new Date(occurredAt as string);

    assert.equal(resolved.getFullYear(), 2026);
    assert.equal(resolved.getMonth(), 8);
    assert.equal(resolved.getDate(), 10);
    assert.equal(resolved.getHours(), 13);
    assert.equal(resolved.getMinutes(), 25);
    assert.equal(resolveDeliveryCompletionOccurredAt('24:00', new Date()), null);
    assert.equal(resolveDeliveryCompletionOccurredAt('9:30', new Date()), null);
  });

  it('shows a destination as completed at its latest order time on this device', () => {
    const early = new Date(2026, 9, 16, 9, 5).toISOString();
    const late = new Date(2026, 9, 16, 9, 41).toISOString();

    assert.equal(destinationCompletionTime([{ completedAt: early }, { completedAt: late }, {}]), '09:41');
    assert.equal(destinationCompletionTime([{ completedAt: null }, {}]), null);
    assert.equal(destinationCompletionTime([{ completedAt: 'not a time' }]), null);
  });

  it('lists a completed route by destination in delivery order with each time', () => {
    const at = (minute: number) => new Date(2026, 9, 16, 10, minute).toISOString();
    const destinations = completedRouteDestinations([
      { completedAt: at(30), destinationId: 'b', destinationName: '남양약품', sequence: 3 },
      { completedAt: at(5), destinationId: 'a', destinationName: '부림약품', sequence: 1 },
      { completedAt: at(12), destinationId: 'a', destinationName: '(주)부림약품', sequence: 2 },
      { completedAt: null, destinationId: 'c', destinationName: '노바메딕스', sequence: 4 },
    ]);

    assert.deepEqual(destinations, [
      { completionTime: '10:12', destinationId: 'a', destinationName: '부림약품' },
      { completionTime: '10:30', destinationId: 'b', destinationName: '남양약품' },
      { completionTime: null, destinationId: 'c', destinationName: '노바메딕스' },
    ]);
  });
});
