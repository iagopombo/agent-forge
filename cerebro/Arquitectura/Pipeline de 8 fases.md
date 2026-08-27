---
title: Pipeline de 8 fases
tags:
  - arquitectura
---

# Pipeline de 8 fases

Cada fase es una sesión independiente del Claude Agent SDK sobre el mismo
workspace. El contrato entre agentes son los documentos de `docs/`: cada agente
lee lo que escribió el anterior antes de tocar nada, y ninguno puede
contradecirlo en silencio (regla 3 de [[Producto|las reglas comunes]]).

## Las cinco fases lineales

Definidas en `PIPELINE` (`server/src/roles.ts`), se ejecutan en orden fijo:

1. [[Producto]] → `docs/00-BRIEF.md` + `docs/00-NEGOCIO.md`
2. [[Arquitecto]] → `docs/01-ARCHITECTURE.md`, `02-DATA-MODEL.md`,
   `03-API-CONTRACT.md`, `04-WORKPLAN.md` + esqueleto del repo
3. [[Backend]] → todos los endpoints del contrato
4. [[Frontend (agente)]] → toda la interfaz contra el backend real
5. [[Integración]] → arranca todo desde cero y corrige desajustes

> [!info] `PIPELINE` no incluye review/fix/package
> El array `PIPELINE` en `roles.ts` solo lista estas cinco. El ciclo de
> revisión y el empaquetado los añade `Run.pipeline()` en
> [[Orquestador|orchestrator.ts]] a mano, después del bucle — porque no son
> lineales, son un ciclo con condición de salida.

## El ciclo revisión → correcciones → revisión

Tras las cinco fases lineales, se repite hasta `maxReviewRounds + 1` veces:

1. [[Revisión]] escribe `docs/05-REVIEW.md` y `docs/REVIEW.json`
2. Si el veredicto es `pass` o no hay bloqueantes, se corta el ciclo
3. Si no, [[Correcciones]] resuelve los bloqueantes y se vuelve a revisar

Si se agotan las rondas configuradas (`maxReviewRounds`, por defecto
`FORGE_MAX_REVIEW_ROUNDS=2`), la entrega sigue adelante igualmente y los
bloqueantes abiertos quedan documentados — no se bloquea el pipeline entero por
una revisión que no converge.

> [!warning] Si la fase de revisión falla, no hay veredicto
> `readVerdict()` en el orquestador solo lee `docs/REVIEW.json` si `review.ok`
> es `true`. Si la fase de revisión falla (cuota, error), se emite un aviso
> ("se entrega sin auditar") y se corta el ciclo sin dar por buena una revisión
> que no ocurrió — nunca se asume `pass` por defecto en ese caso. El único caso
> donde sí se asume `pass: true` es cuando la fase *terminó bien* pero
> `docs/REVIEW.json` no se pudo parsear (JSON roto o ausente).

## Entrega

Última fase siempre: [[Entrega]] escribe README, `.env.example`,
`docs/DEPLOY.md`, `docs/OPERACIONES.md`, LICENSE y CHANGELOG. Se ejecuta pase
lo que pase con el ciclo de revisión (incluso si se agotaron las rondas).

## Retomar una ejecución interrumpida

Si `request.startFrom` viene informado (botón «Retomar en \<fase\>» de la
interfaz, o `POST /api/runs` con `resumeOf`+`startFrom`), el pipeline salta las
fases anteriores — se dan por hechas en disco — y arranca directamente en esa
fase con una nota en el contexto: *"Retomas una ejecución interrumpida (...)
lee docs/ y el código existente antes de escribir nada"*.

Caso especial: si `startFrom === 'package'`, se salta también el ciclo de
revisión entero y se corre solo la fase de entrega.

Ver [[Workspaces y slugs]] para cómo se resuelve la misma carpeta al retomar, y
[[Orquestador]] para el mecanismo de pausa/reintento automático dentro de una
misma fase (distinto de retomar: eso es para cuando se agota la cuota, esto es
para cuando la ejecución se detuvo o falló del todo).

> [!info] Las fases ya hechas se ven hechas, no "en espera"
> El nuevo run que nace de un retomar no hereda el registro de eventos del
> anterior — sin más, la interfaz mostraría las fases previas como pendientes
> aunque ya estén terminadas en disco. `seedPriorPhases()` lo corrige
> reproduciendo su resultado como eventos sintéticos al arrancar. Ver
> [[Orquestador#Sembrado de fases previas al retomar (seedPriorPhases)]].
