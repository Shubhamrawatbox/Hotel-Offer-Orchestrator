import { describe, expect, it } from 'vitest';
import { formatCity, formatDuration, formatPrice, pluralize } from './format';
import { readFormFromQuery, toQueryString } from './url';
import { validateSearch } from './validation';

describe('validateSearch', () => {
  it('accepts a bare city and normalises it', () => {
    expect(validateSearch({ city: '  New   Delhi ', minPrice: '', maxPrice: '' })).toEqual({
      params: { city: 'new delhi' },
      errors: {},
    });
  });

  it('parses price bounds', () => {
    expect(validateSearch({ city: 'delhi', minPrice: '4000', maxPrice: '6000' }).params).toEqual({
      city: 'delhi',
      minPrice: 4000,
      maxPrice: 6000,
    });
  });

  it('accepts a single bound', () => {
    expect(validateSearch({ city: 'delhi', minPrice: '10000', maxPrice: '' }).params).toEqual({
      city: 'delhi',
      minPrice: 10000,
    });
  });

  it('requires a city', () => {
    const { params, errors } = validateSearch({ city: '   ', minPrice: '', maxPrice: '' });
    expect(params).toBeNull();
    expect(errors.city).toBe('Enter a city');
  });

  it('rejects negative and non-numeric prices', () => {
    expect(validateSearch({ city: 'delhi', minPrice: '-1', maxPrice: '' }).errors.minPrice).toBe(
      'Must be zero or more',
    );
    expect(validateSearch({ city: 'delhi', minPrice: '', maxPrice: 'cheap' }).errors.maxPrice).toBe(
      'Enter a number',
    );
  });

  it('rejects an inverted range', () => {
    const { params, errors } = validateSearch({ city: 'delhi', minPrice: '9000', maxPrice: '1000' });
    expect(params).toBeNull();
    expect(errors.maxPrice).toBe('Max price must be at least the min price');
  });
});

describe('query strings', () => {
  it('round-trips a search through the page URL', () => {
    const query = toQueryString({ city: 'delhi', minPrice: 4000, maxPrice: 6000 });
    expect(query).toBe('city=delhi&minPrice=4000&maxPrice=6000');
    expect(readFormFromQuery(`?${query}`)).toEqual({ city: 'delhi', minPrice: '4000', maxPrice: '6000' });
  });

  it('omits bounds that were not set', () => {
    expect(toQueryString({ city: 'goa' })).toBe('city=goa');
  });

  it('ignores a URL without a city', () => {
    expect(readFormFromQuery('?minPrice=100')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats prices as rupees with Indian digit grouping', () => {
    expect(formatPrice(5340)).toBe('₹5,340');
    expect(formatPrice(1000000)).toBe('₹10,00,000');
  });

  it('formats durations for humans', () => {
    expect(formatDuration(312)).toBe('312 ms');
    expect(formatDuration(1234)).toBe('1.2 s');
    expect(formatDuration(60_115)).toBe('60 s');
  });

  it('title-cases city names', () => {
    expect(formatCity('delhi')).toBe('Delhi');
    expect(formatCity('new  delhi')).toBe('New Delhi');
  });

  it('pluralises', () => {
    expect(pluralize(1, 'hotel')).toBe('1 hotel');
    expect(pluralize(7, 'hotel')).toBe('7 hotels');
  });
});
