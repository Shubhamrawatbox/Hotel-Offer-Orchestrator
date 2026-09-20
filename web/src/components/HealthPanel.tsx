import type { ApiError } from '../api/client';
import type { CheckName, HealthCheck, OverallStatus } from '../api/types';
import { HEALTH_POLL_INTERVAL_MS } from '../config';
import type { Health } from '../hooks/useHealth';
import { useNow } from '../hooks/useNow';
import { formatAgo, pluralize } from '../lib/format';
import { RefreshIcon } from './Icons';
import { StatusBadge, StatusIcon } from './StatusIcon';
import { SupplierSwatch } from './SupplierTag';

const CHECKS: { key: CheckName; label: string }[] = [
  { key: 'supplierA', label: 'Supplier A' },
  { key: 'supplierB', label: 'Supplier B' },
  { key: 'worker', label: 'Temporal worker' },
  { key: 'temporal', label: 'Temporal server' },
  { key: 'redis', label: 'Redis' },
];

export function HealthPanel({ health }: { health: Health }) {
  const { report, error, checkedAt, refreshing, refresh } = health;
  const now = useNow(1_000);
  const overall: OverallStatus | 'unknown' = report?.status ?? (error ? 'down' : 'unknown');
  const workerDown = report?.checks.worker?.status === 'down';

  return (
    <section className="card" aria-labelledby="health-title">
      <div className="card-header">
        <h2 id="health-title">System health</h2>
        <button
          type="button"
          className="icon-button"
          onClick={() => void refresh()}
          disabled={refreshing}
          aria-label="Refresh health checks"
        >
          <RefreshIcon className={refreshing ? 'spin' : undefined} />
        </button>
      </div>

      <div className="health-summary">
        <StatusBadge status={overall} />
        <p>{summarize(overall, error)}</p>
      </div>

      {report && (
        <ul className="checks">
          {CHECKS.map(({ key, label }) => {
            const check = report.checks[key];
            const supplier = key === 'supplierA' ? 'A' : key === 'supplierB' ? 'B' : null;
            return (
              <li key={key} className="check">
                <StatusIcon status={check?.status ?? 'unknown'} />
                <span className="check-label">
                  {supplier && <SupplierSwatch supplier={supplier} />}
                  {label}
                </span>
                <span className="check-detail">{describe(key, check)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {workerDown && (
        <p className="health-hint">
          Without a worker, searches wait 60 s and time out. Start one with{' '}
          <code>npm run dev:worker</code>.
        </p>
      )}

      <p className="card-footnote">
        {checkedAt ? `Checked ${formatAgo(checkedAt, now)}` : 'Checking…'} · refreshes every{' '}
        {HEALTH_POLL_INTERVAL_MS / 1_000} s
      </p>
    </section>
  );
}

function summarize(status: OverallStatus | 'unknown', error: ApiError | null): string {
  switch (status) {
    case 'ok':
      return 'Everything is reachable.';
    case 'degraded':
      return 'A supplier is down. Searches still work, with partial results.';
    case 'down':
      return error ? 'The API is not responding.' : 'Searches will fail until the failing checks recover.';
    default:
      return 'Running checks…';
  }
}

function describe(key: CheckName, check: HealthCheck | undefined): string {
  if (!check) return 'Not reported';
  if (check.status === 'down') return check.error ?? 'Unreachable';
  if (key === 'worker') return pluralize(check.pollers ?? 0, 'poller');
  return `${check.latencyMs} ms`;
}
