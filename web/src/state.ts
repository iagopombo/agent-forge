import { PHASE_LABELS, PHASE_ORDER, type ForgeEvent, type PhaseId, type RunStatus } from './types';

export type Block =
  | { kind: 'text'; text: string; sub: boolean }
  | { kind: 'thinking'; text: string; sub: boolean }
  | { kind: 'tool'; name: string; summary: string; sub: boolean }
  | { kind: 'consult'; agent: string; question: string }
  | { kind: 'ask'; question: string; options: string[]; image?: string; answer?: string }
  | { kind: 'denied'; name: string; reason: string };

export type PhaseState = {
  id: PhaseId;
  label: string;
  status: 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'stopped';
  blocks: Block[];
  summary: string;
  costUsd: number;
  durationMs: number;
  round: number;
  toolCount: number;
  startedAt: number;
};

export type ReviewState = { verdict: 'pass' | 'changes_requested'; blockers: string[]; round: number };

export type PendingAsk = { id: string; phase: PhaseId; question: string; options: string[]; image?: string };

export type PauseInfo = { phase: PhaseId; reason: string; resumeAt: number | null };

export type RunState = {
  runId: string | null;
  idea: string;
  workspace: string;
  status: RunStatus;
  costUsd: number;
  startedAt: number;
  endedAt: number;
  phases: Record<PhaseId, PhaseState>;
  /** Most recent write wins, so the list doubles as "what has been touched". */
  files: Map<string, { phase: PhaseId; action: 'write' | 'edit'; ts: number }>;
  logs: Array<{ level: 'info' | 'warn' | 'error'; msg: string; ts: number }>;
  reviews: ReviewState[];
  /** Pregunta del agente esperando respuesta, o null. Una a la vez. */
  pendingAsk: PendingAsk | null;
  /** Información de la pausa por falta de cuota, mientras dura. */
  pause: PauseInfo | null;
  lastSeq: number;
};

function emptyPhase(id: PhaseId): PhaseState {
  return {
    id,
    label: PHASE_LABELS[id],
    status: 'pending',
    blocks: [],
    summary: '',
    costUsd: 0,
    durationMs: 0,
    round: 0,
    toolCount: 0,
    startedAt: 0,
  };
}

export function initialRunState(): RunState {
  const phases = {} as Record<PhaseId, PhaseState>;
  for (const id of PHASE_ORDER) phases[id] = emptyPhase(id);
  return {
    runId: null,
    idea: '',
    workspace: '',
    status: 'queued',
    costUsd: 0,
    startedAt: 0,
    endedAt: 0,
    phases,
    files: new Map(),
    logs: [],
    reviews: [],
    pendingAsk: null,
    pause: null,
    lastSeq: -1,
  };
}

/** Appends a prose delta, merging into the trailing block when it is the same kind. */
function pushDelta(blocks: Block[], kind: 'text' | 'thinking', text: string, sub: boolean): void {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === kind && last.sub === sub) {
    last.text += text;
    return;
  }
  blocks.push({ kind, text, sub });
}

/**
 * Applies a batch of events in place and returns a new top-level object, so
 * React re-renders once per flush rather than once per event.
 */
