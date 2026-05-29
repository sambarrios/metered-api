import { useState } from 'react';
import { ApiError, issueCredit } from '../api';
import { dollarsToCents, formatCents } from '../format';
import type { CreditResult } from '../types';

/**
 * Issue an account credit. Safety design:
 *  - A confirmation step restates the exact amount + customer before anything
 *    is sent (credits move money; no silent one-click).
 *  - A client idempotency key is generated once per modal open and reused on
 *    every retry, so a double-submit / network retry credits exactly once
 *    (the server dedupes on this key). The key is shown for auditability.
 *  - The submit button is disabled while a request is in flight.
 */
export function CreditModal({
  customerId,
  customerName,
  onClose,
  onIssued,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onIssued: () => void;
}) {
  // Stable for the life of this modal — the dedupe guarantee depends on reusing
  // it across retries of the same intent.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreditResult | null>(null);

  const amountCents = dollarsToCents(amountStr);
  const amountValid = amountCents !== null && amountCents >= 1;
  const reasonValid = reason.trim().length >= 3;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await issueCredit(customerId, {
        amountCents: amountCents!,
        reason: reason.trim(),
        idempotencyKey,
      });
      setResult(res);
      onIssued();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {result ? (
          <>
            <h3>{result.deduplicated ? 'Credit already on file' : 'Credit issued'}</h3>
            <div className="modal-sub">{customerName}</div>
            <div className={`notice ${result.deduplicated ? 'warn' : 'success'}`}>
              {result.deduplicated
                ? `This idempotency key was already used — no second credit was created. Existing credit: ${formatCents(
                    result.amountCents,
                  )}.`
                : `${formatCents(result.amountCents)} credited.`}
            </div>
            <div className="confirm-box">
              <div className="row">
                <span className="k">Credit id</span>
                <code className="mono">{result.id}</code>
              </div>
              <div className="row">
                <span className="k">Reason</span>
                <span>{result.reason}</span>
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
            <h3>Issue credit</h3>
            <div className="modal-sub">{customerName}</div>

            <label className="field-label">Amount (USD)</label>
            <input
              className="field"
              inputMode="decimal"
              placeholder="25.00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              autoFocus
            />
            {amountStr && !amountValid && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Enter a positive dollar amount (max 2 decimals).
              </div>
            )}

            <label className="field-label">Reason</label>
            <textarea
              className="field"
              rows={2}
              placeholder="e.g. goodwill credit for the April outage"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <div className="modal-actions">
              <button className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={!amountValid || !reasonValid}
                onClick={() => setStep('confirm')}
              >
                Review
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>Confirm credit</h3>
            <div className="modal-sub">This issues a credit to the customer&apos;s account.</div>
            <div className="confirm-box">
              <div className="row">
                <span className="k">Customer</span>
                <span>{customerName}</span>
              </div>
              <div className="row">
                <span className="k">Amount</span>
                <strong>{formatCents(amountCents!)}</strong>
              </div>
              <div className="row">
                <span className="k">Reason</span>
                <span>{reason.trim()}</span>
              </div>
              <div className="row">
                <span className="k">Idempotency key</span>
                <code className="mono">{idempotencyKey.slice(0, 8)}…</code>
              </div>
            </div>

            {error && (
              <div className="notice error" style={{ marginTop: 12 }}>
                {error} — safe to retry; the idempotency key prevents a double credit.
              </div>
            )}

            <div className="modal-actions">
              <button className="secondary" disabled={submitting} onClick={() => setStep('form')}>
                Back
              </button>
              <button className="primary" disabled={submitting} onClick={submit}>
                {submitting ? 'Issuing…' : 'Issue credit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
