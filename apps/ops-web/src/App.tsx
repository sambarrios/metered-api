import { useCallback, useState } from 'react';
import { clearToken, getToken, setToken } from './api';
import { CustomerDetail } from './components/CustomerDetail';
import { CustomerList } from './components/CustomerList';

export function App() {
  const [hasToken, setHasToken] = useState<boolean>(() => getToken() !== null);
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);

  const handleAuthError = useCallback(() => {
    clearToken();
    setHasToken(false);
    setOpenCustomer(null);
  }, []);

  if (!hasToken) {
    return <TokenGate onConnect={() => setHasToken(true)} />;
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1>Metered</h1>
          <div className="sub">Ops console</div>
        </div>
        <button className="link" style={{ color: 'white' }} onClick={handleAuthError}>
          Sign out
        </button>
      </header>

      <div className="container">
        {openCustomer ? (
          <CustomerDetail
            id={openCustomer}
            onBack={() => setOpenCustomer(null)}
            onAuthError={handleAuthError}
          />
        ) : (
          <CustomerList onOpen={setOpenCustomer} onAuthError={handleAuthError} />
        )}
      </div>
    </>
  );
}

function TokenGate({ onConnect }: { onConnect: () => void }) {
  const [value, setValue] = useState('');

  function connect() {
    const token = value.trim();
    if (!token) return;
    setToken(token);
    onConnect();
  }

  return (
    <div className="container" style={{ maxWidth: 480, marginTop: 80 }}>
      <div className="card">
        <h2>Staff sign-in</h2>
        <div className="card-sub">
          Paste a staff token (HS256 JWT). In dev, mint one with{' '}
          <code className="mono">npm run mint:staff</code> in apps/api. Stored only in this browser.
        </div>
        <textarea
          className="field token-input"
          rows={3}
          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div style={{ marginTop: 14 }}>
          <button className="primary" onClick={connect} disabled={!value.trim()}>
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
