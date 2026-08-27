import { useEffect, useReducer, useRef, useState } from 'react';
import { applyEvents, initialRunState, type RunState } from './state';
import type { ForgeEvent } from './types';

type Action = { type: 'events'; events: ForgeEvent[] } | { type: 'reset' };

function reducer(state: RunState, action: Action): RunState {
  if (action.type === 'reset') return initialRunState();
  return applyEvents(state, action.events);
}

/**
 * Subscribes to a run's SSE stream. Events are buffered and flushed on an
 * interval: a busy phase emits hundreds of text deltas per second, and
 * re-rendering per delta makes the page crawl.
 */
export function useForgeRun(runId: string | null): {
  state: RunState;
  connected: boolean;
  /** Vuelve a abrir el stream desde cero. Para cuando el servidor cambió algo
   *  de la ejecución con la conexión ya cerrada, como al detenerla. */
  refresh: () => void;
} {
  const [state, dispatch] = useReducer(reducer, undefined, initialRunState);
  const [connected, setConnected] = useState(false);
  const [nonce, setNonce] = useState(0);
  const buffer = useRef<ForgeEvent[]>([]);

  useEffect(() => {
    dispatch({ type: 'reset' });
    buffer.current = [];
    if (!runId) {
      setConnected(false);
      return;
    }

    const flush = window.setInterval(() => {
      if (buffer.current.length === 0) return;
      const events = buffer.current;
      buffer.current = [];
      dispatch({ type: 'events', events });
    }, 90);

    const source = new EventSource(`/api/runs/${runId}/events`);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      try {
        buffer.current.push(JSON.parse(message.data) as ForgeEvent);
      } catch {
        /* ignore malformed frame */
      }
    };
    // The server closes the stream with this event once a finished run has been replayed.
    source.addEventListener('end', () => {
      source.close();
      setConnected(false);
    });

    return () => {
      window.clearInterval(flush);
      source.close();
      if (buffer.current.length > 0) {
        dispatch({ type: 'events', events: buffer.current });
        buffer.current = [];
      }
    };
  }, [runId, nonce]);

  return { state, connected, refresh: () => setNonce((n) => n + 1) };
}
