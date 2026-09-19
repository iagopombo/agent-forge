/**
 * Fase 1 — Traductor de eventos OpenCode → ForgeEvent / ConsoleEvent.
 *
 * OpenCode emite eventos SSE con esta forma (types.gen.d.ts):
 *   { type: "message.part.updated", properties: { part: Part, delta?: string } }
 *   { type: "session.error", properties: { error?: ApiError } }
 *   { type: "session.status", properties: { status: SessionStatus } }
 *   etc.
 *
 * ForgeEvent (events.ts) es el vocabulario del frontend:
 *   { t: 'text', phase, delta, sub }
 *   { t: 'tool', phase, id, name, summary, sub }
 *   { t: 'file', phase, path, action }
 *   { t: 'denied', phase, name, reason }
 *   etc.
 *
 * Este módulo convierte los primeros en los segundos, uno a uno.
 */

import path from "node:path";
import type { PhaseId } from "./events.js";
import { summarizeTool } from "./guard.js";

// ─── Re-export OpenCode event types ────────────────────────────────

/**
 * Evento raw que llega del SSE de OpenCode.
 * Usamos un tipo amplio porque el SDK genera unión de muchos tipos;
 * nos interesan los campos comunes: type + properties.
 */
export type OpencodeEvent = {
  type: string;
  properties: Record<string, unknown>;
};

// ─── Auth helper ───────────────────────────────────────────────────

/**
 * Headers de autenticación HTTP Basic para el servidor OpenCode.
 * OPENCODE_SERVER_PASSWORD define si auth está habilitado.
 */
