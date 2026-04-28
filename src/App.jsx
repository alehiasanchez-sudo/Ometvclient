import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SERVER_URL = 'https://ometv-production.up.railway.app';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export default function App() {
  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [camError, setCamError] = useState('');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  // ── helpers que NO dependen de estado de React ──
  const cleanupPeer = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
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
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('signal', { candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('WebRTC state:', pc.connectionState);
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

  // ── Socket ──
  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => console.log('Socket conectado:', socket.id));
    socket.on('connect_error', (err) => console.error('Error socket:', err));

    socket.on('waiting', () => {
      setStatus('waiting');
      setMessages([]);
    });

    socket.on('partner_found', ({ initiator }) => {
      setStatus('connected');
      setMessages([{ text: '¡Conectado con un extraño!', from: 'system' }]);
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
      setMessages(prev => [...prev, { text: 'El extraño se desconectó.', from: 'system' }]);
      cleanupPeer();
    });

    socket.on('partner_skipped', () => {
      // El otro presionó "Siguiente" — el servidor ya nos puso a buscar
      cleanupPeer();
      setMessages([{ text: 'El extraño se fue. Buscando otro...', from: 'system' }]);
      setStatus('waiting');
      // NO llamar find_partner aquí, el servidor ya lo hace
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
  }, []);

  // ── Handlers ──
  const handleStart = async () => {
    setCamError('');
    try {
      await getLocalStream();
    } catch (err) {
      setCamError('No se pudo acceder a la cámara. Verifica los permisos del navegador.');
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
  };

  const handleStop = () => {
    cleanupPeer();
    socketRef.current.emit('stop');
    setStatus('idle');
    setMessages([]);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!inputMsg.trim() || status !== 'connected') return;
    socketRef.current.emit('chat_message', inputMsg);
    setMessages(prev => [...prev, { text: inputMsg, from: 'you' }]);
    setInputMsg('');
  };

  return (
    <div className="app">
      <div className="video-section">
        <div className="video-wrapper remote">
          <video ref={remoteVideoRef} autoPlay playsInline className="video" />
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
                  <p>Buscando extraño...</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="video-wrapper local">
          <video ref={localVideoRef} autoPlay playsInline muted className="video" />
          <span className="label">Tú</span>
        </div>
      </div>

      <div className="chat-section">
        <div className="messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.from}`}>
              {msg.from === 'you' && <span className="sender">Tú: </span>}
              {msg.from === 'stranger' && <span className="sender">Extraño: </span>}
              {msg.text}
            </div>
          ))}
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
              <button className="btn stop" onClick={handleStop}>✕ Detener</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
