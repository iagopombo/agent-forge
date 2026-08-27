import { useState } from 'react';
import { api } from '../api';
import type { PendingAsk } from '../state';

type Props = { runId: string; ask: PendingAsk };

/**
 * La pregunta de alcance del agente de producto. Muestra las 3 opciones que
 * propuso más una cuarta libre para escribir cualquier otra respuesta. Mientras
 * está abierta, el pipeline está pausado esperando.
 */
export function AskPanel({ runId, ask }: Props) {
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');

  const send = async (answer: string) => {
    const text = answer.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.answer(runId, ask.id, text);
      // El evento `answer` que llega por SSE cierra el panel; no lo tocamos aquí.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar.');
      setBusy(false);
    }
  };

  return (
    <div className="ask" role="dialog" aria-label="El agente necesita una decisión">
      <div className="ask-head">
        <span className="ask-badge">El agente pregunta</span>
        <p className="ask-question">{ask.question}</p>
      </div>

      {ask.image && (
        <div className="ask-image">
          <img src={ask.image} alt="Captura del diseño actual" />
        </div>
      )}

      <div className="ask-options">
        {ask.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className="ask-option"
            disabled={busy}
            onClick={() => void send(opt)}
          >
            <span className="ask-key">{i + 1}</span>
            <span>{opt}</span>
          </button>
        ))}
      </div>

      <form
        className="ask-custom"
        onSubmit={(e) => {
          e.preventDefault();
          void send(custom);
        }}
      >
        <span className="ask-key">4</span>
        <input
          type="text"
          placeholder="Otra respuesta: escribe la tuya…"
          value={custom}
          disabled={busy}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button type="submit" className="ask-send" disabled={busy || custom.trim().length === 0}>
          Enviar
        </button>
      </form>

      {error && <p className="ask-error">{error}</p>}
    </div>
  );
}
