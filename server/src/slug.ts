/**
 * Identificador legible de un proyecto, derivado de la idea. Nombra la carpeta
 * del workspace y agrupa los intentos de un mismo proyecto en el historial.
 *
 * La misma idea da siempre el mismo slug, así que retomar o reanudar reutiliza
 * la carpeta sin cálculo extra. Si la idea empieza por un nombre propio seguido
 * de dos puntos o guion ("Aforo: …", "Tarea — …") se usa ese nombre; si no, las
 * primeras palabras.
 */
export function projectSlug(idea: string): string {
  const trimmed = idea.trim();
  const named = trimmed.match(/^([\p{L}][\p{L}0-9]{1,30})\s*[:—-]\s/u);
  const source = named?.[1] ?? trimmed.split(/\s+/).slice(0, 5).join(' ');
  const slug = source
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'proyecto';
}
