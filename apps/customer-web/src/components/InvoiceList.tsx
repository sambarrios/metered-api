import { useEffect, useState } from 'react';
import { ApiError, fetchInvoices } from '../api';
import { formatCents, formatDateUtc } from '../format';
import type { Invoice } from '../types';

export function InvoiceList({
  onOpen,
  onAuthError,
}: {
  onOpen: (id: string) => void;
  onAuthError: () => void;
}) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchInvoices()
      .then((page) => active && setInvoices(page.data))
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
    return <div className="notice error">Could not load invoices: {error}</div>;
  }
  if (!invoices) {
    return <div className="muted">Loading invoices…</div>;
  }

  return (
    <div className="card">
      <h2>Invoices</h2>
      <div className="card-sub">Newest period first</div>

      {invoices.length === 0 ? (
        <div className="notice empty">No invoices yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Status</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="clickable" onClick={() => onOpen(inv.id)}>
                <td>{formatDateUtc(inv.periodStart)}</td>
                <td>
                  <span className={`badge ${inv.status}`}>{inv.status}</span>
                </td>
                <td className="num">{formatCents(inv.totalCents)}</td>
                <td className="num">
                  <button className="link">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
