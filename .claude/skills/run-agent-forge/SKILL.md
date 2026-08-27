---
name: run-agent-forge
description: Arranca, compila, prueba y pilota Agent Forge — el servidor Express con SSE y la interfaz React. Úsalo para levantar la app, ejecutar el smoke test de la API, capturar pantallas del navegador o lanzar una ejecución real de agentes. Also for running, starting, building, testing or screenshotting Agent Forge.
---

# Ejecutar Agent Forge

Agent Forge es un servidor Express (`server/`) que orquesta ocho fases del Claude Agent SDK
sobre un workspace, y una SPA de React (`web/`) que muestra el progreso en vivo por SSE.
Los agentes escriben código de verdad en `workspaces/<id>/`.

Lo caro es la parte de agentes. Por eso este skill trae un **fixture**: una ejecución real
grabada (162 eventos) que se instala en `.runs/` y se reproduce por la ruta de replay del
servidor. Con eso la interfaz se puebla entera —rail de fases, transcript con razonamiento,
explorador de archivos— **sin gastar un solo token**. Solo el modo `live` llama a Claude.

Todas las rutas de este documento son relativas a `agent-forge/`.

## Requisitos

- **Node 24+.** El script `dev` del servidor usa `node --watch --import tsx`.
  Verificado con `v24.16.0`.
- **Chrome instalado.** El modo `ui` usa `playwright-core` con `channel: 'chrome'`: pilota
  el Chrome del sistema, no descarga navegador.
- **Credenciales solo para `live`.** Con `ANTHROPIC_API_KEY` en `server/.env` se factura por
  token; sin ella, el SDK usa la sesión de Claude Code y consume cuota de suscripción.
  `smoke`, `ui` y `serve` no tocan ninguna de las dos.

## Compilar

```bash
npm install
npm run install:all
npm --prefix .claude/skills/run-agent-forge install
```

La tercera línea es aparte a propósito: `install:all` solo instala `server/` y `web/`, no el
`playwright-core` del harness.

```bash
npm run typecheck
```

Sin salida por fase = correcto (`tsc --noEmit` en servidor y web).

## Ejecutar — camino del agente

El harness vive en `.claude/skills/run-agent-forge/driver.mjs`. Arranca el servidor, espera a
que escuche, afirma, y **mata el árbol de procesos al terminar**.

### 1. Smoke: API y replay, sin cuota

```bash
node .claude/skills/run-agent-forge/driver.mjs smoke
```

Tarda unos 10 s (más ~40 s la primera vez, que compila `web/dist`). Salida real:

```
  ✓ web/dist esta al dia
  ✓ fixture instalado como "fixture-demo" (161 eventos)
  ✓ servidor arriba en http://localhost:5178 (modelo claude-opus-5)
·   aviso: sin ANTHROPIC_API_KEY -> usara las credenciales de Claude Code
  ✓ GET /api/health responde
  ✓ GET /api/roles devuelve las 8 fases (Producto, Arquitecto, Backend, Frontend, Integración, Revisión, Correcciones, Entrega)
  ✓ GET /api/runs incluye el fixture
  ✓ el replay SSE devuelve 161 eventos
  ✓ el primer evento es run.start
  ✓ el replay contiene eventos de archivo
  ✓ GET /files lista 2 archivos del workspace
  ✓ GET /file devuelve el contenido del brief
  ✓ el replay termina en run.end
  ✓ ?from=N reanuda exactamente en ese numero de secuencia
  ✓ rechazado con 404: ruta que sale del workspace
  ✓ rechazado con 404: ruta escapada en URL
  ✓ rechazado con 404: ruta absoluta del sistema
  ✓ rechazado con 404: un directorio en vez de un archivo
  ✓ rechazado con 404: id con travesia (listado)
  ✓ rechazado con 404: id con travesia (lectura)
  ✓ POST /api/runs rechaza una idea demasiado corta
  ✓ cualquier ruta sirve la SPA
  ✓ una ruta /api desconocida es 404, no la SPA

SMOKE OK — sin consumir cuota
```

Las seis comprobaciones de travesía no son decorado: las dos del `id` corresponden a un
agujero real que existió aquí. Express decodifica `%2f` **antes** de llegar al handler, así
que `/api/runs/..%2f..%2f/file?path=server/.env` llegaba como id `../../`, y con eso se leía
el repositorio entero, `server/.env` incluido. Si alguna vez vuelven a dar 200, es el mismo
fallo otra vez.

### 2. UI: Chrome de verdad y capturas

```bash
node .claude/skills/run-agent-forge/driver.mjs ui
```

