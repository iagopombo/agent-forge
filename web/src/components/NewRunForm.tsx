import { useState } from 'react';
import { api } from '../api';

type Props = { onCreated: (id: string) => void };

const EXAMPLES = [
  'Un SaaS para que peluquerías gestionen citas: los clientes reservan online, el negocio ve la agenda del día y recibe avisos de cancelación.',
  'Una herramienta para autónomos que convierte fotos de tickets en gastos categorizados y genera el resumen trimestral de IVA.',
  'Un panel para academias de idiomas: alumnos, grupos, control de asistencia, pagos mensuales y avisos automáticos de impago.',
];

export function NewRunForm({ onCreated }: Props) {
  const [idea, setIdea] = useState('');
  const [language, setLanguage] = useState('español');
  const [rounds, setRounds] = useState(2);
  const [budget, setBudget] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const run = await api.createRun({
        idea: idea.trim(),
        language,
        maxReviewRounds: rounds,
        maxBudgetUsd: budget,
      });
      onCreated(run.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="new-run">
      <div className="new-run-inner">
        <h1>¿Qué construimos?</h1>
        <p className="lede">
          Describe la idea. Un equipo de ocho agentes la convierte en un repositorio completo:
          producto, arquitectura, backend, frontend, integración, revisión y entrega.
        </p>

        <form onSubmit={submit}>
          <label className="field">
            <span>La idea</span>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Cuanto más concreto seas sobre quién lo usa y qué problema resuelve, mejor será el resultado."
              rows={7}
              required
              minLength={15}
            />
          </label>

          <div className="examples">
            <span>Ejemplos:</span>
            {EXAMPLES.map((example, i) => (
              <button key={i} type="button" onClick={() => setIdea(example)}>
                {example.slice(0, 44)}…
              </button>
            ))}
          </div>

          <div className="field-row">
            <label className="field">
              <span>Idioma del producto</span>
              <input value={language} onChange={(e) => setLanguage(e.target.value)} />
            </label>
            <label className="field">
              <span>Rondas de corrección</span>
              <input
                type="number"
                min={0}
                max={5}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Presupuesto por fase (USD)</span>
              <input
                type="number"
                min={1}
                max={200}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="primary" disabled={busy || idea.trim().length < 15}>
            {busy ? 'Arrancando el equipo…' : 'Construir la aplicación'}
          </button>
        </form>
      </div>
    </div>
  );
}
