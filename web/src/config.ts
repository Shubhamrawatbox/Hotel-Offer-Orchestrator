export const TEMPORAL_UI_URL = (import.meta.env.VITE_TEMPORAL_UI_URL || 'http://localhost:8080').replace(
  /\/+$/,
  '',
);

export const HEALTH_POLL_INTERVAL_MS = 10_000;

/** The mock suppliers quote rupee amounts. Change both together to re-denominate the UI. */
export const PRICE_LOCALE = 'en-IN';
export const PRICE_CURRENCY = 'INR';

/** Cities the mock suppliers cover, offered as quick picks. */
export const KNOWN_CITIES = ['delhi', 'mumbai', 'goa'] as const;

/** A city neither supplier covers, for demonstrating the empty result. */
export const EMPTY_CITY_EXAMPLE = 'atlantis';

export interface PricePreset {
  label: string;
  minPrice: string;
  maxPrice: string;
}

export const PRICE_PRESETS: readonly PricePreset[] = [
  { label: 'Any price', minPrice: '', maxPrice: '' },
  { label: 'Under ₹5,000', minPrice: '', maxPrice: '5000' },
  { label: '₹5,000–₹10,000', minPrice: '5000', maxPrice: '10000' },
  { label: 'Over ₹10,000', minPrice: '10000', maxPrice: '' },
];
