import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Auth from './Auth';
import Gifts from './Gifts';
import Withdraw from './Withdraw';
import Admin from './Admin';
import './App.css';

const SERVER_URL = 'https://ometv-production.up.railway.app';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  });

  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [camError, setCamError] = useState('');
  const [partner, setPartner] = useState(null); // { username, country, userId }
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [giftAnimation, setGiftAnimation] = useState(null);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const wakeLockRef = useRef(null);

  const cleanupPeer = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    if (!tracks.length) return;
    const newState = !tracks[0].enabled;
    tracks.forEach(t => { t.enabled = newState; });
    setMicMuted(!newState);
  };

  const toggleCam = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (!tracks.length) return;
    const newState = !tracks[0].enabled;
    tracks.forEach(t => { t.enabled = newState; });
    setCamOff(!newState);
  };

  const getLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  const startWebRTC = async (initiator) => {
    cleanupPeer();
    let stream;
    try {
      stream = await getLocalStream();
    } catch (err) {
      console.error('No se pudo acceder a la cámara:', err);
      return;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('signal', { candidate: event.candidate });
      }
    };

    if (initiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketRef.current.emit('signal', { type: offer.type, sdp: offer.sdp });
      } catch (err) {
        console.error('Error creando oferta:', err);
      }
    }
  };

  // Mantener la pantalla encendida mientras se está en llamada
  useEffect(() => {
    if (status !== 'connected') return;

    let cancelled = false;

    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          const lock = await navigator.wakeLock.request('screen');
          if (cancelled) {
            lock.release().catch(() => {});
            return;
          }
          wakeLockRef.current = lock;
          lock.addEventListener('release', () => {
            wakeLockRef.current = null;
          });
        }
      } catch (err) {
        console.warn('Wake Lock no disponible:', err);
      }
    };

    acquire();

    // Reactivar al volver a la pestaña (el sistema lo libera al ocultarse)
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && status === 'connected' && !wakeLockRef.current) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [status]);

  useEffect(() => {
    if (!token) return;

    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      // Autenticar con el servidor
      socket.emit('authenticate', token);
    });

    socket.on('authenticated', () => console.log('Socket autenticado'));
    socket.on('auth_error', (msg) => {
      console.error('Auth error:', msg);
      handleLogout();
    });

    socket.on('waiting', () => {
      setStatus('waiting');
      setMessages([]);
      setPartner(null);
    });

    socket.on('partner_found', ({ initiator, partnerUsername, partnerCountry, partnerUserId, partnerGender }) => {
      setStatus('connected');
      setPartner({ username: partnerUsername, country: partnerCountry, userId: partnerUserId, gender: partnerGender });
      setMessages([{ text: `¡Conectado con ${partnerUsername}!`, from: 'system' }]);
      setShowReport(false);
      setReportSent(false);
      startWebRTC(initiator);
    });

    socket.on('signal', async (data) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        if (data.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: data.type, sdp: data.sdp }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { type: answer.type, sdp: answer.sdp });
        } else if (data.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: data.type, sdp: data.sdp }));
        } else if (data.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (err) {
        console.error('Error señalización:', err);
      }
    });

    socket.on('partner_disconnected', () => {
      setStatus('idle');
      setMessages(prev => [...prev, { text: 'El Usuario se desconectó.', from: 'system' }]);
      setPartner(null);
      cleanupPeer();
    });

    socket.on('partner_skipped', () => {
      cleanupPeer();
      setMessages([{ text: 'El Usuario se fue. Buscando otro...', from: 'system' }]);
      setPartner(null);
      setStatus('waiting');
    });

    socket.on('gift_received', (data) => {
      setGiftAnimation(data);
      setTimeout(() => setGiftAnimation(null), 3000);
    });

    socket.on('chat_message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
      cleanupPeer();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    };
  }, [token]);

  const handleLogin = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setStatus('idle');
    cleanupPeer();
    if (socketRef.current) socketRef.current.disconnect();
  };

  const handleStart = async () => {
    setCamError('');
    try {
      await getLocalStream();
    } catch (err) {
      setCamError('No se pudo acceder a la cámara. Verifica los permisos.');
      return;
    }
    socketRef.current.emit('find_partner');
    setStatus('waiting');
  };

  const handleNext = () => {
    cleanupPeer();
    socketRef.current.emit('next');
    setStatus('waiting');
    setMessages([]);
    setPartner(null);
    setShowReport(false);
  };

  const handleStop = () => {
    cleanupPeer();
    socketRef.current.emit('stop');
    setStatus('idle');
    setMessages([]);
    setPartner(null);
    setShowReport(false);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMsg.trim() || status !== 'connected') return;
    socketRef.current.emit('chat_message', inputMsg);
    setMessages(prev => [...prev, { text: inputMsg, from: 'you' }]);
    setInputMsg('');
  };

  // Captura un frame del <video> en JPEG base64. Devuelve null si no se puede.
  const captureVideoFrame = (videoEl, maxW = 480) => {
    if (!videoEl || !videoEl.videoWidth) return null;
    try {
      const ratio = videoEl.videoHeight / videoEl.videoWidth;
      const w = Math.min(maxW, videoEl.videoWidth);
      const h = Math.round(w * ratio);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.warn('No se pudo capturar frame:', e);
      return null;
    }
  };

  // Compone remoto+local lado a lado para enviar como evidencia
  const buildReportSnapshot = () => {
    const remote = remoteVideoRef.current;
    const local  = localVideoRef.current;
    if (!remote?.videoWidth && !local?.videoWidth) return null;
    try {
      const W = 960, H = 360;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const half = W / 2;
      const drawFitted = (v, x) => {
        if (!v || !v.videoWidth) return;
        const vr = v.videoWidth / v.videoHeight;
        const tr = half / H;
        let dw, dh, dx, dy;
        if (vr > tr) { dh = H; dw = H * vr; dx = x + (half - dw) / 2; dy = 0; }
        else         { dw = half; dh = half / vr; dx = x; dy = (H - dh) / 2; }
        ctx.drawImage(v, dx, dy, dw, dh);
      };
      drawFitted(remote, 0);
      drawFitted(local,  half);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, H - 22, W, 22);
      ctx.fillStyle = '#fff';
      ctx.font = '13px sans-serif';
      ctx.fillText(`${partner?.username || '?'} (izq)  ·  ${user?.username || ''} (der)  ·  ${new Date().toLocaleString()}`, 8, H - 6);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      console.warn('No se pudo componer captura:', e);
      return captureVideoFrame(remoteVideoRef.current);
    }
  };

  const handleReport = async () => {
    if (!reportReason || !partner?.userId) return;
    const screenshot = buildReportSnapshot();
    const chatSnapshot = messages.slice(-30).map(m => ({ from: m.from, text: m.text }));
    console.log('[Reporte] captura:', screenshot ? `${Math.round(screenshot.length / 1024)} KB` : 'NO disponible',
                '| mensajes:', chatSnapshot.length);
    try {
      const res = await fetch(`${SERVER_URL}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reportedUserId: partner.userId,
          reason: reportReason,
          screenshot,
          chatSnapshot
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[Reporte] servidor respondió', res.status, data);
        alert('Error al enviar reporte: ' + (data.error || res.status));
        return;
      }
      setReportSent(true);
      setShowReport(false);
      setReportReason('');
    } catch (err) {
      console.error('Error al reportar:', err);
      alert('Error de red al enviar reporte');
    }
  };

  if (!token) return <Auth onLogin={handleLogin} />;

  return (
    <div className="app">
      <div className="app-logo">
        <img src="/logo.png" alt="TR-Live" className="app-logo-img" />
      </div>
      <div className="video-section">
        <div className="video-wrapper remote">
          <video ref={remoteVideoRef} autoPlay playsInline className="video" />

          {/* Info del compañero */}
          {status === 'connected' && partner && (
            <div className="partner-info">
              <span>👤 {partner.username}</span>
              <span>🌍 {partner.country}</span>
            </div>
          )}

          {status !== 'connected' && (
            <div className="video-overlay">
              {status === 'idle' && (
                <div className="idle-msg">
                  <p>Presiona Iniciar para conectar</p>
                  {camError && <p className="cam-error">{camError}</p>}
                </div>
              )}
              {status === 'waiting' && (
                <div className="waiting">
                  <div className="spinner" />
                  <p>Buscando Usuario...</p>
                </div>
              )}
            </div>
          )}

          {/* Modal de reporte */}
          {showReport && (
            <div className="report-modal">
              <h3>Reportar usuario</h3>
              <select value={reportReason} onChange={e => setReportReason(e.target.value)}>
                <option value="">Selecciona una razón</option>
                <option value="inappropriate">Contenido inapropiado</option>
                <option value="harassment">Acoso</option>
                <option value="spam">Spam</option>
                <option value="underage">Menor de edad</option>
                <option value="other">Otro</option>
              </select>
              <div className="report-actions">
                <button onClick={handleReport} disabled={!reportReason}>Enviar</button>
                <button onClick={() => setShowReport(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* Animación de regalo recibido */}
        {giftAnimation && (
          <div className="gift-animation">
            <span>{giftAnimation.emoji}</span>
            <p>{giftAnimation.name}</p>
          </div>
        )}

        <div className="video-wrapper local">
          <video ref={localVideoRef} autoPlay playsInline muted className="video" />
          {camOff && <div className="cam-off-overlay">📷 Cámara apagada</div>}
          <span className="label">Tú ({user?.username})</span>
          <div className="media-controls">
            <button
              className={`media-btn ${micMuted ? 'off' : ''}`}
              onClick={toggleMic}
              title={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
            >
              {micMuted ? '🔇' : '🎤'}
            </button>
            <button
              className={`media-btn ${camOff ? 'off' : ''}`}
              onClick={toggleCam}
              title={camOff ? 'Encender cámara' : 'Apagar cámara'}
            >
              {camOff ? '📷' : '📹'}
            </button>
          </div>
        </div>

        {/* Botón logout */}
        <button className="logout-btn" onClick={handleLogout}>Salir</button>
        <button className="withdraw-btn" onClick={() => setShowWithdraw(true)}>💰</button>
        {(user?.role === 'admin' || user?.role === 'owner') && (
          <button className="admin-btn" onClick={() => setShowAdmin(true)} title="Panel de administración">⚙️</button>
        )}

        {showWithdraw && (
          <Withdraw token={token} onClose={() => setShowWithdraw(false)} />
        )}
        {showAdmin && (
          <Admin token={token} userRole={user?.role} onClose={() => setShowAdmin(false)} />
        )}
      </div>

      <div className="bottom-section">
        <div className="controls-panel">
          <div className="controls">
            {status === 'idle' && (
              <button className="btn start" onClick={handleStart}>▶ Iniciar</button>
            )}
            {status === 'waiting' && (
              <button className="btn stop" onClick={handleStop}>✕ Cancelar</button>
            )}
            {status === 'connected' && (
              <>
                <button className="btn next" onClick={handleNext}>⏭ Siguiente</button>
                <button className="btn stop" onClick={handleStop}>✕ Parar</button>
                <Gifts token={token} partnerId={partner?.userId} socket={socketRef.current} />
                <button className="btn report" onClick={() => setShowReport(true)}>⚑ Reportar</button>
              </>
            )}
          </div>
          {status === 'connected' && partner && (
            <div className="partner-bar">
              <span className="partner-bar-item">
                🌍 <strong>{partner.country}</strong>
              </span>
              <span className="partner-bar-item">
                {partner.gender === 'male' ? '👨' : partner.gender === 'female' ? '👩' : '🧑'}{' '}
                <strong>{partner.gender === 'male' ? 'Hombre' : partner.gender === 'female' ? 'Mujer' : 'Otro'}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="chat-section">
          <div className="messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.from}`}>
                {msg.from === 'you' && <span className="sender">{user?.username}: </span>}
                {msg.from === 'stranger' && <span className="sender">{partner?.username || 'Usuario'}: </span>}
                {msg.text}
              </div>
            ))}
            {reportSent && (
              <div className="message system">✓ Reporte enviado</div>
            )}
          </div>

          <form className="chat-input" onSubmit={sendMessage}>
            <input
              type="text"
              placeholder={status === 'connected' ? 'Escribe un mensaje...' : 'Conéctate para chatear'}
              value={inputMsg}
              onChange={e => setInputMsg(e.target.value)}
              disabled={status !== 'connected'}
            />
            <button type="submit" disabled={status !== 'connected'}>Enviar</button>
          </form>
        </div>
      </div>
    </div>
  );
}
