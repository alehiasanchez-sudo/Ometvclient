import React, { useState, useEffect } from 'react';
import './Withdraw.css';

const SERVER_URL = 'https://ometv-production.up.railway.app';

export default function Withdraw({ token, onClose }) {
  const [info, setInfo] = useState(null);
  const [paypalEmail, setPaypalEmail] = useState('');
  const [coins, setCoins] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchInfo();
  }, []);

  const fetchInfo = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/withdraw/info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setInfo(data);
      setCoins(data.minWithdraw);
    } catch {}
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`${SERVER_URL}/api/withdraw/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paypalEmail, coins: Number(coins) })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setMsg(`✓ $${data.usdSent} enviados a ${data.paypalEmail}`);
        fetchInfo();
      } else {
        setMsg(data.error || 'Error');
      }
    } catch {
      setMsg('Error de conexión');
    }
    setLoading(false);
  };

  const usdPreview = coins ? (Number(coins) * 0.0075).toFixed(2) : '0.00';

  return (
    <div className="withdraw-overlay" onClick={onClose}>
      <div className="withdraw-modal" onClick={e => e.stopPropagation()}>
        <div className="withdraw-header">
          <h2>💰 Retirar monedas</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {info && (
          <div className="withdraw-balance">
            <span>Balance: <strong>{info.balance} 🪙</strong></span>
            <span className="rate">{info.rate}</span>
          </div>
        )}

        {success ? (
          <div className="withdraw-success">
            <p>🎉 {msg}</p>
            <button onClick={onClose}>Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleWithdraw}>
            <label>Email de PayPal</label>
            <input
              type="email"
              placeholder="tu@paypal.com"
              value={paypalEmail}
              onChange={e => setPaypalEmail(e.target.value)}
              required
            />

            <label>Monedas a retirar (mín. {info?.minWithdraw || 500})</label>
            <input
              type="number"
              min={info?.minWithdraw || 500}
              max={info?.balance || 0}
              value={coins}
              onChange={e => setCoins(e.target.value)}
              required
            />

            <div className="usd-preview">
              Recibirás: <strong>${usdPreview} USD</strong>
            </div>

            {msg && <p className="withdraw-msg error">{msg}</p>}

            <button type="submit" disabled={loading || !info || info.balance < (info?.minWithdraw || 500)}>
              {loading ? 'Procesando...' : 'Retirar a PayPal'}
            </button>

            {info && info.balance < info.minWithdraw && (
              <p className="withdraw-msg">
                Necesitas {info.minWithdraw - info.balance} monedas más para retirar
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
