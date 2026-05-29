import { useEffect, useState } from 'react';
import { ApiError, fetchCustomers } from '../api';
import { formatDateUtc } from '../format';
import type { CustomerSummary } from '../types';

export function CustomerList({
  onOpen,
  onAuthError,
}: {
  onOpen: (id: string) => void;
  onAuthError: () => void;
}) {
  const [customers, setCustomers] = useState<CustomerSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchCustomers()
      .then((page) => active && setCustomers(page.data))
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
    return <div className="notice error">Could not load customers: {error}</div>;
  }
  if (!customers) {
    return <div className="muted">Loading customers…</div>;
  }

  return (
    <div className="card">
      <h2>Customers</h2>
      <div className="card-sub">Newest first</div>

      {customers.length === 0 ? (
        <div className="notice empty">No customers yet.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
              <th>Created</th>
              <th className="num">Active keys</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => onOpen(c.id)}>
                <td>{c.name}</td>
                <td>
                  <code className="mono">{c.id}</code>
                </td>
                <td>{formatDateUtc(c.createdAt)}</td>
                <td className="num">{c.activeKeyCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
