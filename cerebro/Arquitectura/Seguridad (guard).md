---
title: Seguridad (guard)
tags:
  - arquitectura
  - seguridad
---

# Seguridad (guard)

`server/src/guard.ts`. Cada ejecución vive en `workspaces/<slug>/` y el guard
es lo que intenta que nada salga de ahí. Se conecta al SDK vía
`canUseTool: buildGuard(...)` en [[Orquestador]] — con `permissionMode: 'default'`
y sin `allowedTools`, **toda** llamada a herramienta pasa por este callback.

## Lista de permitidos primero (`ALLOWED_TOOLS`)

Antes de cualquier otra comprobación, el guard exige que la herramienta esté
en `ALLOWED_TOOLS` (`Bash`, `Write`, `Edit`, `Read`, `Glob`, `Grep`,
`NotebookEdit`, `WebFetch`, `WebSearch`, `Task`, `TodoWrite`, `Skill`) o
empiece por `mcp__forge__` (el servidor propio de
[[Preguntas al usuario (ask)]]). Cualquier otra cosa se deniega sin mirar
nada más.

> [!bug] Antes era al revés — encontrado por una fuga real, no por precaución
> Hasta este cambio, `buildGuard` no tenía ninguna lista de permitidos: todo
> lo que no coincidiera con las comprobaciones de abajo (ruta fuera del
> workspace, comando prohibido de `Bash`) se permitía por omisión. Eso era
> seguro mientras el proceso hijo solo viera las herramientas nativas del
> SDK — pero una prueba real mostró que puede acabar viendo hasta 83
> herramientas ajenas (MCP de Gmail/Notion/Drive conectados a la cuenta,
> todo el toolset de administración de la sesión que lanzó el servidor), sin
> que `settingSources: []` lo evite. Con "permitir salvo lo reconocido como
> peligroso", cualquiera de esas 83 se habría permitido si el modelo hubiera
> decidido llamarla. Detalle completo, causa raíz y verificación en
> [[Aislamiento del proceso hijo]].

## Contención de rutas

`PATH_INPUTS` mapea qué parámetro de qué herramienta es una ruta de archivo
(`Write.file_path`, `Edit.file_path`, `NotebookEdit.notebook_path`,
`Read.file_path`). `isInside(workspace, target)` comprueba con
`path.relative` que la ruta resuelta no empiece por `..` ni sea absoluta fuera
del workspace. Si no está dentro, se deniega con el motivo
`ruta fuera del workspace (<valor>)`.

## Comandos prohibidos (`FORBIDDEN_COMMANDS`)

Solo se comprueban contra `Bash`. Lista de expresiones regulares con su motivo:

| Qué bloquea | Motivo |
|---|---|
| `rm -rf /`, `rm -rf ~`, `rm -rf C:\` | borrado recursivo fuera del workspace |
| `rm -rf ...` con una ruta que sale del workspace (`..`) | borrado recursivo con ruta que sale del workspace |
| `mkfs`, `fdisk`, `diskpart`, `format C:` (no `format.ts` ni `--format=`) | operación de disco |
| `shutdown`, `reboot`, `halt`, `poweroff` | apagado del sistema |
| `sudo`, `su -` | escalada de privilegios |
| `curl`/`wget`/`iwr` \| intérprete (sh, python, node...) — salvo si el origen es localhost/127.0.0.1/0.0.0.0/::1 | ejecución de script remoto |
| `Invoke-Expression` / `iex` | ejecución dinámica de código |
| `git push` (con o sin opciones/`-C`/`--git-dir` de por medio) | publicación en remoto |
| `gh pr/release/repo create/edit` | publicación en GitHub |
| `npm/pnpm/yarn publish` | publicación de paquete |
| `docker push` | publicación de imagen |
| `vercel/netlify/fly/railway deploy/launch` | despliegue en producción |
| `netsh`, `iptables`, `ufw` | cambio de firewall |
| `reg add/delete`, `Set-ItemProperty -Path HK...` | cambio en el registro de Windows |

> [!warning] Dos trampas ya resueltas en el código, documentadas ahí mismo
> - `format` a secas bloqueaba `format.ts`, `--format=json` y `git log
>   --format`. Ahora solo cuenta `format` seguido de una unidad (`C:`) o una
>   ruta absoluta estilo Unix (`/algo`).
> - El bloqueo de `curl | sh` también atrapaba `curl http://localhost:3100/api
>   | node -e ...`, que es la app **probándose a sí misma** (p. ej. la fase de
>   integración verificando su propio servidor), no trayendo código remoto. El
>   patrón ahora exime explícitamente los destinos localhost/127.0.0.1/
>   0.0.0.0/`::1`.

## Otros aislamientos (no en `guard.ts`, pero parte del mismo perímetro)

- `settingSources: []` en las opciones del SDK ([[Orquestador]]): una fase no
  carga `settings.json` (user/project/local) ni `.claude/skills` del host.
  **No** cubre la herencia de `process.env` ni los servidores MCP conectados
  a la cuenta que autentica el proceso — eso es lo que
  [[Aislamiento del proceso hijo]] encontró y por lo que `ALLOWED_TOOLS`
  existe: la garantía real está en el guard, no en `settingSources`.
- `env`/`tools` explícitos en las opciones del SDK: reducen qué ve el modelo
  listado (menos ruido, menos tokens), pero no son la garantía — ver la nota
  de arriba.
- Nada de despliegue saliente: `git push`, `npm publish`, `docker push` y los
  comandos de despliegue de plataformas están bloqueados arriba — los agentes
  construyen, publicar es decisión del usuario.
- Validación estricta de IDs de ejecución en `server/src/index.ts`
  (`workspaceFor`): `/^[A-Za-z0-9._-]+$/`, y explícitamente rechaza `.` y `..`.

> [!danger] El agujero real que motivó esa validación
> Express decodifica `%2f` **antes** de que la ruta llegue al handler. Un id
> como `..%2f..%2f` llegaba como `../../`, y `path.basename` por sí solo lo
> hubiera dejado en `..` — suficiente para listar y leer el repositorio
> completo, incluido `server/.env`, a través de `GET /api/runs/:id/files` y
> `/file`. Por eso `workspaceFor` valida la **forma completa** del id, no solo
> el último segmento.

## Qué NO cubre esto

Bash puede cambiar de directorio: un `cd .. && rm -rf otra-cosa` pasa el
filtro tal cual está escrito, porque las regex de `FORBIDDEN_COMMANDS` miran
el comando completo pero no ejecutan un intérprete de shell para resolver el
`cd` primero. Los bloqueos son un cinturón de seguridad para la *conducta* del
agente (que normalmente coopera y busca otro camino cuando algo se deniega),
no una cárcel: el aislamiento fuerte de verdad sería un contenedor.

Los bloqueos son informativos para el agente — el mensaje de denegación se le
devuelve como parte del resultado de la tool, y aparece en rojo en el
transcript de la interfaz (evento `denied`, ver [[Eventos y SSE]]).

Tampoco cubre esto: `ALLOWED_TOOLS` deniega la *llamada*, no oculta la
herramienta del *listado* que ve el modelo cada turno — ver
[[Aislamiento del proceso hijo]] para el porqué (no hay forma confirmada de
ocultar lo que aporta un MCP conectado a la cuenta).
