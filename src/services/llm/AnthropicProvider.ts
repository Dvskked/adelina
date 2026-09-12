import { env } from '../../config/env';
import type { ChatMessage, GenerationResult, LlmProvider } from './types';

interface AnthropicErrorBody {
  error?: { message?: string };
}

/**
 * AnthropicProvider
 * -----------------
 * Implementa `LlmProvider` contra la API de Messages de Anthropic (Claude).
 * La API separa el mensaje `system` del resto, así que aquí se extrae.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey = env.anthropic.apiKey, model = env.anthropic.model) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(
    messages: ChatMessage[],
    opts: { json?: boolean } = {},
  ): Promise<GenerationResult> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY no configurada. Revisa tu archivo .env');
    }

    // Anthropic usa el campo `system` fuera de `messages`.
    const systemText = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const rest = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: env.maxTokens,
      temperature: env.temperature,
      messages: rest,
    };
    if (systemText) body.system = systemText;
    if (opts.json) {
      // Claude no tiene response_format; se refuerza vía instrucción.
      body.messages = [
        ...(rest as { role: string; content: string }[]),
        { role: 'user', content: 'Responde únicamente con JSON válido, sin texto adicional.' },
      ];
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    } & AnthropicErrorBody;

    if (!res.ok) {
      throw new Error(`Anthropic (${res.status}): ${data?.error?.message ?? res.statusText}`);
    }

    const text = (data.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');

    return { content: text };
  }

  async ping(): Promise<boolean> {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
    });
    return res.ok;
  }
}