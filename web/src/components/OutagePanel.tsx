import { useOutages } from '../hooks/useOutages';
import { SUPPLIERS } from '../lib/comparison';
import { SupplierTag } from './SupplierTag';

interface OutagePanelProps {
  /** Called after a switch flips, so the page can refresh health and re-run the search. */
  onChanged: () => void;
  /** Changes whenever health is re-checked; keeps the switches in sync with the server. */
  syncKey: unknown;
}

export function OutagePanel({ onChanged, syncKey }: OutagePanelProps) {
  const { down, pending, error, toggle } = useOutages(onChanged, syncKey);

  return (
    <section className="card" aria-labelledby="outage-title">
      <h2 id="outage-title">Outage simulator</h2>
      <p className="card-intro">
        Switch a supplier off to watch the workflow degrade gracefully. The current search re-runs
        on its own.
      </p>

      <ul className="switches">
        {SUPPLIERS.map((supplier) => {
          const online = down ? !down[supplier] : true;
          return (
            <li key={supplier} className="switch-row">
              <SupplierTag supplier={supplier} />
              <span className="switch-state">
                {down === null ? 'Unknown' : online ? 'Online' : 'Offline'}
              </span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={online}
                aria-label={`Supplier ${supplier} online`}
                disabled={down === null || pending !== null}
                onClick={() => void toggle(supplier, online)}
              >
                <span className="switch-thumb" />
              </button>
            </li>
          );
        })}
      </ul>

      {down === null && (
        <p className="card-footnote">Switches unlock once the API is reachable.</p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
