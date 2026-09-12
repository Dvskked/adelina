import { env, hasTtsKey } from '../config/env';

/**
 * VoiceService
 * ------------
 * Encapsula las dos capacidades de voz de Adelina:
 *
 *  - SPEECH-TO-TEXT (escucha):
 *      `transcribeAudio(buffer)` envía el audio grabado por el navegador a
 *      Whisper (OpenAI) vía fetch multipart y devuelve el texto transcrito
 *      en español.
 *      Alternativa: el navegador puede usar la Web Speech API nativa
 *      (STT_ENGINE=browser) directamente en el cliente, sin pasar por aquí.
 *
 *  - TEXT-TO-SPEECH (habla):
 *      `synthesizeSpeech(text)` produce audio MP3 con una voz natural en
 *      español mediante ElevenLabs.
 *      Alternativa sin claves: síntesis de voz del navegador (speechSynthesis).
 */
export class VoiceService {
  /** Motor STT configurado ('openai' | 'browser'). */
  readonly sttEngine = env.sttEngine;

  /** ¿Hay credenciales de ElevenLabs para TTS? */
  get ttsAvailable(): boolean {
    return hasTtsKey();
  }

  /**
   * Transcribe audio (webm/ogg/mp3/wav codificado por el navegador) a texto.
   *
   * @param audioBuffer bytes de audio crudos.
   * @param mimeType    tipo MIME, p. ej. 'audio/webm' (default).
   */
  async transcribeAudio(audioBuffer: Buffer, mimeType = 'audio/webm'): Promise<string> {
    if (!env.openai.apiKey) {
      throw new Error('OPENAI_API_KEY no configurada: no se puede transcribir voz.');
    }

    // Multipart manual con FormData/Blob nativos (Node 18+).
    const form = new FormData();
    form.append('model', env.openai.whisperModel);
    form.append('language', 'es');
    form.append('file', new Blob([audioBuffer], { type: mimeType }), 'recording.webm');

    const res = await fetch(`${env.openai.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openai.apiKey}` },
      body: form,
    });

    const data = (await res.json()) as { text?: string } & { error?: { message?: string } };

    if (!res.ok) {
      throw new Error(`Whisper (${res.status}): ${data?.error?.message ?? res.statusText}`);
    }

    return (data.text ?? '').trim();
  }

  /**
   * Convierte texto a voz natural (español) usando ElevenLabs.
   * Devuelve los bytes de audio MP3 listos para reproducción/streaming.
   */
  async synthesizeSpeech(text: string): Promise<Buffer> {
    if (!this.ttsAvailable) {
      throw new Error('ELEVENLABS_API_KEY no configurada. Usa la voz del navegador.');
    }

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${env.elevenLabs.voiceId}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': env.elevenLabs.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.slice(0, 5000), // límite de seguridad por petición
        model_id: env.elevenLabs.model,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.85,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`ElevenLabs (${res.status}): ${body}`);
    }

    return Buffer.from(await res.arrayBuffer());
  }
}