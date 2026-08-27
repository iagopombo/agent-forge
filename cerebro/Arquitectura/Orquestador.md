---
title: Orquestador
tags:
  - arquitectura
  - operacion
---

# Orquestador

`server/src/orchestrator.ts` — la clase `Run` es el corazón de Agent Forge:
gestiona el [[Pipeline de 8 fases|pipeline]], el consumo de mensajes del SDK,
y el mecanismo de pausa/reanudación por cuota. Ver también
[[Cuota, pausas y reanudación]] para la historia real de cómo se afinó esto.

## Ciclo de vida de una fase (`runPhaseOnce`)

Por cada fase se abre una sesión nueva del Agent SDK vía `query({ prompt, options })`
con, entre otras opciones:

- `cwd: this.workspace` — todo el trabajo pasa por el workspace del proyecto
- `effort` — el de `roles.ts`, recortado por `effortCap` si la ejecución trae uno
  (`capEffort`: el menor de los dos, nunca sube el esfuerzo de un rol)
- `canUseTool: buildGuard(...)` — ver [[Seguridad (guard)]]
- `settingSources: []` — aislado de `~/.claude` del host
- `plugins: [{ type: 'local', path: ... }]` + `systemPrompt.excludeDynamicSections: true`
  — Skill de ahorro de tokens y caché del prompt del sistema entre proyectos
  distintos, al margen de `settingSources`. Ver [[Eficiencia de tokens]]
- `thinking: { type: 'adaptive', display: 'summarized' }`
- `mcpServers: { forge: buildAskServer(...) }` solo si `role.canAsk` (solo
  [[Producto]]) — ver [[Preguntas al usuario (ask)]]
- `agents: { 'architect-advisor': ... }` solo si `role.canConsult` (backend,
  frontend, integración, correcciones) — el arquitecto como subagente
  consultable vía la tool `Task`, de solo lectura (`tools: ['Read', 'Glob', 'Grep']`)

> [!warning] Deliberadamente sin `allowedTools`
> Poner un nombre de herramienta en `allowedTools` hace que el SDK la
> autoapruebe **antes** de llamar a `canUseTool` — el guard de contención de
> rutas dejaría de ejecutarse para esa tool. Por eso el orquestador usa
> `permissionMode: 'default'` sin `allowedTools`: todo pasa por el callback.

Los mensajes del SDK se consumen en `consume()`, que traduce cada tipo a un
evento de [[Eventos y SSE]]: `stream_event` con `text_delta`/`thinking_delta` →
`text`/`thinking`; bloques `tool_use` → `tool`, y si es `Write`/`Edit` también
`file`; bloques `Task` → `consult`.

## Rastreo del proceso hijo (`trackChild`)

Al empezar una fase se toma una foto de los PIDs hijos del servidor
(`childProcesses(process.pid)`); en paralelo, `trackChild` espera hasta 10 s a
que aparezca un PID nuevo que además parezca un agente (`AGENT_PROCESS.test`).
Ese PID es lo que `stop()` mata de verdad con `killTree`.

> [!info] Por qué importa
> Abortar el `AbortController` del SDK solo corta el diálogo con el modelo.
> Lo que el agente arrancó por su cuenta con Bash — un `npm install`, un
> servidor de desarrollo — sigue vivo después de que la interfaz diga
> «detenida», si no se mata el árbol de procesos completo.

## Pausa y reintento automático (`runPhase` → `waitForQuota`)

`runPhase` envuelve a `runPhaseOnce` en un bucle: si tras ejecutar la fase
queda un `pauseSignal` armado (ver [[Cuota, pausas y reanudación]]) y la
ejecución no se ha parado, llama a `waitForQuota` y, si la espera termina bien,
**reintenta la misma fase desde cero** — el agente relee su propio trabajo en
`docs/` y continúa donde lo dejó.

`waitForQuota`:
- Pone `status = 'paused'` y emite el evento `paused` con la razón y (si se
  pudo parsear) la hora exacta de reanudación
- Duerme en tramos de máximo 15 s (para poder cortar rápido si se detiene la
  ejecución) hasta la hora de reset + 60 s de margen, o 5 min si no se conoce
  la hora
- Tiene un tope absoluto: `MAX_PAUSE_MS = 8 horas`. Si se supera sin que la
  cuota vuelva, se marca `fatal` y la ejecución termina de verdad
- Devuelve `false` (sin reanudar) si la ejecución se detuvo mientras esperaba

