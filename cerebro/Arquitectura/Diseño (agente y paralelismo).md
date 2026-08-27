---
title: Diseño (agente y paralelismo)
tags:
  - arquitectura
aliases:
  - Diseño en paralelo
---

# Diseño (agente y paralelismo)

Noveno rol del pipeline, y el primero que corre **en paralelo** con otra fase.
Pedido explícitamente por el usuario: quería un agente que use algo como
Claude Design para maquetar la app antes de que el frontend construya nada,
enseñando capturas e iterando con el usuario.

> [!info] Por qué no es literalmente "el comando /design"
> Los canvas de Claude Design (Artifacts) son una función de la sesión de
> Claude Code/claude.ai que opera Agent Forge — no algo a lo que un agente
> lanzado por `query()` (una sesión aislada del SDK, con su propio toolset
> restringido, sin cuenta de claude.ai propia) pueda llamar. La alternativa
> real construida: mockups HTML autocontenidos, capturados con Chrome
> headless en el propio servidor y mostrados en el transcript — mismo
> resultado percibido (capturas que van cambiando con el feedback), sin
> depender de una superficie de producto a la que este proceso no llega.

## Dónde encaja: product → (diseño ‖ arquitecto → backend) → frontend

```
product
   │
   ├──────────────┬─────────────────┐
   │               │                 │
 diseño        arquitecto ──────► backend
   │               │                 │
   └───────┬───────┘                 │
           │                         │
        frontend  ◄──────────────────┘
           │
      integration → review ⇄ fix → package
```

Diseño no depende de la arquitectura (trabaja del brief de
[[Producto]], no del contrato técnico) ni al revés. Frontend es donde las dos
ramas se juntan: no puede construir sin la API real (backend) ni sin las
pantallas aprobadas (diseño). Detalle de la decisión "por qué secuencial no,
por qué esta rama sí" — la motivación original del usuario fue que diseño es
la única fase (aparte de producto) que espera respuesta humana, así que
correrla en serie desperdicia el tiempo de esa conversación en vez de
aprovecharlo mientras arquitecto/backend trabajan solos.

## La herramienta `mostrar_diseno` (`server/src/design.ts`)

Mismo patrón que [[Preguntas al usuario (ask)]] (bloquea la fase hasta la
respuesta), pero pensada para iterar en bucle, no para una sola pregunta de
alcance:

1. El agente escribe un HTML autocontenido (`design/pantallas/<nombre>.html`
   — CSS inline o `<style>`, sin peticiones a internet) de una pantalla.
2. Llama a `mostrar_diseno(archivo_html, mensaje)`.
3. El servidor lo captura con Chrome headless (`server/src/screenshot.ts`,
   `playwright-core` + `channel: 'chrome'` — el Chrome del sistema, sin
   descargar un Chromium propio, mismo patrón que
   `.claude/skills/run-agent-forge`) y lo convierte en un PNG en base64.
4. Esa captura viaja como `image` en el evento `ask` (mismo evento que
   [[Preguntas al usuario (ask)]], con el campo opcional añadido) — la
   interfaz la muestra en el panel de pregunta y en el transcript.
5. La respuesta del usuario (aprobación o petición de cambios) vuelve al
   agente como texto; si pide cambios, edita el mismo HTML y repite desde 2.

No hay tope de rondas en código — igual que `preguntar_al_usuario`, se confía
en el prompt ("sé eficiente, no llames por cambios triviales") en vez de un
límite duro, porque cortar a mitad de una conversación real con el usuario
sería peor que dejar que termine con calma.

Al final escribe `docs/DESIGN.md` con la estructura fija que pide
[[Skills de diseño (perfect-design)|design-goal-calibration]] (overview con
el perfil de objetivo elegido, colores, tipografía, espaciado, formas,
pantallas aprobadas, do's/don'ts) — el contrato que
[[Frontend (agente)|frontend]] traduce al framework real en vez de diseñar
por su cuenta.

## Lo que tuvo que cambiar en el orquestador para que esto sea seguro

Antes de esto, `Run` (server/src/orchestrator.ts) asumía una sola fase activa
a la vez en varios sitios. Meter una segunda fase concurrente real (no solo
"dos MCP tools a la vez", sino dos procesos `claude.exe` reales) rompía eso
en silencio si no se arreglaba:

