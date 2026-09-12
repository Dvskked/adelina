/**
 * Utilidades JSON para que los distintos proveedores LLM
 * devuelvan datos estructurados (extracción de memoria, resúmenes...).
 */

/**
 * Extrae un objeto JSON del texto de una respuesta LLM, tolerando:
 *  - bloques de código markdown (```json ... ```)
 *  - texto suelto alrededor del JSON (explicaciones, saludos...)
 */
export function extractJson<T = unknown>(raw: string): T {
  let text = (raw ?? '').trim();
  if (!text) throw new Error('Respuesta vacía del modelo.');

  // Quita bloques de código markdown.
  const fenced = /^```[a-zA-Z]*\s*([\s\S]*?)```$/m.exec(text);
  if (fenced) text = fenced[1].trim();

  // Si el primer carácter es '[', pero esperamos objeto, buscamos el bloque contiguo.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No se encontró un objeto JSON en la respuesta del modelo.');
  }

  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Último intento: un array de objetos.
    const arrStart = text.indexOf('[');
    const arrEnd = text.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd > arrStart) {
      return JSON.parse(text.slice(arrStart, arrEnd + 1)) as T;
    }
    throw new Error('JSON inválido en la respuesta del modelo.');
  }
}

/**
 * Normaliza una "clave" de hecho memorizado: minúsculas, sin acentos,
 * sin caracteres raros → un slug estable fácil de consultar y deduplicar.
 */
export function slugify(input: string, maxLength = 90): string {
  const slug = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);

  return slug || 'hecho';
}