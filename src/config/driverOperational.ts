// The additive server contract is an unmerged, undeployed candidate. Enable only
// in a reviewed isolated test environment until the operational gate is cleared.
export const DRIVER_OPERATIONAL_ENABLED = process.env.EXPO_PUBLIC_DSV_OPERATIONAL_ENABLED === 'true';
