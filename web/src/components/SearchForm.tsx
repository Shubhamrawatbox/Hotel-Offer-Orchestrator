import type { ChangeEvent, ReactNode } from 'react';
import { EMPTY_CITY_EXAMPLE, KNOWN_CITIES, PRICE_PRESETS } from '../config';
import { formatCity } from '../lib/format';
import type { SearchFormErrors, SearchFormValues } from '../lib/validation';
import { SearchIcon } from './Icons';

interface SearchFormProps {
  values: SearchFormValues;
  errors: SearchFormErrors;
  pending: boolean;
  onChange: (values: SearchFormValues) => void;
  onSubmit: (values: SearchFormValues) => void;
}

export function SearchForm({ values, errors, pending, onChange, onSubmit }: SearchFormProps) {
  const set = (field: keyof SearchFormValues) => (event: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...values, [field]: event.target.value });

  const currentCity = values.city.trim().toLowerCase();

  return (
    <form
      className="card search-card"
      aria-label="Search hotels"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="search-fields">
        <Field id="city" label="City" error={errors.city}>
          <input
            id="city"
            name="city"
            list="known-cities"
            autoComplete="off"
            placeholder="e.g. Delhi"
            value={values.city}
            onChange={set('city')}
            aria-invalid={errors.city ? true : undefined}
            aria-describedby={errors.city ? 'city-error' : undefined}
          />
          <datalist id="known-cities">
            {KNOWN_CITIES.map((city) => (
              <option key={city} value={formatCity(city)} />
            ))}
          </datalist>
        </Field>

        <Field id="minPrice" label="Min price (₹)" error={errors.minPrice}>
          <input
            id="minPrice"
            name="minPrice"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            placeholder="Any"
            value={values.minPrice}
            onChange={set('minPrice')}
            aria-invalid={errors.minPrice ? true : undefined}
            aria-describedby={errors.minPrice ? 'minPrice-error' : undefined}
          />
        </Field>

        <Field id="maxPrice" label="Max price (₹)" error={errors.maxPrice}>
          <input
            id="maxPrice"
            name="maxPrice"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            placeholder="Any"
            value={values.maxPrice}
            onChange={set('maxPrice')}
            aria-invalid={errors.maxPrice ? true : undefined}
            aria-describedby={errors.maxPrice ? 'maxPrice-error' : undefined}
          />
        </Field>

        <button type="submit" className="button button--primary search-submit">
          <SearchIcon />
          {pending ? 'Searching…' : 'Search'}
        </button>
      </div>

      <div className="quick-row" role="group" aria-label="Quick city picks">
        <span className="quick-label">City</span>
        {KNOWN_CITIES.map((city) => (
          <button
            key={city}
            type="button"
            className="chip"
            aria-pressed={currentCity === city}
            onClick={() => onSubmit({ ...values, city: formatCity(city) })}
          >
            {formatCity(city)}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={currentCity === EMPTY_CITY_EXAMPLE}
          onClick={() => onSubmit({ ...values, city: formatCity(EMPTY_CITY_EXAMPLE) })}
        >
          {formatCity(EMPTY_CITY_EXAMPLE)}
          <span className="chip-note">no results</span>
        </button>
      </div>

      <div className="quick-row" role="group" aria-label="Price range presets">
        <span className="quick-label">Price</span>
        {PRICE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="chip"
            aria-pressed={values.minPrice === preset.minPrice && values.maxPrice === preset.maxPrice}
            onClick={() =>
              onSubmit({ ...values, minPrice: preset.minPrice, maxPrice: preset.maxPrice })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
