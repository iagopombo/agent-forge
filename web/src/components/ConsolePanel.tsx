import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ConsoleBlock, ConsoleState } from '../console';

type Props = { runId: string; state: ConsoleState; connected: boolean };

/** Herramientas que solo leen: se atenúan para que destaquen las que escriben. */
const QUIET_TOOLS = new Set(['Read', 'Glob', 'Grep', 'TodoWrite', 'WebSearch', 'WebFetch']);

export function ConsolePanel({ runId, state, connected }: Props) {
  const [draft, setDraft] = useState('');
  const [showThinking, setShowThinking] = useState(false);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Sigue la cola mientras el usuario esté abajo; para en cuanto sube.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  });

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || state.busy) return;
    setDraft('');
    setError('');
    pinned.current = true;
    try {
      await api.sendConsole(runId, text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar.');
      setDraft(text);
    }
  };

  const interrupt = async () => {
    setError('');
    try {
      await api.interruptConsole(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo interrumpir.');
    }
  };

  const visible = state.blocks.filter((b) => showThinking || b.kind !== 'thinking');

  return (
    <section className="console">
      <header className="console-head">
        <h2>Claude Code</h2>
        <div className="console-tools">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showThinking}
              onChange={(e) => setShowThinking(e.target.checked)}
            />
            <span>Razonamiento</span>
          </label>
          {state.costUsd > 0 && <span className="pill">${state.costUsd.toFixed(2)}</span>}
          <span className="console-state">
            <span className={`dot ${state.busy ? 'is-running' : connected ? 'is-done' : ''}`} />
            {state.busy ? 'trabajando…' : connected ? 'lista' : 'conectando…'}
          </span>
        </div>
      </header>

      <div className="console-body" ref={scroller} onScroll={onScroll}>
        {visible.length === 0 && (
          <p className="empty">
            Pídele un cambio y lo aplicará sobre este workspace. Verás los archivos tocados
            aparecer en verde en el panel de al lado.
          </p>
        )}
        {visible.map((block, i) => (
          <ConsoleBlockView key={i} block={block} />
        ))}
        {state.busy && <span className="caret" aria-hidden="true" />}
      </div>

      {error && <p className="console-error">{error}</p>}

      <form
        className="console-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <span className="console-prompt">&gt;</span>
        <textarea
          rows={1}
          value={draft}
          placeholder={state.busy ? 'Trabajando… espera al final del turno' : 'Pide un cambio a Claude Code…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter envía; Mayús+Enter hace salto de línea, como en la terminal.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {state.busy ? (
          <button type="button" className="console-stop" onClick={() => void interrupt()}>
            Interrumpir
          </button>
        ) : (
          <button type="submit" className="console-send" disabled={!draft.trim()}>
            Enviar
          </button>
        )}
      </form>
    </section>
  );
}

function ConsoleBlockView({ block }: { block: ConsoleBlock }) {
  switch (block.kind) {
    case 'user':
      return (
        <p className="console-user">
          <span className="console-prompt">&gt;</span>
          {block.text}
        </p>
      );

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

    case 'denied':
      return (
        <div className="denied">
          <span className="denied-tag">bloqueado</span>
          <span>
            {block.name}: {block.reason}
          </span>
        </div>
      );

    case 'log':
      return <p className={`log is-${block.level}`}>{block.msg}</p>;
  }
}
