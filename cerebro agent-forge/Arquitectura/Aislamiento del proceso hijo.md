---
title: Aislamiento del proceso hijo
tags:
  - arquitectura
  - seguridad
---

# Aislamiento del proceso hijo

Incidente real, encontrado y arreglado en la misma sesión, mientras se
verificaba la carga del [[Eficiencia de tokens|plugin de ahorro de tokens]].
No especulativo: reproducido, diagnosticado con datos reales de un
`system`/`init` real, y verificado con una prueba determinista de `guard.ts`
(`ALLOWED_TOOLS`) — no una suposición sin comprobar.

## Lo que se encontró

`settingSources: []` en [[Orquestador]] se documenta (y se pensaba) como
aislamiento suficiente del `~/.claude` del host. Al inspeccionar el mensaje
`system`/`init` de una sesión real de `query()`, el agente de backend
(`canConsult: true`, sin ningún motivo para necesitar nada de esto) tenía
disponibles **83 herramientas**, incluyendo:

- Todo el toolset de administración de la sesión que lanzó el servidor
  (`CronCreate/Delete/List`, `Monitor`, `PushNotification`, `ScheduleWakeup`,
  `RemoteTrigger`, `PowerShell`, `EnterPlanMode`/`ExitPlanMode`, etc.)
- **~70 herramientas MCP de Gmail, Google Calendar, Google Drive y Notion**
  conectadas a la cuenta que autentica el proceso.
- Skills instaladas globalmente en la máquina (`update-config`, `debug`,
  `simplify`, `batch`, `fewer-permission-prompts`, `loop`, `schedule`,
  `claude-api`) — ninguna pensada para este pipeline.

## Por qué pasaba (dos mecanismos distintos, no uno)

