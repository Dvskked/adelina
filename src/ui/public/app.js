/**
 * app.js — cliente web de Adelina (sin frameworks).
 *
 * Flujo de voz:
 *  1. El usuario mantiene pulsado el micrófono (MediaRecorder → WebM/OGG).
 *  2. El audio se envía a POST /api/voice (Whisper transcribe en el servidor).
 *  3. Adelina responde (LLM) y el servidor devuelve texto.
 *  4. El navegador reproduce su voz: ElevenLabs (GET /api/tts) o, si no hay
 *     clave configurada, la voz nativa del navegador (speechSynthesis es-ES).
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  const state = {
    sessionId: localStorage.getItem('adelina.session') || crypto.randomUUID(),
    recorder: null,
    recording: false,
    chunks: [],
    voiceConfig: { sttEngine: 'openai', tts: 'browser', elevenLabs: false },
    voicesLoaded: false,
    preferBrowser: false,
  };
  localStorage.setItem('adelina.session', state.sessionId);

  // ------------------------------------------------------------------
  // Elementos
  // ------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const chatEl = $('chat');
  const statusEl = $('status');
  const micBtn = $('micBtn');
  const sendBtn = $('sendBtn');
  const chatForm = $('chatForm');
  const textInput = $('textInput');
  const ttsEngine = $('ttsEngine');
  const resetBtn = $('resetBtn');

  // ------------------------------------------------------------------
  // Utilidades de UI
  // ------------------------------------------------------------------
  function setStatus(text) {
    statusEl.textContent = text;
  }

  function appendBubble(text, who) {
    const div = document.createElement('div');
    div.className = 'bubble ' + who;
    div.textContent = text;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
    return div;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'typing';
    div.id = 'typing';
    div.innerHTML = '<span class="dots"><span></span><span></span><span></span></span> Adelina está pensando…';
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('typing');
    if (el) el.remove();
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    textInput.disabled = busy;
    if (busy) micBtn.classList.remove('recording');
  }

  // ------------------------------------------------------------------
  // Voz de Adelina (TTS)
  // ------------------------------------------------------------------
  async function speak(text) {
    if (!text) return;

    const mode = ttsEngine.value === 'auto' ? state.voiceConfig.tts : ttsEngine.value;

    // Onze: si hay ElevenLabs configurado lo usamos (voz mucho más natural).
    if (mode !== 'browser' && state.voiceConfig.elevenLabs) {
      try {
        const res = await fetch('/api/tts?text=' + encodeURIComponent(text.slice(0, 4000)));
        if (res.ok) {
          const blob = await res.blob();
          const audio = new Audio(URL.createObjectURL(blob));
          audio.play();
          return;
        }
      } catch (_) {
        /* fallback silencioso a la voz del navegador */
      }
    }

    speakWithBrowser(text);
  }

  function speakWithBrowser(text) {
    if (!('speechSynthesis' in window)) return;

    if (state.ttsUtter) window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';
    utter.rate = 1.02;
    utter.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const es = voices.find((v) => v.lang.toLowerCase().startsWith('es'));
    if (es) utter.voice = es;

    state.ttsUtter = utter;
    window.speechSynthesis.speak(utter);
  }

  // Carga de voces (en algunos navegadores llegan asíncronas).
  if ('speechSynthesis' in window) {
    const loadVoices = () => { state.voicesLoaded = true; };
    window.speechSynthesis.addEventListener
      ? window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
      : (window.speechSynthesis.onvoiceschanged = loadVoices);
    loadVoices();
  }

  // ------------------------------------------------------------------
  // Chat por texto
  // ------------------------------------------------------------------
  async function sendMessage(text) {
    text = (text || '').trim();
    if (!text || sendBtn.disabled) return;

    appendBubble(text, 'user');
    textInput.value = '';
    showTyping();
    setBusy(true);
    setStatus('Adelina está escribiendo…');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: state.sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);

      appendBubble(data.reply, 'adelina');
      setStatus('escribiendo…');
      speak(data.reply);
    } catch (err) {
      appendBubble('No pude responder ahora mismo. Inténtalo de nuevo, por favor.', 'adelina');
      setStatus('las redes fallan a veces');
      console.error(err);
    } finally {
      hideTyping();
      setBusy(false);
    }
  }

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(textInput.value);
  });

  // ------------------------------------------------------------------
  // Chat por voz: grabación del micrófono
  // ------------------------------------------------------------------
  async function toggleRecording() {
    if (state.recording) {
      stopRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('tu navegador no soporta grabación');
      return;
    }

    setStatus('pidiendo el micrófono…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg'
            : 'audio/webm';

      state.recorder = new MediaRecorder(stream, { mimeType: mime });
      state.recorder.ondataavailable = (e) => e.data.size && state.chunks.push(e.data);
      state.recorder.onstop = sendRecording;
      state.chunks = [];
      state.recorder.start();

      state.recording = true;
      micBtn.classList.add('recording');
      setStatus('hablando… vuelve a pulsar para terminar');
    } catch (_) {
      setStatus('no pude acceder al micrófono');
    }
  }

  function stopRecording() {
    if (!state.recorder) return;
    setBusy(true);
    micBtn.classList.remove('recording');
    state.recorder.stop();
    state.recorder.stream.getTracks().forEach((t) => t.stop());
    state.recordTimout = setTimeout(() => setBusy(false), 800);
  }

  async function sendRecording() {
    const blob = new Blob(state.chunks, { type: state.recorder?.mimeType || 'audio/webm' });
    state.chunks = [];
    state.recorder = null;
    state.recording = false;
    setStatus('escuchando…');
    showTyping();

    appendBubble('… (tu mensaje de voz)', 'user');

    try {
      const res = await fetch('/api/voice?sessionId=' + encodeURIComponent(state.sessionId), {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);

      // Sustituye el placeholder por la transcripción real.
      const last = chatEl.querySelector('.bubble.user:last-child');
      if (last) last.textContent = data.transcript || '(audio no entendido)';

      appendBubble(data.reply, 'adelina');
      setStatus('respondiendo por voz…');
      speak(data.reply);
    } catch (err) {
      appendBubble('No capté bien tu voz, ¿lo repetimos?', 'adelina');
      console.error(err);
    } finally {
      hideTyping();
      setBusy(false);
      setStatus('todo listo para hablar');
    }
  }

  micBtn.addEventListener('click', toggleRecording);

  // ------------------------------------------------------------------
  // Arranque y extras
  // ------------------------------------------------------------------
  (async function init() {
    try {
      const res = await fetch('/api/voice/config');
      if (res.ok) state.voiceConfig = await res.json();
    } catch (_) { /* modo offline: usar defaults */ }

    const hasMic = !!(navigator.mediaDevices?.getUserMedia);
    setStatus(
      'Adelina te escucha' +
        (state.voiceConfig.elevenLabs ? ' · voz ElevenLabs' : '') +
        (hasMic ? '' : ' · sin micrófono'),
    );

    if (state.voiceConfig.elevenLabs) {
      ttsEngine.value = 'auto';
      speakWithBrowser;
    }

    resetBtn.addEventListener('click', async () => {
      await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId }),
      });
      chatEl.querySelectorAll('.bubble').forEach((b) => b.remove());
      appendBubble('Hola de nuevo. Cada conversación es un mundo nuevo para mí. ¿Cómo estás?', 'adelina');
      setStatus('memoria de esta conversación borrada');
    });
  })();
})();