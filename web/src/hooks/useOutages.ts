import { useCallback, useEffect, useState } from 'react';
import { fetchOutages, isAbortError, setSupplierOutage } from '../api/client';
import type { SupplierId } from '../api/types';

export interface Outages {
  /** Which suppliers are switched off; null until the first read succeeds. */
  down: Record<SupplierId, boolean> | null;
  pending: SupplierId | null;
  error: string | null;
  toggle: (supplier: SupplierId, down: boolean) => Promise<void>;
}

/**
 * Reads and flips the backend's outage switches. `syncKey` re-reads them on the
 * health-check cadence, so a switch flipped from Postman shows up here too.
 */
export function useOutages(onChanged: () => void, syncKey: unknown): Outages {
  const [down, setDown] = useState<Record<SupplierId, boolean> | null>(null);
  const [pending, setPending] = useState<SupplierId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchOutages(controller.signal)
      .then((list) => {
        const next: Record<SupplierId, boolean> = { A: false, B: false };
        for (const entry of list) next[entry.supplier] = entry.down;
        setDown(next);
      })
      .catch((reason: unknown) => {
        if (!isAbortError(reason)) setDown(null);
      });
    return () => controller.abort();
  }, [syncKey]);

  const toggle = useCallback(
    async (supplier: SupplierId, nextDown: boolean) => {
      setPending(supplier);
      setError(null);
      try {
        await setSupplierOutage(supplier, nextDown);
        setDown((previous) => ({ ...(previous ?? { A: false, B: false }), [supplier]: nextDown }));
        onChanged();
      } catch (reason) {
        setError(
          `Could not switch Supplier ${supplier} ${nextDown ? 'off' : 'on'}: ${
            reason instanceof Error ? reason.message : String(reason)
          }`,
        );
      } finally {
        setPending(null);
      }
    },
    [onChanged],
  );

  return { down, pending, error, toggle };
}
