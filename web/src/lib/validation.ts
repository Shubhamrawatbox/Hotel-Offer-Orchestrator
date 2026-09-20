import type { SearchParams } from '../api/types';

export interface SearchFormValues {
  city: string;
  minPrice: string;
  maxPrice: string;
}

export type SearchFormErrors = Partial<Record<keyof SearchFormValues, string>>;

export const EMPTY_FORM: SearchFormValues = { city: '', minPrice: '', maxPrice: '' };

/**
 * Mirrors the API's own rules, so most mistakes are caught before a workflow is
 * started. The server still validates — this only saves a round trip.
 */
export function validateSearch(values: SearchFormValues): {
  params: SearchParams | null;
  errors: SearchFormErrors;
} {
  const errors: SearchFormErrors = {};

  const city = values.city.trim().replace(/\s+/g, ' ');
  if (!city) errors.city = 'Enter a city';
  else if (city.length > 64) errors.city = 'City must be 64 characters or fewer';

  const minPrice = parsePrice(values.minPrice, 'minPrice', errors);
  const maxPrice = parsePrice(values.maxPrice, 'maxPrice', errors);

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    errors.maxPrice = 'Max price must be at least the min price';
  }

  if (Object.keys(errors).length > 0) return { params: null, errors };

  return {
    params: {
      city: city.toLowerCase(),
      ...(minPrice !== undefined ? { minPrice } : {}),
      ...(maxPrice !== undefined ? { maxPrice } : {}),
    },
    errors,
  };
}

function parsePrice(
  raw: string,
  field: 'minPrice' | 'maxPrice',
  errors: SearchFormErrors,
): number | undefined {
  const value = raw.trim();
  if (value === '') return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors[field] = 'Enter a number';
    return undefined;
  }
  if (parsed < 0) {
    errors[field] = 'Must be zero or more';
    return undefined;
  }
  return parsed;
}

export function hasPriceFilter(params: SearchParams): boolean {
  return params.minPrice !== undefined || params.maxPrice !== undefined;
}
