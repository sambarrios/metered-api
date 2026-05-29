import { useCallback, useState } from 'react';
import { clearApiKey, getApiKey, setApiKey } from './api';
import { InvoiceDetail } from './components/InvoiceDetail';
import { InvoiceList } from './components/InvoiceList';
import { UsagePanel } from './components/UsagePanel';

type Tab = 'usage' | 'invoices';

export function App() {
  const [hasKey, setHasKey] = useState<boolean>(() => getApiKey() !== null);
  const [tab, setTab] = useState<Tab>('usage');
  const [openInvoice, setOpenInvoice] = useState<string | null>(null);

  // Any 401 from a panel kicks back to the key gate (and clears the bad key).
  const handleAuthError = useCallback(() => {
    clearApiKey();
    setHasKey(false);
  }, []);

  if (!hasKey) {
    return <KeyGate onConnect={() => setHasKey(true)} />;
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1>Metered</h1>
          <div className="sub">Customer dashboard</div>
        </div>
        <button
          className="link"
          style={{ color: 'white' }}
          onClick={handleAuthError}
        >
          Disconnect key
        </button>
      </header>

      <div className="container">
        <nav className="tabs">
          <button
            className={`tab ${tab === 'usage' ? 'active' : ''}`}
            onClick={() => {
              setTab('usage');
              setOpenInvoice(null);
            }}
          >
            Usage
          </button>
          <button
            className={`tab ${tab === 'invoices' ? 'active' : ''}`}
            onClick={() => {
              setTab('invoices');
              setOpenInvoice(null);
            }}
          >
            Invoices
          </button>
        </nav>

        {tab === 'usage' && <UsagePanel onAuthError={handleAuthError} />}

        {tab === 'invoices' &&
          (openInvoice ? (
            <InvoiceDetail
              id={openInvoice}
              onBack={() => setOpenInvoice(null)}
              onAuthError={handleAuthError}
            />
          ) : (
            <InvoiceList onOpen={setOpenInvoice} onAuthError={handleAuthError} />
          ))}
      </div>
    </>
  );
}

function KeyGate({ onConnect }: { onConnect: () => void }) {
  const [value, setValue] = useState('');

  function connect() {
    const key = value.trim();
    if (!key) return;
    setApiKey(key);
    onConnect();
  }

  return (
    <div className="container" style={{ maxWidth: 440, marginTop: 80 }}>
      <div className="card">
        <h2>Connect your account</h2>
        <div className="card-sub">
          Paste your API key to view usage and invoices. It is stored only in
          this browser.
        </div>
        <input
          className="key-input"
          type="password"
          placeholder="mk_…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && connect()}
          autoFocus
        />
        <div style={{ marginTop: 14 }}>
          <button className="primary" onClick={connect} disabled={!value.trim()}>
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
