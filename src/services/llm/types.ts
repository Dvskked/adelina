/**
 * Definiciones comunes del motor conversacional.
 * Cada proveedor (OpenAI, Anthropic, Gemini) implementa `LlmProvider`.
 */
export type ChatRole = 'system' | 'user' | 'assistant';

/** Mensaje canónico del chat, independiente del proveedor. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Resultado genérico de una generación. */
export interface GenerationResult {
  content: string;
}

/**
 * Contrato que todo proveedor LLM debe cumplir.
 * Implementado mediante `fetch` nativo (Node 18+), sin SDKs, manteniendo
 * la base de dependencias mínima y portable.
 */
export interface LlmProvider {
  /** Nombre del proveedor para logs. */
  readonly name: string;

  /**
   * Genera una respuesta de texto.
   * @param messages  lista de mensajes (incluido el `system`).
   * @param opts.json si es true, el modelo debe devolver JSON válido.
   */
  generate(messages: ChatMessage[], opts?: { json?: boolean }): Promise<GenerationResult>;

  /** Test rápido de conectividad (usado en el smoke test). */
  ping(): Promise<boolean>;
}