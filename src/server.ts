import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { env, hasTtsKey } from './config/env';
import { AdelinaCore } from './core/AdelinaCore';
import { VoiceService } from './voice/VoiceService';

/**
 * server.ts
 * ---------
 * Interfaz web local de prueba para Adelina.
 *
 * Serve la UI (src/ui/public) y expone una API mínima:
 *
 *   GET  /                → interfaz de chat con voz.
 *   POST /api/chat        → { message, sessionId } → respuesta de Adelina.
 *   POST /api/voice       → audio crudo (WebM/OGG) en el body → transcribe con
 *                           Whisper, genera la respuesta y la devuelve en JSON.
 *   GET  /api/tts?text=   → audio MP3 (ElevenLabs) para reproducir la voz.
 *   GET  /api/voice/config→ capacidades de voz del servidor.
 *   POST /api/reset       → { sessionId } → borra la memoria de esa sesión.
 */
export async function startServer(): Promise<void> {
  const core = new AdelinaCore();
  const voice = new VoiceService();

  if (!core.ready) {
    console.warn(
      `[adelina] ¡Atención! No hay clave válida para LLM_PROVIDER=${env.llmProvider}. ` +
        'Copia .env.example a .env y rellena tus claves.',
    );
  }

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Estática: la UI pública vive en src/ui/public (dev) o dist/ui/public (build).
  const candidates = [
    path.resolve(__dirname, 'ui', 'public'),
    path.resolve(__dirname, '..', 'src', 'ui', 'public'),
  ];
  const publicDir = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  app.use(express.static(publicDir));

  // -------- API de chat (texto) --------
  app.post('/api/chat', async (req, res, next) => {
    try {
      const { message, sessionId } = (req.body ?? {}) as { message?: string; sessionId?: string };
      if (!message?.trim()) {
        res.status(400).json({ error: 'Falta el campo "message".' });
        return;
      }
      const sid = sessionId?.trim() || randomUUID();
      const result = await core.respond(sid, message);
      res.json({ ...result, sessionId: sid });
    } catch (err) {
      next(err);
    }
  });

  // -------- API de voz (audio -> transcripción -> respuesta) --------
  const audioParser = express.raw({
    type: ['audio/*', 'application/octet-stream'],
    limit: '40mb',
  });

  app.post('/api/voice', audioParser, async (req, res, next) => {
    try {
      const audio = req.body as Buffer | undefined;
      if (!audio || audio.length === 0) {
        res.status(400).json({ error: 'No se recibió audio.' });
        return;
      }

      const sid = (req.query.sessionId as string)?.trim() || randomUUID();
      const mimeType = (req.headers['content-type'] ?? 'audio/webm').split(';')[0].trim();

      const transcript = await voice.transcribeAudio(audio, mimeType);
      const result = await core.respond(sid, transcript);

      res.json({ ...result, sessionId: sid, transcript });
    } catch (err) {
      next(err);
    }
  });

  // -------- API TTS (texto -> MP3) --------
  app.get('/api/tts', async (req, res, next) => {
    try {
      const text = String(req.query.text ?? '').trim();
      if (!text) {
        res.status(400).json({ error: 'Falta el parámetro "text".' });
        return;
      }
      if (!hasTtsKey()) {
        res
          .status(501)
          .json({ error: 'ElevenLabs no configurado. Usa la voz del navegador.' });
        return;
      }
      const audio = await voice.synthesizeSpeech(text);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.send(audio);
    } catch (err) {
      next(err);
    }
  });

  // -------- Config de voz para la UI --------
  app.get('/api/voice/config', (_req, res) => {
    res.json({
      sttEngine: voice.sttEngine,
      tts: hasTtsKey() ? 'elevenlabs' : 'browser',
      elevenLabs: hasTtsKey(),
      provider: core.providerName,
    });
  });

  // -------- Reset de memoria por sesión --------
  app.post('/api/reset', (req, res) => {
    const { sessionId } = (req.body ?? {}) as { sessionId?: string };
    if (sessionId) core.forgetSession(sessionId);
    res.json({ ok: true });
  });

  // -------- Salud --------
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, pid: process.pid, provider: core.providerName, ready: core.ready });
  });

  // -------- Manejo central de errores --------
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[adelina] error en petición:', err.message);
    res.status(500).json({ error: err.message });
  });

  app.listen(env.port, () => {
    console.log('============================================================');
    console.log(`  ADELINA está despierta`);
    console.log(`  Interfaz local:  http://localhost:${env.port}`);
    console.log(`  Proveedor LLM:   ${core.providerName} (${env.llmProvider})`);
    console.log(`  STT:             ${voice.sttEngine === 'openai' ? 'Whisper (OpenAI)' : 'Web Speech del navegador'}`);
    console.log(`  TTS:             ${hasTtsKey() ? `ElevenLabs (voz ${env.elevenLabs.voiceId.slice(0, 6)}…)` : 'Voz nativa del navegador'}`);
    console.log('  Presiona Ctrl+C para detener el servidor.');
    console.log('============================================================');
  });

  // Cierre limpio de la base de datos al apagar.
  const shutdown = () => {
    core.dispose();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}