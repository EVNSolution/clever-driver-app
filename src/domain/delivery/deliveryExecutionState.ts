export type DeliveryExecutionProof = {
  completesRoute: boolean | null;
  deliveryStopIds: string[];
  deliveryStopId: string;
  destinationId: string;
  destinationName: string;
  proofUploaded: boolean;
};

export type DeliveryExecutionState = {
  phase:
    | 'idle'
    | 'starting'
    | 'proof'
    | 'completing-stop'
    | 'uploading-proof'
    | 'completing-route';
  proof: DeliveryExecutionProof | null;
};

type DeliveryExecutionEvent =
  | { type: 'ACTION_FAILED' | 'ROUTE_COMPLETED' | 'START_COMPLETED' }
  | { type: 'ROUTE_COMPLETION_FAILED' | 'ROUTE_COMPLETION_STARTED' }
  | { proof: DeliveryExecutionProof; type: 'COMPLETION_OPENED' }
  | { type: 'PROOF_UPLOAD_FAILED' | 'PROOF_UPLOAD_STARTED' }
  | { proof: DeliveryExecutionProof; type: 'PROOF_UPLOADED' }
  | { type: 'START_STARTED' | 'STOP_COMPLETION_FAILED' | 'STOP_COMPLETION_STARTED' }
  | { proof: DeliveryExecutionProof; type: 'STOP_COMPLETED' }
  | { type: 'PROOF_CLOSED' };

export const INITIAL_DELIVERY_EXECUTION_STATE: DeliveryExecutionState = {
  phase: 'idle',
  proof: null,
};

export function isDeliveryExecutionLocked(state: DeliveryExecutionState): boolean {
  return state.phase !== 'idle' || state.proof !== null;
}

export function reduceDeliveryExecutionState(
  state: DeliveryExecutionState,
  event: DeliveryExecutionEvent,
): DeliveryExecutionState {
  switch (event.type) {
    case 'START_STARTED':
      if (isDeliveryExecutionLocked(state)) return state;
      return { phase: 'starting', proof: null };
    case 'COMPLETION_OPENED':
      if (isDeliveryExecutionLocked(state)) return state;
      return { phase: 'proof', proof: event.proof };
    case 'STOP_COMPLETION_STARTED':
      if (state.phase !== 'proof' || state.proof?.completesRoute !== null) return state;
      return { phase: 'completing-stop', proof: state.proof };
    case 'STOP_COMPLETION_FAILED':
      if (state.phase !== 'completing-stop') return state;
      return { phase: 'proof', proof: state.proof };
    case 'STOP_COMPLETED':
      if (state.phase !== 'completing-stop') return state;
      return { phase: 'proof', proof: event.proof };
    case 'PROOF_UPLOAD_STARTED':
      if (state.phase !== 'proof' || state.proof?.completesRoute === null) return state;
      return { phase: 'uploading-proof', proof: state.proof };
    case 'PROOF_UPLOAD_FAILED':
      if (state.phase !== 'uploading-proof') return state;
      return { phase: 'proof', proof: state.proof };
    case 'PROOF_UPLOADED':
      if (state.phase !== 'uploading-proof') return state;
      return { phase: 'proof', proof: event.proof };
    case 'ROUTE_COMPLETION_STARTED':
      if (state.phase !== 'proof' || state.proof?.completesRoute !== true) return state;
      return { phase: 'completing-route', proof: state.proof };
    case 'ROUTE_COMPLETION_FAILED':
      if (state.phase !== 'completing-route') return state;
      return { phase: 'proof', proof: state.proof };
    case 'PROOF_CLOSED':
      if (state.phase !== 'proof') return state;
      return INITIAL_DELIVERY_EXECUTION_STATE;
    case 'ROUTE_COMPLETED':
      if (state.phase !== 'completing-route') return state;
      return INITIAL_DELIVERY_EXECUTION_STATE;
    case 'START_COMPLETED':
      if (state.phase !== 'starting') return state;
      return INITIAL_DELIVERY_EXECUTION_STATE;
    case 'ACTION_FAILED':
      if (state.phase !== 'starting') return state;
      return INITIAL_DELIVERY_EXECUTION_STATE;
  }
}
