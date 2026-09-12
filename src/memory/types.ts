/**
 * Tipos del sistema de memoria de Adelina.
 *
 * Dos niveles de memoria:
 *  - Corto plazo  → historial reciente de la conversación activa (contexto del LLM).
 *  - Largo plazo  → mensajes, hechos sobre el usuario y resúmenes, persistidos en SQLite.
 */

/** Roles de mensaje admitidos en el historial. */
export type MemoryRole = 'user' | 'assistant';

/** Un mensaje del historial, tal como se guarda en la base de datos. */
export interface MemoryMessage {
  id?: number;
  sessionId: string;
  content: string;
  role: MemoryRole;
  createdAt: number;
}

/**
 * Categorías de hechos memorizados sobre el usuario.
 * Mantenerlas acotadas facilita consultas futuras (p. ej. "qué gustos tiene Andrés").
 */
export type FactCategory =
  | 'gusto'
  | 'persona'
  | 'evento'
  | 'salud'
  | 'trabajo'
  | 'proyecto'
  | 'emocion'
  | 'preferencia'
  | 'otro';

export const FACT_CATEGORIES: FactCategory[] = [
  'gusto',
  'persona',
  'evento',
  'salud',
  'trabajo',
  'proyecto',
  'emocion',
  'preferencia',
  'otro',
];

/** Un hecho memorizado a largo plazo. */
export interface MemoryFact {
  /** Clave semántica única (slug), evita duplicados. */
  key: string;
  /** Valor del hecho en lenguaje natural. */
  value: string;
  category: FactCategory;
  /** Confianza 0-1 según la fuerza de la evidencia. */
  confidence: number;
  /** Veces que Andrés lo ha mencionado (refuerzo). */
  occurrences: number;
  createdAt: number;
  updatedAt: number;
}

/** Forma típica devuelta por la extracción del LLM. */
export interface ExtractedFact {
  key: string;
  value: string;
  category: FactCategory;
}

/** Resumen acumulado de una sesión (memoria episódica). */
export interface ConversationSummary {
  sessionId: string;
  content: string;
  createdAt: number;
}