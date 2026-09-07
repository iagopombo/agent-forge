# Agent Forge

Instrucciones para cualquier sesión de Claude Code que trabaje en este repo.

## Antes de tocar código

- Lee [CONTEXT.md](CONTEXT.md) para el vocabulario del proyecto (Fase,
  Ejecución, Guard, Workspace...). Úsalo tal cual, no inventes sinónimos.
- Para el mecanismo detrás de un archivo concreto — por qué está así, qué se
  probó, qué bug real arregló — consulta `cerebro/`, el vault de Obsidian
  donde vive la documentación profunda de Agent Forge. Empieza por
  [cerebro/Agent Forge.md](<cerebro/Agent Forge.md>), su índice.
- `cerebro/` no sustituye al código: puede haberse quedado desactualizado si
  algo cambió y la nota no se tocó. Si algo no cuadra, manda el código.

## Después de tocar código

Sincroniza `cerebro/` en el mismo turno en que cierras el cambio, no lo dejes
para después ni lo conviertas en una pregunta aparte, siempre que:

- Edites algo en `server/src/` o `web/src/` que cambie comportamiento,
  configuración (modelo, `maxTurns`, `effort`) o arregle un bug real.
- Una ejecución real del pipeline (no un test) revele algo que no estaba
  documentado: un límite agotado, un mensaje de error nuevo, un dato de coste,
  una decisión de producto o arquitectura tomada de verdad.
- El usuario pregunte directamente si el vault está al día.

Invoca la skill `cerebro-sync` para el procedimiento exacto (qué nota tocar,
cómo no dejar frases viejas sin corregir, cuándo crear una nota nueva en
`Pruebas/`) — no lo hagas de memoria.

Un cambio de configuración de herramientas (skills, hooks, lint, CI) no
dispara esto por sí solo, salvo que también toque uno de los archivos de
arriba.
