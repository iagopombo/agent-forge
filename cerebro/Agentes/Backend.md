---
title: Backend
tags:
  - agentes
---

# Backend

Tercera fase. `effort: 'xhigh'`, `model: 'claude-sonnet-5'`, `maxTurns: 170`,
`canConsult: true` (puede delegar en el [[Arquitecto|architect-advisor]], que
sí corre en opus-4-8).

> [!info] Por qué 170 y no 120
> Tope subido tras [[Red social de libros (prueba)]]: con complejidad media
> (~30 endpoints), los 120 turnos previos se agotaron a mitad de camino (64
> archivos escritos, tests y storage sin terminar). Igual que
> [[Frontend (agente)]], subido con margen en vez de reintentar cada vez que
> el backend crece.

Implementa todo el lado servidor exactamente como dice
`docs/03-API-CONTRACT.md`: modelos y migraciones según
`docs/02-DATA-MODEL.md`, todos los endpoints (ninguno a medias), autenticación
y autorización reales (hash de contraseñas, sesiones/tokens verificados,
comprobación de rol por endpoint), integraciones externas del brief
implementadas de verdad y configuradas por variable de entorno, script de seed
ejecutable, y tests de los caminos críticos incluidos los de fallo.

Solo toca los archivos que `docs/04-WORKPLAN.md` asigna a BACKEND — ni
siquiera para "arreglar" algo del frontend.

Criterio de terminado: typecheck, build, tests y arranque del servidor, todo
ejecutado por el propio agente, no solo afirmado.

Entrega un resumen para [[Frontend (agente)|frontend]]: cómo arrancar el
servidor, en qué URL escucha, cómo autenticarse, qué credenciales trae el
seed, y cualquier desvío respecto al contrato original.
