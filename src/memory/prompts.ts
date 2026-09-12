import type { FactCategory, MemoryFact, MemoryMessage } from './types';

/**
 * Prompts del sistema de memoria.
 * Se usan para:
 *  1) extraer hechos memorables de lo que dice Andrés,
 *  2) generar/actualizar el resumen episódico de la conversación.
 */
export const FACT_EXTRACTION_SYSTEM_PROMPT = `
Eres el "módulo de memoria a largo plazo" de Adelina, una compañera virtual.
Tu única tarea es leer lo que dice el usuario y decidir qué hechos merecen ser recordados en el futuro.

Reglas:
- Solo memoriza hechos RELEVANTES, DURADEROS y verificables: gustos, preferencias, personas de su vida, eventos importantes, metas y proyectos, detalles de su día a día, emociones recurrentes, datos personales.
- NO memorices: saludos, cortesías, preguntas al azar, ruido conversacional ni información trivial caduca en minutos.
- La clave (key) debe ser corta, descriptiva y en minúsculas con guiones (slug), ej: "trabajo-proyecto-x", "gusto-cafe", "hermana-maria".
- El valor (value) en una frase natural en español.
- Categorías permitidas (category): ${[
  'gusto',
  'persona',
  'evento',
  'salud',
  'trabajo',
  'proyecto',
  'emocion',
  'preferencia',
  'otro',
].join(', ')}

Responde ÚNICAMENTE con un objeto JSON válido en este formato exacto:
{"facts":[{"key":"...","value":"...","category":"..."}]}
Si no hay nada relevante que memorizar: {"facts":[]}
`;

/** Plantilla de la pregunta de extracción concreta. */
export const factExtractionUserPrompt = (userName: string, userText: string): string => `
Mensaje de ${userName}: "${userText}"
Extrae los hechos memorables (o ninguno). Recuerda: solo JSON.
`;

export const SUMMARY_SYSTEM_PROMPT = `
Eres el "módulo de memoria episódica" de Adelina.
Reescribes un resumen acumulado de la conversación con el usuario para que Adelina
pueda continuar el hilo aunque el historial completo ya no entre en el contexto.

El resumen debe ser:
- En español, conciso pero con suficiente detalle (puntos clave, decisiones, eventos, emociones, pendientes).
- En tercera persona, referido al usuario y a lo compartido.
- No inventar hechos: solo sintetizar lo aportado.
- Si el resumen anterior existe, fúndelo con los mensajes nuevos (actualiza, no dupliques).
- Máximo 350 palabras.
`;

/** Plantilla para la pregunta de resumen concreta. */
export const summaryUserPrompt = (
  previousSummary: string | null,
  recentMessages: MemoryMessage[],
): string => {
  const conversation = recentMessages
    .map((m) => `${m.role === 'user' ? 'USUARIO' : 'ADELINA'}: ${m.content}`)
    .join('\n\n');

  return `
Resumen previo (si existe):
${previousSummary ?? '  (ninguno)'}

Nuevos mensajes de la conversación:
${conversation}

Genera el resumen ACTUALIZADO completo (absorbe el resumen previo si lo hubiera).
Solo el texto del resumen, sin etiquetas ni preámbulos.
`;
};

/**
 * Devuelve una categoría válida, cayendo a 'otro' si el modelo
 * devuelve algo fuera del conjunto permitido.
 */
export function sanitizeCategory(value: unknown): FactCategory {
  const allowed = new Set<FactCategory>([
    'gusto',
    'persona',
    'evento',
    'salud',
    'trabajo',
    'proyecto',
    'emocion',
    'preferencia',
    'otro',
  ]);
  return allowed.has(value as FactCategory) ? (value as FactCategory) : 'otro';
}