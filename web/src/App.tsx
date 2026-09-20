import { useCallback, useEffect, useState } from 'react';
import type { OverallStatus, SearchParams } from './api/types';
import { Header } from './components/Header';
import { HealthPanel } from './components/HealthPanel';
import { OutagePanel } from './components/OutagePanel';
import { ResultsPanel } from './components/ResultsPanel';
import { SearchForm } from './components/SearchForm';
import { useHealth } from './hooks/useHealth';
import { useHotelSearch } from './hooks/useHotelSearch';
import { formatCity } from './lib/format';
import { readFormFromQuery, toQueryString } from './lib/url';
import {
  EMPTY_FORM,
  validateSearch,
  type SearchFormErrors,
  type SearchFormValues,
} from './lib/validation';

/** A search in the page URL is restored on load, so results survive a refresh and can be shared. */
function initialState(): {
  values: SearchFormValues;
  errors: SearchFormErrors;
  params: SearchParams | null;
} {
  const values = readFormFromQuery(window.location.search);
  if (!values) return { values: EMPTY_FORM, errors: {}, params: null };
  const { params, errors } = validateSearch(values);
  return { values, errors, params };
}

export function App() {
  const [initial] = useState(initialState);
  const [values, setValues] = useState<SearchFormValues>(initial.values);
  const [errors, setErrors] = useState<SearchFormErrors>(initial.errors);

  const search = useHotelSearch(initial.params);
  const health = useHealth();
  const { run, request } = search;
  const { refresh: refreshHealth } = health;

  const submit = useCallback(
    (next: SearchFormValues) => {
      setValues(next);
      const { params, errors: nextErrors } = validateSearch(next);
      setErrors(nextErrors);
      if (!params) return;
      window.history.replaceState(null, '', `?${toQueryString(params)}`);
      run(params);
    },
    [run],
  );

  const clearFilter = useCallback(
    (params: SearchParams) => submit({ city: params.city, minPrice: '', maxPrice: '' }),
    [submit],
  );

  const retry = useCallback(() => {
    if (request) run(request.params);
  }, [request, run]);

  const handleOutageChanged = useCallback(() => {
    void refreshHealth();
    if (request) run(request.params);
  }, [refreshHealth, request, run]);

  const city = search.result?.params.city ?? request?.params.city;
  useEffect(() => {
    document.title = city
      ? `${formatCity(city)} · Hotel Offer Orchestrator`
      : 'Hotel Offer Orchestrator';
  }, [city]);

  const namespace = health.report?.checks.temporal?.namespace ?? 'default';
  const overall: OverallStatus | 'unknown' =
    health.report?.status ?? (health.error ? 'down' : 'unknown');

  return (
    <div className="app">
      <Header status={overall} />

      <main className="layout">
        <div className="main-column">
          <SearchForm
            values={values}
            errors={errors}
            pending={search.pending}
            onChange={setValues}
            onSubmit={submit}
          />
          <ResultsPanel
            search={search}
            namespace={namespace}
            onClearFilter={clearFilter}
            onRetry={retry}
          />
        </div>

        <aside className="side-column" aria-label="System status and controls">
          <HealthPanel health={health} />
          <OutagePanel onChanged={handleOutageChanged} syncKey={health.checkedAt} />
        </aside>
      </main>

      <footer className="app-footer">
        Prices in INR from two mock suppliers · API calls are proxied through this origin
      </footer>
    </div>
  );
}
