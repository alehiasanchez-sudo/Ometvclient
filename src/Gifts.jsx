import React, { useState, useEffect, useRef } from 'react';
import './Gifts.css';

const SERVER_URL = 'https://ometv-production.up.railway.app';

const GIFTS = [
  { id: 'like',    emoji: '👍', name: 'Like',     cost: 1   },
  { id: 'rose',    emoji: '🌹', name: 'Rosa',     cost: 10  },
  { id: 'heart',   emoji: '❤️', name: 'Corazón',  cost: 25  },
  { id: 'diamond', emoji: '💎', name: 'Diamante', cost: 100 },
  { id: 'rocket',  emoji: '🚀', name: 'Cohete',   cost: 250 },
  { id: 'crown',   emoji: '👑', name: 'Corona',   cost: 500 }
];

const PACKAGES = [
  { id: 'pack_100',  coins: 100,  price: '1.00',  label: '100 🪙' },
  { id: 'pack_500',  coins: 500,  price: '4.50',  label: '500 🪙' },
  { id: 'pack_1000', coins: 1000, price: '8.00',  label: '1000 🪙' },
  { id: 'pack_2500', coins: 2500, price: '18.00', label: '2500 🪙' }
];

export default function Gifts({ token, partnerId, socket, onGiftSent }) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const [showBuy, setShowBuy] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const paypalRef = useRef(null);

  useEffect(() => {
    if (token) fetchBalance();
  }, [token, open]);

  useEffect(() => {
    if (!showBuy || !paypalRef.current) return;
    // Limpiar botones anteriores
    paypalRef.current.innerHTML = '';
  }, [showBuy]);

  const fetchBalance = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/coins/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setBalance(data.balance || 0);
    } catch {}
  };

  const sendGift = async (gift) => {
    if (!partnerId) return;
    setSending(true);
    setMsg('');
    try {
      const res = await fetch(`${SERVER_URL}/api/gifts/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ toUserId: partnerId, giftId: gift.id })
      });
      const data = await res.json();
      if (data.success) {
        setBalance(data.senderBalance);
        setMsg(`¡Enviaste ${gift.emoji}!`);
        socket.emit('gift_sent', { emoji: gift.emoji, name: gift.name });
        if (onGiftSent) onGiftSent(gift);
        setTimeout(() => setMsg(''), 2000);
      } else {
        setMsg(data.error || 'Error');
      }
    } catch {
      setMsg('Error de conexión');
    }
    setSending(false);
  };

  const buyCoins = async (pkg) => {
    if (!window.paypal) {
      setMsg('PayPal no disponible');
      return;
    }
    if (paypalRef.current) paypalRef.current.innerHTML = '';

    window.paypal.Buttons({
      style: {
        layout: 'vertical',
        color:  'blue',
        shape:  'rect',
        label:  'pay'
      },
      fundingSource: window.paypal.FUNDING.PAYPAL,
      createOrder: async () => {
        try {
          const res = await fetch(`${SERVER_URL}/api/coins/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ packageId: pkg.id })
          });
          const data = await res.json();
          if (!data.orderId) throw new Error('No order ID received');
          return data.orderId;
        } catch (err) {
          setMsg('Error creando orden: ' + err.message);
          throw err;
        }
      },
      onApprove: async (data) => {
        const capture = await fetch(`${SERVER_URL}/api/coins/capture-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId: data.orderID, packageId: pkg.id })
        });
        const result = await capture.json();
        if (result.success) {
          setBalance(result.balance);
          setMsg(`✓ +${result.coinsAdded} monedas añadidas`);
          setShowBuy(false);
          setTimeout(() => setMsg(''), 3000);
        }
      },
      onError: (err) => {
        console.error('PayPal error:', err);
        setMsg('Error en el pago');
      }
    }).render(paypalRef.current);
  };

  return (
    <div className="gifts-container">
      <button className="gift-toggle-btn" onClick={() => setOpen(o => !o)} title="Regalos">
        🎁
      </button>

      {open && (
        <div className="gifts-panel">
          <div className="gifts-header">
            <span>🪙 {balance} monedas</span>
            <button className="buy-btn" onClick={() => setShowBuy(s => !s)}>
              + Comprar
            </button>
          </div>

          {msg && <p className="gift-msg">{msg}</p>}

          {showBuy ? (
            <div className="packages">
              <p className="packages-title">Comprar monedas</p>
              {PACKAGES.map(pkg => (
                <button key={pkg.id} className="package-btn" onClick={() => buyCoins(pkg)}>
                  <span>{pkg.label}</span>
                  <span className="pkg-price">${pkg.price}</span>
                </button>
              ))}
              <div ref={paypalRef} className="paypal-btn-container" />
            </div>
          ) : (
            <div className="gifts-grid">
              {GIFTS.map(gift => (
                <button
                  key={gift.id}
                  className="gift-btn"
                  onClick={() => sendGift(gift)}
                  disabled={sending || !partnerId || balance < gift.cost}
                  title={`${gift.name} - ${gift.cost} 🪙`}
                >
                  <span className="gift-emoji">{gift.emoji}</span>
                  <span className="gift-cost">{gift.cost}🪙</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
