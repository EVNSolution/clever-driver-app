export type DeliveryExecutionProof = {
  completesRoute: boolean;
  deliveryStopId: string;
  destinationName: string;
};

export type DeliveryExecutionState = {
  phase: 'idle' | 'starting' | 'completing-stop' | 'proof' | 'completing-route';
  proof: DeliveryExecutionProof | null;
};

type DeliveryExecutionEvent =
  | { type: 'ACTION_FAILED' | 'ROUTE_COMPLETED' | 'START_COMPLETED' }
  | { type: 'ROUTE_COMPLETION_FAILED' | 'ROUTE_COMPLETION_STARTED' }
  | { type: 'START_STARTED' | 'STOP_COMPLETION_STARTED' }
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
    case 'STOP_COMPLETION_STARTED':
      if (isDeliveryExecutionLocked(state)) return state;
      return { phase: 'completing-stop', proof: null };
    case 'STOP_COMPLETED':
      if (state.phase !== 'completing-stop') return state;
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
      if (state.phase !== 'starting' && state.phase !== 'completing-stop') return state;
      return INITIAL_DELIVERY_EXECUTION_STATE;
  }
}
