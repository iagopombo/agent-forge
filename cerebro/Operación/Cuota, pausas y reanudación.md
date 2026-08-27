---
title: Cuota, pausas y reanudación
tags:
  - operacion
---

# Cuota, pausas y reanudación

La nota más importante para operar Agent Forge con suscripción de Claude Code
en vez de API key. Mecanismo implementado en
[[Orquestador]] (`server/src/orchestrator.ts`); contexto de negocio en
[[Autenticación y consumo]].

## El problema que resuelve

Con suscripción, la cuota se agota a mitad de fase de vez en cuando —
especialmente en fases a `effort: 'max'` como [[Arquitecto]] o [[Revisión]].
Antes, cualquier error mataba la ejecución entera: seis fases fallando en
cuatro segundos cada una y la ejecución anunciando `done` al final, sin haber
hecho nada real. Ahora se distingue cuota (pausable) de error duro (fatal).

## Las dos expresiones regulares

```ts
// server/src/orchestrator.ts
const QUOTA_ERRORS =
  /hit your [\w\s-]*?limit|usage limit|out of (extra )?usage|rate.?limit|too many requests|\bquota\b|resets?\s+\d{1,2}(:\d{2})?\s*(am|pm)/i;

const HARD_ERRORS =
  /credit balance|insufficient.credit|invalid.*api.key|authentication_error|oauth token.*expired|please run .?login/i;
```

`classifyFailure(detail)` prueba primero `QUOTA_ERRORS`: si coincide, arma
`pauseSignal` con la razón y, si el mensaje trae una hora ("resets 6pm"),
`parseResetAt()` la convierte al epoch ms más próximo en el futuro. Si no es
cuota, marca `fatal` (para la ejecución de verdad: el resto de fases fallaría
igual) — `HARD_ERRORS` solo decide qué frase de log mostrar, no si se para.

### Fail-safe por defecto

> [!bug] Encontrado en [[Postúlate (prueba)]]: lo no reconocido caía en cascada
> Hasta esta prueba, `classifyFailure` solo marcaba `fatal` si el error
> coincidía con `HARD_ERRORS`. Un fallo que no encajaba en *ninguna* de las
> dos expresiones —por ejemplo `"Claude Code process exited with code
> 1073807364"`, un código de salida crudo del sistema operativo, sin texto
> reconocible— no armaba `pauseSignal` ni `fatal`. `halted` seguía `false`,
> así que `pipeline()` pasaba a la fase siguiente como si nada, y como el
> entorno seguía roto, las fases restantes fallaban en cascada en cuestión de
> milisegundos cada una. Exactamente el bug que el README describe como
> resuelto para errores de cuota reconocidos por texto, reapareciendo para
> cualquier fallo sin texto reconocible.
>
> El arreglo invierte el criterio por defecto: ahora **todo lo que no es
> cuota es fatal**, reconocido por `HARD_ERRORS` o no. Detener es la opción
> segura por omisión; solo lo que de verdad parece un aviso de cuota es la
> excepción que reintenta sola. Regresión en `probe-pause.mts`.

> [!warning] Esta regex se ha ido ampliando con cada mensaje real nuevo
> El patrón inicial solo reconocía `hit your limit`, `usage limit`,
> `rate.?limit`, `too many requests` y `\bquota\b`. En pruebas reales
> aparecieron frases que no encajaban y que hicieron fallar toda la ejecución
> antes de que se ampliara el patrón:
>
> - `"You're out of extra usage · resets 6pm (Europe/Madrid)"` — no contenía
>   ni "limit" ni "quota". Se añadió `out of (extra )?usage`.
> - `"You've hit your weekly limit · resets 7pm (Europe/Madrid)"` — el
>   "weekly" en medio rompía el `hit your limit` literal. Se generalizó a
>   `hit your [\w\s-]*?limit`.
>
> La lección operativa: cualquier frase nueva de agotamiento de cuota que
> Claude Code no reconozca hará fallar la fase entera como si fuera un error
> irrecuperable. Si vuelve a pasar, el arreglo es añadir el fragmento nuevo a
> `QUOTA_ERRORS`, no reintentar a mano.

## Los dos límites reales del plan Pro

Descubierto empíricamente en [[Postúlate (prueba)]]: el plan Pro (y
probablemente el resto de planes de suscripción) tiene **dos** límites
distintos, no uno:

1. **Ventanas móviles de ~5 horas** — los avisos tipo "resets 5:30pm",
   "resets 6pm" que `parseResetAt()` sabe leer.
2. **Un tope semanal aparte** — el aviso `"You've hit your weekly limit"` es
   de esta clase, no de la ventana de 5h. Agotar las ventanas del día no dice
   nada sobre cuánta cuota semanal queda.

Esto importa para planificar cuánto trabajo cabe: agotar la ventana de 5h se
resuelve esperando unas horas: agotar el límite semanal exige esperar hasta el
reset semanal, mucho más largo. Ver [[Aprendizajes de cuota]].

## El ciclo de pausa (`Run.waitForQuota`)

1. `status = 'paused'`, se emite el evento `paused` (fase, razón, hora de
   reanudación si se conoce)
2. Duerme en tramos de máx. 15s hasta la hora de reset + 60s de margen, o 5
   min si no se sabe la hora exacta
3. Tope absoluto: `MAX_PAUSE_MS = 8 horas`. Si se agota sin que la cuota
   vuelva, se marca `fatal` y la ejecución termina de verdad — la espera no es
   infinita
4. Si la ejecución se detiene manualmente mientras espera, la espera se corta
   al instante (la señal de aborto interrumpe el `sleep`)
5. Si sale bien: `status = 'running'`, evento `resumed`, y `runPhase()`
   **reintenta la misma fase desde cero** — el agente relee `docs/` y el
   código existente y continúa donde lo dejó, no repite desde el principio del
   pipeline

Una fase que terminó en pausa no se registra como completada
(`phase.end` no se emite mientras `pauseSignal` siga armado) — solo cuenta
cuando el reintento sale bien.

## Qué ve el usuario

Puede cerrar el navegador: la ejecución sigue en el servidor y se reanuda
sola. La interfaz muestra un aviso mientras dura la pausa (`PauseBanner` en
`web/src/App.tsx`, alimentado por `pause: PauseInfo | null` en el estado —
ver [[Interfaz y TeamFlow]]).