export function authHeaders(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (password) {
    const token = Buffer.from(`opencode:${password}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }
  return {};
}

// ─── OpenCode Part → ForgeEvent ────────────────────────────────────

type Part = {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: {
    status: string;
    input?: Record<string, unknown>;
    output?: string;
    title?: string;
    error?: string;
  };
  [key: string]: unknown;
};

/**
 * Convierte un `message.part.updated` de OpenCode en un array de ForgeEvents.
 * Devuelve array porque un tool part puede generar tanto `tool` como `file`.
 */
export function translatePartUpdated(
  part: Part,
  delta: string | undefined,
  phase: string,
  workspace: string
): Array<{ t: string; [key: string]: unknown }> {
  const events: Array<{ t: string; [key: string]: unknown }> = [];
  const sub = Boolean(part.messageID); // parts siempre son de mensajes del asistente

  switch (part.type) {
    case "text": {
      if (delta) {
        events.push({ t: "text", phase, delta, sub });
      }
      break;
    }

    case "reasoning": {
      if (delta) {
        events.push({ t: "thinking", phase, delta, sub });
      }
      break;
    }

    case "tool": {
      const toolName = part.tool ?? "unknown";
      const state = part.state;
      const input = state?.input ?? {};

      // Emitir evento de herramienta cuando empieza o termina
      if (state?.status === "running" || state?.status === "completed") {
        events.push({
          t: "tool",
          phase,
          id: part.callID ?? part.id,
          name: toolName,
          summary: summarizeTool(toolName, input),
          sub,
        });
      }

      // Detectar escritura/edición de archivos
      if (
        (toolName === "Write" || toolName === "Edit") &&
        typeof input.file_path === "string"
      ) {
        events.push({
          t: "file",
          phase,
          path: path
            .relative(workspace, input.file_path)
            .split(path.sep)
            .join("/"),
          action: toolName === "Write" ? "write" : "edit",
        });
      }

      // Detectar delegación a subagente (Task tool)
      if (toolName === "Task") {
        events.push({
          t: "consult",
          phase,
          agent:
            typeof input.subagent_type === "string"
              ? input.subagent_type
              : "subagente",
          question:
            typeof input.description === "string" ? input.description : "",
        });
      }

      // Si el tool fue denegado, emitir denied
      if (
        state?.status === "error" &&
        state.error?.includes("Bloqueado por Agent Forge")
      ) {
        events.push({
          t: "denied",
          phase,
          name: toolName,
          reason: state.error,
        });
      }

      break;
    }

    case "subtask": {
      // Delegación a subagente via Task tool
      events.push({
        t: "consult",
        phase,
        agent: typeof part.agent === "string" ? part.agent : "subagente",
        question: typeof part.description === "string" ? part.description : "",
      });
      break;
    }
  }

  return events;
}

// ─── Session error → classifyFailure input ─────────────────────────

/**
 * Extrae el mensaje de error de un session.error de OpenCode.
 * Devuelve null si no es un error reconocible.
 */
export function extractErrorMessage(event: OpencodeEvent): string | null {
  if (event.type !== "session.error") return null;
  const error = event.properties?.error as any;
  if (!error) return null;

  switch (error.name) {
    case "APIError":
      return error.data?.message ?? "APIError desconocido";
    case "ProviderAuthError":
      return `autenticación: ${error.data?.message ?? "credenciales inválidas"}`;
    case "MessageOutputLengthError":
      return "output limit exceeded";
    case "MessageAbortedError":
      return "message aborted";
    case "UnknownError":
      return error.data?.message ?? "error desconocido";
    default:
      return JSON.stringify(error);
  }
}

// ─── Session status → ForgeEvent ───────────────────────────────────

/**
 * Convierte session.status de OpenCode en eventos ForgeEvent.
 * Usado internamente; el orquestador decide qué hacer con idle/busy/retry.
 */
export function translateSessionStatus(event: OpencodeEvent): {
  status: "idle" | "busy" | "retry";
  retryAttempt?: number;
  retryNext?: number;
} | null {
  if (event.type !== "session.status") return null;
  const status = event.properties?.status as any;
  if (!status) return null;

  switch (status.type) {
    case "idle":
      return { status: "idle" };
    case "busy":
      return { status: "busy" };
    case "retry":
      return {
        status: "retry",
        retryAttempt: status.attempt,
        retryNext: status.next,
      };
    default:
      return null;
  }
}

// ─── Permission → denied event ─────────────────────────────────────

/**
 * Convierte permission.updated de OpenCode en un ForgeEvent denied.
 * OpenCode permission events have: { id, type, title, metadata, sessionID }
 * The metadata may contain the tool name and reason.
 */
export function translatePermissionDenied(
  event: OpencodeEvent,
  phase: string
): { t: "denied"; phase: string; name: string; reason: string } | null {
  if (event.type !== "permission.updated") return null;
  const perm = event.properties as any;
  if (!perm) return null;

  return {
    t: "denied",
    phase,
    name: perm.type ?? "unknown",
    reason: perm.title ?? "permiso denegado",
  };
}

// ─── Batch translation ─────────────────────────────────────────────

/**
 * Convierte un array de OpenCode events en ForgeEvents.
 * Filtra eventos irrelevantes para el pipeline.
 */
export function translateEvents(
  events: OpencodeEvent[],
  phase: string,
  workspace: string
): Array<{ t: string; [key: string]: unknown }> {
  const result: Array<{ t: string; [key: string]: unknown }> = [];

  for (const event of events) {
    switch (event.type) {
      case "message.part.updated": {
        const part = event.properties?.part as Part | undefined;
        const delta = event.properties?.delta as string | undefined;
        if (part)
          result.push(...translatePartUpdated(part, delta, phase, workspace));
        break;
      }
      case "session.error": {
        const msg = extractErrorMessage(event);
        if (msg) result.push({ t: "log", level: "error", msg });
        break;
      }
      case "permission.updated": {
        const denied = translatePermissionDenied(event, phase);
        if (denied) result.push(denied);
        break;
      }
      // session.status, session.idle, session.diff — ignorados aquí
      // (el orquestador los maneja directamente)
    }
  }

  return result;
}