export function applyEvents(state: RunState, events: ForgeEvent[]): RunState {
  const phases = { ...state.phases };
  const files = new Map(state.files);
  let { runId, idea, workspace, status, costUsd, startedAt, endedAt, lastSeq } = state;
  let logs = state.logs;
  let reviews = state.reviews;
  let pendingAsk = state.pendingAsk;
  let pause = state.pause;

  const touch = (id: PhaseId): PhaseState => {
    const next = { ...phases[id], blocks: [...phases[id].blocks] };
    phases[id] = next;
    return next;
  };

  for (const event of events) {
    if (event.seq <= lastSeq) continue;
    lastSeq = event.seq;

    switch (event.t) {
      case 'run.start':
        runId = event.runId;
        idea = event.idea;
        workspace = event.workspace;
        status = 'running';
        startedAt = event.ts;
        break;

      case 'run.end': {
        status = event.status;
        costUsd = event.costUsd;
        endedAt = event.ts;
        pause = null;
        // An interrupted phase never emits phase.end, so without this it keeps
        // rendering as "trabajando…"/"pausada" on a run whose header already
        // says detenida.
        if (event.status !== 'done') {
          for (const id of PHASE_ORDER) {
            if (phases[id].status === 'running' || phases[id].status === 'paused') {
              touch(id).status = 'stopped';
            }
          }
        }
        break;
      }

      case 'phase.start': {
        const phase = touch(event.phase);
        phase.status = 'running';
        phase.round = event.round;
        phase.startedAt = event.ts;
        // A second pass over the same phase (fix -> review) continues the transcript
        // with a visible separator rather than wiping the earlier round.
        if (phase.blocks.length > 0) {
          phase.blocks.push({ kind: 'text', text: `\n\n— ronda ${event.round} —\n\n`, sub: false });
        }
        break;
      }

      case 'phase.end': {
        const phase = touch(event.phase);
        phase.status = event.ok ? 'done' : 'failed';
        phase.summary = event.summary;
        phase.costUsd += event.costUsd;
        phase.durationMs += event.durationMs;
        costUsd += event.costUsd;
        break;
      }

      case 'text':
        pushDelta(touch(event.phase).blocks, 'text', event.delta, event.sub);
        break;

      case 'thinking':
        pushDelta(touch(event.phase).blocks, 'thinking', event.delta, event.sub);
        break;

      case 'tool': {
        const phase = touch(event.phase);
        phase.blocks.push({ kind: 'tool', name: event.name, summary: event.summary, sub: event.sub });
        phase.toolCount += 1;
        break;
      }

      case 'consult':
        touch(event.phase).blocks.push({
          kind: 'consult',
          agent: event.agent,
          question: event.question,
        });
        break;

      case 'ask':
        pendingAsk = {
          id: event.id,
          phase: event.phase,
          question: event.question,
          options: event.options,
          image: event.image,
        };
        touch(event.phase).blocks.push({
          kind: 'ask',
          question: event.question,
          options: event.options,
          image: event.image,
        });
        break;

      case 'answer': {
        // Replay-safe: sólo cierra la pregunta si es la que está abierta.
        if (pendingAsk?.id === event.id) pendingAsk = null;
        const phase = touch(event.phase);
        const block = [...phase.blocks].reverse().find((b) => b.kind === 'ask' && !b.answer);
        if (block && block.kind === 'ask') block.answer = event.answer;
        break;
      }

      case 'denied':
        touch(event.phase).blocks.push({ kind: 'denied', name: event.name, reason: event.reason });
        break;

      case 'file':
        files.set(event.path, { phase: event.phase, action: event.action, ts: event.ts });
        break;

      case 'review':
        reviews = [
          ...reviews,
          { verdict: event.verdict, blockers: event.blockers, round: event.round },
        ];
        break;

      // Diseño puede pausarse por cuota mientras arquitecto/backend siguen
      // trabajando de verdad — el status global solo baja a "paused" si NO
      // queda ninguna fase corriendo, no en cuanto pausa la primera.
      case 'paused': {
        touch(event.phase).status = 'paused';
        pause = { phase: event.phase, reason: event.reason, resumeAt: event.resumeAt };
        const algunaCorriendo = Object.values(phases).some((p) => p.status === 'running');
        status = algunaCorriendo ? 'running' : 'paused';
        break;
      }

      case 'resumed':
        touch(event.phase).status = 'running';
        status = 'running';
        // El banner es uno solo: si la que reanuda no es la que lo abrió, se
        // deja como está (la otra fase sigue pausada de verdad).
        if (pause?.phase === event.phase) pause = null;
        break;

      case 'log':
        logs = [...logs, { level: event.level, msg: event.msg, ts: event.ts }].slice(-200);
        break;
    }
  }

  return {
    runId,
    idea,
    workspace,
    status,
    costUsd,
    startedAt,
    endedAt,
    phases,
    files,
    logs,
    reviews,
    pendingAsk,
    pause,
    lastSeq,
  };
}

/** The phase currently running, or the last one that produced output. */
export function activePhase(state: RunState): PhaseId {
  const running = PHASE_ORDER.find((id) => state.phases[id].status === 'running');
  if (running) return running;
  const touched = PHASE_ORDER.filter((id) => state.phases[id].blocks.length > 0);
  return touched[touched.length - 1] ?? 'product';
}
