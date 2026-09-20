import type { HotelOffer, SupplierFeed, SupplierHotel, SupplierId } from '../api/types';
import { normalizeName } from './normalize';

/**
 * The API returns only the winning offer per hotel. To show *why* it won, the UI
 * also reads both supplier feeds and lines each winner up against the other
 * supplier's quote for the same hotel.
 */

export const SUPPLIERS: readonly SupplierId[] = ['A', 'B'];

export type QuoteCell =
  | { kind: 'quote'; price: number; commissionPct: number; best: boolean }
  | { kind: 'not-offered' }
  | { kind: 'unavailable' };

export interface ComparisonRow {
  key: string;
  offer: HotelOffer;
  winner: SupplierId | null;
  quotes: Record<SupplierId, QuoteCell>;
  /** How much cheaper the winning quote is than the other supplier's, when both quoted. */
  saving: number | null;
}

export interface ComparisonSummary {
  /** Hotels both suppliers quoted — the ones deduplication actually had to decide. */
  overlaps: number;
  totalSaving: number;
  wins: Record<SupplierId, number>;
}

export function supplierIdFromLabel(label: string): SupplierId | null {
  const match = /^supplier\s+([ab])$/i.exec(label.trim());
  return match ? (match[1]!.toUpperCase() as SupplierId) : null;
}

export function otherSupplier(supplier: SupplierId): SupplierId {
  return supplier === 'A' ? 'B' : 'A';
}

export function buildComparison(
  offers: readonly HotelOffer[],
  feeds: Record<SupplierId, SupplierFeed>,
): ComparisonRow[] {
  const indexes: Record<SupplierId, Map<string, SupplierHotel> | null> = {
    A: indexFeed(feeds.A),
    B: indexFeed(feeds.B),
  };

  return offers.map((offer) => {
    const key = normalizeName(offer.name);
    const winner = supplierIdFromLabel(offer.supplier);
    const quotes: Record<SupplierId, QuoteCell> = {
      A: quoteFor('A', key, offer, winner, indexes.A),
      B: quoteFor('B', key, offer, winner, indexes.B),
    };
    return { key, offer, winner, quotes, saving: savingFor(offer, winner, quotes) };
  });
}

export function summarize(rows: readonly ComparisonRow[]): ComparisonSummary {
  const summary: ComparisonSummary = { overlaps: 0, totalSaving: 0, wins: { A: 0, B: 0 } };
  for (const row of rows) {
    if (row.winner) summary.wins[row.winner] += 1;
    if (row.quotes.A.kind === 'quote' && row.quotes.B.kind === 'quote') summary.overlaps += 1;
    if (row.saving !== null) summary.totalSaving += row.saving;
  }
  return summary;
}

function indexFeed(feed: SupplierFeed): Map<string, SupplierHotel> | null {
  if (feed.status !== 'ok') return null;
  const index = new Map<string, SupplierHotel>();
  for (const hotel of feed.hotels) {
    const key = normalizeName(hotel.name);
    const existing = index.get(key);
    // A feed listing a hotel twice would be a supplier bug; keep its cheapest row.
    if (!existing || hotel.price < existing.price) index.set(key, hotel);
  }
  return index;
}

function quoteFor(
  supplier: SupplierId,
  key: string,
  offer: HotelOffer,
  winner: SupplierId | null,
  index: Map<string, SupplierHotel> | null,
): QuoteCell {
  // The winner's column shows the price the workflow actually chose, so the
  // table can never contradict the result it is explaining.
  if (supplier === winner) {
    return { kind: 'quote', price: offer.price, commissionPct: offer.commissionPct, best: true };
  }
  if (!index) return { kind: 'unavailable' };

  const hotel = index.get(key);
  return hotel
    ? { kind: 'quote', price: hotel.price, commissionPct: hotel.commissionPct, best: false }
    : { kind: 'not-offered' };
}

function savingFor(
  offer: HotelOffer,
  winner: SupplierId | null,
  quotes: Record<SupplierId, QuoteCell>,
): number | null {
  if (!winner) return null;
  const other = quotes[otherSupplier(winner)];
  return other.kind === 'quote' && other.price > offer.price ? other.price - offer.price : null;
}
