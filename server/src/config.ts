import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root (agent-forge/). `src` -> `server` -> repo root. */
export const ROOT = path.resolve(here, '..', '..');

export const CONFIG = {
  port: Number(process.env.PORT ?? 5178),

  /** Every run gets its own sandbox directory under here. */
  workspacesRoot: process.env.FORGE_WORKSPACES ?? path.join(ROOT, 'workspaces'),

  /** Where the append-only event log of each run is persisted. */
  runsRoot: process.env.FORGE_RUNS ?? path.join(ROOT, '.runs'),

  /** Built frontend, served by the same process in production. */
  webDist: path.join(ROOT, 'web', 'dist'),

  /**
   * Sin definir por defecto: cada rol trae su propio modelo en `roles.ts`
   * (pensado para no agotar cuota de suscripción). Fijar esta variable fuerza
   * el mismo modelo en las ocho fases, pisando ese reparto — útil para
   * pruebas, no recomendado para uso normal.
   */
  model: process.env.FORGE_MODEL,

  /** How many review -> fix -> review cycles before we ship what we have. */
  maxReviewRounds: Number(process.env.FORGE_MAX_REVIEW_ROUNDS ?? 2),

  /** Hard ceiling per run, in USD. The SDK aborts the phase when reached. */
  maxBudgetUsd: Number(process.env.FORGE_MAX_BUDGET_USD ?? 25),

  /** Events kept in memory per run for SSE replay. */
  eventBufferSize: 20000,
} as const;
