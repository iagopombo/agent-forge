---
title: Oficina isométrica
tags:
  - arquitectura
  - frontend
---

# Oficina isométrica

Análisis de cómo sustituir (o acompañar) la banda de [[Interfaz y TeamFlow|TeamFlow]]
por una oficina en isométrico estilo Habbo, donde los nueve agentes se sientan a
trabajar y se entregan el trabajo entre ellos.

Los assets ya están diseñados y viven en `design/oficina/` (ver su README): nueve
personajes × ocho posturas y el escenario completo. Esta nota es sobre **cómo se
implementa**, no sobre cómo se dibuja.

## El problema de fondo: estado instantáneo vs. animación con duración

Todo lo que la interfaz sabe hoy es un **snapshot**: `RunState.phases[id].status`
vale `running`, `done`, etc. El rail actual es una función pura de ese snapshot,
y por eso es tan simple.

La oficina no puede serlo. «El arquitecto termina y le entrega los papeles al
backend» es un suceso **con duración** (levantarse, andar, entregar, volver ≈ 3-4 s)
disparado por un evento **instantáneo** (`phase.end`). Esa es la diferencia
estructural con todo lo que hay hoy en `web/`, y es de donde salen casi todas las
decisiones de abajo.

Consecuencia inmediata: hace falta una capa nueva entre el estado y el dibujo —
un **director** que observe *transiciones* de `RunState` (no su valor), las meta
en una cola y las reproduzca en el tiempo.

> [!warning] El replay es el caso que rompe la implementación ingenua
> Abrir una ejecución terminada reproduce cientos de eventos de golpe (ver
> [[Eventos y SSE]]): las nueve fases pasan de `pending` a `done` en el mismo
> lote de 90 ms. Si el director encola una animación por transición, el usuario
> se come cuatro minutos de dibujitos andando antes de ver el estado real.
>
> El director necesita dos modos: **en directo** (anima) y **puesta al día**
> (coloca a cada agente en su sitio final sin animar). El disparador natural es
> el mismo que ya distingue `useForgeRun`: si el lote de eventos trae más de una
> transición de fase, o el run ya está cerrado, se salta la animación.

## La topología de entregas no es la fila que se ve

`PHASE_ORDER` es orden de **renderizado**, no de dependencia — el propio
[[Interfaz y TeamFlow]] ya lo avisa, y [[Diseño (agente y paralelismo)]] lo
explica: diseño corre en paralelo con arquitecto/backend.

Una oficina que dibuje entregas tiene que hacer explícito lo que el rail podía
permitirse dejar ambiguo. Hace falta un grafo de verdad:

```ts
const HANDOFF: Record<PhaseId, PhaseId[]> = {
  product:     ['design', 'architect'],   // se bifurca de verdad
  architect:   ['backend'],
  design:      ['frontend'],
  backend:     ['frontend'],              // frontend recibe de DOS sitios
  frontend:    ['integration'],
  integration: ['review'],
  review:      ['fix', 'package'],        // según el veredicto
  fix:         ['review'],                // vuelve atrás
  package:     [],
};
```

Dos casos que el diseño visual tiene que soportar y que la fila no contemplaba:

- **Producto entrega a dos** (diseño y arquitecto). O hace dos viajes, o entrega
  en el pasillo a los dos a la vez. Lo segundo es más corto y más legible.
- **Revisión devuelve a correcciones** y correcciones vuelve a revisión. Es la
  única entrega que va hacia atrás, y visualmente es la más expresiva de todas:
  el revisor baja al pasillo con el documento marcado en rojo. Merece sprite
  propio (un `DOC` con marca roja) más que una animación nueva.

## Dónde vive en la interfaz

`TeamFlow` hace hoy dos trabajos: **mostrar estado** y **seleccionar la fase**
cuyo transcript se lee. La oficina puede hacer los dos (pulsar un agente
selecciona su fase), pero es mucho más alta que la banda actual, así que no puede
convivir con ella encima del workspace.

Recomendación: **una pestaña más**, junto a las que introduce
[[Consola de Claude Code]] — *Oficina* / *Trabajo del equipo* / *Consola*. Razones:

- El rail compacto sigue siendo mejor para trabajar (ver los nueve estados de un
  vistazo sin scroll); la oficina es mejor para mirar. No hay que elegir.
- Es el mismo patrón que ya existe, cero concepto nuevo para el usuario.
- Permite entregar la oficina sin tocar el camino crítico de nadie.

