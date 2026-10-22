import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function SignIn({ onSignedIn }) {
  const [token, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setToken(token.trim());
    try {
      onSignedIn(await api.me());
    } catch (err) {
      setToken('');
      setError(err.status === 401 ? 'That access key was not recognised.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-card">
      <div className="brand" style={{ marginBottom: 16 }}>
        <div className="dotgrid" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="brand-name">Nural <span>CRM Insights</span></div>
      </div>
      <h1 className="panel-title">Sign in</h1>
      <div className="panel-sub">Enter the dashboard access key issued to you.</div>
      <form onSubmit={submit}>
        <div>
          <label className="field-label" htmlFor="token">Access key</label>
          <input id="token" type="password" className="mval-input full" value={token} onChange={(e) => setValue(e.target.value)} autoFocus />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="pill-primary pill-btn" disabled={!token.trim() || busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
