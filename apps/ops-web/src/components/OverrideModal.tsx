import { useState } from 'react';
import { ApiError, overrideLineItem } from '../api';
import { dollarsToCents, formatCents } from '../format';
import type { LineItem, OverrideResult } from '../types';

/**
 * Override a single invoice line amount. Safety design:
 *  - Sets an absolute amount and is NOT idempotent, so the confirmation step
 *    restates before -> after explicitly; the audit_log keeps the before/after
 *    trail server-side.
 *  - A reason is required (it lands in the audit row).
 *  - A paid invoice can't be overridden (the caller hides the action; the
 *    server also returns 409, surfaced here).
 */
export function OverrideModal({
  invoiceId,
  line,
  onClose,
  onApplied,
}: {
  invoiceId: string;
  line: LineItem;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [amountStr, setAmountStr] = useState((line.amountCents / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OverrideResult | null>(null);

  const amountCents = dollarsToCents(amountStr);
  const amountValid = amountCents !== null && amountCents >= 0;
  const reasonValid = reason.trim().length >= 3;
  const changed = amountValid && amountCents !== line.amountCents;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await overrideLineItem(invoiceId, line.id, {
        amountCents: amountCents!,
        reason: reason.trim(),
      });
      setResult(res);
      onApplied();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <>
            <h3>Line overridden</h3>
            <div className="notice success">
              Line set to {formatCents(result.lineItem.amountCents)}.
            </div>
            <div className="confirm-box">
              <div className="row">
                <span className="k">New subtotal</span>
                <span>{formatCents(result.subtotalCents)}</span>
              </div>
              <div className="row">
                <span className="k">New total</span>
                <strong>{formatCents(result.totalCents)}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : step === 'form' ? (
          <>
            <h3>Override line amount</h3>
            <div className="modal-sub">{line.description}</div>

            <label className="field-label">New amount (USD)</label>
            <input
              className="field"
              inputMode="decimal"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              autoFocus
            />
            {amountStr && !amountValid && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Enter a non-negative dollar amount (max 2 decimals).
              </div>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Current: {formatCents(line.amountCents)}
            </div>

            <label className="field-label">Reason (recorded in the audit log)</label>
            <textarea
              className="field"
              rows={2}
              placeholder="e.g. negotiated discount per support ticket #482"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <div className="modal-actions">
              <button className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={!changed || !reasonValid}
                onClick={() => setStep('confirm')}
              >
                Review
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>Confirm override</h3>
            <div className="modal-sub">
              This overwrites the line amount and recomputes the invoice total. It is not
              idempotent.
            </div>
            <div className="confirm-box">
              <div className="row">
                <span className="k">Before</span>
                <span>{formatCents(line.amountCents)}</span>
              </div>
              <div className="row">
                <span className="k">After</span>
                <strong>{formatCents(amountCents!)}</strong>
              </div>
              <div className="row">
                <span className="k">Reason</span>
                <span>{reason.trim()}</span>
              </div>
            </div>

            {error && (
              <div className="notice error" style={{ marginTop: 12 }}>
                {error}
              </div>
            )}

            <div className="modal-actions">
              <button className="secondary" disabled={submitting} onClick={() => setStep('form')}>
                Back
              </button>
              <button className="primary" disabled={submitting} onClick={submit}>
                {submitting ? 'Applying…' : 'Apply override'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
