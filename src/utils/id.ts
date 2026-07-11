/**
 * Generates collision-resistant identifiers without external dependencies.
 * Uses crypto.randomUUID when available (extension contexts, Node >= 19),
 * falling back to a random hex string.
 */
export function createId(prefix?: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return prefix ? `${prefix}_${raw}` : raw;
}
