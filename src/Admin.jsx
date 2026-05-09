import React, { useState, useEffect } from 'react';
import './Admin.css';

const SERVER_URL = 'https://ometv-production.up.railway.app';

export default function Admin({ token, userRole, onClose }) {
  const isOwner = userRole === 'owner';
  // Tab por defecto: si es admin (no owner) abre directo en reportes; owner abre en stats.
  const [tab, setTab] = useState(isOwner ? 'stats' : 'users');

  return (
    <div className="admin-overlay">
      <div className="admin-panel">
        <div className="admin-header">
          <h2>Panel de Administración <span className="role-badge">{userRole === 'owner' ? '👑 OWNER' : '🛡️ ADMIN'}</span></h2>
          <button className="admin-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-tabs">
          {isOwner && <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>📊 Stats</button>}
          <button className={tab === 'users'   ? 'active' : ''} onClick={() => setTab('users')}>👥 Usuarios</button>
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>⚑ Reportes</button>
          {isOwner && <button className={tab === 'txs' ? 'active' : ''} onClick={() => setTab('txs')}>💰 Transacciones</button>}
        </div>
        <div className="admin-body">
          {tab === 'stats'   && isOwner && <StatsTab token={token} />}
          {tab === 'users'   && <UsersTab token={token} isOwner={isOwner} />}
          {tab === 'reports' && <ReportsTab token={token} />}
          {tab === 'txs'     && isOwner && <TxsTab token={token} />}
        </div>
      </div>
    </div>
  );
}

// ── Stats (sólo owner) ──
function StatsTab({ token }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setStats(d);
    } catch (e) { setErr(e.message); }
  };

  if (err) return <p className="admin-error">{err}</p>;
  if (!stats) return <p>Cargando…</p>;

  return (
    <div className="stats-grid">
      <Card label="Usuarios totales" value={stats.totalUsers} />
      <Card label="Baneados"          value={stats.bannedUsers} danger />
      <Card label="Nuevos hoy"        value={stats.newToday} good />
      <Card label="Reportes pendientes" value={stats.pendingReports} warn />
      <Card label="Monedas vendidas hoy" value={`${stats.coinsPurchasedToday} 🪙`} good />
      <Card label="Compras hoy"       value={stats.purchaseCountToday} />
      <Card label="Monedas vendidas mes" value={`${stats.coinsPurchasedMonth} 🪙`} good />
      <Card label="Compras mes"       value={stats.purchaseCountMonth} />
      <Card label="Regalos enviados hoy" value={stats.giftsSentToday} />
    </div>
  );
}

