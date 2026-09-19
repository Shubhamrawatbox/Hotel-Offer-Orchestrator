import { normalizeCity } from '../domain/normalize';
import type { SupplierHotel, SupplierId } from '../domain/types';

/**
 * Static catalogues backing the two mock supplier endpoints.
 *
 * The data is deliberately overlapping: in every city several hotel names
 * appear in both feeds at different prices, so the deduplication step has real
 * work to do. `delhi` reproduces the prices from the brief (Holtin is cheaper
 * on B at 5340, Radison is cheaper on A at 5900).
 */
const CATALOG: Record<SupplierId, SupplierHotel[]> = {
  A: [
    { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
    { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
    { hotelId: 'a3', name: 'Taj Palace', price: 12500, city: 'delhi', commissionPct: 8 },
    { hotelId: 'a4', name: 'Leela Kempinski', price: 9800, city: 'delhi', commissionPct: 11 },
    { hotelId: 'a5', name: 'Ibis Aerocity', price: 4200, city: 'delhi', commissionPct: 15 },

    { hotelId: 'a6', name: 'Trident Nariman Point', price: 9400, city: 'mumbai', commissionPct: 9 },
    { hotelId: 'a7', name: 'The Oberoi', price: 15200, city: 'mumbai', commissionPct: 7 },
    { hotelId: 'a8', name: 'Ibis Airport', price: 4600, city: 'mumbai', commissionPct: 14 },
    { hotelId: 'a9', name: 'Sea Green South', price: 3900, city: 'mumbai', commissionPct: 16 },

    { hotelId: 'a10', name: 'Taj Exotica', price: 18500, city: 'goa', commissionPct: 6 },
    { hotelId: 'a11', name: 'Casa Colvale', price: 5200, city: 'goa', commissionPct: 17 },
    { hotelId: 'a12', name: 'Whispering Palms', price: 6100, city: 'goa', commissionPct: 12 },
  ],
  B: [
    { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
    { hotelId: 'b2', name: 'Radison', price: 6100, city: 'delhi', commissionPct: 9 },
    { hotelId: 'b3', name: 'Taj Palace', price: 11990, city: 'delhi', commissionPct: 7 },
    { hotelId: 'b4', name: 'Novotel Aerocity', price: 5100, city: 'delhi', commissionPct: 12 },
    { hotelId: 'b5', name: 'Bloomrooms Janpath', price: 3100, city: 'delhi', commissionPct: 18 },

    { hotelId: 'b6', name: 'Trident Nariman Point', price: 9100, city: 'mumbai', commissionPct: 11 },
    { hotelId: 'b7', name: 'The Oberoi', price: 15800, city: 'mumbai', commissionPct: 6 },
    { hotelId: 'b8', name: 'Taj Lands End', price: 11200, city: 'mumbai', commissionPct: 8 },
    { hotelId: 'b9', name: 'Sea Green South', price: 4050, city: 'mumbai', commissionPct: 12 },

    { hotelId: 'b10', name: 'Taj Exotica', price: 17900, city: 'goa', commissionPct: 5 },
    { hotelId: 'b11', name: 'Casa Colvale', price: 5450, city: 'goa', commissionPct: 15 },
    { hotelId: 'b12', name: 'Cidade de Goa', price: 8700, city: 'goa', commissionPct: 10 },
  ],
};

export const KNOWN_CITIES: readonly string[] = [
  ...new Set([...CATALOG.A, ...CATALOG.B].map((hotel) => hotel.city)),
];

/**
 * Returns the supplier's hotels, optionally narrowed to a city. An unknown city
 * yields an empty array rather than an error — a supplier that does not cover a
 * destination simply has nothing to sell there.
 */
export function getCatalog(supplier: SupplierId, city?: string): SupplierHotel[] {
  const hotels = CATALOG[supplier];
  if (!city) return hotels.map((hotel) => ({ ...hotel }));

  const wanted = normalizeCity(city);
  return hotels.filter((hotel) => hotel.city === wanted).map((hotel) => ({ ...hotel }));
}

/**
 * Optional price jitter, off by default. Turning it on (SUPPLIER_PRICE_JITTER_PCT)
 * makes each call return slightly different prices, which is handy for watching
 * the "cheapest supplier" flip between runs.
 */
export function applyJitter(price: number, jitterPct: number): number {
  if (jitterPct <= 0) return price;
  const delta = (Math.random() * 2 - 1) * (jitterPct / 100);
  return Math.max(1, Math.round(price * (1 + delta)));
}
