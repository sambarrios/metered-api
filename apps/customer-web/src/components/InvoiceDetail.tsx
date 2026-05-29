import { useEffect, useState } from 'react';
import { ApiError, fetchInvoice } from '../api';
import { formatCents, formatDateUtc, formatUnits } from '../format';
import type { Invoice } from '../types';

export function InvoiceDetail({
  id,
  onBack,
  onAuthError,
}: {
  id: string;
  onBack: () => void;
  onAuthError: () => void;
}) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setInvoice(null);
    setError(null);
    fetchInvoice(id)
      .then((inv) => active && setInvoice(inv))
      .catch((e: ApiError) => {
        if (!active) return;
        if (e.status === 401) onAuthError();
        setError(e.status === 404 ? 'Invoice not found.' : e.message);
      });
    return () => {
      active = false;
    };
  }, [id, onAuthError]);

  return (
    <div className="card">
      <button className="link" onClick={onBack}>
        ← Back to invoices
      </button>

      {error && (
        <div className="notice error" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      {!invoice && !error && <div className="muted" style={{ marginTop: 14 }}>Loading…</div>}

      {invoice && (
        <>
          <h2 style={{ marginTop: 14 }}>
            Invoice — {formatDateUtc(invoice.periodStart)}
          </h2>
          <div className="card-sub">
            {formatDateUtc(invoice.periodStart)} – {formatDateUtc(invoice.periodEnd)} ·{' '}
            <span className={`badge ${invoice.status}`}>{invoice.status}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Line item</th>
                <th className="num">Units</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id}>
                  <td>
                    {li.description}
                    {li.overridden && (
                      <span className="muted" style={{ fontSize: 12 }}> · adjusted</span>
                    )}
                  </td>
                  <td className="num">{formatUnits(li.units)}</td>
                  <td className="num">{formatCents(li.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} className="num muted">Subtotal</td>
                <td className="num">{formatCents(invoice.subtotalCents)}</td>
              </tr>
              {invoice.creditsCents > 0 && (
                <tr>
                  <td colSpan={2} className="num muted">Credits</td>
                  <td className="num">−{formatCents(invoice.creditsCents)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={2} className="num" style={{ fontWeight: 600 }}>Total</td>
                <td className="num" style={{ fontWeight: 600 }}>
                  {formatCents(invoice.totalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </div>
  );
}
