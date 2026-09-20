import type { OverallStatus } from '../api/types';
import { TEMPORAL_UI_URL } from '../config';
import { ExternalIcon } from './Icons';
import { StatusBadge } from './StatusIcon';

export function Header({ status }: { status: OverallStatus | 'unknown' }) {
  return (
    <header className="app-header">
      <div className="brand">
        <img src="/favicon.svg" alt="" width={32} height={32} />
        <div>
          <h1>Hotel Offer Orchestrator</h1>
          <p className="brand-tagline">
            The best price per hotel across two suppliers, orchestrated by Temporal
          </p>
        </div>
      </div>

      <div className="header-actions">
        <StatusBadge status={status} />
        <a className="button button--ghost" href={TEMPORAL_UI_URL} target="_blank" rel="noreferrer">
          Temporal UI
          <ExternalIcon />
        </a>
      </div>
    </header>
  );
}
