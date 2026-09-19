import { normalizeName } from './normalize';
import { SUPPLIER_LABELS, type HotelOffer, type SupplierFetchResult } from './types';

/**
 * Collapses the supplier feeds into one offer per hotel name.
 *
 * Rules:
 *  - a hotel present in both feeds keeps the cheaper offer;
 *  - a hotel present in only one feed is kept as-is;
 *  - on an exact price tie the higher commission wins, since the guest pays the
 *    same either way and the higher-margin offer is the better one to book.
 *
 * Pure and synchronous on purpose: it is trivially unit-testable and safe to
 * call from a Temporal activity.
 */
export function selectBestOffers(results: readonly SupplierFetchResult[]): HotelOffer[] {
  const bestByName = new Map<string, HotelOffer>();

  for (const result of results) {
    for (const hotel of result.hotels) {
      const key = normalizeName(hotel.name);
      if (!key) continue;

      const candidate: HotelOffer = {
        name: hotel.name.trim().replace(/\s+/g, ' '),
        price: hotel.price,
        supplier: SUPPLIER_LABELS[result.supplier],
        commissionPct: hotel.commissionPct,
      };

      const incumbent = bestByName.get(key);
      if (!incumbent || isBetterOffer(candidate, incumbent)) {
        bestByName.set(key, candidate);
      }
    }
  }

  return [...bestByName.values()].sort(byPriceThenName);
}

function isBetterOffer(candidate: HotelOffer, incumbent: HotelOffer): boolean {
  if (candidate.price !== incumbent.price) return candidate.price < incumbent.price;
  return candidate.commissionPct > incumbent.commissionPct;
}

function byPriceThenName(a: HotelOffer, b: HotelOffer): number {
  return a.price - b.price || a.name.localeCompare(b.name);
}
