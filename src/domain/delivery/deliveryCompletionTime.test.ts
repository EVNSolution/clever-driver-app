import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
});
