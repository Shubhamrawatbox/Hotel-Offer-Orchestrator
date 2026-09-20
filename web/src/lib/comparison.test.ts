import { describe, expect, it } from 'vitest';
import type { HotelOffer, SupplierFeed, SupplierHotel } from '../api/types';
import { buildComparison, summarize, supplierIdFromLabel } from './comparison';

const hotel = (name: string, price: number, commissionPct = 10): SupplierHotel => ({
  hotelId: `${name}-${price}`,
  name,
  price,
  city: 'delhi',
  commissionPct,
});

const ok = (...hotels: SupplierHotel[]): SupplierFeed => ({ status: 'ok', hotels });
const down: SupplierFeed = { status: 'unavailable', reason: 'HTTP 503' };

const offer = (name: string, price: number, supplier: 'A' | 'B', commissionPct = 10): HotelOffer => ({
  name,
  price,
  supplier: `Supplier ${supplier}`,
  commissionPct,
});

describe('supplierIdFromLabel', () => {
  it('reads the supplier id from the API label', () => {
    expect(supplierIdFromLabel('Supplier A')).toBe('A');
    expect(supplierIdFromLabel(' supplier b ')).toBe('B');
    expect(supplierIdFromLabel('Supplier C')).toBeNull();
  });
});

describe('buildComparison', () => {
  it('lines the winner up against the other supplier and works out the saving', () => {
    const [row] = buildComparison([offer('Holtin', 5340, 'B', 20)], {
      A: ok(hotel('Holtin', 6000)),
      B: ok(hotel('Holtin', 5340, 20)),
    });

    expect(row?.winner).toBe('B');
    expect(row?.quotes.B).toEqual({ kind: 'quote', price: 5340, commissionPct: 20, best: true });
    expect(row?.quotes.A).toEqual({ kind: 'quote', price: 6000, commissionPct: 10, best: false });
    expect(row?.saving).toBe(660);
  });

  it('marks a hotel only one supplier sells as not offered by the other', () => {
    const [row] = buildComparison([offer('Ibis Aerocity', 4200, 'A')], {
      A: ok(hotel('Ibis Aerocity', 4200)),
      B: ok(hotel('Something Else', 3000)),
    });

    expect(row?.quotes.B).toEqual({ kind: 'not-offered' });
    expect(row?.saving).toBeNull();
  });

  it('shows the other column as unavailable when that supplier is down', () => {
    const [row] = buildComparison([offer('Holtin', 5340, 'B')], {
      A: down,
      B: ok(hotel('Holtin', 5340)),
    });

    expect(row?.quotes.A).toEqual({ kind: 'unavailable' });
    expect(row?.saving).toBeNull();
  });

  it('matches names the way the backend does — case and whitespace insensitive', () => {
    const [row] = buildComparison([offer('Radison', 5900, 'A')], {
      A: ok(hotel('Radison', 5900)),
      B: ok(hotel('  radison ', 6100)),
    });

    expect(row?.quotes.B).toMatchObject({ kind: 'quote', price: 6100 });
    expect(row?.saving).toBe(200);
  });

  it("always shows the workflow's price in the winning column", () => {
    // Even if the separately fetched feed disagrees (e.g. price jitter), the
    // table must not contradict the result it explains.
    const [row] = buildComparison([offer('Holtin', 5340, 'B')], {
      A: ok(hotel('Holtin', 6000)),
      B: ok(hotel('Holtin', 5999)),
    });

    expect(row?.quotes.B).toMatchObject({ price: 5340, best: true });
  });

  it('reports no saving on an exact price tie', () => {
    const [row] = buildComparison([offer('Taj Palace', 12000, 'B')], {
      A: ok(hotel('Taj Palace', 12000)),
      B: ok(hotel('Taj Palace', 12000)),
    });

    expect(row?.saving).toBeNull();
  });
});

describe('summarize', () => {
  it('counts overlaps, wins and the total saving', () => {
    const rows = buildComparison(
      [offer('Bloomrooms', 3100, 'B'), offer('Holtin', 5340, 'B'), offer('Radison', 5900, 'A')],
      {
        A: ok(hotel('Holtin', 6000), hotel('Radison', 5900)),
        B: ok(hotel('Bloomrooms', 3100), hotel('Holtin', 5340), hotel('Radison', 6100)),
      },
    );

    expect(summarize(rows)).toEqual({ overlaps: 2, totalSaving: 860, wins: { A: 1, B: 2 } });
  });
});
