import type { UsageWindow } from '../types';
import { formatHourUtc, formatUnits } from '../format';

/**
 * Minimal dependency-free SVG bar chart of units per hourly window (ascending
 * by time). Operational clarity over polish: each bar carries a hover title
 * with the exact hour + units, and the y-axis max is labelled.
 */
export function UsageChart({ windows }: { windows: UsageWindow[] }) {
  if (windows.length === 0) {
    return <div className="notice empty">No usage recorded for this period yet.</div>;
  }

  // Ascending by time for a left-to-right timeline.
  const data = [...windows].sort((a, b) => a.windowStart.localeCompare(b.windowStart));

  const W = 860;
  const H = 240;
  const PAD_L = 48;
  const PAD_B = 28;
  const PAD_T = 12;
  const PAD_R = 8;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const maxUnits = Math.max(...data.map((d) => d.totalUnits), 1);
  const barGap = 2;
  const barW = Math.max(1, plotW / data.length - barGap);

  // A handful of evenly spaced x labels so a busy month stays readable.
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Usage per hour">
      {/* y axis max + baseline */}
      <line className="chart-axis" x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + plotH} />
      <line
        className="chart-axis"
        x1={PAD_L}
        y1={PAD_T + plotH}
        x2={PAD_L + plotW}
        y2={PAD_T + plotH}
      />
      <text className="chart-label" x={PAD_L - 6} y={PAD_T + 4} textAnchor="end">
        {formatUnits(maxUnits)}
      </text>
      <text className="chart-label" x={PAD_L - 6} y={PAD_T + plotH} textAnchor="end">
        0
      </text>

      {data.map((d, i) => {
        const h = (d.totalUnits / maxUnits) * plotH;
        const x = PAD_L + i * (barW + barGap);
        const y = PAD_T + plotH - h;
        return (
          <g key={d.windowStart}>
            <rect className="chart-bar" x={x} y={y} width={barW} height={h}>
              <title>
                {formatHourUtc(d.windowStart)} — {formatUnits(d.totalUnits)} units (
                {formatUnits(d.eventCount)} events)
              </title>
            </rect>
            {i % labelEvery === 0 && (
              <text
                className="chart-label"
                x={x + barW / 2}
                y={PAD_T + plotH + 14}
                textAnchor="middle"
              >
                {new Date(d.windowStart).getUTCDate()}/{String(
                  new Date(d.windowStart).getUTCHours(),
                ).padStart(2, '0')}h
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
