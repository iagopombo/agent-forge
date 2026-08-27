---
title: Postúlate (prueba)
tags:
  - pruebas
---

# Postúlate (prueba)

Segunda prueba real, lanzada para medir si una jornada de cuota del plan Pro
alcanza para una app de complejidad media. Datos de
`.runs/postulate-2c6b3f.json` y `.jsonl`.

## La idea

Seguimiento de candidaturas de empleo tipo kanban (guardada / aplicada /
entrevista / oferta / descartada), recordatorios de seguimiento vencidos,
panel de embudo con tasas de conversión, acceso sin contraseña por enlace
mágico. Gratis hasta 20 candidaturas activas; de pago para ilimitadas,
recordatorios por email y export a CSV.

## Lo que de verdad pasó

- Fase [[Producto]]: terminó bien, 0.50 USD, 171 s, con **una** pregunta de
  alcance real (sobre cuánto de la pasarela de pago entraba en el MVP — se
  eligió la opción de solo aplicar límites con flag manual, conectar el cobro
  real después). Ver [[Preguntas al usuario (ask)]].
- Fase [[Arquitecto]]: falló con `"Claude Code process exited with code
  1073807364"` — un código de salida de proceso del sistema operativo, no un
  mensaje de cuota ni de error de credenciales.

> [!danger] Esto no fue el mecanismo de cuota — y reveló una cascada real
> El mensaje de fallo de la fase de arquitecto no coincide con `QUOTA_ERRORS`
> ni con `HARD_ERRORS` (ver [[Cuota, pausas y reanudación]]): es un código de
> salida crudo del proceso, no un texto que las expresiones regulares
> reconozcan. `classifyFailure()` no arma `pauseSignal` ni marca `fatal`, así
> que `halted` sigue siendo `false` — el pipeline **no se detiene** y sigue a
> la fase siguiente. Como el entorno seguía roto, backend, frontend,
> integración, revisión y entrega fallaron en cascada, cada una en menos de
> 200 ms, con el mismo tipo de código de salida (`3221225794`). La ejecución
> terminó `failed` con 6 fases fallidas en total, 383.9 s de duración total
> (la mayor parte, los 212 s del intento de arquitecto) y 0.4957 USD gastados
> — solo lo que costó la fase de producto.
>
> Es la misma clase de cascada que el README describe como ya resuelta para
> errores de cuota reconocidos por texto ("antes seguía: seis fases fallando
> en cuatro segundos cada una"), pero aquí ocurrió con un fallo que
> **no** es de cuota ni de las frases que `HARD_ERRORS` reconoce: es un
> proceso que murió con un código de salida del sistema. `classifyFailure`
> solo miraba el *texto* del error — un fallo que llegaba como código
> numérico sin texto reconocible no disparaba ni la pausa ni el corte, y el
> pipeline lo trataba como "fase fallida, pero seguimos" en vez de detenerse.
>
> **Arreglado tras esta prueba.** `classifyFailure()` ahora es fail-safe por
> defecto: solo lo que coincide con `QUOTA_ERRORS` pausa y reintenta; *todo lo
> demás* —incluido lo que no encaja en ningún patrón conocido— marca `fatal`
> y detiene la ejecución en vez de dejarla caer en cascada. Antes solo
> `HARD_ERRORS` detenía; ahora detener es el comportamiento por omisión y solo
> lo reconocible como cuota es la excepción. Ver
> [[Cuota, pausas y reanudación#Fail-safe por defecto]]. Regresión:
> `probe-pause.mts`, caso "código de salida crudo".

## Por qué la instrucción original decía "límite semanal"

Durante esta misma sesión de trabajo apareció por separado el aviso
`"You've hit your weekly limit · resets 7pm (Europe/Madrid)"`, pero como
error de un comando `/compact` de la **sesión de Claude Code que dirigía
Agent Forge**, no como fallo interno de esta ejecución de Postúlate. Es un
límite real del mismo tipo que describe
[[Cuota, pausas y reanudación#Los dos límites reales del plan Pro]], pero no
es la causa registrada en el `.jsonl` de esta ejecución concreta — conviene no
confundir ambas cosas.

## Qué faltó verificar

Por el fallo en cascada, esta prueba no llegó a producir nada más allá de
`docs/00-BRIEF.md` y `docs/00-NEGOCIO.md` de producto — no hay app real que
verificar manualmente, a diferencia de [[Cuentas Claras (prueba)]].