Corre el smoke y luego abre Chrome sobre `http://localhost:5178` (el servidor sirve
`web/dist` en el mismo origen, así el proxy de Vite no participa). Añade:

```
  ✓ la pantalla inicial renderiza el formulario
  ✓ el ejemplo rellena la idea
  ✓ el boton de construir se habilita
  ✓ la banda del equipo muestra los 8 agentes
  ✓ hay 1 agente(s) con la fase completada
  ✓ cada agente tiene su personaje (9 dibujos)
  ✓ el panel de archivos lista 2 archivo(s)
  ✓ el conmutador de razonamiento muestra los bloques de pensamiento
  ✓ el visor muestra el contenido del archivo
  ✓ la barra lateral se oculta en movil
  ✓ sin errores de consola

UI OK — capturas en .claude\skills\run-agent-forge\shots/
```

Deja cuatro PNG en `.claude/skills/run-agent-forge/shots/`:

| Captura | Qué prueba |
|---|---|
| `01-nueva-app.png` | Formulario inicial, ejemplos, idioma/rondas/presupuesto |
| `02-ejecucion.png` | Banda del equipo (8 agentes con su personaje), transcript, workspace |
| `03-archivos.png` | Razonamiento activado + visor de `docs/00-BRIEF.md` |
| `04-movil.png` | 700 px de ancho, sin barra lateral |

**Abre `02-ejecucion.png` y míralo.** Las aserciones cuentan nodos del DOM; no ven que la banda
diga "trabajando…" en una ejecución ya detenida ni que el bundle servido sea de hace tres
cambios. Los dos bugs se encontraron mirando ese PNG, no leyendo los ✓.

### 3. Live: ejecución real (CONSUME CUOTA)

```bash
node .claude/skills/run-agent-forge/driver.mjs live
```

Lanza una idea de prueba con `maxReviewRounds: 0` y `maxBudgetUsd: 3`, y corta en cuanto el
agente de producto escribe su primer archivo. Un par de minutos. Salida real:

```
  ✓ run creado: 2026-08-20-aedbb6
· esperando a la primera escritura en disco (hasta 6 min)…
  eventos: {"run.start":1,"phase.start":1,"text":2,"tool":1,"file":1}
  ✓ el agente pidio escribir docs/00-BRIEF.md
  ✓ run detenido
  ✓ el workspace tiene 1 archivo(s) en disco
  ✓ docs/00-BRIEF.md trae 28937 caracteres reales
  ✓ llega prosa en streaming
· razonamiento en este turno: 0 deltas

LIVE OK
```

La idea por defecto es un panel de fisioterapeutas; puedes pasar otra como argumento:
`node .claude/skills/run-agent-forge/driver.mjs live "Un lector de RSS con carpetas y modo lectura"`.

### 4. Una ejecución completa, sin agotar la cuota a la primera

`live` solo demuestra la cadena hasta el primer archivo. Para el pipeline entero, crea la
ejecución tú y bájale el esfuerzo, porque **con suscripción el arquitecto a `effort: max`
agota la cuota**: pasó dos veces seguidas, a los ~30 minutos y ~5 $ cada vez.

```bash
curl -s -X POST localhost:5178/api/runs -H 'Content-Type: application/json' -d '{
  "idea": "Una herramienta para que los organizadores de eventos pequeños vendan entradas con QR y controlen el acceso en la puerta",
  "model": "claude-sonnet-5",
  "effortCap": "medium",
  "maxReviewRounds": 1
}'
```

Si aun así se corta, no repitas desde cero: el workspace conserva el trabajo y `docs/` es el
contrato entre agentes. Se retoma por la primera fase sin terminar.

```bash
curl -s -X POST localhost:5178/api/runs -H 'Content-Type: application/json' -d '{
  "idea": "<la misma idea>",
  "resumeOf": "2026-08-20-a2f2c2",
  "startFrom": "architect",
  "model": "claude-sonnet-5",
  "effortCap": "medium"
}'
```

En la interfaz es el botón **«Retomar en \<fase\>»** de la cabecera, que solo sale en
ejecuciones fallidas o detenidas.

## Ejecutar — camino humano

Dos servidores, recarga en caliente en ambos:

```bash
npm run dev
```

API en `http://localhost:5178`, interfaz en `http://localhost:5179` (Vite proxea `/api`).
Levanta en ~1 s. Para servir todo desde un único puerto, como en el modo `ui`:

```bash
npm run build && npm start
```

Si quieres el servidor en primer plano **con el fixture ya instalado** —útil para trastear a
mano sin gastar cuota— el harness también hace eso:

