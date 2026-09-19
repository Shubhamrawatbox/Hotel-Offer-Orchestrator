/**
 * Hotels are deduplicated by name, and supplier feeds are rarely consistent
 * about casing or whitespace ("  holtin" vs "Holtin"). Every lookup key goes
 * through here so both the in-memory merge and the Redis cache agree on what
 * "the same hotel" means.
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeCity(city: string): string {
  return city.trim().replace(/\s+/g, ' ').toLowerCase();
}