> [!note] Conflicto de merge previsible con la rama de la consola
> `feat/consola-claude-code` (PR #1) ya añade el bloque de pestañas a `App.tsx`.
> Esta rama sale de `main`, así que las dos tocan el mismo sitio. Es un conflicto
> pequeño y mecánico (una pestaña más en el mismo array), pero conviene mergear
> la consola primero y rebasar esta encima, no al revés.

## Cómo se dibuja

**SVG, no canvas.** Son ~30 muebles + 9 personajes + algún bocadillo: del orden
de 200 nodos, con 1-2 animándose a la vez. SVG va sobrado, mantiene el idioma que
ya usa `Mascot.tsx`, permite animar con CSS y deja los personajes accesibles y
pulsables sin trabajo extra. Canvas haría falta a partir de varios cientos de
sprites móviles, que no es este caso.

**Animación híbrida**, que es justo para lo que está diseñada la hoja de sprites:

| Qué | Cómo |
|---|---|
| Desplazamiento por la sala | `transform: translate(...)` con `transition` CSS sobre el `<g>` del personaje |
| Ciclo de andar | Intercambio de sprite `walkA`/`walkB` cada ~250 ms mientras se mueve |
| Teclear | Intercambio `sit`/`type` cada ~400 ms mientras la fase está `running` |
| Postura puntual (entregar, recibir, celebrar) | Sprite fijo durante el tramo correspondiente |

## El orden de pintado es el detalle que más muerde

En isométrico, quien está más cerca de la cámara se pinta después. La
profundidad es `gx + gy` (está en `room.mjs`). Con muebles fijos es trivial: se
ordena una vez. Con **personajes que se mueven**, la profundidad cambia, y SVG
no tiene `z-index`: el orden de pintado es el orden del documento.

Reordenar el array en cada frame significa que React mueve nodos del DOM, y
mover un nodo puede reiniciar una transición CSS a mitad — justo la animación
que se está intentando reproducir.

**Salida recomendada, y es una decisión de diseño de escena, no un truco:** el
pasillo (`gy = 3`) está por delante de la fila de arriba y por detrás de la de
abajo, y **nadie trabaja en él**. Si todo el tránsito ocurre en el pasillo,
basta con tres capas fijas:

```
<g> fila superior (mesas gy=1 + sus agentes) </g>
<g> pasillo: agentes en tránsito             </g>
<g> fila inferior (mesas gy=5 + sus agentes) </g>
```

Dentro de cada capa el orden es estático. Nadie se reordena nunca, las
transiciones CSS no se cortan, y el resultado es correcto porque la escena está
construida para que lo sea. Si más adelante hiciera falta movimiento libre por
toda la sala, ahí sí habría que ordenar por profundidad de verdad y renunciar a
las transiciones CSS (pasando a animar por `requestAnimationFrame`).

## La máquina de estados por agente

El director mantiene, por agente, algo así:

```ts
type AgentPose =
  | { at: 'desk'; pose: 'idle' | 'sit' | 'type' }
  | { at: 'corridor'; pose: 'walkA' | 'walkB' | 'give' | 'take' }
  | { at: 'desk'; pose: 'cheer' };
```

y una cola de tramos (`{ pose, tile, ms }`) que consume con un temporizador.
Traducción de eventos a coreografía:

| Evento ([[Eventos y SSE]]) | Qué pasa en la oficina |
|---|---|
| `phase.start` | El agente se sienta, se enciende su monitor, bocadillo «trabajando…» |
| `tool` | Nada por sí solo — el bucle de teclear ya está corriendo |
| `phase.end` con `ok` | Se levanta, baja al pasillo, entrega al siguiente del grafo, vuelve y se sienta |
| `review` con bloqueantes | Revisión baja al pasillo y entrega **hacia atrás** a correcciones, con documento marcado |
| `ask` | Bocadillo con la pregunta y postura de mano levantada hasta que se responde |
| `paused` | El agente se queda sentado con un bocadillo de «sin cuota» |
| `run.end` con `done` | Todos a la postura `cheer` |
| `denied` | Un destello rojo sobre el agente, sin cambiar de postura |

## Riesgos y cosas que hoy no sé

- **Legibilidad con varios agentes activos.** En la escena de muestra, con dos
  bocadillos abiertos a la vez, el pasillo ya se ve apretado. Con diseño y
  arquitecto trabajando en paralelo y una entrega en curso puede saturarse.
  Mitigación: como mucho un bocadillo a la vez (el de la fase seleccionada).
- **Coste de mantener dos vistas.** El rail y la oficina cuentan lo mismo con
  código distinto; una regla de estado nueva hay que aplicarla en los dos sitios.
  Es el precio de no romper la vista compacta, pero es un precio real.
- **Sin verificar todavía:** que la coreografía completa se entienda de verdad
  viéndola en movimiento. La hoja de sprites y la escena estática se revisan bien
  fotograma a fotograma, pero el ritmo (cuánto dura un viaje, si da tiempo a
  leer un bocadillo) solo se juzga en marcha. Antes de dar la fase 2 por buena
  hay que verlo corriendo contra un run de mentira, no contra uno real.

## Plan por fases

1. **Escenario estático.** La sala, los nueve puestos, y cada agente en su sitio
   con la postura que corresponde a su `status` actual — sin transiciones. Ya
   sustituye al rail como forma de leer el estado, y no necesita director.
2. **El director y las entregas.** Cola de animación, los dos modos
   (directo / puesta al día), el grafo `HANDOFF` y la coreografía de entrega.
3. **Los detalles que dan vida.** Bocadillos de `ask`, el bucle
   revisión → correcciones con documento marcado, la celebración de `run.end`,
   y `prefers-reduced-motion` (que debe saltar directamente al estado final).

La fase 1 es la que más valor entrega por línea escrita y no tiene ningún riesgo
de los de arriba; las fases 2 y 3 son donde está el trabajo de verdad.
