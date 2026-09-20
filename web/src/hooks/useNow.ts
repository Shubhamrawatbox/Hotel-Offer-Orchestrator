import { useEffect, useState } from 'react';

/** A clock that ticks while `enabled`, for elapsed timers and "checked 5s ago" labels. */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);

  return now;
}
