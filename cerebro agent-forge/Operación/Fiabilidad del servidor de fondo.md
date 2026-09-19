---
title: Fiabilidad del servidor de fondo
tags:
  - operacion
---

# Fiabilidad del servidor de fondo

Varios incidentes reales, ninguno por un bug en la lógica de negocio de Agent
Forge — todos por cómo vive el servidor de fondo (reinicios, cuelgues,
escrituras concurrentes) mientras una ejecución real está en marcha.

## El servidor se cae entre reconexiones de sesión

`npm start &` se lanzó como proceso hijo de esta sesión. En algún punto entre
turnos el proceso desapareció sin volcado de error (`/api/health` empezó a
devolver conexión rechazada) — coincide con el patrón ya visto de "shell en
segundo plano sin registro de finalización" al reanudar una sesión. El
workspace no se pierde (`docs/` y el código ya escrito siguen en disco); lo
que se pierde es la ejecución en memoria. Recuperación: reiniciar el servidor
y retomar con `resumeOf` + `startFrom` en la fase que quedó a medias — ver
[[Cuota, pausas y reanudación]].

> [!warning] Esto no es un caso que `classifyFailure` pueda atrapar
> El proceso del servidor entero desaparece, no solo la fase — no hay ningún
> evento de error que capturar porque no hay proceso vivo que lo emita. La
> única señal es `/api/health` sin respuesta. No hay arreglo de código posible
> aquí: es responsabilidad de quien opera el servidor comprobar que sigue vivo.

