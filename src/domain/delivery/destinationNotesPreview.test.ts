import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EMPTY_DESTINATION_NOTES,
  formatTimeInput,
  formatTimeRangeInput,
  isValidLunchTime,
  isValidRequiredArrivalTime,
  savePreviewDestinationNotes,
} from './destinationNotesPreview';

describe('destination notes UI preview state', () => {
  it('timestamps only fields whose value changed', () => {
    const updatedAt = '2026-08-18T05:30:00.000Z';
    const notes = savePreviewDestinationNotes(
      EMPTY_DESTINATION_NOTES,
      {
        lunchAccess: 'AVAILABLE',
        lunchTime: '12:00~13:00',
        memo: '',
        requiredArrivalTime: '13:30',
      },
      updatedAt,
    );

    assert.deepEqual(notes.memo, { updatedAt: null, value: '' });
    assert.deepEqual(notes.lunchAccess, { updatedAt, value: 'AVAILABLE' });
    assert.deepEqual(notes.lunchTime, { updatedAt, value: '12:00~13:00' });
    assert.deepEqual(notes.requiredArrivalTime, { updatedAt, value: '13:30' });
  });

  it('accepts an empty or valid 24-hour time and rejects invalid values', () => {
    assert.equal(isValidRequiredArrivalTime(''), true);
    assert.equal(isValidRequiredArrivalTime('00:00'), true);
    assert.equal(isValidRequiredArrivalTime('23:59'), true);
    assert.equal(isValidRequiredArrivalTime('9:30'), false);
    assert.equal(isValidRequiredArrivalTime('24:00'), false);
    assert.equal(isValidRequiredArrivalTime('12:60'), false);
  });

  it('formats digit-only time input without requiring separators', () => {
    assert.equal(formatTimeInput('1'), '1');
    assert.equal(formatTimeInput('1330'), '13:30');
    assert.equal(formatTimeInput('13:30'), '13:30');
    assert.equal(formatTimeInput('133099'), '13:30');
    assert.equal(formatTimeRangeInput('1200'), '12:00');
    assert.equal(formatTimeRangeInput('12001300'), '12:00~13:00');
    assert.equal(formatTimeRangeInput('12:00~13:00'), '12:00~13:00');
  });

  it('accepts an empty or complete lunch period', () => {
    assert.equal(isValidLunchTime(''), true);
    assert.equal(isValidLunchTime('12:00~13:00'), true);
    assert.equal(isValidLunchTime('12:00'), false);
    assert.equal(isValidLunchTime('24:00~25:00'), false);
  });
});
