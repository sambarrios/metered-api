import { useEffect, useState } from 'react';
import { ApiError, fetchUsage } from '../api';
import { formatHourUtc, formatUnits } from '../format';
import type { UsageWindow } from '../types';
import { UsageChart } from './UsageChart';

/** Start of the current UTC month — the open billing period. */
function currentPeriodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const PERIOD_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
}).format(currentPeriodStart());

export function UsagePanel({ onAuthError }: { onAuthError: () => void }) {
  const [windows, setWindows] = useState<UsageWindow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const from = currentPeriodStart().toISOString();
    const to = new Date().toISOString();
    fetchUsage(from, to)
      .then((page) => active && setWindows(page.data))
      .catch((e: ApiError) => {
        if (!active) return;
        if (e.status === 401) onAuthError();
        setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [onAuthError]);

  if (error) {
    return <div className="notice error">Could not load usage: {error}</div>;
  }
  if (!windows) {
    return <div className="muted">Loading usage…</div>;
  }

  const totalUnits = windows.reduce((s, w) => s + w.totalUnits, 0);
  const totalEvents = windows.reduce((s, w) => s + w.eventCount, 0);
  const peak = windows.reduce<UsageWindow | null>(
    (best, w) => (best === null || w.totalUnits > best.totalUnits ? w : best),
    null,
  );

  return (
    <div className="card">
      <h2>Current period usage</h2>
      <div className="card-sub">{PERIOD_LABEL} · hourly windows, UTC</div>

      <div className="stat-row">
        <div className="stat">
          <div className="label">Total units</div>
          <div className="value">{formatUnits(totalUnits)}</div>
        </div>
        <div className="stat">
          <div className="label">Total events</div>
          <div className="value">{formatUnits(totalEvents)}</div>
        </div>
        <div className="stat">
          <div className="label">Active hours</div>
          <div className="value">{formatUnits(windows.length)}</div>
        </div>
        <div className="stat">
          <div className="label">Peak hour</div>
          <div className="value">{peak ? formatUnits(peak.totalUnits) : '—'}</div>
          {peak && <div className="muted" style={{ fontSize: 12 }}>{formatHourUtc(peak.windowStart)}</div>}
        </div>
      </div>

      <UsageChart windows={windows} />
    </div>
  );
}