Volvió a pasar una tercera vez en la misma prueba de la red social de libros,
justo mientras la ejecución estaba en pausa por cuota esperando el reset de
las 5:00 — al reiniciar, `reapOrphans` cerró correctamente esa ejecución como
`stopped` (ver [[Workspaces y slugs#Reaparición de huérfanos (reapOrphans)]]),
así que no hizo falta más que retomar. Tres apariciones en la misma sesión de
trabajo refuerzan la conclusión: es un patrón operativo del entorno, no un bug
puntual a perseguir en el código.

## Editar `server/src/` mientras hay una ejecución real en marcha la mata

Cuarto incidente, distinto de los anteriores: aquí sí hubo una causa
identificable, y fui yo (Claude Code, en la sesión de desarrollo). `npm run
dev` levanta el servidor con `node --watch --import tsx src/index.ts`. Con
una ejecución real en curso (Kairos, diseño + arquitecto en paralelo),
edité varios archivos de `server/src/` para un cambio de producto — `--watch`
reinició el proceso en caliente, y con él se fue la ejecución en memoria.

No es un bug de Agent Forge — es una consecuencia directa de tener el
servidor en modo desarrollo con recarga en caliente. `Run` no tiene ningún
`process.on('SIGTERM' | 'exit', …)` que intente cerrar limpiamente las fases
activas antes de que `--watch` mate el proceso; simplemente desaparece, igual
que en el primer incidente de esta nota, pero con una causa conocida en vez
de un misterio del entorno.

Verificado en real, dos cosas buenas:

- **`reapOrphans` se comió el golpe igual que con el resto de caídas**: al
  reiniciar, cerró la ejecución como `stopped` con el mismo mensaje de
  siempre ("La ejecución se perdió al reiniciarse el servidor."), confirmado
  vía `GET /api/runs/:id` (`status: "stopped"`, `currentPhase: null`) sin
  intervención manual.
- **No quedó ningún proceso `claude.exe`/`node.exe` huérfano** de las fases
  de diseño/arquitecto que estaban corriendo — comprobado listando la tabla
  de procesos completa por línea de comandos (`Get-CimInstance
Win32_Process`) justo después del reinicio. `--watch` mató también a los
  hijos, aunque no hay ningún `killTree` (`procs.ts`) de por medio en este
  camino — a diferencia de `Run.stop()`, que sí lo llama explícitamente.

Lo que este incidente sí destapó fue un bug real y distinto, ya corregido:
retomar esa ejecución con el botón/API fallaba con 400 porque el manifiesto
se había quedado con el nombre de carpeta anterior al rename de Producto —
ver [[Workspaces y slugs#El problema que esto le crea a reanudar, y cómo se resolvió]]
para el detalle completo y el arreglo.

**Regla operativa**: no editar `server/src/` mientras una ejecución real está
`running`/`paused` si se puede evitar — para probar un cambio de código, para
la ejecución primero (`POST /api/runs/:id/stop`) o espera a que termine.

## `node --watch` se reinicia solo por falsos positivos en Windows, sin que nadie edite nada

Sexto incidente, durante [[Pruebas/Kairos, bot de trading (prueba)|Kairos]]: dos
reinicios del servidor a mitad de una fase real, ninguno causado por editar
código.

1. `node --watch --import tsx src/index.ts` (el `dev` original, sin
   `--watch-path`) vigila **todo el grafo de módulos importado**, node_modules
   incluido. Nada más arrancar la fase de frontend, el log mostró: `Change
detected in 'server\node_modules\iconv-lite\encodings\dbcs-data.js' —
Restarting`. Ese archivo no cambió — el propio Claude Agent SDK lo lee al
   decodificar la salida del proceso hijo que acaba de lanzar, y en Windows
   una simple lectura puede disparar el mismo evento de "cambio" que una
   escritura real. El reinicio mató la ejecución en memoria (`reapOrphans` la
   cerró como `stopped`, igual que en los incidentes anteriores).
2. **Arreglo aplicado**: `server/package.json` — `dev` pasó a
   `node --watch-path=./src --import tsx src/index.ts`, para vigilar solo el
   código propio y no `node_modules`. No fue suficiente del todo: en un
   reintento posterior, el mismo patrón de falso positivo volvió a saltar
   sobre `server/src/files.ts` (mtime real: días antes, sin ningún cambio de
   verdad) mientras una pestaña del navegador seguía haciendo polling contra
   un run antiguo — otra vez una simple lectura/acceso, no una edición,
   bastó para que el watcher de Windows lo reportara como cambio.

**Regla operativa, más estricta que la de arriba**: para una ejecución real y
larga (cualquier fase con `effort: 'xhigh'`, que puede tardar horas), arrancar
el servidor **sin `--watch`** — `npm --prefix server run start` (`tsx
src/index.ts` directo) en vez de `npm run dev` — y dejar Vite (`npm --prefix
web run dev`) aparte para la recarga en caliente de la interfaz, que no
comparte este problema. `--watch`/`--watch-path` siguen siendo cómodos para
iterar código con el servidor sin una ejecución real en curso, pero no son
fiables como modo de operación mientras el pipeline trabaja de verdad.

## `writeManifest()` sin encolar tumbaba el servidor al retomar

Quinto incidente, y el más caro de diagnosticar: retomar Kairos en `backend`
(producto/diseño/arquitecto ya hechos, sembrados de golpe) colgaba el
servidor entero — sin responder ni a `/api/health` — justo después de
`phase.start backend`, cuatro veces seguidas, siempre en el mismo punto.

**Camino equivocado que se investigó primero**: con el servidor sin
responder y CPU del proceso sin moverse ni un tick durante varios minutos,
la hipótesis inicial fue un cuelgue de sistema operativo — `trackChild()`
(`orchestrator.ts`) llama a `childProcesses()` (`procs.ts`), que lanza un
`powershell.exe` con `Get-CimInstance Win32_Process` para localizar al hijo
recién lanzado, y ese patrón ya tiene precedente en esta nota (ver más abajo,
"Una fase se cuelga"). Se llegó a comprobar memoria libre del sistema (2.4
GB de 15.4 GB, con ~22 procesos `node`/`claude` de varias sesiones de Claude
Code abiertas) como posible causa de un `CreateProcess` lento a nivel de
SO. Un test aislado de `childProcesses()` contra el PID real del servidor
respondió en 502 ms — descartando esa hipótesis por completo. Mandar a
investigar sin evidencia real es exactamente lo que esta nota ya advertía no
hacer ("Una fase se cuelga sin fallar ni terminar"), y aquí casi se repite el
error: la pista que sí importaba estaba en el log del proceso, no en el
sistema operativo.

**Causa real**, encontrada al mirar la salida real del proceso en segundo
plano en vez de solo sondear `/api/health`:

```
Error: EPERM: operation not permitted, rename
'.runs\quiero-hacer-un-bot-de-8795f3.json.tmp-20212-c656d5e1' ->
'.runs\quiero-hacer-un-bot-de-8795f3.json'
    at async writeJsonAtomic (server/src/runs.ts:324:3)
    at async RunStore.writeManifest (server/src/runs.ts:304:5)
Node.js v24.20.0
```

El arreglo de la corrupción de manifiestos (ver
[[../Arquitectura/Workspaces y slugs#El problema que esto le crea a reanudar, y cómo se resolvió|Workspaces y slugs]])
cambió `writeManifest()` a escritura atómica (temporal + `rename()`) para
que dos escrituras concurrentes no se entrelazaran — pero seguían
disparándose sueltas, una por cada `phase.end`. Retomar en `backend` siembra
`product`+`design`+`architect` de golpe: cuatro eventos que disparan
`writeManifest()` casi en el mismo tick (`run.start` + 3×`phase.end`), cada
uno con `void this.writeManifest(run)` **sin `.catch()`**. En Windows, dos
`rename()` casi simultáneos sobre el mismo destino pueden pisarse — el
segundo falla con `EPERM` porque el primero aún tiene el fichero destino
abierto un instante. Sin `.catch()`, esa promesa rechazada es una excepción
no controlada: Node la trata como fatal y mata **el proceso entero**, no solo
la ejecución — de ahí el "cuelgue" (en realidad una caída silenciosa: el
proceso seguía listado pero ya no aceptaba conexiones) justo en el momento en
que más escrituras se agolpan.

**Por qué pasaba justo con `backend` y no con diseño/arquitecto normales**:
en una ejecución sin retomar, cada fase termina con minutos de diferencia —
sus `writeManifest()` nunca coinciden en el mismo tick. Retomar seedeando
varias fases de golpe es la única situación que agolpa 3-4 disparos casi
simultáneos, así que el riesgo de colisión en Windows solo se manifestaba
ahí.

**Arreglo real** (`server/src/runs.ts`): `RunStore` mantiene
`manifestQueues: Map<string, Promise<void>>` y encadena los
`writeManifest()` de cada id — nunca dos escrituras concurrentes al mismo
fichero — y la función ya no puede rechazar (`.catch(() => undefined)`
alrededor de la escritura real): un fallo de persistir el manifiesto se
traga, igual que `renameToProductName()` ya trataba el rename como cosmético.
Verificado en real: con el arreglo, el mismo retomar (`resumeOf: eebe20`,
`startFrom: 'backend'`) sembró las tres fases y arrancó `backend` de verdad
(tool calls reales, `/api/health` respondiendo todo el rato) a la primera.

**Aprendizaje del propio proceso de diagnóstico**: cuando un proceso deja de
responder, mirar primero su salida real (stdout/stderr del proceso en
segundo plano) antes de construir hipótesis sobre el sistema operativo — la
traza del error estaba ahí desde el primer cuelgue, y perseguir SO/memoria/
antivirus primero costó varios reinicios y reintentos de más.

## Un run reanudado por API deja el navegador mirando el intento viejo

Al reanudar con `POST /api/runs` (`resumeOf` + `startFrom`) en vez de desde el
botón "Retomar" de la propia interfaz, el navegador que ya tenía la pestaña
abierta sigue conectado por SSE al `runId` **anterior** — el que falló — hasta
que se recarga o se vuelve a hacer clic en el proyecto del historial. No es un
bug: el id nuevo no tiene forma de llegarle a una pestaña que no lo pidió. Se
vio en esta misma prueba: el navegador seguía enseñando el intento de Entrega
fallido por `maxTurns` mucho después de que el reintento hubiera terminado
`done`. `GET /api/runs` (o recargar) siempre da el id correcto, porque
[[Workspaces y slugs#Deduplicación del historial (RunStore.list())]] se queda
con el más reciente por slug.

## Una fase se cuelga sin fallar ni terminar

Aparte, la fase `backend` de la red social de lectura se quedó **5.5 horas**
sin emitir ningún evento nuevo tras un `Write` a `src/server/storage/local.ts`
— ni éxito, ni error, ni el siguiente turno. El proceso `claude` de esa fase
seguía vivo (visible en `Get-Process`, con tiempo de CPU acumulado), así que
no fue un cierre limpio: quedó esperando algo que nunca volvió.

Investigado: `server/src/guard.ts` no tiene ningún `await` fuera de la propia
función `canUseTool` (una sola función async, sin llamadas a red ni a
procesos hijos) — descarta que el bloqueo esté en la contención de rutas.
Sin más evidencia (no hay traza, no hay error), la hipótesis más probable es
un cuelgue a nivel de sistema operativo (E/S de disco, antivirus escaneando
el archivo recién escrito) o del propio proceso del SDK al comunicarse con su
subproceso — no una función identificable del código de este repo.

**No se investigó más a fondo** porque no había manera de reproducirlo ni una
pista de código a seguir, y forzar un diagnóstico sin evidencia real es
inventarse una causa. Recuperación aplicada: `POST /api/runs/:id/stop` (mata
el árbol de procesos de la fase) y retomar con `startFrom: 'backend'`.

**Si vuelve a pasar**, el diagnóstico es: comparar la hora del último evento
del `.jsonl` contra la hora actual. Si la diferencia es de minutos, puede ser
solo una fase larga (turnos de 10-15 min con `effort: 'xhigh'` son normales).
Si es de horas sin ni un evento de `log`, `text` o `thinking` de por medio, es
este cuelgue — parar y retomar, no esperar más.
