import { PRICE_CURRENCY, PRICE_LOCALE } from '../config';

const priceFormatter = new Intl.NumberFormat(PRICE_LOCALE, {
  style: 'currency',
  currency: PRICE_CURRENCY,
  maximumFractionDigits: 0,
});

export function formatPrice(amount: number): string {
  return priceFormatter.format(amount);
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1_000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
}

/** "delhi" -> "Delhi", "new  delhi" -> "New Delhi". */
export function formatCity(city: string): string {
  return city
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_match, separator: string, letter: string) => separator + letter.toUpperCase(),
    );
}

export function formatAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1_000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
