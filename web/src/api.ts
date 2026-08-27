import type { FileNode, RunSummary } from './types';

async function json<T>(request: Promise<Response>): Promise<T> {
  const res = await request;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () =>
    json<{ ok: boolean; model: string; hasApiKey: boolean }>(fetch('/api/health')),

  listRuns: () => json<RunSummary[]>(fetch('/api/runs')),

  createRun: (body: {
    idea: string;
    language: string;
    maxReviewRounds: number;
    maxBudgetUsd: number;
    /** Reutiliza el workspace de otra ejecución y empieza por `startFrom`. */
    resumeOf?: string;
    startFrom?: string;
    model?: string;
  }) =>
    json<{ id: string; workspace: string }>(
      fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    ),

  stopRun: (id: string) => json<{ ok: boolean }>(fetch(`/api/runs/${id}/stop`, { method: 'POST' })),

  answer: (id: string, questionId: string, answer: string) =>
    json<{ ok: boolean }>(
      fetch(`/api/runs/${id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: questionId, answer }),
      }),
    ),

  listFiles: (id: string) => json<FileNode[]>(fetch(`/api/runs/${id}/files`)),

  readFile: (id: string, path: string) =>
    json<{ content: string; truncated: boolean }>(
      fetch(`/api/runs/${id}/file?path=${encodeURIComponent(path)}`),
    ),
};
