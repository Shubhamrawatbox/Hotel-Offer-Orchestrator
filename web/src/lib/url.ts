import type { SearchParams } from '../api/types';
import type { SearchFormValues } from './validation';

/** One query-string format shared by the page URL and the API call. */
export function toQueryString(params: SearchParams): string {
  const query = new URLSearchParams({ city: params.city });
  if (params.minPrice !== undefined) query.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== undefined) query.set('maxPrice', String(params.maxPrice));
  return query.toString();
}

/** Restores a search from the page URL so results survive a refresh and can be shared. */
export function readFormFromQuery(search: string): SearchFormValues | null {
  const query = new URLSearchParams(search);
  const city = query.get('city')?.trim();
  if (!city) return null;
  return {
    city,
    minPrice: query.get('minPrice') ?? '',
    maxPrice: query.get('maxPrice') ?? '',
  };
}
