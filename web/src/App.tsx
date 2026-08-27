import { useEffect, useState } from 'react';
import { api } from './api';
import { AskPanel } from './components/AskPanel';
import { FilesPanel } from './components/FilesPanel';
import { NewRunForm } from './components/NewRunForm';
import { TeamFlow } from './components/TeamFlow';
import { Sidebar } from './components/Sidebar';
import { Transcript } from './components/Transcript';
import { activePhase, type RunState } from './state';
import { PHASE_LABELS, PHASE_ORDER, type PhaseId } from './types';
import { useForgeRun } from './useForgeRun';

/** La ejecución abierta vive en el hash, para que recargar no la pierda. */
function runIdFromHash(): string | null {
  const id = window.location.hash.replace(/^#\/?/, '');
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : null;
}

export function App() {
  const [runId, setRunId] = useState<string | null>(runIdFromHash);
  const [pinnedPhase, setPinnedPhase] = useState<PhaseId | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const { state, connected, refresh } = useForgeRun(runId);

  useEffect(() => {
    api
      .health()
      .then((h) => setKeyMissing(!h.hasApiKey))
      .catch(() => undefined);
  }, []);

  // Atrás y adelante del navegador cambian de ejecución como cualquier otra web.
  useEffect(() => {
    const onHash = () => {
      setRunId(runIdFromHash());
      setPinnedPhase(null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Follow the working agent unless the user has clicked a specific phase.
  const selected = pinnedPhase ?? activePhase(state);
  // En pausa la ejecución sigue viva (esperando cuota): se puede detener, pero
  // no retomar, y aún no ha fallado.
  const running = state.status === 'running' || state.status === 'paused';

  // Una ejecución cortada a medias se puede continuar desde la primera fase que
  // no llegó a terminar, reutilizando el workspace en vez de empezar de cero.
  const resumeFrom =
    state.status === 'failed' || state.status === 'stopped'
      ? PHASE_ORDER.find((id) => state.phases[id].status !== 'done')
      : undefined;

  const openRun = (id: string | null) => {
    // Escribir el hash dispara `hashchange`, que es quien actualiza el estado.
    // Si ya estamos en ese hash el evento no llega, así que se fija a mano.
    const next = id ? `#/${id}` : '#/';
    if (window.location.hash === next) {
      setRunId(id);
      setPinnedPhase(null);
    } else {
      window.location.hash = next;
    }
  };

  return (
    <div className="app">
      <Sidebar currentId={runId} onSelect={openRun} revision={state.lastSeq} />

      <main className="main">
        {keyMissing && (
          <div className="banner is-warn">
            Sin <code>ANTHROPIC_API_KEY</code>: los agentes usarán la sesión de Claude Code y
            consumirán tu cuota de suscripción, no dólares por token.
          </div>
        )}

        {!runId && <NewRunForm onCreated={openRun} />}

        {runId && (
          <>
            <header className="run-head">
              <div className="run-head-main">
                <p className="run-head-idea">{state.idea || 'Cargando…'}</p>
                <p className="run-head-path">{state.workspace}</p>
              </div>
              <div className="run-head-stats">
                <Stat label="Estado" value={statusLabel(state.status, connected)} />
                <Stat label="Coste est." value={`$${state.costUsd.toFixed(2)}`} />
                <Stat label="Archivos" value={String(state.files.size)} />
                <Stat label="Tiempo" value={elapsed(state.startedAt, state.endedAt)} />
                {running && <StopButton runId={runId} connected={connected} onStopped={refresh} />}
                {!running && resumeFrom && (
                  <ResumeButton runId={runId} state={state} from={resumeFrom} onCreated={openRun} />
                )}
              </div>
            </header>

            <TeamFlow phases={state.phases} selected={selected} onSelect={setPinnedPhase} />

            {state.pause && <PauseBanner pause={state.pause} />}

            {state.pendingAsk && <AskPanel runId={runId} ask={state.pendingAsk} />}

            {state.reviews.length > 0 && <ReviewBanner review={state.reviews[state.reviews.length - 1]!} />}

            <div className="workspace">
              <Transcript phase={state.phases[selected]} />
              <FilesPanel runId={runId} state={state} />
            </div>

            {state.logs.length > 0 && (
              <details className="logs">
                <summary>Registro del sistema ({state.logs.length})</summary>
                {state.logs.map((log, i) => (
                  <p key={i} className={`log is-${log.level}`}>
                    {log.msg}
                  </p>
                ))}
              </details>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Detener no es «mandar una señal y confiar»: el servidor no contesta hasta que
 * la ejecución está parada y sus procesos cerrados. Hasta entonces el botón lo
 * dice, y si falla lo dice también, en vez de quedarse mudo.
 */
function StopButton({
  runId,
  connected,
  onStopped,
}: {
  runId: string;
  connected: boolean;
  onStopped: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stop = async () => {
    setBusy(true);
    setError('');
    try {
      await api.stopRun(runId);
      // Con el stream vivo, el propio `run.end` actualiza la pantalla. Si ya
      // estaba cerrado (una ejecución que el servidor perdió al reiniciarse),
      // el cambio sólo está en disco: hay que releerlo.
      if (!connected) onStopped();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo detener.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="stop"
      disabled={busy}
      onClick={() => void stop()}
      title={error || 'Corta la fase en curso y cierra los procesos del agente'}
    >
      {busy ? 'Deteniendo…' : error ? 'Detener (reintentar)' : 'Detener'}
    </button>
  );
}

function ResumeButton({
  runId,
  state,
  from,
  onCreated,
}: {
  runId: string;
  state: RunState;
  from: PhaseId;
  onCreated: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resume = async () => {
    setBusy(true);
    setError('');
    try {
      const run = await api.createRun({
        idea: state.idea,
        language: 'español',
        maxReviewRounds: 1,
        maxBudgetUsd: 25,
        resumeOf: runId,
        startFrom: from,
      });
      onCreated(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retomar.');
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="resume"
      disabled={busy}
      onClick={() => void resume()}
      title={error || `Continúa en el mismo workspace desde la fase "${PHASE_LABELS[from]}"`}
    >
      {busy ? 'Retomando…' : `Retomar en ${PHASE_LABELS[from]}`}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function ReviewBanner({ review }: { review: { verdict: string; blockers: string[]; round: number } }) {
  const pass = review.verdict === 'pass';
  return (
    <div className={`banner ${pass ? 'is-ok' : 'is-warn'}`}>
      <strong>
        Revisión {review.round}: {pass ? 'aprobada' : `${review.blockers.length} bloqueante(s)`}
      </strong>
      {!pass && (
        <ul>
          {review.blockers.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusLabel(status: string, connected: boolean): string {
  if (status === 'running') return connected ? 'en curso' : 'reconectando…';
  if (status === 'paused') return 'en pausa';
  if (status === 'done') return 'terminada';
  if (status === 'failed') return 'fallida';
  if (status === 'stopped') return 'detenida';
  return 'en cola';
}

function PauseBanner({ pause }: { pause: { reason: string; resumeAt: number | null } }) {
  const when = pause.resumeAt
    ? new Date(pause.resumeAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div className="banner is-warn">
      <strong>Sin cuota — en pausa.</strong>{' '}
      {when
        ? `La ejecución se reanudará sola cuando vuelva la cuota, hacia las ${when}. Puedes cerrar el navegador.`
        : 'La ejecución se reanudará sola en cuanto vuelva la cuota. Puedes cerrar el navegador.'}
    </div>
  );
}

function elapsed(from: number, to: number): string {
  if (!from) return '—';
  const ms = (to || Date.now()) - from;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
