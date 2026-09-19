import { describe, expect, it } from 'vitest';
import { HotelQuerySchema } from '../src/api/validation';

describe('HotelQuerySchema', () => {
  it('accepts a bare city', () => {
    expect(HotelQuerySchema.parse({ city: 'delhi' })).toEqual({ city: 'delhi' });
  });

  it('coerces price bounds from query strings', () => {
    expect(HotelQuerySchema.parse({ city: 'delhi', minPrice: '4000', maxPrice: '6000' })).toEqual({
      city: 'delhi',
      minPrice: 4000,
      maxPrice: 6000,
    });
  });

  it('treats empty price params as absent', () => {
    expect(HotelQuerySchema.parse({ city: 'delhi', minPrice: '', maxPrice: '' })).toEqual({
      city: 'delhi',
      minPrice: undefined,
      maxPrice: undefined,
    });
  });

  it('rejects a missing city', () => {
    expect(HotelQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a negative or non-numeric price', () => {
    expect(HotelQuerySchema.safeParse({ city: 'delhi', minPrice: '-1' }).success).toBe(false);
    expect(HotelQuerySchema.safeParse({ city: 'delhi', maxPrice: 'cheap' }).success).toBe(false);
  });

  it('rejects an inverted price range', () => {
    const result = HotelQuerySchema.safeParse({ city: 'delhi', minPrice: '9000', maxPrice: '1000' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/minPrice must be less than or equal to maxPrice/);
    }
  });
});
