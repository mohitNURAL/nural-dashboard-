export default function TopBar({ user, onExport, onSaveView, onSyncNow, onSignOut }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="dotgrid" aria-hidden="true"><span /><span /><span /><span /></div>
        <div>
          <h1 className="brand-name">Nural <span>CRM Insights</span></h1>
          <div className="brand-sub">POWERED BY NURAL</div>
        </div>
      </div>
      <div className="topbar-right">
        <span className="user-chip">
          <b>{user.name}</b> · {user.role === 'admin' ? 'Pipeline admin' : 'Viewer'}
          {user.name !== 'local-dev' && <> · <button className="link-btn" onClick={onSignOut}>Sign out</button></>}
        </span>
        {onSyncNow && <button className="pill-stroke pill-btn" onClick={onSyncNow}>Sync now</button>}
        <button className="pill-stroke pill-btn" onClick={onExport}>Export</button>
        <button className="pill-primary pill-btn" onClick={onSaveView}>+ Save View</button>
      </div>
    </header>
  );
}
