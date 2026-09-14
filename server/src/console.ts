import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./config.js";
import { EventLog, type Base } from "./events.js";
import {
  createSession,
  deleteSession,
  promptAsync,
  subscribeEvents,
  abortSession,
  type OpencodeSession,
} from "./opencode.js";
import {
  translatePartUpdated,
  extractErrorMessage,
  translateSessionStatus,
  authHeaders,
} from "./translate.js";
import { summarizeTool } from "./guard.js";

/**
 * Vocabulario de la consola. Se parece al del pipeline pero no lleva `phase`:
 * aquí no hay fases, hay turnos del usuario. Comparte la forma (`seq`, `ts`) y
 * el mecanismo de replay, que es lo que `EventLog` generaliza.
 */
export type ConsoleEvent = Base &
  (
    | { t: "user"; text: string }
    | { t: "text"; delta: string; sub: boolean }
    | { t: "thinking"; delta: string; sub: boolean }
    | { t: "tool"; id: string; name: string; summary: string; sub: boolean }
    | { t: "file"; path: string; action: "write" | "edit" }
    | { t: "consult"; agent: string; question: string }
    | { t: "denied"; name: string; reason: string }
    | { t: "turn.start" }
    | { t: "turn.end"; ok: boolean; costUsd: number }
    | { t: "log"; level: "info" | "warn" | "error"; msg: string }
  );

/** Modelo por defecto de la consola. */
const CONSOLE_MODEL = "claude-sonnet-5";

const SYSTEM_APPEND = [
  "Estás en la consola de Agent Forge, sobre el repositorio que un equipo de",
  "agentes acaba de construir. El usuario te habla directamente para seguir",
  "mejorando esta aplicación: trata cada mensaje como una petición de cambio",
  "real sobre el código que tienes en el workspace.",
  "",
  "Trabaja como en una sesión normal de Claude Code: lee antes de tocar, haz el",
  "cambio, y compruébalo (tests o build) cuando el cambio lo merezca.",
  "",
  "El repositorio lleva documentación en `docs/` escrita por los agentes que lo",
  "construyeron (brief de producto, arquitectura, contrato de API). Si tu cambio",
  "contradice algo de ahí, actualiza el documento en el mismo turno en vez de",
  "dejar la documentación mintiendo.",
].join("\n");

/**
 * Una sesión de OpenCode viva sobre el workspace de una ejecución.
 *
 * OpenCode mantiene el contexto entre turnos usando la misma sesión.
 * La sesión se crea bajo demanda (primer mensaje) y se destruye al cerrar.
 */
export class ConsoleSession {
  readonly log: EventLog<ConsoleEvent>;
  /** Hay un turno en marcha ahora mismo. */
  busy = false;

  private session: OpencodeSession | null = null;
  private closed = false;
  private readonly stream: fs.WriteStream;
  private abortController: AbortController | null = null;

  constructor(
    readonly runId: string,
    readonly workspace: string,
    startSeq: number
  ) {
    this.log = new EventLog<ConsoleEvent>(CONFIG.eventBufferSize, startSeq);
    this.stream = fs.createWriteStream(consolePath(runId), { flags: "a" });
    this.log.subscribe((event) =>
      this.stream.write(`${JSON.stringify(event)}\n`)
    );
  }

