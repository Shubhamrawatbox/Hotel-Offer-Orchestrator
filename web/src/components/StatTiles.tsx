import type { SearchResult } from '../hooks/useHotelSearch';
import { formatDuration, formatPrice } from '../lib/format';

/** Headline numbers for a search. Values use proportional figures; see the table for detail. */
export function StatTiles({ result }: { result: SearchResult }) {
  const { offers, meta, summary } = result;
  const total = meta.totalBeforeFilter;
  const filtered = meta.source === 'redis' && total !== undefined && total !== offers.length;

  console.log('result',result)

  return (
    <dl className="stats">
      <div className="stat">
        <dt>Hotels</dt>
        <dd>
          {offers.length}
          {filtered && <span className="stat-context"> of {total}</span>}
        </dd>
      </div>
      <div className="stat">
        <dt>Overlaps resolved</dt>
        <dd>{summary.overlaps}</dd>
      </div>
      <div className="stat">
        <dt>Saved by picking cheapest</dt>
        <dd>{formatPrice(summary.totalSaving)}</dd>
      </div>
      <div className="stat">
        <dt>Round trip</dt>
        <dd>{formatDuration(meta.durationMs)}</dd>
      </div>
    </dl>
  );
}
