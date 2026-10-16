// Matches the approved operational API: UUID versions 1–5 with the RFC variant.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isDriverOperationalUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
