---
title: Autenticación y consumo
tags:
  - operacion
---

# Autenticación y consumo

El Agent SDK resuelve credenciales en orden, y la primera que encuentra gana:

1. **`ANTHROPIC_API_KEY`** en `server/.env` → cuenta de API, facturación real
   por token. El contador "Coste est." de la interfaz se aproxima a lo que se
   va a pagar de verdad.
2. **Sesión de Claude Code** (`~/.claude`) → la suscripción del usuario. No
   hay cobro por token: **se consume cuota**, la misma que se gasta usando
   Claude Code normalmente. Aquí es donde entra en juego
   [[Cuota, pausas y reanudación]].

Al arrancar, el servidor avisa por consola si falta `ANTHROPIC_API_KEY` — es
la señal rápida de en qué modo se está operando (`server/src/index.ts`,
`app.listen`).

> [!warning] Con suscripción se choca contra los límites, no es teórico
> El [[Arquitecto|arquitecto]] va a `effort: 'max'`, el más caro de los ocho
> roles. En las pruebas reales agotó la cuota más de una vez en esa fase. Ver
> [[Cuentas Claras (prueba)]] y [[Postúlate (prueba)]].

## Palancas para que quepa una ejecución, de menos a más agresiva

- `effortCap` en la ejecución — un techo para todos los roles (`medium` corta
  muchísimo respecto a `xhigh`/`max`). El reparto relativo por rol de
  `roles.ts` se respeta por debajo del techo (`capEffort` en
  [[Orquestador]]: el menor de los dos, nunca sube el esfuerzo de un rol).
- `model` en la ejecución, o `FORGE_MODEL=claude-sonnet-5` para todas — Sonnet
  en vez de Opus reduce el consumo.
- Bajar `maxReviewRounds` a `0` y revisar a mano.
- Poner `ANTHROPIC_API_KEY` y pagar por token — el camino que el propio Agent
  SDK indica como previsto para aplicaciones construidas sobre él (el login
  de claude.ai no está pensado para productos ofrecidos a terceros; Agent
  Forge es una herramienta personal usando la propia cuenta, así que no
  aplica esa restricción, pero conviene tenerlo presente si se comparte).

`FORGE_MAX_BUDGET_USD` (por defecto 25, techo **por fase**) sigue funcionando
como freno en ambos modos: se calcula sobre la estimación del SDK, así que
sirve para cortar una fase desbocada incluso sin pagar dólares reales.

## El contador "Coste est."

Siempre dice eso, nunca "coste" a secas, porque con suscripción no hay cobro:
es la estimación que hace el SDK a tarifa de API (`message.total_cost_usd`),
usada como indicador de consumo relativo entre fases, no como factura real.
Ver los números reales de las pruebas en [[Aprendizajes de cuota]].