- **Seguimiento de proceso hijo**: `this.child: number | null` (un único PID)
  pasó a `this.children: Set<number>` — cualquier fase puede tener su propio
  hijo vivo al mismo tiempo. `trackChild` ahora también excluye PIDs ya
  reclamados por otra fase (`!this.children.has(p.pid)`), para que dos fases
  arrancando casi a la vez no se peleen por el mismo PID recién aparecido.
- **Generación por fase**: `phaseSeq` (contador global) pasó a
  `phaseGen: Map<PhaseId, number>`. Con un contador global, el reintento de
  UNA fase tras una pausa de cuota invalidaría por error el rastreo de OTRA
  fase corriendo en paralelo.
- **Pausa de cuota ya no es un campo compartido**: `classifyFailure()` volvía
  a mutar `this.pauseSignal`/`this.fatal` directamente; ahora `classifyFailure`
  **devuelve** la señal de pausa (o `null`) en vez de mutar estado
  compartido, y esa señal viaja como valor local por `runPhaseOnce` →
  `runPhase`. `this.fatal` sigue siendo un campo compartido a propósito — un
  error fatal para de verdad la ejecución entera, aunque otra fase siga
  corriendo.
- **`status` ya no es "paused" solo porque una fase lo esté**:
  `activePhases: Map<PhaseId, 'running' | 'paused'>` + `updateStatus()`
  derivan el estado global — solo baja a `paused` cuando **todas** las fases
  activas lo están. Si diseño se queda sin cuota pero arquitecto sigue
  trabajando, el run entero sigue `running` de verdad. Ver
  [[Cuota, pausas y reanudación]].
- **`askUser` recibe la fase explícita**, no `this.currentPhase` como
  fallback — con dos fases activas, adivinar cuál preguntó habría sido
  ambiguo.

> [!bug] `seedPriorPhases` tenía un fallo real de invalidación en cascada, encontrado antes de enviarlo
> La versión inicial de la reescritura sembraba "todo lo que hay en `prior`
> salvo la fase que se reintenta" — más simple que el cutoff por posición
> anterior, y correcto para el caso que motivó el cambio (diseño falla,
> arquitecto/backend siguen). Pero tenía un agujero real: si se retoma en
> `frontend` y un intento **más antiguo** de este mismo proyecto había
> llegado a completar `integration` con éxito, esa entrada seguía siendo "la
> más reciente con éxito" en `prior` — y se habría sembrado como hecha una
> integración que en realidad validó un frontend que ya no existe. Arreglado
> con `DOWNSTREAM_OF`: al retomar en una fase, se invalida también todo lo
> que depende de ella (frontend invalida integration; architect invalida
> backend+frontend+integration; etc.), no solo la fase en sí. Encontrado por
> razonamiento antes de que hiciera falta un fallo real para notarlo —
> verificado con `probe-seed2.mts` (11/11), incluyendo ese caso exacto.

## Verificación (todo gratis, sin gastar cuota real)

- `probe-parallel.mts` — sustituye `runPhase` por un doble que registra orden
  y tiempos: confirma que diseño arranca **antes** de que arquitecto termine
  (paralelismo real, no en serie), que backend espera a arquitecto, que
  frontend espera a diseño Y backend los dos, y que si arquitecto falla,
  backend nunca arranca pero diseño sigue su curso igualmente. 15/15.
- `probe-seed2.mts` — siembra no lineal (arquitecto+backend sembrados sin
  diseño, porque diseño falló independientemente) y el caso de invalidación
  en cascada de arriba. 11/11.
- `probe-status.mts` — `updateStatus()` con combinaciones de fases activas/
  pausadas, y que `classifyFailure()` devuelve en vez de mutar. 9/9.
- `verify-design-tool.mts` — lanza `query()` de verdad con el rol `design` y
  aborta en el mensaje `system`/`init` (antes de cualquier turno facturable):
  confirma que `mostrar_diseno` aparece listada.
- `test-screenshot.mts` — `screenshotHtmlFile()` contra un HTML de prueba real
  (sin SDK, solo Playwright): PNG válido, visualmente correcto (verificado
  mirando la imagen, no solo el tamaño en bytes).

Lo único que estas pruebas NO cubren: una ejecución real de principio a fin
con el modelo de verdad decidiendo cuándo llamar a `mostrar_diseno` y cómo
responde el usuario en vivo — eso solo lo confirma la primera vez que se use
para construir un proyecto real.
