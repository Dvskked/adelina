import { env } from '../../config/env';
import { extractJson } from '../../utils/json';
import { AnthropicProvider } from './AnthropicProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenAIProvider } from './OpenAIProvider';
import type { ChatMessage, LlmProvider } from './types';

/**
 * LlmService
 * ----------
 * Fachada (facade) sobre el proveedor de LLM activo.
 * Expone dos operaciones de alto nivel:
 *  - `chat(mensajes)`          → texto libre como respuesta de Adelina.
 *  - `json(mensajes)`          → pide y parsea JSON estructurado (memoria).
 */
export class LlmService {
  readonly provider: LlmProvider;

  constructor() {
    switch (env.llmProvider) {
      case 'anthropic':
        this.provider = new AnthropicProvider();
        break;
      case 'gemini':
        this.provider = new GeminiProvider();
        break;
      case 'openai':
      default:
        this.provider = new OpenAIProvider();
        break;
    }
  }

  /** Generación de texto libre. */
  async chat(messages: ChatMessage[]): Promise<string> {
    const result = await this.provider.generate(messages);
    return result.content.trim();
  }

  /** Generación con salida JSON garantizada y parseada. */
  async json<T = unknown>(messages: ChatMessage[]): Promise<T> {
    const result = await this.provider.generate(messages, { json: true });
    return extractJson<T>(result.content);
  }

  /** ¿Está configurado el proveedor (hay credenciales)? */
  get ready(): boolean {
    switch (env.llmProvider) {
      case 'anthropic':
        return env.anthropic.apiKey.trim().length > 0;
      case 'gemini':
        return env.gemini.apiKey.trim().length > 0;
      default:
        return env.openai.apiKey.trim().length > 0;
    }
  }
}