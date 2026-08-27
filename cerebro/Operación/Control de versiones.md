---
title: Control de versiones
tags:
  - operacion
---

# Control de versiones

El repositorio de Agent Forge vive en GitHub, privado:
`https://github.com/iagopombo/agent-forge`. Ya existía (creado el 21 de
agosto, vacío) — se reutilizó en vez de crear uno nuevo con otro nombre.

## Qué entra y qué no

`.gitignore` ya estaba preparado desde antes de tener repo: excluye
`node_modules/`, `dist/`, `.env`/`.env.local`, `.runs/` y **`workspaces/`**.

> [!info] Por qué `workspaces/` queda fuera a propósito
> Cada carpeta de `workspaces/<nombre>/` es un producto generado
> **independiente** — su propio repositorio en potencia, con su propia
> historia de versiones si el usuario decide llevarlo a control de versiones.
> Mezclarlo con el repositorio de Agent Forge (la fábrica) confundiría el
> historial de la herramienta con el de cada producto que construye. Ver
> [[Workspaces y slugs]].

El resto sí entra: `server/`, `web/`, `cerebro/` (el vault documenta el
propio Agent Forge, tiene sentido versionarlo junto al código),
`.claude/skills/` y `.claude-plugins/` (herramientas del propio repo).

## Primer commit

Un solo commit inicial con todo el estado acumulado de varias sesiones de
desarrollo y pruebas — no hay historia granular previa porque no había
repositorio hasta ahora. A partir de aquí, commits normales hacia delante.
