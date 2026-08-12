import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ANDROID_BACK_EXIT_WINDOW_MS,
  resolveAndroidBackAction,
} from './androidBackNavigation';

describe('Android driver workspace back navigation', () => {
  it('returns through visible child screens before considering app exit', () => {
    assert.equal(resolveAndroidBackAction({
      isDeliverySpaceOpen: true,
      isSequenceEditing: true,
      lastRootBackAt: 1_000,
      now: 1_500,
    }), 'close-delivery-space');
    assert.equal(resolveAndroidBackAction({
      isDeliverySpaceOpen: false,
      isSequenceEditing: true,
      lastRootBackAt: 1_000,
      now: 1_500,
    }), 'close-sequence-editor');
  });

  it('exits only on a second root back press within two seconds', () => {
    assert.equal(resolveAndroidBackAction({
      isDeliverySpaceOpen: false,
      isSequenceEditing: false,
      lastRootBackAt: null,
      now: 1_000,
    }), 'show-exit-hint');
    assert.equal(resolveAndroidBackAction({
      isDeliverySpaceOpen: false,
      isSequenceEditing: false,
      lastRootBackAt: 1_000,
      now: 1_000 + ANDROID_BACK_EXIT_WINDOW_MS,
    }), 'exit-app');
    assert.equal(resolveAndroidBackAction({
      isDeliverySpaceOpen: false,
      isSequenceEditing: false,
      lastRootBackAt: 1_000,
      now: 1_001 + ANDROID_BACK_EXIT_WINDOW_MS,
    }), 'show-exit-hint');
  });
});
