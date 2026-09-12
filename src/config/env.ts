import 'dotenv/config';

/**
 * Tipos de configuración admitidos.
 */
export type LlmProviderName = 'openai' | 'anthropic' | 'gemini';
export type SttEngine = 'openai' | 'browser';
export type Mode = 'web' | 'cli' | 'smoke';

function floatOf(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function intOf(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isInteger(n) ? n : fallback;
}

/**
 * Configuración central de la aplicación.
 * Todo se lee desde variables de entorno (archivo `.env`).
 *
 * Centralizar aquí evita dispersar `process.env.X` por todo el código
 * y permite un solo punto de validación.
 */
export const env = {
  /** Modo de ejecución: servidor web con voz | consola de texto | smoke test. */
  mode: (process.env.ADELINA_MODE ?? 'web') as Mode,

  /** Puerto del servidor web local. */
  port: intOf(process.env.PORT, 3000),

  /** Nombre del usuario al que acompaña Adelina. */
  userName: process.env.ADELINA_USER_NAME ?? 'Andrés',

  /** Proveedor LLM seleccionado. */
  llmProvider: (process.env.LLM_PROVIDER ?? 'openai') as LlmProviderName,

  /** Parámetros globales de generación. */
  temperature: floatOf(process.env.LLM_TEMPERATURE, 0.85),
  maxTokens: intOf(process.env.MAX_TOKENS, 900),

  /** Configuración OpenAI (o endpoint compatible). */
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    whisperModel: process.env.OPENAI_WHISPER_MODEL ?? 'whisper-1',
  },

  /** Configuración Anthropic. */
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
  },

  /** Configuración Gemini. */
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
  },

  /** Configuración ElevenLabs (TTS con voz natural). */
  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY ?? '',
    voiceId: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
    model: process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2',
  },

  /** Motor de transcripción: openai (Whisper) o browser (Web Speech API). */
  sttEngine: (process.env.STT_ENGINE ?? 'openai') as SttEngine,

  /** Memoria a largo plazo. */
  dbPath: process.env.DB_PATH ?? './data/adelina.db',
  maxHistory: intOf(process.env.MAX_HISTORY, 20),
  summarizeEvery: intOf(process.env.SUMMARIZE_EVERY, 12),
  maxFactsInPrompt: intOf(process.env.MAX_FACTS_IN_PROMPT, 15),
} as const;

/** Indica si Adelina tiene credenciales de TTS externas (ElevenLabs). */
export const hasTtsKey = (): boolean => env.elevenLabs.apiKey.trim().length > 0;

/** Indica si hay credenciales para el proveedor LLM activo. */
export function hasLlmKey(): boolean {
  switch (env.llmProvider) {
    case 'anthropic':
      return env.anthropic.apiKey.trim().length > 0;
    case 'gemini':
      return env.gemini.apiKey.trim().length > 0;
    default:
      return env.openai.apiKey.trim().length > 0;
  }
}