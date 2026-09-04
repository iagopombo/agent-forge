import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { CONFIG } from './config.js';
import { EventLog, type Base } from './events.js';
import { buildGuard, summarizeTool } from './guard.js';
import { PIPELINE_TOOLS, SPAWN_ENV, TOKEN_EFFICIENCY_PLUGIN_PATH } from './orchestrator.js';

/**
 * Vocabulario de la consola. Se parece al del pipeline pero no lleva `phase`:
 * aquí no hay fases, hay turnos del usuario. Comparte la forma (`seq`, `ts`) y
 * el mecanismo de replay, que es lo que `EventLog` generaliza.
 */
export type ConsoleEvent = Base &
  (
    | { t: 'user'; text: string }
    | { t: 'text'; delta: string; sub: boolean }
    | { t: 'thinking'; delta: string; sub: boolean }
    | { t: 'tool'; id: string; name: string; summary: string; sub: boolean }
    | { t: 'file'; path: string; action: 'write' | 'edit' }
    | { t: 'consult'; agent: string; question: string }
    | { t: 'denied'; name: string; reason: string }
    | { t: 'turn.start' }
    | { t: 'turn.end'; ok: boolean; costUsd: number }
    | { t: 'log'; level: 'info' | 'warn' | 'error'; msg: string }
  );

/** Modelo por defecto de la consola: el mismo caballo de batalla del pipeline. */
const CONSOLE_MODEL = 'claude-sonnet-5';

const SYSTEM_APPEND = [
  'Estás en la consola de Agent Forge, sobre el repositorio que un equipo de',
  'agentes acaba de construir. El usuario te habla directamente para seguir',
  'mejorando esta aplicación: trata cada mensaje como una petición de cambio',
  'real sobre el código que tienes en el workspace.',
  '',
  'Trabaja como en una sesión normal de Claude Code: lee antes de tocar, haz el',
  'cambio, y compruébalo (tests o build) cuando el cambio lo merezca.',
  '',
  'El repositorio lleva documentación en `docs/` escrita por los agentes que lo',
  'construyeron (brief de producto, arquitectura, contrato de API). Si tu cambio',
  'contradice algo de ahí, actualiza el documento en el mismo turno en vez de',
  'dejar la documentación mintiendo.',
].join('\n');

/**
 * Una sesión de Claude Code viva sobre el workspace de una ejecución.
 *
 * El SDK se alimenta de un generador de mensajes de usuario que no termina: eso
 * es lo que mantiene UNA sola sesión (y por tanto el contexto de la
 * conversación) entre turnos, en vez de arrancar un proceso por mensaje. El
 * proceso no se lanza hasta el primer mensaje: abrir la pestaña no debe costar
 * ni un token.
 */
export class ConsoleSession {
  readonly log: EventLog<ConsoleEvent>;
  /** Hay un turno en marcha ahora mismo. */
  busy = false;

  private readonly pending: string[] = [];
  /** Despierta al generador de entrada cuando llega un mensaje. */
  private wake: (() => void) | null = null;
  private active: Query | null = null;
  /**
   * Sube en cada interrupción. El generador de entrada compara contra la suya:
   * así el de una sesión ya cerrada no se queda vivo compitiendo por los
   * mensajes que el usuario escribe para la sesión nueva.
   */
  private gen = 0;
  private closed = false;
  private readonly stream: fs.WriteStream;

  constructor(
    readonly runId: string,
    readonly workspace: string,
    startSeq: number,
  ) {
    this.log = new EventLog<ConsoleEvent>(CONFIG.eventBufferSize, startSeq);
    this.stream = fs.createWriteStream(consolePath(runId), { flags: 'a' });
    this.log.subscribe((event) => this.stream.write(`${JSON.stringify(event)}\n`));
  }

  send(text: string): void {
    if (this.closed) return;
    this.log.emit({ t: 'user', text });
    this.pending.push(text);
    this.wake?.();
    if (!this.active) void this.open();
  }

  /**
   * Corta el turno en curso cerrando el proceso del SDK. La conversación
   * anterior se pierde (el proceso era quien la sostenía), así que el siguiente
   * mensaje abre una sesión nueva; el transcript en pantalla no se toca.
   */
  interrupt(): void {
    if (!this.active) return;
    this.gen += 1;
    this.active.close();
    this.active = null;
    this.busy = false;
    this.pending.length = 0;
    this.wake?.();
    this.log.emit({
      t: 'log',
      level: 'warn',
      msg: 'Turno interrumpido. El siguiente mensaje empieza una sesión nueva, sin memoria de la anterior.',
    });
    this.log.emit({ t: 'turn.end', ok: false, costUsd: 0 });
  }

  close(): void {
    this.closed = true;
    this.active?.close();
    this.active = null;
    this.wake?.();
    this.stream.end();
  }

