---
title: Correcciones
tags:
  - agentes
---

# Correcciones

Segunda fase del ciclo de calidad, solo si [[Revisión]] pidió cambios.
`effort: 'xhigh'`, `model: 'claude-sonnet-5'`, `maxTurns: 100`,
`canConsult: true`.

Arregla **exactamente** los bloqueantes de `docs/REVIEW.json`, ni uno más —
"refactorizar de paso lo que no está en la lista es cómo se rompen los
productos".

Método: para cada bloqueante, reproducirlo primero, arreglarlo, y demostrar
que está arreglado ejecutando algo (un test nuevo, una llamada real). Un
bloqueante sin prueba de que está resuelto sigue considerándose abierto.

Criterio de terminado: todos los bloqueantes cerrados con evidencia, la suite
completa (typecheck/build/tests) sigue en verde, y nada que funcionaba antes
se ha roto.

Tras esta fase, el pipeline vuelve a [[Revisión]] — el ciclo se repite hasta
que el veredicto es `pass` o se agotan las rondas configuradas
(`maxReviewRounds`).