Una fase que terminó en pausa **no cuenta como completada**: `runPhaseOnce` no
registra `phase.end` ni añade la fase a `this.phases` mientras
`this.pauseSignal` siga armado — solo se registra cuando el reintento sale bien
o cuando se agota definitivamente.

## Fatal vs. pausa (`classifyFailure`)

Un fallo de fase (excepción o `message.subtype !== 'success'`) se clasifica en
`classifyFailure(detail)`:

- **Cuota** (`QUOTA_ERRORS`) → arma `pauseSignal` con la razón y, si se pudo,
  la hora de reset (`parseResetAt`). No detiene la ejecución.
- **Cualquier otra cosa** (reconocida por `HARD_ERRORS` o no) → marca
  `this.fatal` también. `halted` = `stopped || fatal !== null` corta la
  ejecución ahí, sin pasar a la fase siguiente.

> [!warning] No siempre fue así
> Hasta que [[Postúlate (prueba)]] destapó el bug, solo `HARD_ERRORS` marcaba
> `fatal`; un fallo sin texto reconocible (un código de salida crudo del
> proceso, por ejemplo) no armaba ni `pauseSignal` ni `fatal`, y el pipeline
> seguía a la fase siguiente como si nada — cascada de fallos en milisegundos.
> Se invirtió el criterio: ahora detener es la opción segura por defecto, y
> solo lo que de verdad parece cuota es la excepción que reintenta sola. Ver
> [[Cuota, pausas y reanudación#Fail-safe por defecto]].

Ver [[Cuota, pausas y reanudación]] para las expresiones regulares exactas y su
historia de ajustes reales.

## Sembrado de fases previas al retomar (`seedPriorPhases`)

Al retomar (`request.startFrom` informado), la interfaz necesita ver las fases
anteriores como terminadas desde el primer instante del nuevo `run.start` —
no como "en espera", que es lo que pasaba antes de este mecanismo (ver
[[Red social de libros (prueba)]], donde se reportó y se arregló).

- `RunStore.create()` (`server/src/runs.ts`), solo si `startFrom` viene
  informado, llama a `priorPhaseOutcomes(slug)`: recorre **todos** los
  manifiestos `.runs/*.json` que comparten slug (cada reanudación tiene su
  propio id y su propio `.jsonl`), lee sus eventos `phase.end` con `ok: true`,
  y se queda con el más reciente por fase (por si una fase se reintentó varias
  veces en ejecuciones distintas). Es síncrono a propósito: `create()` es
  síncrono y solo lee un puñado de ficheros pequeños, nunca en el camino
  caliente de una fase en marcha.
- Ese resultado (`priorPhases: Partial<Record<PhaseId, PhaseOutcome>>`) se
  pasa a `Run` en el constructor. Justo después del evento `run.start` en
  `start()`, `seedPriorPhases()` recorre las fases anteriores a `startFrom` en
  orden y, por cada una con outcome guardado, emite `phase.start` +
  `phase.end` sintéticos **inmediatamente** (no ejecuta nada, solo reproduce
  el resultado ya conocido) y suma su coste a `this.costUsd`.
- La fase que es literalmente `startFrom` (y las posteriores) nunca se siembra
  — esas sí se ejecutan de verdad.

> [!info] Verificado en producción, no solo en test
> Al reanudar [[Red social de libros (prueba)|la red social de libros]] desde
> `package`, el `.jsonl` del nuevo run mostró las seis fases previas
> (`product` → `review`) con `phase.end ok=true` en el segundo `0` de la
> ejecución, antes de que `package` empezara a correr de verdad. Regresión en
> `probe-seed.mts` (aislado, sobre `Run`) y `probe-seed-part2.mts` (proceso
> aparte con `FORGE_RUNS` apuntando a un directorio temporal, porque `CONFIG`
> se congela al primer `import`).

## Fin de la ejecución

`start()` marca `status = 'done'` solo si **todas** las fases que se
ejecutaron salieron bien (`fallidas === 0`); si no, `'failed'`. Antes bastaba
con llegar al final del bucle del pipeline aunque ninguna fase hubiera
sobrevivido — ese bug ya no existe. En cualquier caso se emite `run.end` con el
coste total y la duración.

## Preguntas del usuario

`askUser(question, options)` es la única forma en que una fase puede detenerse
a esperar input humano fuera del ciclo de cuota: crea un id aleatorio, lo
guarda en `pendingAsks`, emite el evento `ask` y devuelve una promesa que solo
se resuelve desde `answer(id, text)` (llamado por `POST /api/runs/:id/answer`)
o se rechaza si la ejecución se detiene con la pregunta abierta
(`rejectAsks`). Ver [[Preguntas al usuario (ask)]].
