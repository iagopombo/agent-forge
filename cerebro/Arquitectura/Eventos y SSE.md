---
title: Eventos y SSE
tags:
  - arquitectura
---

# Eventos y SSE

`server/src/events.ts` define el vocabulario compartido entre
[[Orquestador|orchestrator.ts]], el endpoint SSE de `index.ts` y el reductor de
la interfaz (`web/src/state.ts`). Todo evento lleva `seq` (monotónico) y `ts`.

## Tipo `RunStatus`

```
'queued' | 'running' | 'paused' | 'done' | 'failed' | 'stopped'
```

## Tipos de evento (`ForgeEvent`)

| Evento | Cuándo | Campos propios |
|---|---|---|
| `run.start` | al arrancar `Run.start()` | `runId`, `idea`, `workspace` |
| `run.end` | al terminar, en cualquier desenlace | `status`, `costUsd`, `durationMs` |
| `phase.start` | al empezar una fase (o una nueva ronda) | `phase`, `label`, `round` |
| `phase.end` | al terminar una fase que **no** quedó en pausa | `phase`, `ok`, `summary`, `costUsd`, `durationMs` |
| `text` | delta de prosa del asistente | `phase`, `delta`, `sub` |
| `thinking` | delta de razonamiento | `phase`, `delta`, `sub` |
| `tool` | una llamada a herramienta | `phase`, `id`, `name`, `summary`, `sub` |
| `file` | un `Write` o `Edit` | `phase`, `path`, `action` |
| `consult` | delegación a un subagente (`Task`) | `phase`, `agent`, `question` |
| `ask` | [[Producto|producto]] pregunta al usuario | `phase`, `id`, `question`, `options` |
| `answer` | el usuario contestó un `ask` | `phase`, `id`, `answer` |
| `denied` | el guard bloqueó una tool | `phase`, `name`, `reason` |
| `review` | veredicto de una ronda de revisión | `verdict`, `blockers`, `round` |
| `paused` | se acabó la cuota a mitad de fase | `phase`, `reason`, `resumeAt` |
| `resumed` | la cuota volvió y se reintenta | `phase` |
| `log` | mensaje suelto (info/warn/error) | `level`, `msg` |

`sub: boolean` en `text`/`thinking`/`tool` distingue si el bloque viene del
agente principal de la fase o de un subagente delegado (p. ej. el
`architect-advisor` respondiendo a una consulta).

## `EventLog`: pub/sub con replay

Cada `Run` tiene un `EventLog` propio (`server/src/events.ts`), con capacidad
acotada (`CONFIG.eventBufferSize`). `emit()` numera el evento, lo guarda, y si
se pasa de capacidad recorta por el principio (contando lo descartado en
`dropped`, expuesto como `firstSeq`). `since(from)` filtra por `seq >= from`:
es lo que permite a un cliente que se reconecta pedir solo lo que se perdió.

## El endpoint SSE (`GET /api/runs/:id/events`)

En `server/src/index.ts`. Acepta `?from=N` (o la cabecera `Last-Event-ID`) para
reanudar en ese punto. Si la ejecución ya no está en memoria, reproduce desde
el `.jsonl` en disco (`runs.replay`) y cierra. Si sigue viva, envía primero lo
que ya tenía el `EventLog` desde `from`, y después se suscribe en directo.

> [!warning] Una ejecución terminada sigue en memoria
> `RunStore` no suelta un `Run` mientras vive el proceso del servidor. Sin la
> comprobación `run.status !== 'running' && run.status !== 'queued'` (que
> también trata `'paused'` como todavía-en-curso), el navegador se quedaría
> "en directo" para siempre sobre algo que ya no va a emitir nada más.

> [!note] El cierre del stream también es un `data:`
> `close()` escribe `event: end\ndata: {}\n\n`. Un lector ingenuo que cuenta
> cualquier `data:` como evento añadiría un `{}` fantasma al final de cada
> replay — hay que cortar específicamente al ver `event: end`.

Cada evento se persiste además línea a línea en `.runs/<id>.jsonl`
(`RunStore.create`, suscrito al mismo `EventLog`), y en los hitos importantes
(`phase.end`, `run.end`, `run.start`) se reescribe el manifiesto
`.runs/<id>.json` — ver [[Workspaces y slugs]].