```bash
node .claude/skills/run-agent-forge/driver.mjs serve
```

## Trampas

- **`allowedTools` anula el guard.** Poner un nombre de herramienta ahí hace que el SDK la
  autoapruebe *antes* de llamar a `canUseTool`, y la contención de rutas de `server/src/guard.ts`
  deja de ejecutarse. Por eso `orchestrator.ts` no tiene `allowedTools` y usa
  `permissionMode: 'default'`. Si al arrancar una fase ves
  `canUseTool will not be invoked for: Read, Glob, ...`, alguien lo ha vuelto a poner.
- **El evento `file` se emite al pedir la herramienta, no al escribir.** Parar la ejecución
  justo al recibirlo aborta el `Write` y deja `docs/` vacío. Por eso `live` espera a que
  `/api/runs/:id/files` vea el archivo antes de llamar a `/stop`.
- **El razonamiento es adaptativo.** El mismo prompt da 135 deltas de `thinking` una vez y 0
  la siguiente. No lo conviertas en aserción: el fixture sí trae razonamiento grabado, y esa
  es la prueba fiable del conmutador.
- **`tsx watch` se cuelga bajo `concurrently` en Windows.** Arranca, imprime su cabecera y
  nunca llega a escuchar. Por eso `server/package.json` usa
  `node --watch --import tsx src/index.ts`. No lo revierta nadie a `tsx watch`.
- **`web/dist` rancio miente.** El servidor sirve el bundle compilado; si editas `web/src` y
  arrancas con `npm start`, ves la interfaz anterior. El harness compara fechas y recompila
  (`web/dist esta rancio`), pero a mano hay que acordarse del `npm run build`.
- **El fixture pisa datos reales.** `installFixture()` borra y reescribe
  `workspaces/fixture-demo/` y `.runs/fixture-demo.*` en cada ejecución. Las demás
  ejecuciones no se tocan.
- **Un error de cuota mata la ejecución entera, no solo la fase.** El orquestador reconoce
  «You've hit your limit», saldo agotado y credenciales inválidas, y para. Antes seguía: seis
  fases fallando en cuatro segundos cada una y la ejecución anunciando `done` al final.
  Si tocas `FATAL_ERRORS` en `orchestrator.ts`, esa cascada es lo que vuelve.
- **La trama de cierre del SSE también lleva `data:`.** Un lector ingenuo cuenta
  `event: end\ndata: {}` como un evento más y añade un `{}` al final de cada replay. El
  harness corta al ver `event: end`; si escribes otro cliente, hazlo igual.
- **Una ejecución terminada sigue en memoria.** `RunStore` no la suelta mientras vive el
  proceso, así que el endpoint de eventos comprueba el estado y cierra el stream. Sin eso el
  navegador se queda "en directo" para siempre sobre algo que ya no emite.
- **El servidor se reutiliza.** Si ya hay algo escuchando en 5178, el driver lo usa en vez de
  arrancar el suyo — y entonces *no* lo mata al salir. Cómodo, pero si ese proceso es viejo
  estarás probando código antiguo.

## Si algo falla

**`el servidor no respondio en 30s`** — casi siempre hay un huérfano ocupando el puerto:
`npm` lanza un hijo, así que matar el PID de npm deja el proceso real vivo. Libéralo:

```powershell
Get-NetTCPConnection -LocalPort 5178 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

**5179 carga pero está vacío y la consola de Vite escupe `http proxy error: /api/health
AggregateError [ECONNREFUSED]`** — Vite vive, la API no. Comprueba con
`curl -s http://localhost:5178/api/health`. Si no responde y `npm run dev` imprimió
`> tsx watch src/index.ts` sin la línea `Agent Forge escuchando`, es la trampa de `tsx watch`
de arriba.

**La captura no coincide con el código que acabas de escribir** — bundle viejo. Borra y
recompila:

```bash
rm -rf web/dist && npm run build
```

**`live` agota los 6 minutos sin ningún evento `file`** — mira el desglose de `eventos:` que
imprime. Si hay `text` o `thinking`, el agente sigue razonando y solo necesita más tiempo
(sube `seconds` en `live()`). Si solo hay `run.start` y `phase.start`, la sesión del SDK no
arrancó: revisa las credenciales y la advertencia del arranque del servidor.

**El rail se queda en "trabajando…" para siempre** — una fase interrumpida no emite
`phase.end`. El reductor de `web/src/state.ts` la marca como `stopped` al recibir un
`run.end` que no sea `done`; si vuelve a aparecer, ese es el sitio.
