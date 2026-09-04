/**
 * Event vocabulary shared by the orchestrator, the SSE endpoint and the UI.
 * Every event carries a monotonic `seq` so a reconnecting client can replay
 * from where it left off instead of restarting the stream.
 */

export type PhaseId =
  | 'product'
  | 'design'
  | 'architect'
  | 'backend'
  | 'frontend'
  | 'integration'
  | 'review'
  | 'fix'
  | 'package';

export type RunStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'stopped';

export type Base = { seq: number; ts: number };

export type ForgeEvent = Base &
  (
    | { t: 'run.start'; runId: string; idea: string; workspace: string }
    | { t: 'run.end'; status: RunStatus; costUsd: number; durationMs: number }
    | { t: 'phase.start'; phase: PhaseId; label: string; round: number }
    | {
        t: 'phase.end';
        phase: PhaseId;
        ok: boolean;
        summary: string;
        costUsd: number;
        durationMs: number;
      }
    /** Streamed assistant prose, delta by delta. */
    | { t: 'text'; phase: PhaseId; delta: string; sub: boolean }
    /** Streamed reasoning, delta by delta. */
    | { t: 'thinking'; phase: PhaseId; delta: string; sub: boolean }
    | { t: 'tool'; phase: PhaseId; id: string; name: string; summary: string; sub: boolean }
    | { t: 'file'; phase: PhaseId; path: string; action: 'write' | 'edit' }
    /** One agent delegating to another (Task tool). */
    | { t: 'consult'; phase: PhaseId; agent: string; question: string }
    /**
     * The product agent is asking a scope question, or the design agent is
     * showing a mockup screenshot and asking for feedback (`image` set, a
     * data URL). Either way it blocks the phase.
     */
    | { t: 'ask'; phase: PhaseId; id: string; question: string; options: string[]; image?: string }
    /** The user answered an `ask`. `answer` is the chosen option or free text. */
    | { t: 'answer'; phase: PhaseId; id: string; answer: string }
    | { t: 'denied'; phase: PhaseId; name: string; reason: string }
    | { t: 'review'; verdict: 'pass' | 'changes_requested'; blockers: string[]; round: number }
    /** Se acabó la cuota a mitad de fase: la ejecución espera y reintenta sola. */
    | { t: 'paused'; phase: PhaseId; reason: string; resumeAt: number | null }
    | { t: 'resumed'; phase: PhaseId }
    | { t: 'log'; level: 'info' | 'warn' | 'error'; msg: string }
  );

/** `Omit` over a union collapses to the shared keys, so distribute it explicitly. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type ForgeEventInput = DistributiveOmit<ForgeEvent, 'seq' | 'ts'>;

/**
 * Per-run pub/sub with replay. The buffer is capped; `firstSeq` lets a late
 * subscriber detect that it missed events rather than silently skipping them.
 *
 * Genérico en el tipo de evento: el pipeline emite `ForgeEvent` y la consola
 * de Claude Code su propio vocabulario (ver `console.ts`), pero el replay por
 * `seq`, el tope del búfer y la suscripción son idénticos en los dos.
 */
export class EventLog<E extends Base = ForgeEvent> {
  private events: E[] = [];
  private listeners = new Set<(e: E) => void>();
  private nextSeq: number;
  private dropped = 0;

  /**
   * `startSeq` continúa la numeración de un registro ya escrito en disco. Sin
   * él, una consola reabierta tras reiniciar el servidor volvería a emitir
   * desde 0 y el navegador mezclaría los eventos nuevos con los viejos.
   */
  constructor(
    private readonly capacity: number,
    startSeq = 0,
  ) {
    this.nextSeq = startSeq;
  }

  emit(input: DistributiveOmit<E, 'seq' | 'ts'>): E {
    const event = { ...input, seq: this.nextSeq++, ts: Date.now() } as unknown as E;
    this.events.push(event);
    if (this.events.length > this.capacity) {
      this.dropped += this.events.length - this.capacity;
      this.events = this.events.slice(-this.capacity);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* a broken subscriber must not take down the run */
      }
    }
    return event;
  }

  /** Events with `seq >= from` that are still buffered. */
  since(from: number): E[] {
    return this.events.filter((e) => e.seq >= from);
  }

  get firstSeq(): number {
    return this.dropped;
  }

  subscribe(listener: (e: E) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
