import { Fragment } from 'react';
import type { PhaseState } from '../state';
import { PHASE_ORDER, type PhaseId } from '../types';
import { Mascot } from './Mascot';

type Props = {
  phases: Record<PhaseId, PhaseState>;
  selected: PhaseId;
  onSelect: (id: PhaseId) => void;
};

const META: Record<PhaseState['status'], string> = {
  pending: 'en espera',
  running: 'trabajando…',
  done: 'terminado',
  failed: 'con errores',
  stopped: 'interrumpida',
};

/** El check verde que corona una fase ya terminada. */
function DoneBadge() {
  return (
    <span className="flow-badge">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M5 12l5 5 9-11" stroke="#0a0c10" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * El equipo trabajando, de izquierda a derecha. Cada agente es su personaje;
 * el que trabaja se agranda y late, los hechos llevan check, los que esperan se
 * atenúan. Pulsar un agente abre su transcript.
 */
export function TeamFlow({ phases, selected, onSelect }: Props) {
  return (
    <nav className="flow" aria-label="Fases del equipo">
      {PHASE_ORDER.map((id, i) => {
        const phase = phases[id];
        const prev = i > 0 ? phases[PHASE_ORDER[i - 1]!] : null;
        return (
          <Fragment key={id}>
            {i > 0 && (
              <span
                className={`flow-link ${prev?.status === 'done' ? 'is-done' : ''} ${
                  prev?.status === 'done' && phase.status === 'running' ? 'is-next' : ''
                }`}
              />
            )}
            <button
              type="button"
              className={`flow-node is-${phase.status} ${selected === id ? 'is-selected' : ''}`}
              onClick={() => onSelect(id)}
              aria-current={selected === id ? 'step' : undefined}
            >
              <span className="flow-chip-row">
                <span className="flow-chip">
                  <Mascot phase={id} size={phase.status === 'running' ? 64 : 58} />
                  {phase.status === 'done' && <DoneBadge />}
                </span>
              </span>
              <span className="flow-name">{phase.label}</span>
              <span className="flow-meta">{META[phase.status]}</span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
