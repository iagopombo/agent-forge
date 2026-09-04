---
title: Interfaz y TeamFlow
tags:
  - frontend
---

# Interfaz y TeamFlow

La SPA de React (`web/`) que muestra el progreso de una ejecución en vivo por
SSE. Se conecta a [[Eventos y SSE]] y usa el reductor `web/src/state.ts`
(`applyEvents`) para convertir el flujo de eventos en `RunState`.

## `TeamFlow` — la banda de personajes

`web/src/components/TeamFlow.tsx`. Sustituye a un antiguo rail vertical: los
agentes del [[Pipeline de 8 fases|pipeline]] (nueve desde [[Diseño]]) se
muestran en una banda horizontal, cada uno con su
[[Interfaz y TeamFlow#Mascot — los personajes|personaje]], conectados por
líneas de gradiente (`.flow-link`) que se colorean según el estado de la fase
anterior (`is-done`, `is-next` cuando la siguiente ya está trabajando).

> [!warning] El rail sigue siendo una fila, no un diagrama de ramas
> Diseño corre en paralelo con arquitecto+backend de verdad (ver
> [[Diseño (agente y paralelismo)]]), pero `TeamFlow` sigue dibujando una fila
> lineal — se colocó justo tras producto en `PHASE_ORDER`
> (`web/src/types.ts`), y el conector visual hacia arquitecto no representa
> una dependencia real. Cada nodo sí muestra su estado real e independiente
> (los dos pueden estar "trabajando…" a la vez), así que la información es
> correcta — solo la disposición gráfica no distingue "en serie" de "en
> paralelo". Simplificación consciente, no un descuido.

Cada nodo (`.flow-node`) muestra el personaje, un check verde (`DoneBadge`) si
la fase terminó, el nombre de la fase y su estado en texto:

| Estado interno | Texto mostrado |
|---|---|
| `pending` | en espera |
| `running` | trabajando… |
| `paused` | sin cuota, espera… |
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
| [[Diseño]] | paleta de pintor + pincel, coral |
| [[Arquitecto]] | casco de obra naranja |
| [[Backend]] | engranaje + llave inglesa azules |
| [[Frontend (agente)\|Frontend]] | boina morada + pincel |
| [[Integración]] | piezas de puzle encajando, en verde azulado |
| [[Revisión]] | lupa |
| [[Correcciones]] | llave inglesa amarilla + destornillador azul |
| [[Entrega]] | caja de regalo envolviéndose, morada |

## Pestañas — equipo y consola

`App.tsx`. Bajo `TeamFlow` hay dos pestañas: *Trabajo del equipo* (el
`Transcript` de siempre) y *Consola · Claude Code* (`ConsolePanel.tsx`, ver
[[Consola de Claude Code]]). Cambiar de pestaña no navega ni desmonta nada del
otro lado — es la misma decisión que ya tomaba `pinnedPhase` para no perder el
transcript de una fase al mirar otra.

Dos estados nuevos gobiernan la consola sin acoplar `App.tsx` a su
implementación:

- `consoleOpened` — si `false`, `useConsole` ni siquiera abre el `EventSource`.
  Pisar la pestaña del equipo (el caso normal, ninguna ejecución se mejora a
  posteriori) no debe crear una sesión de consola de la nada.
- Una vez `true`, se queda así aunque se vuelva a la pestaña del equipo: la
  conexión SSE sigue viva de fondo, para no cortar un turno en marcha por
  cambiar de pestaña sin querer.

La pestaña de consola se deshabilita mientras `running` (el run está
`'running'` o `'paused'`) — dos sesiones escribiendo el mismo workspace a la
vez se pisarían.

`FilesPanel` pasó de recibir el `RunState` completo a recibir un `touched:
Map<string, unknown>` que `App.tsx` arma fusionando `state.files` (lo que
tocaron los agentes) con `consoleRun.state.files` (lo que ha tocado la
consola) — el panel no necesita saber de dónde viene cada escritura para
marcarla en verde.

## `AskPanel` — pregunta y, si la hay, captura

`web/src/components/AskPanel.tsx`. El mismo panel de siempre (pregunta + 3
opciones + una cuarta libre) ahora renderiza además `ask.image` cuando está
presente — el caso de [[Diseño]] enseñando un mockup. `Transcript.tsx` hace lo
mismo para las preguntas ya respondidas, así que el historial de capturas de
una conversación de diseño queda visible después de que termine, no solo
mientras está pendiente.

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
  siguiera en `'running'` o `'paused'` — una fase interrumpida nunca emite
  `phase.end` por sí sola, así que sin este parche quedaría mostrando
  "trabajando…"/"sin cuota, espera…" para siempre sobre una ejecución que la
  cabecera ya dice que terminó
- Los eventos `paused`/`resumed` marcan **esa fase concreta** como
  `'paused'`/`'running'` en `phases`, y el `status` global del run solo baja a
  `'paused'` si NO queda ninguna fase en `'running'` — desde
  [[Diseño (agente y paralelismo)|que diseño corre en paralelo]] con
  arquitecto/backend, una pausa de una no implica que el run entero esté
  parado. `pause: PauseInfo | null` alimenta el aviso único (ver
  [[Cuota, pausas y reanudación]]) — si dos fases pausan a la vez, el banner
  muestra la más reciente, no las dos
- `pendingAsk` guarda como mucho una pregunta abierta a la vez — no es una
  limitación real: producto y diseño (los dos únicos roles que preguntan)
  nunca están activos al mismo tiempo, porque diseño empieza después de que
  producto termina
