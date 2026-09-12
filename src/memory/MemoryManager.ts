import { env } from '../config/env';
import { slugify, extractJson } from '../utils/json';
import { SqliteStore } from './storage/SqliteStore';
import {
  factExtractionUserPrompt,
  FACT_EXTRACTION_SYSTEM_PROMPT,
  sanitizeCategory,
  summaryUserPrompt,
  SUMMARY_SYSTEM_PROMPT,
} from './prompts';
import type { ExtractedFact, FactCategory, MemoryFact, MemoryMessage } from './types';
import type { LlmService } from '../services/llm/LlmService';

interface RawExtraction {
  facts?: Array<{ key?: string; value?: string; category?: string }>;
}

/**
 * MemoryManager
 * -------------
 * Orquestador del sistema de memoria de Adelina.
 *
 * Combina:
 *  - MEMORIA A CORTO PLAZO: recupera la ventana reciente de la sesión
 *    (la conversación activa que se inyecta en el prompt del LLM).
 *  - MEMORIA A LARGO PLAZO: persiste cada mensaje en SQLite, extrae
 *    hechos relevantes de lo que dice el usuario y mantiene un resumen
 *    episódico por conversación.
 *
 * Las heurísticas (cada cuántos mensajes resume, qué hechos guarda)
 * están controladas por variables de entorno (ver `src/config/env.ts`).
 */
export class MemoryManager {
  private readonly store: SqliteStore;
  private readonly llm: LlmService;

  constructor(llm: LlmService) {
    this.llm = llm;
    this.store = new SqliteStore();
  }

  // ------------------------------------------------------------------
  // Corto plazo: historial activo
  // ------------------------------------------------------------------

  /** Persiste un mensaje en el historial a largo plazo. */
  addMessage(sessionId: string, role: MemoryMessage['role'], content: string): void {
    this.store.addMessage(sessionId, role, content);
  }

  /** Últimos N mensajes de la sesión (contexto inmediato para el LLM). */
  getRecent(sessionId: string, limit = env.maxHistory): MemoryMessage[] {
    return this.store.getMessages(sessionId, limit);
  }

  /** Historial completo de la sesión (úsalo con cuidado, puede ser largo). */
  getFullHistory(sessionId: string): MemoryMessage[] {
    return this.store.getAllMessages(sessionId);
  }

  // ------------------------------------------------------------------
  // Largo plazo: hechos semánticos
  // ------------------------------------------------------------------

  getFacts(limit = env.maxFactsInPrompt): MemoryFact[] {
    return this.store.getFacts(limit * 3);
  }

  /** Resumen episódico de la sesión, si existe. */
  getSummary(sessionId: string): string | null {
    return this.store.getSummary(sessionId);
  }

  /**
   * Pide al LLM extraer hechos memorables del mensaje del usuario
   * y los guarda (o refuerza) en la base de datos.
   * Si el modelo falla, no se rompe la conversación: se ignora (catch interno).
   */
  async extractAndStoreFacts(userName: string, userText: string): Promise<void> {
    try {
      const parsed = await this.llm.json<RawExtraction>([
        { role: 'system', content: FACT_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: factExtractionUserPrompt(userName, userText) },
      ]);

      const facts = Array.isArray(parsed?.facts) ? parsed!.facts : [];
      for (const raw of facts) {
        const key = slugify(raw?.key ?? '');
        const value = (raw?.value ?? '').trim();
        if (!key || !value) continue;

        this.store.upsertFact({
          key,
          value,
          category: sanitizeCategory(raw.category) as FactCategory,
          confidence: 0.8,
        });
      }
    } catch (err) {
      // La extracción es "best-effort": nunca debe cortar la conversación.
      console.warn(`[memoria] no se pudieron extraer hechos: ${(err as Error).message}`);
    }
  }

  /**
   * Cada `SUMMARIZE_EVERY` mensajes, regenera el resumen episódico
   * de la sesión fusionando el resumen anterior con los mensajes recientes.
   */
  async maybeSummarize(sessionId: string): Promise<void> {
    const count = this.store.countMessages(sessionId);
    if (count < env.summarizeEvery || count % env.summarizeEvery !== 0) return;

    try {
      const recent = this.store.getMessages(sessionId, env.summarizeEvery + env.maxHistory);
      if (recent.length < 2) return;

      const previous = this.store.getSummary(sessionId);
      const summary = await this.llm.chat([
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: summaryUserPrompt(previous, recent) },
      ]);

      const clean = summary.split('\n').filter((l) => !/^(resumen|síntesis):/i.test(l)).join('\n').trim();
      if (clean) this.store.upsertSummary(sessionId, clean);
    } catch (err) {
      console.warn(`[memoria] no se pudo resumir: ${(err as Error).message}`);
    }
  }

  /** Borra los mensajes y el resumen de una sesión. */
  forgetSession(sessionId: string): void {
    this.store.forgetSession(sessionId);
  }

  /** True si existe al menos un hecho memorizado. */
  hasFacts(): boolean {
    return this.store.getFacts(1).length > 0;
  }

  close(): void {
    this.store.close();
  }
}