import type { ConsoleEvent } from './types';

export type ConsoleBlock =
  | { kind: 'user'; text: string }
  | { kind: 'text'; text: string; sub: boolean }
  | { kind: 'thinking'; text: string; sub: boolean }
  | { kind: 'tool'; name: string; summary: string; sub: boolean }
  | { kind: 'consult'; agent: string; question: string }
  | { kind: 'denied'; name: string; reason: string }
  | { kind: 'log'; level: 'info' | 'warn' | 'error'; msg: string };

export type ConsoleState = {
  blocks: ConsoleBlock[];
  /** Hay un turno en marcha: la consola no acepta otro mensaje hasta que acabe. */
  busy: boolean;
  costUsd: number;
  /** Archivos que la consola ha tocado, para marcarlos en el panel de workspace. */
  files: Map<string, 'write' | 'edit'>;
  lastSeq: number;
};

export function initialConsoleState(): ConsoleState {
  return { blocks: [], busy: false, costUsd: 0, files: new Map(), lastSeq: -1 };
}

/** Igual que en el transcript de las fases: los deltas se funden en el bloque final. */
function pushDelta(
  blocks: ConsoleBlock[],
  kind: 'text' | 'thinking',
  text: string,
  sub: boolean,
): void {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === kind && last.sub === sub) {
    last.text += text;
    return;
  }
  blocks.push({ kind, text, sub });
}

export function applyConsoleEvents(state: ConsoleState, events: ConsoleEvent[]): ConsoleState {
  const blocks = [...state.blocks];
  const files = new Map(state.files);
  let { busy, costUsd, lastSeq } = state;

  for (const event of events) {
    if (event.seq <= lastSeq) continue;
    lastSeq = event.seq;

    switch (event.t) {
      case 'user':
        blocks.push({ kind: 'user', text: event.text });
        break;

      case 'text':
        pushDelta(blocks, 'text', event.delta, event.sub);
        break;

      case 'thinking':
        pushDelta(blocks, 'thinking', event.delta, event.sub);
        break;

      case 'tool':
        blocks.push({ kind: 'tool', name: event.name, summary: event.summary, sub: event.sub });
        break;

      case 'file':
        files.set(event.path, event.action);
        break;

      case 'consult':
        blocks.push({ kind: 'consult', agent: event.agent, question: event.question });
        break;

      case 'denied':
        blocks.push({ kind: 'denied', name: event.name, reason: event.reason });
        break;

      case 'turn.start':
        busy = true;
        break;

      case 'turn.end':
        busy = false;
        costUsd += event.costUsd;
        break;

      case 'log':
        blocks.push({ kind: 'log', level: event.level, msg: event.msg });
        break;
    }
  }

  return { blocks, busy, costUsd, files, lastSeq };
}
