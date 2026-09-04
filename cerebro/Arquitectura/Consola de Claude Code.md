---
title: Consola de Claude Code
tags:
  - arquitectura
---

# Consola de Claude Code

`server/src/console.ts` + `web/src/components/ConsolePanel.tsx`. Cuando el
[[Pipeline de 8 fases|pipeline]] termina, la única forma de seguir mejorando
la aplicación generada era salir de Agent Forge y abrir una terminal en el
workspace. Esta consola vive dentro de la interfaz, en una pestaña junto al
trabajo del equipo (ver [[Interfaz y TeamFlow#Pestañas — equipo y consola]]),
y opera sobre el mismo `workspace` que las fases.

## Una sesión, no un proceso por mensaje

A diferencia de una fase (`runPhaseOnce` en [[Orquestador]], que abre
`query()` una vez y la cierra), la consola necesita conversación multi-turno:
el usuario escribe, espera, escribe otra vez, y el segundo mensaje debe
recordar el primero. `query()` acepta `prompt: AsyncIterable<SDKUserMessage>`
en vez de un string — `ConsoleSession.input()` es un generador que **no
termina**: se queda `await`ando en una promesa hasta que `send()` empuja un
mensaje a `pending` y resuelve `wake`. Eso es lo que mantiene un solo proceso
del SDK vivo entre turnos en vez de reabrir sesión (y perder contexto) cada
vez.

> [!info] El proceso no arranca al abrir la pestaña
> `ConsoleSession` se crea (o se recupera) en cuanto se conecta el stream SSE,
> pero `open()` — que es quien llama a `query()` — solo se dispara desde el
> primer `send()`. Mirar la consola no cuesta ni un token; escribir en ella sí.

## Interrupción y continuidad

`interrupt()` cierra el `Query` activo (`session.close()`) y sube un contador
`gen`. El generador de entrada compara su propio `gen` capturado al abrir
contra el actual; si no coinciden, termina — así el generador de una sesión ya
cerrada no compite por los mensajes que el usuario escribe para la sesión
siguiente. La conversación anterior se pierde (el proceso la sostenía), pero
el transcript en pantalla no se toca: queda un aviso de que el siguiente
mensaje empieza sin memoria de la anterior.

Reabrir la consola tras un reinicio del servidor tiene la misma propiedad: el
transcript se reproduce desde `.runs/<id>.console.jsonl`, pero la sesión nueva
no tiene el contexto de la anterior (ningún proceso sobrevive al servidor). Se
avisa con un `log` al reabrir, en vez de fingir continuidad que no existe.

## Vocabulario propio, mismo mecanismo de replay

`ConsoleEvent` (`server/src/console.ts`, espejado en `web/src/types.ts`) es
deliberadamente parecido a `ForgeEvent` (ver [[Eventos y SSE]]) pero no lleva
`phase` — aquí no hay fases, hay turnos (`turn.start`/`turn.end` en vez de
`phase.start`/`phase.end`) y mensajes de usuario (`user`). Para no duplicar
pub/sub-con-replay, `EventLog` se hizo genérico: `EventLog<E extends Base =
ForgeEvent>`. El orquestador la sigue usando sin cambios (el genérico por
defecto es `ForgeEvent`); `ConsoleSession` instancia `EventLog<ConsoleEvent>`.

`EventLog` también gana un `startSeq` opcional en el constructor: una consola
reabierta tras un reinicio del servidor necesita continuar la numeración del
`.jsonl` ya escrito, no volver a `seq=0` (que pisaría o duplicaría eventos al
reproducir). `ConsoleStore.open()` lee el transcript en disco antes de crear
la sesión y arranca `EventLog` justo después del último `seq` conocido.

El endpoint SSE (`GET /api/runs/:id/console/events` en `server/src/index.ts`)
sigue el mismo patrón que el de las fases — `?from=N`, replay de lo que falta
desde disco, suscripción en directo — con una diferencia: como aquí la sesión
sigue viva indefinidamente (no hay "ejecución terminada" que cerrar), no
existe el evento `end` que sí tiene el stream de fases.

## Mismo perímetro de seguridad que el pipeline

La consola reutiliza, sin duplicar, tres piezas que [[Orquestador]] ya exporta:

- `SPAWN_ENV` y `PIPELINE_TOOLS` — ver
  [[Aislamiento del proceso hijo]]. El usuario pilotando la consola no es más
  de fiar que un agente por estar en la misma máquina y la misma cuenta: el
  proceso hijo que lanza sigue pudiendo heredar el toolset del harness o los
  conectores MCP de la cuenta si no se aísla igual.
- `TOKEN_EFFICIENCY_PLUGIN_PATH` — la misma Skill de ahorro de tokens que
  siguen las nueve fases ([[Eficiencia de tokens]]).
- `buildGuard(workspace, onDeny)` — ver más abajo, cambió de firma para poder
  compartirse.

`ConsoleSession` no comparte instancia de guard con ninguna fase (cada
`open()` construye la suya), pero sí la misma función y las mismas reglas:
`ALLOWED_TOOLS`, contención de rutas al `workspace`, `FORBIDDEN_COMMANDS`.

## `buildGuard` se desacopla de `PhaseId`

Antes, `buildGuard(workspace, phase: () => PhaseId, emit)` conocía el
vocabulario de eventos del pipeline: emitía `{ t: 'denied', phase: phase(), ...
}` directamente. La consola no tiene `PhaseId` ni ese vocabulario, así que
`guard.ts` dejó de saber nada de eventos — ahora es
`buildGuard(workspace, onDeny: (name, reason) => void)`, y cada llamador
decide cómo convertir esa denegación en su propio evento:

```ts
// orchestrator.ts
canUseTool: buildGuard(this.workspace, (name, reason) =>
  this.emit({ t: 'denied', phase, name, reason }),
)

// console.ts
canUseTool: buildGuard(this.workspace, (name, reason) =>
  this.log.emit({ t: 'denied', name, reason }),
)
```

Ver [[Seguridad (guard)]] — las reglas en sí (lista de permitidos, contención
de rutas, comandos prohibidos) no cambiaron, solo cómo se reporta una
denegación.

## Pestaña deshabilitada mientras el equipo trabaja

`App.tsx` deshabilita la pestaña de consola si `running` (el run sigue en
`'running'` o `'paused'`). No es una limitación técnica del SDK — es que dos
sesiones escribiendo el mismo `workspace` a la vez (una fase del pipeline y un
turno de consola) se pisarían sin que nada las coordine. Se reactiva sola en
cuanto el run deja de estar activo.

## Lo que el panel de archivos gana de gratis

`FilesPanel` dejó de recibir `state: RunState` y pasó a recibir
`touched: Map<string, unknown>` — un mapa ya fusionado en `App.tsx` entre lo
que tocaron los agentes (`state.files`) y lo que ha tocado la consola
(`consoleRun.state.files`). El panel no distingue el origen: un archivo
editado desde la consola se marca en verde y dispara una relectura del árbol
exactamente igual que uno editado por un agente — es el mismo evento `file`
en los dos vocabularios, consumido por el mismo componente.
