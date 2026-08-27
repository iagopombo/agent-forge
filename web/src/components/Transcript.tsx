import { useEffect, useRef, useState } from 'react';
import type { Block, PhaseState } from '../state';

type Props = { phase: PhaseState };

/** Tool names that read rather than change things — dimmed so writes stand out. */
const QUIET_TOOLS = new Set(['Read', 'Glob', 'Grep', 'TodoWrite', 'WebSearch', 'WebFetch']);

export function Transcript({ phase }: Props) {
  const [showThinking, setShowThinking] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the tail while the user is at the bottom; stop the moment they scroll up.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const visible = phase.blocks.filter((b) => showThinking || b.kind !== 'thinking');

  return (
    <section className="transcript">
      <header className="transcript-head">
        <h2>{phase.label}</h2>
        <div className="transcript-tools">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
            />
            <span>Razonamiento</span>
          </label>
          {phase.costUsd > 0 && <span className="pill">${phase.costUsd.toFixed(2)}</span>}
          {phase.durationMs > 0 && (
            <span className="pill">{Math.round(phase.durationMs / 1000)}s</span>
          )}
        </div>
      </header>

      <div className="transcript-body" ref={scroller} onScroll={onScroll}>
        {visible.length === 0 && (
          <p className="empty">
            {phase.status === 'pending'
              ? 'Este agente aún no ha empezado.'
              : 'Esperando la primera respuesta…'}
          </p>
        )}
        {visible.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
        {phase.status === 'running' && <span className="caret" aria-hidden="true" />}
      </div>

      {phase.summary && (
        <footer className="transcript-summary">
          <h3>Entrega de la fase</h3>
          <p>{phase.summary}</p>
        </footer>
      )}
    </section>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'text':
      return <p className={`say ${block.sub ? 'is-sub' : ''}`}>{block.text}</p>;

    case 'thinking':
      return <p className="think">{block.text}</p>;

    case 'tool':
      return (
        <div
          className={`tool ${QUIET_TOOLS.has(block.name) ? 'is-quiet' : ''} ${
            block.sub ? 'is-sub' : ''
          }`}
        >
          <span className="tool-name">{block.name}</span>
          <span className="tool-summary">{block.summary}</span>
        </div>
      );

    case 'consult':
      return (
        <div className="consult">
          <span className="consult-tag">consulta → {block.agent}</span>
          <span>{block.question}</span>
        </div>
      );

    case 'ask':
      return (
        <div className="consult">
          <span className="consult-tag">pregunta al usuario</span>
          {block.image && (
            <div className="ask-image">
              <img src={block.image} alt="Captura del diseño en ese momento" />
            </div>
          )}
          <span>
            {block.question}
            {block.answer ? ` → ${block.answer}` : ' → (esperando respuesta)'}
          </span>
        </div>
      );

    case 'denied':
      return (
        <div className="denied">
          <span className="denied-tag">bloqueado</span>
          <span>
            {block.name}: {block.reason}
          </span>
        </div>
      );
  }
}
