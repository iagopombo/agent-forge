---
title: Cuentas Claras (prueba)
tags:
  - pruebas
---

# Cuentas Claras (prueba)

Primera prueba real completa del pipeline, con [[Autenticación y consumo|suscripción]]
(Sonnet, `effortCap: medium`). Datos de `.runs/cuentas-claras-una-app-para-*.json`.

## La idea

App para grupos que comparten gastos (piso, viaje, pareja): registro de
gastos con reparto igual o desigual, balance de quién debe a quién, y una
opción "liquidar" que calcula el número mínimo de transferencias para saldar
cuentas — algoritmo greedy de máximo deudor/máximo acreedor. Modelo de
negocio: gratis hasta 5 personas y 3 grupos activos; de pago para grupos
grandes, ilimitados y exportar a CSV.

## Dos intentos, mismo proyecto

Gracias a [[Workspaces y slugs]], ambos comparten slug
`cuentas-claras-una-app-para` y carpeta de workspace:

| Ejecución | Estado | Coste est. | Duración |
|---|---|---|---|
| `...c2d9c1` | `failed` | 4.37 USD | ~19 min |
| `...bbfa28` | `done` | 18.67 USD | ~5.5 h (incluye pausa por cuota) |

En el historial solo aparece la segunda (la más reciente del mismo slug).

## Verificación manual

Se corrió la app generada de verdad: Postgres embebido, `npm install`, seed
de la base de datos, servidor Next.js, y se probaron manualmente los flujos
de la interfaz, incluido el algoritmo de liquidación — el resultado (p. ej.
Luis→Ana 90€, Marta→Ana 70€, Diego→Ana 10€) se contrastó independientemente
calculando los balances a mano desde la base de datos, y coincidió.

> [!info] Relevancia para [[Cuota, pausas y reanudación]]
> Esta ejecución fue la que validó por primera vez que el mecanismo de pausa
> automática funciona de extremo a extremo: se quedó sin cuota, esperó
> automáticamente (~4.5 h), y siguió sola sin intervención hasta terminar
> `done`. Ver también [[Aprendizajes de cuota]].
