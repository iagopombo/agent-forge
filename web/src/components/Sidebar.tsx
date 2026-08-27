import { useEffect, useState } from 'react';
import { api } from '../api';
import type { RunSummary, RunStatus } from '../types';

type Props = {
  currentId: string | null;
  onSelect: (id: string | null) => void;
  /** Bumped by the parent whenever run state changes, to refresh the list. */
  revision: number;
};

const STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'en cola',
  running: 'en curso',
  paused: 'en pausa',
  done: 'terminada',
  failed: 'fallida',
  stopped: 'detenida',
};

/** Hora si es de hoy, fecha corta si no. */
function when(ts: number): string {
  const date = new Date(ts);
  const hoy = new Date().toDateString() === date.toDateString();
  return hoy
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function Sidebar({ currentId, onSelect, revision }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .listRuns()
        .then((list) => !cancelled && setRuns(list))
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [revision]);

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Agent Forge</span>
      </div>

      <button type="button" className="new-button" onClick={() => onSelect(null)}>
        Nueva aplicación
      </button>

      <h2 className="sidebar-title">Historial</h2>
      <div className="sidebar-list">
        {runs.length === 0 && <p className="empty">Aún no has construido nada.</p>}
        {runs.map((run) => (
          <button
            key={run.id}
            type="button"
            className={`run-item ${currentId === run.id ? 'is-selected' : ''}`}
            data-run-id={run.id}
            onClick={() => onSelect(run.id)}
          >
            <span className="run-idea">{run.idea}</span>
            <span className="run-meta">
              <span className={`dot is-${run.status}`} aria-hidden="true" />
              {STATUS_LABEL[run.status]}
              {/* Dos ejecuciones de la misma idea son indistinguibles sin la hora. */}
              {run.createdAt > 0 && ` · ${when(run.createdAt)}`}
              {run.costUsd > 0 && ` · $${run.costUsd.toFixed(2)}`}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
