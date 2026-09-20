import type { CheckStatus, OverallStatus } from '../api/types';
import { AlertIcon, CheckIcon, CrossIcon } from './Icons';

type Status = CheckStatus | OverallStatus | 'unknown';

const LABELS: Record<Status, string> = {
  up: 'Up',
  down: 'Down',
  ok: 'Operational',
  degraded: 'Degraded',
  unknown: 'Checking',
};

const TONES: Record<Status, 'good' | 'warning' | 'critical' | 'unknown'> = {
  up: 'good',
  ok: 'good',
  degraded: 'warning',
  down: 'critical',
  unknown: 'unknown',
};

/**
 * Status is never carried by colour alone: every state has its own glyph and a
 * text label next to it.
 */
export function StatusIcon({ status }: { status: Status }) {
  const tone = TONES[status];

  return (
    <span className={`status-icon status-icon--${tone}`}>
      {tone === 'good' && <CheckIcon />}
      {tone === 'warning' && <AlertIcon />}
      {tone === 'critical' && <CrossIcon />}
      {tone === 'unknown' && <span className="status-dot" />}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <StatusIcon status={status} />
      {LABELS[status]}
    </span>
  );
}
