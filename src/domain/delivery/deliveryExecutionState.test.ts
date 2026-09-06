import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INITIAL_DELIVERY_EXECUTION_STATE,
  isDeliveryExecutionLocked,
  reduceDeliveryExecutionState,
} from './deliveryExecutionState';

const finalProof = {
  completesRoute: true,
  deliveryStopId: 'stop-final',
  destinationName: '마지막 배송지',
};

describe('delivery execution state', () => {
  it('keeps proof visible when the live summary disappears after completion', () => {
    const proofState = reduceDeliveryExecutionState(
      { phase: 'completing-stop', proof: null },
      { proof: finalProof, type: 'STOP_COMPLETED' },
    );

    assert.deepEqual(proofState, { phase: 'proof', proof: finalProof });
    assert.equal(isDeliveryExecutionLocked(proofState), true);
    assert.equal(
      reduceDeliveryExecutionState(proofState, { type: 'START_STARTED' }),
      proofState,
    );
    assert.equal(
      reduceDeliveryExecutionState(proofState, { type: 'STOP_COMPLETION_STARTED' }),
      proofState,
    );
    assert.equal(
      reduceDeliveryExecutionState(proofState, { type: 'ACTION_FAILED' }),
      proofState,
    );
  });

  it('keeps final proof retryable after route completion fails', () => {
    const proofState = { phase: 'proof' as const, proof: finalProof };
    const completingState = reduceDeliveryExecutionState(
      proofState,
      { type: 'ROUTE_COMPLETION_STARTED' },
    );
    const failedState = reduceDeliveryExecutionState(
      completingState,
      { type: 'ROUTE_COMPLETION_FAILED' },
    );
    const retryState = reduceDeliveryExecutionState(
      failedState,
      { type: 'ROUTE_COMPLETION_STARTED' },
    );
    const completedState = reduceDeliveryExecutionState(
      retryState,
      { type: 'ROUTE_COMPLETED' },
    );

    assert.deepEqual(failedState, proofState);
    assert.deepEqual(retryState, completingState);
    assert.deepEqual(completedState, INITIAL_DELIVERY_EXECUTION_STATE);
  });
});
