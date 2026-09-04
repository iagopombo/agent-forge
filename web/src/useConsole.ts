import { useEffect, useReducer, useRef, useState } from 'react';
import { applyConsoleEvents, initialConsoleState, type ConsoleState } from './console';
import type { ConsoleEvent } from './types';

type Action = { type: 'events'; events: ConsoleEvent[] } | { type: 'reset' };

function reducer(state: ConsoleState, action: Action): ConsoleState {
  if (action.type === 'reset') return initialConsoleState();
  return applyConsoleEvents(state, action.events);
}

/**
 * Stream de la consola de una ejecución. `enabled` es lo que evita que abrir
 * cualquier ejecución cree una sesión de consola: no se conecta hasta que el
 * usuario pisa la pestaña por primera vez, y una vez conectado sigue vivo
 * aunque vuelva a la pestaña del equipo (así no se pierde el hilo al cambiar).
 *
 * Los eventos se acumulan y se vuelcan cada 90 ms, igual que en `useForgeRun`:
 * un turno activo emite cientos de deltas por segundo.
 */
export function useConsole(
  runId: string | null,
  enabled: boolean,
): { state: ConsoleState; connected: boolean } {
  const [state, dispatch] = useReducer(reducer, undefined, initialConsoleState);
  const [connected, setConnected] = useState(false);
  const buffer = useRef<ConsoleEvent[]>([]);

  useEffect(() => {
    dispatch({ type: 'reset' });
    buffer.current = [];
    if (!runId || !enabled) {
      setConnected(false);
      return;
    }

    const flush = window.setInterval(() => {
      if (buffer.current.length === 0) return;
      const events = buffer.current;
      buffer.current = [];
      dispatch({ type: 'events', events });
    }, 90);

    const source = new EventSource(`/api/runs/${runId}/console/events`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      try {
        buffer.current.push(JSON.parse(message.data) as ConsoleEvent);
      } catch {
        /* ignore malformed frame */
      }
    };

    return () => {
      window.clearInterval(flush);
      source.close();
      if (buffer.current.length > 0) {
        dispatch({ type: 'events', events: buffer.current });
        buffer.current = [];
      }
    };
  }, [runId, enabled]);

  return { state, connected };
}
