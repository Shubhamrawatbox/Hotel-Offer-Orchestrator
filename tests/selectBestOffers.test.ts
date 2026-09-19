import { describe, expect, it } from 'vitest';
import { selectBestOffers } from '../src/domain/selectBestOffers';
import type { SupplierFetchResult, SupplierHotel } from '../src/domain/types';

const hotel = (over: Partial<SupplierHotel> & { name: string; price: number }): SupplierHotel => ({
  hotelId: `${over.name}-${over.price}`,
  city: 'delhi',
  commissionPct: 10,
  ...over,
});

const feed = (supplier: 'A' | 'B', hotels: SupplierHotel[]): SupplierFetchResult => ({
  supplier,
  hotels,
  latencyMs: 1,
});

describe('selectBestOffers', () => {
  it('keeps the cheaper offer when a hotel appears in both feeds', () => {
    const offers = selectBestOffers([
      feed('A', [hotel({ name: 'Holtin', price: 6000, commissionPct: 10 })]),
      feed('B', [hotel({ name: 'Holtin', price: 5340, commissionPct: 20 })]),
    ]);

    expect(offers).toEqual([{ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 }]);
  });

  it('keeps a hotel offered by only one supplier', () => {
    const offers = selectBestOffers([
      feed('A', [hotel({ name: 'Ibis Aerocity', price: 4200, commissionPct: 15 })]),
      feed('B', []),
    ]);

    expect(offers).toEqual([
      { name: 'Ibis Aerocity', price: 4200, supplier: 'Supplier A', commissionPct: 15 },
    ]);
  });

  it('matches hotel names regardless of casing and stray whitespace', () => {
    const offers = selectBestOffers([
      feed('A', [hotel({ name: '  radison ', price: 5900 })]),
      feed('B', [hotel({ name: 'Radison', price: 6100 })]),
    ]);

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ name: 'radison', price: 5900, supplier: 'Supplier A' });
  });

  it('prefers the higher commission when prices tie', () => {
    const offers = selectBestOffers([
      feed('A', [hotel({ name: 'Taj Palace', price: 12000, commissionPct: 8 })]),
      feed('B', [hotel({ name: 'Taj Palace', price: 12000, commissionPct: 12 })]),
    ]);

    expect(offers[0]).toMatchObject({ supplier: 'Supplier B', commissionPct: 12 });
  });

  it('returns the merged list sorted by ascending price', () => {
    const offers = selectBestOffers([
      feed('A', [
        hotel({ name: 'Taj Palace', price: 12500 }),
        hotel({ name: 'Ibis Aerocity', price: 4200 }),
      ]),
      feed('B', [
        hotel({ name: 'Bloomrooms Janpath', price: 3100 }),
        hotel({ name: 'Taj Palace', price: 11990 }),
      ]),
    ]);

    expect(offers.map((offer) => offer.price)).toEqual([3100, 4200, 11990]);
  });

  it('survives a single supplier returning nothing', () => {
    expect(selectBestOffers([feed('A', []), feed('B', [])])).toEqual([]);
    expect(selectBestOffers([])).toEqual([]);
  });
});
