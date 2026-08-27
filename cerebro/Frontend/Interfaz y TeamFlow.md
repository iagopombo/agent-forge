---
title: Interfaz y TeamFlow
tags:
  - frontend
---

# Interfaz y TeamFlow

La SPA de React (`web/`) que muestra el progreso de una ejecución en vivo por
SSE. Se conecta a [[Eventos y SSE]] y usa el reductor `web/src/state.ts`
(`applyEvents`) para convertir el flujo de eventos en `RunState`.

## `TeamFlow` — la banda de 8 personajes

`web/src/components/TeamFlow.tsx`. Sustituye a un antiguo rail vertical: ahora
los 8 agentes del [[Pipeline de 8 fases|pipeline]] se muestran en una banda
horizontal, cada uno con su [[Interfaz y TeamFlow#Mascot — los personajes|personaje]],
conectados por líneas de gradiente (`.flow-link`) que se colorean según el
estado de la fase anterior (`is-done`, `is-next` cuando la siguiente ya está
trabajando).

Cada nodo (`.flow-node`) muestra el personaje, un check verde (`DoneBadge`) si
la fase terminó, el nombre de la fase y su estado en texto:

| Estado interno | Texto mostrado |
|---|---|
| `pending` | en espera |
| `running` | trabajando… |
| `done` | terminado |
| `failed` | con errores |
| `stopped` | interrumpida |

La fase en curso se agranda (64px de personaje vs. 58px) y pulsa (animación
CSS). Pulsar un nodo cambia el transcript seleccionado (`onSelect`).

## Mascot — los personajes

`web/src/components/Mascot.tsx`. Un dibujo SVG por fase (viewBox 96×96), un
muñeco de Claude con un accesorio del oficio, coloreado según la fase:

| Fase | Accesorio |
|---|---|
| [[Producto]] | corona dorada |
| [[Arquitecto]] | casco de obra naranja |
| [[Backend]] | engranaje + llave inglesa azules |
| [[Frontend (agente)\|Frontend]] | boina morada + pincel |
| [[Integración]] | piezas de puzle encajando, en verde azulado |
| [[Revisión]] | lupa |
| [[Correcciones]] | llave inglesa amarilla + destornillador azul |
| [[Entrega]] | caja de regalo envolviéndose, morada |

## El reductor (`web/src/state.ts`)

`applyEvents(state, events)` aplica un lote de eventos de una vez (para que
React repinte una sola vez por lote, no por evento) y devuelve un nuevo
`RunState`. Puntos no obvios:

- `pushDelta` fusiona deltas consecutivos de `text`/`thinking` del mismo tipo
  y del mismo origen (`sub`) en el bloque anterior, en vez de crear un bloque
  nuevo por cada delta
- Un segundo paso por la misma fase (ronda 2 de revisión tras
  [[Correcciones]]) añade un separador visual `— ronda N —` al transcript en
  vez de borrar la ronda anterior
- `run.end` con `status !== 'done'` marca como `'stopped'` cualquier fase que
  siguiera en `'running'` — una fase interrumpida nunca emite `phase.end` por
  sí sola, así que sin este parche quedaría mostrando "trabajando…" para
  siempre sobre una ejecución que la cabecera ya dice que terminó
- Los eventos `paused`/`resumed` mueven `status` a `'paused'`/`'running'` y
  gestionan `pause: PauseInfo | null` — la interfaz muestra un aviso mientras
  dura (ver [[Cuota, pausas y reanudación]])
- `pendingAsk` guarda como mucho una pregunta abierta a la vez, reflejando la
  limitación real del orquestador (una fase, una pregunta pendiente)
