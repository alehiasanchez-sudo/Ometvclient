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

  const adjustCoins = (id, username) => {
    const v = prompt(`Ajustar monedas de ${username} (positivo agrega, negativo resta):`);
    if (!v) return;
    const delta = parseInt(v, 10);
    if (!Number.isInteger(delta) || delta === 0) return alert('Cantidad inválida');
    action(id, 'coins', { delta });
  };

  const deleteUser = (id, username) => {
    const confirm1 = prompt(`⚠️ Vas a ELIMINAR PERMANENTEMENTE a "${username}". Escribe el nombre exacto para confirmar:`);
    if (confirm1 !== username) return alert('Cancelado: el nombre no coincide');
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
                    {/* Ban/Unban: admin y owner */}
                    {u.role !== 'owner' && (
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
                    {/* Coins + Delete: sólo owner */}
                    {isOwner && u.role !== 'owner' && (
                      <>
                        <button onClick={() => adjustCoins(u._id, u.username)}>± Monedas</button>
                        <button className="danger" onClick={() => deleteUser(u._id, u.username)}>🗑️ Eliminar</button>
                      </>
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
function ReportsTab({ token }) {
  const [reports, setReports] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(false);

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
            <thead><tr><th>Reportado</th><th>Por</th><th>Razón</th><th>Fecha</th><th>Acción</th></tr></thead>
            <tbody>
              {reports.length === 0 && <tr><td colSpan="5" style={{ textAlign:'center', padding:20 }}>Sin reportes</td></tr>}
              {reports.map(r => (
                <tr key={r._id}>
                  <td><b>{r.reportedUser?.username || '?'}</b> {r.reportedUser?.banned && '🚫'}</td>
                  <td>{r.reportedBy?.username || '?'}</td>
                  <td>{r.reason}</td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="actions">
                    {r.status === 'pending' ? (
                      <>
                        <button className="danger" onClick={() => resolve(r._id, 'ban')}>Banear</button>
                        <button onClick={() => resolve(r._id, 'dismiss')}>Descartar</button>
                      </>
                    ) : (
                      <span className="muted">{r.status}</span>
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
