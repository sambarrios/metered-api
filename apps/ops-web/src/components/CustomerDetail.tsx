import { useCallback, useEffect, useState } from 'react';
import { ApiError, fetchCustomer } from '../api';
import { formatCents, formatDateUtc, formatHourUtc, formatUnits } from '../format';
import type { CustomerDetail as Detail, Invoice, LineItem } from '../types';
import { CreditModal } from './CreditModal';
import { OverrideModal } from './OverrideModal';
import { UsageChart } from './UsageChart';

export function CustomerDetail({
  id,
  onBack,
  onAuthError,
}: {
  id: string;
  onBack: () => void;
  onAuthError: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditOpen, setCreditOpen] = useState(false);
  const [override, setOverride] = useState<{ invoiceId: string; line: LineItem } | null>(null);

  const load = useCallback(() => {
    let active = true;
    fetchCustomer(id)
      .then((d) => active && setDetail(d))
      .catch((e: ApiError) => {
        if (!active) return;
        if (e.status === 401) onAuthError();
        setError(e.status === 404 ? 'Customer not found.' : e.message);
      });
    return () => {
      active = false;
    };
  }, [id, onAuthError]);

  useEffect(() => load(), [load]);

  if (error) {
    return (
      <div className="card">
        <button className="link" onClick={onBack}>
          ← Back to customers
        </button>
        <div className="notice error" style={{ marginTop: 14 }}>
          {error}
        </div>
      </div>
    );
  }
  if (!detail) {
    return <div className="muted">Loading customer…</div>;
  }

  const flagged = new Set(detail.anomalies.map((a) => a.windowStart));
  const totalUnits = detail.usage.reduce((s, w) => s + w.totalUnits, 0);

  return (
    <>
      <div className="card">
        <button className="link" onClick={onBack}>
          ← Back to customers
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12 }}>
          <div>
            <h2>{detail.customer.name}</h2>
            <div className="card-sub">
              <code className="mono">{detail.customer.id}</code> · created{' '}
              {formatDateUtc(detail.customer.createdAt)} · {detail.customer.activeKeyCount} active
              key(s)
            </div>
          </div>
          <button className="primary" onClick={() => setCreditOpen(true)}>
            Issue credit
          </button>
        </div>

        {detail.anomalies.length > 0 && (
          <div className="anomaly">
            ⚠ {detail.anomalies.length} usage spike(s) flagged (≥10× the 30-day hourly average).
            Highest: {formatUnits(detail.anomalies[0].totalUnits)} units at{' '}
            {formatHourUtc(detail.anomalies[0].windowStart)} ({detail.anomalies[0].ratio}×).
          </div>
        )}

        <h2 style={{ marginTop: 8 }}>Recent usage</h2>
        <div className="card-sub">
          {formatUnits(totalUnits)} units across {detail.usage.length} recent hourly windows
        </div>
        <UsageChart windows={detail.usage} flagged={flagged} />
      </div>

      <div className="card">
        <h2>Invoices</h2>
        <div className="card-sub">Newest period first · override line amounts on draft/issued invoices</div>
        {detail.invoices.length === 0 ? (
          <div className="notice empty">No invoices yet.</div>
        ) : (
          detail.invoices.map((inv) => (
            <InvoiceBlock
              key={inv.id}
              invoice={inv}
              onOverride={(line) => setOverride({ invoiceId: inv.id, line })}
            />
          ))
        )}
      </div>

      {creditOpen && (
        <CreditModal
          customerId={detail.customer.id}
          customerName={detail.customer.name}
          onClose={() => setCreditOpen(false)}
          onIssued={load}
        />
      )}
      {override && (
        <OverrideModal
          invoiceId={override.invoiceId}
          line={override.line}
          onClose={() => setOverride(null)}
          onApplied={load}
        />
      )}
    </>
  );
}

function InvoiceBlock({
  invoice,
  onOverride,
}: {
  invoice: Invoice;
  onOverride: (line: LineItem) => void;
}) {
  const editable = invoice.status !== 'paid';
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <strong>{formatDateUtc(invoice.periodStart)}</strong>
        <span className={`badge ${invoice.status}`}>{invoice.status}</span>
        <span className="muted" style={{ marginLeft: 'auto' }}>
          Total {formatCents(invoice.totalCents)}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Line item</th>
            <th className="num">Units</th>
            <th className="num">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {invoice.lineItems.map((li) => (
            <tr key={li.id}>
              <td>
                {li.description}
                {li.overridden && <span className="muted" style={{ fontSize: 12 }}> · adjusted</span>}
              </td>
              <td className="num">{formatUnits(li.units)}</td>
              <td className="num">{formatCents(li.amountCents)}</td>
              <td className="num">
                {editable ? (
                  <button className="secondary small" onClick={() => onOverride(li)}>
                    Override
                  </button>
                ) : (
                  <span className="muted" style={{ fontSize: 12 }}>locked</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!editable && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Paid invoice — correct with a credit, not a line edit.
        </div>
      )}
    </div>
  );
}
