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

type Base = { seq: number; ts: number };

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
    | { t: 'text'; phase: PhaseId; delta: string; sub: boolean }
    | { t: 'thinking'; phase: PhaseId; delta: string; sub: boolean }
    | { t: 'tool'; phase: PhaseId; id: string; name: string; summary: string; sub: boolean }
    | { t: 'file'; phase: PhaseId; path: string; action: 'write' | 'edit' }
    | { t: 'consult'; phase: PhaseId; agent: string; question: string }
    | { t: 'ask'; phase: PhaseId; id: string; question: string; options: string[]; image?: string }
    | { t: 'answer'; phase: PhaseId; id: string; answer: string }
    | { t: 'denied'; phase: PhaseId; name: string; reason: string }
    | { t: 'review'; verdict: 'pass' | 'changes_requested'; blockers: string[]; round: number }
    | { t: 'paused'; phase: PhaseId; reason: string; resumeAt: number | null }
    | { t: 'resumed'; phase: PhaseId }
    | { t: 'log'; level: 'info' | 'warn' | 'error'; msg: string }
  );

/**
 * Vocabulario de la consola de Claude Code. Espejo de `server/src/console.ts`;
 * no lleva `phase` porque aquí no hay fases, hay turnos del usuario.
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

export type RunSummary = {
  id: string;
  slug: string;
  idea: string;
  status: RunStatus;
  createdAt: number;
  finishedAt: number;
  costUsd: number;
  currentPhase: PhaseId | null;
  workspace: string;
};

export type FileNode = { path: string; size: number };

export const PHASE_LABELS: Record<PhaseId, string> = {
  product: 'Producto',
  design: 'Diseño',
  architect: 'Arquitecto',
  backend: 'Backend',
  frontend: 'Frontend',
  integration: 'Integración',
  review: 'Revisión',
  fix: 'Correcciones',
  package: 'Entrega',
};

/**
 * Orden de renderizado del rail — no implica que cada fase espere a la
 * anterior. Diseño corre en paralelo con arquitecto+backend (ver
 * [[Orquestador]] del vault): se coloca aquí justo después de producto,
 * pero el conector visual entre "diseño" y "arquitecto" no representa una
 * dependencia real, es solo la posición en la fila.
 */
export const PHASE_ORDER: PhaseId[] = [
  'product',
  'design',
  'architect',
  'backend',
  'frontend',
  'integration',
  'review',
  'fix',
  'package',
];