  async send(text: string): Promise<void> {
    if (this.closed) return;
    this.log.emit({ t: "user", text });
    this.busy = true;
    this.log.emit({ t: "turn.start" });

    // Crear sesión si no existe
    if (!this.session) {
      try {
        this.session = await createSession(
          this.workspace,
          `console-${this.runId}`
        );
      } catch (err) {
        this.log.emit({
          t: "log",
          level: "error",
          msg: `No se pudo crear sesión: ${err instanceof Error ? err.message : String(err)}`,
        });
        this.log.emit({ t: "turn.end", ok: false, costUsd: 0 });
        this.busy = false;
        return;
      }
    }

    // Preparar prompt con contexto del sistema
    const fullPrompt = `${SYSTEM_APPEND}\n\n---\n\n${text}`;

    // Suscribirse a eventos SSE
    let resolved = false;
    const completionPromise = new Promise<void>((resolve) => {
      const unsub = subscribeEvents(this.session!.id, (event) => {
        if (resolved) return;

        if (event.type === "session.error") {
          const msg = extractErrorMessage(event);
          if (msg) {
            this.log.emit({ t: "log", level: "error", msg });
          }
          resolved = true;
          unsub();
          resolve();
          return;
        }

        if (event.type === "message.part.updated") {
          const part = event.properties?.part as any;
          const delta = event.properties?.delta as string | undefined;
          if (part) {
            const translated = translatePartUpdated(
              part,
              delta,
              "console",
              this.workspace
            );
            for (const e of translated) {
              // Adaptar eventos de consola (sin phase)
              if ("phase" in e) {
                const { phase: _, ...rest } = e as any;
                this.log.emit(rest);
              } else {
                this.log.emit(e as any);
              }
            }
          }
        }

        if (event.type === "session.status") {
          const status = translateSessionStatus(event);
          if (status?.status === "idle") {
            resolved = true;
            unsub();
            resolve();
          }
        }
      });

      // Guardar abort controller para interrupciones
      this.abortController = new AbortController();
      this.abortController.signal.addEventListener(
        "abort",
        () => {
          unsub();
          resolved = true;
          resolve();
        },
        { once: true }
      );
    });

    // Enviar prompt
    try {
      await promptAsync(this.session.id, fullPrompt, {
        model: CONFIG.model ?? CONSOLE_MODEL,
      });
    } catch (err) {
      if (!resolved) {
        this.log.emit({
          t: "log",
          level: "error",
          msg: `Error al enviar: ${err instanceof Error ? err.message : String(err)}`,
        });
        this.log.emit({ t: "turn.end", ok: false, costUsd: 0 });
        this.busy = false;
        return;
      }
    }

    // Esperar a que termine
    await completionPromise;

    // Obtener costo de la sesión
    let costUsd = 0;
    try {
      const resp = await fetch(
        `${(await import("./opencode.js")).opencodeBaseUrl()}/session/${this.session.id}/message`,
        { headers: authHeaders() }
      );
      if (resp.ok) {
        const msgs = (await resp.json()) as Array<{ info: any }>;
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i];
          if (msg?.info?.role === "assistant") {
            costUsd = msg.info.cost ?? 0;
            break;
          }
        }
      }
    } catch {
      // Ignorar errores al obtener costo
    }

    this.busy = false;
    this.log.emit({ t: "turn.end", ok: true, costUsd });
  }

  interrupt(): void {
    if (!this.busy) return;
    this.abortController?.abort();
    this.abortController = null;
    this.busy = false;
    this.log.emit({
      t: "log",
      level: "warn",
      msg: "Turno interrumpido. La sesión se mantiene para el siguiente turno.",
    });
    this.log.emit({ t: "turn.end", ok: false, costUsd: 0 });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.abortController?.abort();
    this.abortController = null;
    if (this.session) {
      await deleteSession(this.session.id).catch(() => {});
      this.session = null;
    }
    this.stream.end();
  }
}

function consolePath(runId: string): string {
  return path.join(CONFIG.runsRoot, `${runId}.console.jsonl`);
}

/** Transcript ya escrito en disco, para reproducirlo al abrir la pestaña. */
export async function replayConsole(
  runId: string,
  from: number
): Promise<ConsoleEvent[]> {
  try {
    const raw = await fsp.readFile(consolePath(runId), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ConsoleEvent)
      .filter((e) => e.seq >= from);
  } catch {
    return [];
  }
}

class ConsoleStore {
  private readonly sessions = new Map<string, ConsoleSession>();

  get(runId: string): ConsoleSession | undefined {
    return this.sessions.get(runId);
  }

  /**
   * La sesión de un run, creándola si hace falta. Crear no lanza ningún
   * proceso: eso pasa en el primer `send()`.
   */
  async open(runId: string, workspace: string): Promise<ConsoleSession> {
    const existing = this.sessions.get(runId);
    if (existing) return existing;

    const prior = await replayConsole(runId, 0);
    const startSeq = prior.length > 0 ? prior[prior.length - 1]!.seq + 1 : 0;
    const session = new ConsoleSession(runId, workspace, startSeq);
    this.sessions.set(runId, session);
    if (prior.length > 0) {
      session.log.emit({
        t: "log",
        level: "info",
        msg: "Consola reabierta. Lo de arriba es el historial en disco: la sesión nueva no lo recuerda.",
      });
    }
    return session;
  }
}

export const consoles = new ConsoleStore();