  /** Mensajes del usuario, uno por turno, sin cerrar nunca por su cuenta. */
  private async *input(gen: number): AsyncGenerator<SDKUserMessage> {
    while (!this.closed && this.gen === gen) {
      if (this.pending.length === 0) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
        });
        this.wake = null;
        continue;
      }
      const text = this.pending.shift()!;
      this.busy = true;
      this.log.emit({ t: 'turn.start' });
      yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null };
    }
  }

  private async open(): Promise<void> {
    const options: Options = {
      cwd: this.workspace,
      model: CONFIG.model ?? CONSOLE_MODEL,
      effort: 'high',
      permissionMode: 'default',
      canUseTool: buildGuard(this.workspace, (name, reason) =>
        this.log.emit({ t: 'denied', name, reason }),
      ),
      // Mismo aislamiento que las fases: ver SPAWN_ENV/PIPELINE_TOOLS en el
      // orquestador. La consola no es más de fiar que un agente por estar
      // pilotada por el usuario — corre en la misma máquina y con la misma cuenta.
      env: SPAWN_ENV,
      tools: PIPELINE_TOOLS,
      thinking: { type: 'adaptive', display: 'summarized' },
      settingSources: [],
      persistSession: false,
      includePartialMessages: true,
      forwardSubagentText: true,
      plugins: [{ type: 'local', path: TOKEN_EFFICIENCY_PLUGIN_PATH }],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: SYSTEM_APPEND,
        excludeDynamicSections: true,
      },
      stderr: (data) => {
        const msg = data.trim();
        if (msg) this.log.emit({ t: 'log', level: 'warn', msg: msg.slice(0, 500) });
      },
    };

    const session = query({ prompt: this.input(this.gen), options });
    this.active = session;

    try {
      for await (const message of session) {
        this.consume(message);
        if (message.type === 'result') {
          this.busy = false;
          this.log.emit({
            t: 'turn.end',
            ok: message.subtype === 'success' && !message.is_error,
            costUsd: message.total_cost_usd ?? 0,
          });
        }
      }
    } catch (err) {
      // `interrupt()` cierra el proceso a propósito: eso llega aquí como error
      // y ya se ha informado al usuario, así que no se repite.
      if (this.active === session) {
        this.log.emit({
          t: 'log',
          level: 'error',
          msg: err instanceof Error ? err.message : String(err),
        });
        this.log.emit({ t: 'turn.end', ok: false, costUsd: 0 });
      }
    } finally {
      this.busy = false;
      if (this.active === session) this.active = null;
    }
  }

  private consume(message: SDKMessage): void {
    if (message.type === 'stream_event') {
      const sub = message.parent_tool_use_id !== null;
      const event = message.event;
      if (event.type !== 'content_block_delta') return;
      const delta = event.delta;
      if (delta.type === 'text_delta' && delta.text) {
        this.log.emit({ t: 'text', delta: delta.text, sub });
      } else if (delta.type === 'thinking_delta' && delta.thinking) {
        this.log.emit({ t: 'thinking', delta: delta.thinking, sub });
      }
      return;
    }

    if (message.type !== 'assistant') return;

    const sub = message.parent_tool_use_id !== null;
    for (const block of message.message.content) {
      if (block.type !== 'tool_use') continue;
      const input = (block.input ?? {}) as Record<string, unknown>;

      this.log.emit({
        t: 'tool',
        id: block.id,
        name: block.name,
        summary: summarizeTool(block.name, input),
        sub,
      });

      if (block.name === 'Write' || block.name === 'Edit') {
        const file = input.file_path;
        if (typeof file === 'string') {
          this.log.emit({
            t: 'file',
            path: path.relative(this.workspace, file).split(path.sep).join('/'),
            action: block.name === 'Write' ? 'write' : 'edit',
          });
        }
      }

      if (block.name === 'Task') {
        this.log.emit({
          t: 'consult',
          agent: typeof input.subagent_type === 'string' ? input.subagent_type : 'subagente',
          question: typeof input.description === 'string' ? input.description : '',
        });
      }
    }
  }
}

function consolePath(runId: string): string {
  return path.join(CONFIG.runsRoot, `${runId}.console.jsonl`);
}

/** Transcript ya escrito en disco, para reproducirlo al abrir la pestaña. */
export async function replayConsole(runId: string, from: number): Promise<ConsoleEvent[]> {
  try {
    const raw = await fsp.readFile(consolePath(runId), 'utf8');
    return raw
      .split('\n')
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
        t: 'log',
        level: 'info',
        msg: 'Consola reabierta. Lo de arriba es el historial en disco: la sesión nueva no lo recuerda.',
      });
    }
    return session;
  }
}

export const consoles = new ConsoleStore();