1. **Herencia de `process.env`.** `Options.env` del SDK dice literalmente
   "Defaults to `process.env`". El servidor de Agent Forge se ha operado toda
   esta sesión lanzando `npm start` desde una herramienta Bash de una sesión
   de Claude Code — así que el proceso Node hereda variables como
   `CLAUDECODE=1`, `CLAUDE_CODE_CHILD_SESSION=1`, `CLAUDE_CODE_SESSION_ID=...`.
   El `claude.exe` que `query()` lanza como hijo las hereda a su vez y se
   comporta como sesión-hija de la que lo lanzó — heredando su toolset del
   propio harness (`CronCreate`, `Monitor`, etc.). Confirmado contra la
   documentación oficial que **solo dos** de esas variables están
   documentadas (`CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`); el resto
   (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_BRIDGE_SESSION_ID`,
   `CLAUDE_CODE_MESSAGING_*`, ...) **no están documentadas** — es
   comportamiento no garantizado, no una API estable.
2. **Conectores de cuenta.** Las ~70 tools de Gmail/Calendar/Drive/Notion
   **no** desaparecieron ni limpiando `env` ni restringiendo `Options.tools`
   a una lista explícita — ese campo solo filtra herramientas nativas del
   CLI, no las que aporta un servidor MCP conectado a la cuenta que autentica
   la sesión. Todo apunta a que son conectores a nivel de cuenta (la misma
   cuenta de Claude Code autenticada en esta máquina), no algo que dependa de
   un archivo de configuración local — por eso ninguna variante de aislar
   `env`/`cwd`/directorio de configuración las habría ocultado.

> [!warning] `settingSources: []` protege menos de lo que su nombre sugiere
> Gatea la carga de `settings.json` (user/project/local) y `.claude/skills`.
> **No** gatea la herencia de `env`, ni los servidores MCP que llegan
> conectados a la cuenta autenticada. El comentario del código que decía "un
> run debe depender solo de lo que este orquestador pasa" era la intención
> correcta, pero `settingSources: []` por sí solo no la cumplía.

## El arreglo: tres capas, la última es la que de verdad garantiza algo

1. **`SPAWN_ENV`** (`orchestrator.ts`) — copia de `process.env` sin las
   variables de sesión identificadas (`CLAUDECODE`, `CLAUDE_CODE_*`,
   `AI_AGENT`, `CLAUDE_PID`, `CLAUDE_EFFORT`, `Claude`). `env` en `Options`
   **reemplaza** `process.env`, no hace merge — confirmado en la
   documentación del SDK — así que hay que partir de una copia completa para
   no perder `PATH`/`HOME` y romper `Bash`/`npm`. Cerró la fuga del toolset
   del harness (`CronCreate`, `Monitor`, ...) en combinación con el punto 2.
2. **`PIPELINE_TOOLS`** (`orchestrator.ts`) — `tools: [...]` explícito con
   solo lo que el pipeline necesita. Confirmado por prueba real: filtra
   herramientas nativas (cerró `CronCreate`/`Monitor`/`PushNotification`/
   `RemoteTrigger`/`ScheduleWakeup`/`PowerShell` sin tocarlas una a una), pero
   **no** filtra lo que aporta un servidor MCP — de ahí que las tools de
   Gmail/Notion/Drive siguieran apareciendo en el listado pese a esto.
3. **`ALLOWED_TOOLS` en `guard.ts` — la capa que de verdad importa.**
   `buildGuard()` pasó de "todo permitido salvo lo reconocido como
   peligroso" a "nada permitido salvo lo que el pipeline necesita de verdad"
   (`Bash`, `Write`, `Edit`, `Read`, `Glob`, `Grep`, `NotebookEdit`,
   `WebFetch`, `WebSearch`, `Task`, `TodoWrite`, `Skill`, y cualquier
   `mcp__forge__*` — el servidor propio de
   [[Preguntas al usuario (ask)]]). Esta es la única capa que actúa en el
   momento de la **llamada real**, no solo del listado — por eso es la que de
   verdad cierra el riesgo, independientemente de por qué una herramienta
   ajena esté disponible. Ver [[Seguridad (guard)]].

> [!info] Lo que sigue sin resolverse, honestamente
> Las tools de Gmail/Notion/Drive **siguen apareciendo en el listado** que ve
> el modelo (no hay forma confirmada de ocultarlas desde las opciones del
> SDK) — solo se garantiza que una llamada real se deniega. Ocupan además
> algo de contexto en cada turno solo por estar listadas — un coste de
> tokens pequeño pero real que ninguna de las tres capas elimina del todo.

## Verificación

- **`.../verify-plugin-isolation.mts`** (scratchpad de la sesión): lanza
  `query()` con las opciones reales del rol `backend` (incluyendo el servidor
  MCP propio y el subagente `architect-advisor`), aborta en el mensaje
  `system`/`init` antes de cualquier turno facturable, e inspecciona la lista
  de tools. Confirmó el problema primero (83 tools, fuga real) y luego que
  `env`+`tools` cierran la fuga del harness sin tocar `mcp__forge__` ni
  `Task`.
- **`.../probe-guard-isolation.mts`** (scratchpad): prueba pura de
  `buildGuard()`, sin SDK y sin coste — 21/21 comprobaciones en verde,
  incluyendo que Gmail/Notion/Drive/Cron/Monitor/PushNotification/PowerShell/
  AskUserQuestion nativo se deniegan, que `Bash`/`Read`/`Write`/`Glob`/
  `Grep`/`Task`/`TodoWrite`/`Skill`/`WebFetch`/`mcp__forge__preguntar_al_usuario`
  siguen permitidos, y que las reglas previas (rutas fuera del workspace,
  `git push`, `rm -rf /`) no se rompieron.

> [!note] Por qué esta prueba y no una ejecución real completa
> Provocar que el modelo intente llamar a una de estas tools de verdad no es
> determinista (depende de que decida hacerlo) y costaría cuota real sin
> garantizar la cobertura. Probar `buildGuard()` como función pura contra
> cada caso es gratis, determinista y prueba exactamente lo que importa: qué
> decide el guard, no si el modelo llega a pedirlo.
