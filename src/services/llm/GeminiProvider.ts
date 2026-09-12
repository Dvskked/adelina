import { env } from '../../config/env';
import type { ChatMessage, GenerationResult, LlmProvider } from './types';

interface GeminiErrorBody {
  error?: { message?: string };
}

/**
 * GeminiProvider
 * --------------
 * Implementa `LlmProvider` contra la API generativa de Google (Gemini),
 * usando el endpoint REST v1beta mediante `fetch` nativo (sin SDK).
 *
 * Gemini usa `contents` con roles 'user'/'model'; el system prompt
 * va en `systemInstruction`.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';

  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey = env.gemini.apiKey, model = env.gemini.model) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(
    messages: ChatMessage[],
    opts: { json?: boolean } = {},
  ): Promise<GenerationResult> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY no configurada. Revisa tu archivo .env');
    }

    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const generationConfig: Record<string, unknown> = {
      temperature: env.temperature,
      maxOutputTokens: env.maxTokens,
    };
    if (opts.json) generationConfig.responseMimeType = 'application/json';

    const body: Record<string, unknown> = {
      contents,
      generationConfig,
    };
    if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    } & GeminiErrorBody;

    if (!res.ok) {
      throw new Error(`Gemini (${res.status}): ${data?.error?.message ?? res.statusText}`);
    }

    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return { content: text };
  }

  async ping(): Promise<boolean> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${this.apiKey}`;
    const res = await fetch(url);
    return res.ok;
  }
}