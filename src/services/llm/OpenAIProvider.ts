import { env } from '../../config/env';
import type { ChatMessage, GenerationResult, LlmProvider } from './types';

interface OpenAIErrorBody {
  error?: { message?: string };
}

/**
 * OpenAIProvider
 * --------------
 * Implementa `LlmProvider` contra la API de OpenAI (o cualquier endpoint
 * compatible con `/chat/completions`, p. ej. OpenRouter).
 *
 * Se usa `fetch` nativo (Node 18+) para no depender del SDK oficial.
 */
export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(
    apiKey = env.openai.apiKey,
    baseUrl = env.openai.baseUrl,
    model = env.openai.model,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generate(
    messages: ChatMessage[],
    opts: { json?: boolean } = {},
  ): Promise<GenerationResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY no configurada. Revisa tu archivo .env');
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: env.temperature,
      max_tokens: env.maxTokens,
    };
    // Modo JSON garantizado (compatible con gpt-4o y posteriores).
    if (opts.json) body.response_format = { type: 'json_object' };

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    } & OpenAIErrorBody;

    if (!res.ok) {
      throw new Error(`OpenAI (${res.status}): ${data?.error?.message ?? res.statusText}`);
    }

    return { content: data.choices?.[0]?.message?.content ?? '' };
  }

  async ping(): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    return res.ok;
  }
}