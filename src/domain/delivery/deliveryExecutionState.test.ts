import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INITIAL_DELIVERY_EXECUTION_STATE,
  isDeliveryExecutionLocked,
  reduceDeliveryExecutionState,
} from './deliveryExecutionState';

const completionIdentity = {
  clientEventId: 'completion-state-identity',
  occurredAt: '2026-09-10T05:42:00.000Z',
};

const finalProof = {
  completesRoute: true,
  completedAt: '2026-09-10T05:42:00.000Z',
  deliveryStopIds: ['stop-final'],
  deliveryStopId: 'stop-final',
  destinationId: 'destination-final',
  destinationName: '마지막 배송지',
  proofUploaded: false,
};

describe('delivery execution state', () => {
  it('opens the combined completion sheet before saving the stop', () => {
    const pendingProof = { ...finalProof, completesRoute: null, completedAt: null };
    const proofState = reduceDeliveryExecutionState(
      INITIAL_DELIVERY_EXECUTION_STATE,
      { proof: pendingProof, type: 'COMPLETION_OPENED' },
    );
    const completingState = reduceDeliveryExecutionState(
      proofState,
      { type: 'STOP_COMPLETION_STARTED', completionIdentity },
    );
    const completedState = reduceDeliveryExecutionState(
      completingState,
      { proof: finalProof, type: 'STOP_COMPLETED' },
    );

    assert.deepEqual(proofState, { phase: 'proof', proof: pendingProof });
    assert.deepEqual(completingState, { phase: 'completing-stop', proof: { ...pendingProof, completionIdentity } });
    assert.deepEqual(
      reduceDeliveryExecutionState(completingState, { type: 'STOP_COMPLETION_FAILED' }).proof?.completionIdentity,
      completionIdentity,
    );
    assert.deepEqual(completedState, { phase: 'proof', proof: finalProof });
    assert.equal(isDeliveryExecutionLocked(proofState), true);
    assert.equal(
      reduceDeliveryExecutionState(proofState, { type: 'START_STARTED' }),
      proofState,
    );
    assert.deepEqual(
      reduceDeliveryExecutionState(proofState, { type: 'STOP_COMPLETION_STARTED', completionIdentity }),
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

  it('clears only the submitted identity after confirmed rejection and leaves the original proof editable', () => {
    const originalProof = { ...finalProof, completesRoute: null, completedAt: null };
    const originalState = reduceDeliveryExecutionState(INITIAL_DELIVERY_EXECUTION_STATE, {
      type: 'COMPLETION_OPENED', proof: originalProof,
    });
    const submitting = reduceDeliveryExecutionState(originalState, { type: 'STOP_COMPLETION_STARTED', completionIdentity });
    const rejected = reduceDeliveryExecutionState(submitting, { type: 'STOP_COMPLETION_REJECTED' });
    assert.deepEqual(rejected, originalState);
    assert.equal(rejected.proof?.completedAt, null);
    assert.equal(rejected.proof?.completionIdentity, undefined);
    const editedIdentity = { clientEventId: 'edited-after-rejection', occurredAt: '2026-09-10T05:45:00.000Z' };
    assert.deepEqual(
      reduceDeliveryExecutionState(rejected, { type: 'STOP_COMPLETION_STARTED', completionIdentity: editedIdentity }),
      { phase: 'completing-stop', proof: { ...originalProof, completionIdentity: editedIdentity } },
    );
    assert.deepEqual(reduceDeliveryExecutionState(rejected, { type: 'PROOF_CLOSED' }), INITIAL_DELIVERY_EXECUTION_STATE);
  });

  it('keeps original identity on unknown failure and ignores rejection outside active completion', () => {
    const pendingProof = { ...finalProof, completesRoute: null, completedAt: null };
    const opened = reduceDeliveryExecutionState(INITIAL_DELIVERY_EXECUTION_STATE, { type: 'COMPLETION_OPENED', proof: pendingProof });
    const submitting = reduceDeliveryExecutionState(opened, { type: 'STOP_COMPLETION_STARTED', completionIdentity });
    const unknown = reduceDeliveryExecutionState(submitting, { type: 'STOP_COMPLETION_FAILED' });
    assert.deepEqual(unknown.proof?.completionIdentity, completionIdentity);
    assert.equal(reduceDeliveryExecutionState(unknown, { type: 'STOP_COMPLETION_REJECTED' }), unknown);
    const approved = { phase: 'proof' as const, proof: { ...finalProof, completionIdentity } };
    assert.equal(reduceDeliveryExecutionState(approved, { type: 'STOP_COMPLETION_REJECTED' }), approved);
    assert.equal(reduceDeliveryExecutionState(INITIAL_DELIVERY_EXECUTION_STATE, { type: 'STOP_COMPLETION_REJECTED' }), INITIAL_DELIVERY_EXECUTION_STATE);
  });

  it('retains original completion time and refresh requirement after result-only recovery until close', () => {
    const pendingProof = { ...finalProof, completesRoute: null, completedAt: null };
    const opened = reduceDeliveryExecutionState(INITIAL_DELIVERY_EXECUTION_STATE, { type: 'COMPLETION_OPENED', proof: pendingProof });
    const submitting = reduceDeliveryExecutionState(opened, { type: 'STOP_COMPLETION_STARTED', completionIdentity });
    const recoveredProof = { ...finalProof, completesRoute: false, completionIdentity, requiresAssignmentRefresh: true };
    const recovered = reduceDeliveryExecutionState(submitting, { type: 'STOP_COMPLETED', proof: recoveredProof });
    assert.deepEqual(recovered, { phase: 'proof', proof: recoveredProof });
    assert.equal(recovered.proof?.completedAt, completionIdentity.occurredAt);
    assert.equal(recovered.proof?.requiresAssignmentRefresh, true);
    assert.equal(isDeliveryExecutionLocked(recovered), true);
    assert.deepEqual(reduceDeliveryExecutionState(recovered, { type: 'PROOF_CLOSED' }), INITIAL_DELIVERY_EXECUTION_STATE);
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
