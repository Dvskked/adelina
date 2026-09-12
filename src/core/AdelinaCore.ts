import { env } from '../config/env';
import { MemoryManager } from '../memory/MemoryManager';
import { LlmService } from '../services/llm/LlmService';
import { buildSystemPrompt } from '../services/llm/systemPrompt';
import type { ChatMessage } from '../services/llm/types';

/** Respuesta completa de Adelina ante un mensaje. */
export interface AdelinaResponse {
  reply: string;
  sessionId: string;
  facts: unknown[];
}

/**
 * AdelinaCore
 * -----------
 * ORQUESTADOR PRINCIPAL de Adelina.
 *
 * Coordina el flujo completo de cada interacción:
 *
 *  1. Recibe el mensaje del usuario (texto transcrito o tecleado).
 *  2. Persiste el mensaje en la memoria a largo plazo.
 *  3. Construye el contexto: system prompt con personalidad + hechos
 *     memorizados + resumen episódico + historial reciente.
 *  4. Llama al LLM (OpenAI / Anthropic / Gemini, sin importar cuál).
 *  5. Guarda la respuesta y, en paralelo, extrae nuevos hechos memorables
 *     y refresca el resumen cuando toca.
 *
 * Es la única puerta de entrada al "cerebro" de Adelina: tanto la interfaz
 * web como la CLI pasan por aquí.
 */
export class AdelinaCore {
  private readonly memory: MemoryManager;
  /** Servicio LLM activo, accesible para tests y smoke (ping). */
  readonly llm: LlmService;

  constructor() {
    this.llm = new LlmService();
    this.memory = new MemoryManager(this.llm);
  }

  /** ¿Está todo configurado (claves de API)? */
  get ready(): boolean {
    return this.llm.ready;
  }

  /** Proveedor LLM activo (para logs). */
  get providerName(): string {
    return this.llm.provider.name;
  }

  /**
   * Procesa un mensaje del usuario y produce la respuesta de Adelina.
   *
   * @param sessionId identificador de la conversación (persistencia/historial).
   * @param userText  texto del usuario.
   */
  async respond(sessionId: string, userText: string): Promise<AdelinaResponse> {
    const text = (userText ?? '').trim();
    if (!text) return { reply: '', sessionId, facts: [] };

    // 1. Guardar lo que dijo él (memoria a largo plazo).
    await this.memory.addMessage(sessionId, 'user', text);

    // 2. Recuperar contexto: hechos, resumen episódico e historial reciente.
    const facts = this.memory.getFacts(env.maxFactsInPrompt);
    const summary = this.memory.getSummary(sessionId);
    const history = this.memory.getRecent(sessionId, env.maxHistory);

    // 3. System prompt con la personalidad + memoria inyectada.
    const system = buildSystemPrompt({ userName: env.userName, facts, summary });
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      ...history.map((m): ChatMessage => ({ role: m.role, content: m.content })),
    ];

    // 4. Generar la respuesta natural de Adelina.
    const reply = await this.llm.chat(messages);

    // 5. Persistir respuesta y actualizar memoria.
    await this.memory.addMessage(sessionId, 'assistant', reply);

    // Extracción de hechos y resumen son "best-effort": se ejecutan sin bloquear
    // la devolución de la respuesta (await delante pero fallos aislados dentro).
    await this.memory.extractAndStoreFacts(env.userName, text);
    await this.memory.maybeSummarize(sessionId);

    return { reply, sessionId, facts: this.memory.getFacts(env.maxFactsInPrompt) };
  }

  /** Borra la memoria (mensajes y resumen) de una sesión. */
  forgetSession(sessionId: string): void {
    this.memory.forgetSession(sessionId);
  }

  /** Hechos actualmente memorizados (sin sesión: son globales a Adelina). */
  get rememberedFacts() {
    return this.memory.getFacts();
  }

  /** Cierra los recursos (BD) — útil para tests y CI. */
  dispose(): void {
    this.memory.close();
  }
}