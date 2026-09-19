---
title: Diseño
tags:
  - agentes
---

# Diseño

Segunda fase del [[Pipeline de 8 fases|pipeline]], pero corre **en paralelo**
con [[Arquitecto]] y [[Backend]], no después de ellos — ver
[[Diseño (agente y paralelismo)]] para el porqué y el detalle técnico.
`effort: 'high'`, `model: 'claude-sonnet-5'`, `maxTurns: 100` (estimación
inicial, sin evidencia real todavía — se sube si una ejecución real la
agota, mismo criterio que el resto de fases), `canConsult: false`,
`canDesign: true`.

Trabaja solo a partir de `docs/00-BRIEF.md` — no hay contrato de API ni
modelo de datos todavía cuando empieza (arquitecto está escribiéndolos en
paralelo), y no los necesita: el diseño visual no depende de la tecnología
elegida.

## Skills obligatorias: `web-design-craft` y `design-goal-calibration`

Las invoca al empezar, antes de diseñar nada — ver
[[Skills de diseño (perfect-design)]]. La primera es el suelo de calidad
(tipografía, espaciado, contraste, tema); la segunda decide cómo calibrar
ese suelo según el objetivo real de cada pantalla (dashboard denso, landing
de conversión, confianza, delight, o velocidad) — calibrado por pantalla, no
por producto entero.

## Entrevista al usuario (`preguntar_al_usuario`)

Antes de definir el sistema de diseño, entrevista al usuario con la misma
tool que [[Producto]] — `askUserTool` de `server/src/ask.ts`, reutilizada tal
cual — sobre las decisiones de estilo que el brief deja abiertas y que
`design-goal-calibration` no resuelve por sí sola: tono (serio/corporativo,
cercano, atrevido), referencias de marca, tema por defecto (claro, oscuro,
los dos). Como mucho 2-3 preguntas, 3 opciones concretas cada una; la
respuesta manda sobre lo que hubiera calibrado por su cuenta. Ver
[[Preguntas al usuario (ask)]] para el mecanismo completo.

## Herramienta `mostrar_diseno`

Terminada la entrevista, es su forma de trabajar pantalla a pantalla, no un
extra. Por cada pantalla: escribe un HTML autocontenido en
`design/pantallas/<nombre>.html`, lo enseña con `mostrar_diseno`, y si el
usuario pide cambios, itera sobre el mismo archivo hasta que lo aprueba
explícitamente. No pasa a la siguiente pantalla sin esa aprobación. Antes de
la primera pantalla, define y enseña el sistema de diseño (paleta,
tipografía, espaciado, radios).

## Salida

- `design/pantallas/*.html` — un mockup por recorrido de usuario principal
  del brief, cada uno ya aprobado por el usuario.
- `docs/DESIGN.md` — estructura fija (overview con el perfil elegido por
  pantalla, colores, tipografía, espaciado, formas, pantallas aprobadas,
  do's/don'ts) que pide `design-goal-calibration`. Es el contrato que
  [[Frontend (agente)|frontend]] traduce al framework real — frontend no
  diseña desde cero ni aprueba nada, sigue lo que ya está aquí.

## Criterio de terminado

Todas las pantallas que decidió diseñar están aprobadas por el usuario, y
`docs/DESIGN.md` las documenta todas.
