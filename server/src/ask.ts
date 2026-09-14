/**
 * Herramienta `preguntar_al_usuario` como función pura, sin dependencia del
 * SDK de Anthropic. Se expone vía endpoint HTTP (/internal/ask) para que
 * OpenCode pueda llamarla vía MCP o fetch directo.
 *
 * Bloquea la fase: el handler no resuelve hasta que llega la respuesta desde
 * la interfaz. El agente propone exactamente 3 opciones; la interfaz añade
 * una cuarta libre para que el usuario escriba lo que quiera. Al agente le
 * llega el texto elegido.
 */

export type AskRequest = {
  question: string;
  options: string[];
};

export type AskResponse = {
  answer: string;
};

/**
 * Validates an ask request payload.
 * Returns null if valid, or an error message if invalid.
 */
export function validateAskRequest(payload: unknown): string | null {
  const req = payload as AskRequest;
  if (!req || typeof req !== "object") return "Payload inválido";
  if (typeof req.question !== "string" || req.question.length < 10) {
    return "La pregunta debe tener al menos 10 caracteres";
  }
  if (!Array.isArray(req.options) || req.options.length !== 3) {
    return "Se exactamente 3 opciones";
  }
  if (
    req.options.some((o: unknown) => typeof o !== "string" || o.length === 0)
  ) {
    return "Todas las opciones deben ser strings no vacíos";
  }
  return null;
}
