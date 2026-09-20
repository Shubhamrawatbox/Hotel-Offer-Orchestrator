/**
 * Mirrors the backend's normalizeName (src/domain/normalize.ts) so a winning
 * offer lines up with the same hotel in each supplier's raw feed.
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
