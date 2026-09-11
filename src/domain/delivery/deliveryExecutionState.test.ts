import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INITIAL_DELIVERY_EXECUTION_STATE,
  isDeliveryExecutionLocked,
  reduceDeliveryExecutionState,
} from './deliveryExecutionState';

const finalProof = {
  completesRoute: true,
  deliveryStopIds: ['stop-final'],
  deliveryStopId: 'stop-final',
  destinationId: 'destination-final',
  destinationName: '마지막 배송지',
  proofUploaded: false,
};

describe('delivery execution state', () => {
  it('opens the combined completion sheet before saving the stop', () => {
    const pendingProof = { ...finalProof, completesRoute: null };
    const proofState = reduceDeliveryExecutionState(
      INITIAL_DELIVERY_EXECUTION_STATE,
      { proof: pendingProof, type: 'COMPLETION_OPENED' },
    );
    const completingState = reduceDeliveryExecutionState(
      proofState,
      { type: 'STOP_COMPLETION_STARTED' },
    );
    const completedState = reduceDeliveryExecutionState(
      completingState,
      { proof: finalProof, type: 'STOP_COMPLETED' },
    );

    assert.deepEqual(proofState, { phase: 'proof', proof: pendingProof });
    assert.deepEqual(completingState, { phase: 'completing-stop', proof: pendingProof });
    assert.deepEqual(completedState, { phase: 'proof', proof: finalProof });
    assert.equal(isDeliveryExecutionLocked(proofState), true);
    assert.equal(
      reduceDeliveryExecutionState(proofState, { type: 'START_STARTED' }),
      proofState,
    );
    assert.deepEqual(
      reduceDeliveryExecutionState(proofState, { type: 'STOP_COMPLETION_STARTED' }),
      completingState,
    );
    assert.equal(
      reduceDeliveryExecutionState(proofState, { type: 'ACTION_FAILED' }),
      proofState,
    );
  });

  it('keeps a completed stop ready when proof upload fails', () => {
    const proofState = { phase: 'proof' as const, proof: finalProof };
    const uploadingState = reduceDeliveryExecutionState(
      proofState,
      { type: 'PROOF_UPLOAD_STARTED' },
    );

    assert.deepEqual(
      reduceDeliveryExecutionState(uploadingState, { type: 'PROOF_UPLOAD_FAILED' }),
      proofState,
    );

    const uploadedProof = { ...finalProof, proofUploaded: true };
    assert.deepEqual(
      reduceDeliveryExecutionState(uploadingState, {
        proof: uploadedProof,
        type: 'PROOF_UPLOADED',
      }),
      { phase: 'proof', proof: uploadedProof },
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