function Card({ label, value, good, warn, danger }) {
  const cls = good ? 'good' : warn ? 'warn' : danger ? 'danger' : '';
  return (
    <div className={`stat-card ${cls}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </div>
  );
}

// ── Usuarios ──
function UsersTab({ token, isOwner }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/users?search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setUsers(d.users);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const action = async (id, path, body, method = 'POST') => {
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/users/${id}${path ? '/' + path : ''}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      load();
    } catch (e) { alert(e.message); }
  };

  const deleteUser = (id, username) => {
    if (!window.confirm(`¿Eliminar permanentemente a "${username}"?`)) return;
    action(id, '', null, 'DELETE');
  };

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-search"
          placeholder="Buscar por nombre…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()}
        />
        <button onClick={load}>Buscar</button>
      </div>
      {err && <p className="admin-error">{err}</p>}
      {loading ? <p>Cargando…</p> : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th><th>Edad</th><th>Género</th><th>País</th>
                <th>Monedas</th><th>Rol</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} className={u.banned ? 'banned' : ''}>
                  <td><b>{u.username}</b></td>
                  <td>{u.age}</td>
                  <td>{u.gender === 'male' ? '👨' : u.gender === 'female' ? '👩' : '🧑'}</td>
                  <td>{u.country}</td>
                  <td>{u.balance} 🪙</td>
                  <td>{u.role === 'owner' ? '👑 owner' : u.role === 'admin' ? '🛡️ admin' : 'user'}</td>
                  <td>{u.banned ? '🚫 baneado' : '✓'}</td>
                  <td className="actions">
                    {/* Ban/Unban: admin puede banear sólo users; owner puede banear users y admins */}
                    {u.role !== 'owner' && (u.role !== 'admin' || isOwner) && (
                      u.banned
                        ? <button onClick={() => action(u._id, 'unban')}>Desbanear</button>
                        : <button className="danger" onClick={() => action(u._id, 'ban')}>Banear</button>
                    )}
                    {/* Promote/Demote: sólo owner */}
                    {isOwner && u.role !== 'owner' && (
                      u.role === 'admin'
                        ? <button onClick={() => action(u._id, 'demote')}>Quitar admin</button>
                        : <button onClick={() => action(u._id, 'promote')}>Hacer admin</button>
                    )}
                    {/* Delete: sólo owner */}
                    {isOwner && u.role !== 'owner' && (
                      <button className="danger" onClick={() => deleteUser(u._id, u.username)}>🗑️ Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Reportes (admin y owner) ──
const REASON_LABELS = {
  inappropriate: '🔞 Contenido inapropiado',
  harassment:    '😡 Acoso',
  spam:          '📢 Spam',
  underage:      '👶 Menor de edad',
  other:         '❓ Otro'
};

function ReportsTab({ token }) {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [evidence, setEvidence] = useState(null); // { screenshot, chatSnapshot, ... }

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/reports?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await r.json();
      setReports(d.reports || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [status]);

  const resolve = async (id, action) => {
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/reports/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      load();
    } catch (e) { alert(e.message); }
  };

  const deleteReport = async (id, username) => {
    if (!window.confirm(`¿Eliminar este reporte y limpiar todos los reportes de "${username}"?`)) return;
    try {
      const r = await fetch(`${SERVER_URL}/api/admin/reports/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      load();
    } catch (e) { alert(e.message); }
  };

  const openImageInNewTab = (dataUrl) => {
    const w = window.open();
    if (w) w.document.write(`<img src="${dataUrl}" style="max-width:100%;display:block;margin:auto"/>`);
  };

  return (
    <>
      <div className="admin-toolbar">
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pending">Pendientes</option>
          <option value="resolved">Resueltos</option>
          <option value="dismissed">Descartados</option>
          <option value="all">Todos</option>
        </select>
      </div>
      {loading ? <p>Cargando…</p> : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead><tr><th>Reportado</th><th>Reportes totales</th><th>Por</th><th>Razón</th><th>Evidencia</th><th>Fecha</th><th>Acción</th></tr></thead>
            <tbody>
              {reports.length === 0 && <tr><td colSpan="7" style={{ textAlign:'center', padding:20 }}>Sin reportes</td></tr>}
              {reports.map(r => {
                const total = r.reportedUser?.totalReports || 0;
                const sev = total >= 5 ? 'sev-high' : total >= 3 ? 'sev-mid' : 'sev-low';
                const hasEvidence = r.screenshot || (r.chatSnapshot && r.chatSnapshot.length);
                return (
                <tr key={r._id}>
                  <td><b>{r.reportedUser?.username || '?'}</b> {r.reportedUser?.banned && '🚫'}</td>
                  <td><span className={`report-count ${sev}`}>⚑ {total}</span></td>
                  <td>{r.reportedBy?.username || '?'}</td>
                  <td>{REASON_LABELS[r.reason] || r.reason}</td>
                  <td>
                    {hasEvidence
                      ? <button onClick={() => setEvidence(r)}>📷 Ver</button>
                      : <span className="muted">—</span>}
                  </td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="actions">
                    {r.status === 'pending' && (
                      <>
                        <button className="danger" onClick={() => resolve(r._id, 'ban')}>Banear</button>
                        <button onClick={() => resolve(r._id, 'dismiss')}>Descartar</button>
                      </>
                    )}
                    {r.status !== 'pending' && <span className="muted" style={{ marginRight: 6 }}>{r.status}</span>}
                    <button className="danger" onClick={() => deleteReport(r._id, r.reportedUser?.username || '')}>🗑️</button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {evidence && (
        <div className="admin-overlay" onClick={() => setEvidence(null)}>
          <div className="admin-panel evidence-panel" onClick={e => e.stopPropagation()}>
            <div className="admin-header">
              <h2>Evidencia del reporte</h2>
              <button className="admin-close" onClick={() => setEvidence(null)}>✕</button>
            </div>
            <div className="admin-body" style={{ overflow: 'auto' }}>
              <p style={{ color: '#aaa', marginBottom: 8 }}>
                <b>{evidence.reportedUser?.username}</b> reportado por <b>{evidence.reportedBy?.username}</b>
                {' · '}{REASON_LABELS[evidence.reason] || evidence.reason}
                {' · '}{new Date(evidence.createdAt).toLocaleString()}
              </p>
              {evidence.screenshot ? (
                <>
                  <img
                    src={evidence.screenshot}
                    alt="captura"
                    onClick={() => openImageInNewTab(evidence.screenshot)}
                    style={{ width: '100%', borderRadius: 8, border: '1px solid #333', cursor: 'zoom-in' }}
                    title="Click para abrir en grande"
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => openImageInNewTab(evidence.screenshot)}>🔍 Abrir en nueva pestaña</button>
                    <a
                      href={evidence.screenshot}
                      download={`reporte-${evidence._id}.jpg`}
                      style={{ textDecoration: 'none' }}
                    >
                      <button>⬇️ Descargar</button>
                    </a>
                  </div>
                </>
              ) : <p className="muted">Sin captura disponible</p>}
              {evidence.chatSnapshot && evidence.chatSnapshot.length > 0 && (
                <>
                  <h4 style={{ marginTop: 16, color: '#fff' }}>Últimos mensajes</h4>
                  <div style={{ background: '#111', padding: 10, borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
                    {evidence.chatSnapshot.map((m, i) => (
                      <div key={i} style={{ fontSize: '0.85rem', marginBottom: 4, color: m.from === 'you' ? '#cce4ff' : m.from === 'stranger' ? '#fff' : '#888' }}>
                        <b>{m.from === 'you' ? evidence.reportedBy?.username : m.from === 'stranger' ? evidence.reportedUser?.username : 'sistema'}:</b> {m.text}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Transacciones (sólo owner) ──
function TxsTab({ token }) {
  const [txs, setTxs] = useState([]);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const q = type ? `?type=${type}` : '';
      const r = await fetch(`${SERVER_URL}/api/admin/transactions${q}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await r.json();
      setTxs(d.transactions || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [type]);

  return (
    <>
      <div className="admin-toolbar">
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="purchase">Compras</option>
          <option value="gift_sent">Regalos enviados</option>
          <option value="gift_received">Regalos recibidos</option>
        </select>
      </div>
      {loading ? <p>Cargando…</p> : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead><tr><th>Tipo</th><th>De</th><th>Para</th><th>Cantidad</th><th>Detalle</th><th>Fecha</th></tr></thead>
            <tbody>
              {txs.length === 0 && <tr><td colSpan="6" style={{ textAlign:'center', padding:20 }}>Sin transacciones</td></tr>}
              {txs.map(t => (
                <tr key={t._id}>
                  <td>{t.type}</td>
                  <td>{t.fromUser?.username || '—'}</td>
                  <td>{t.toUser?.username || '—'}</td>
                  <td>{t.amount} 🪙</td>
                  <td>{t.giftType || t.paypalOrderId || '—'}</td>
                  <td>{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
