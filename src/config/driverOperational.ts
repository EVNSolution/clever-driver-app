// Formal release profiles include the approved PR488 operational contract.
// Other builds opt in explicitly. This switch does not enable server GPS sending.
export const DRIVER_OPERATIONAL_ENABLED = process.env.EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED === 'true';
