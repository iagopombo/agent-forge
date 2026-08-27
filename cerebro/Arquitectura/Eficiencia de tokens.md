---
title: Eficiencia de tokens
tags:
  - arquitectura
  - operacion
---

# Eficiencia de tokens

Dos mecanismos distintos, uno gratis a nivel de SDK y otro de comportamiento
vía Skill, para que las ocho fases gasten menos cuota sin bajar la calidad del
producto generado. Pedido explícitamente por el usuario tras la
[[Red social de libros (prueba)|prueba de la red social de libros]] (10
intentos, mucha cuota gastada) — no es una optimización especulativa, es una
respuesta directa a ese consumo real.

## `excludeDynamicSections`: caché entre proyectos distintos

`server/src/orchestrator.ts` construye el `systemPrompt` de cada fase así:

```ts
systemPrompt: {
  type: 'preset',
  preset: 'claude_code',
  append: role.system(ctx),
  excludeDynamicSections: true,
},
```

Por defecto, el preset `claude_code` mete secciones dinámicas (directorio de
trabajo, memoria, estado de git) **dentro** del prefijo que se cachea. Como
`cwd` (el workspace del proyecto) cambia con cada proyecto distinto, ese
prefijo nunca coincidía byte a byte entre dos ejecuciones de Agent Forge —
cada proyecto nuevo pagaba el prompt del sistema entero desde cero, aunque el
texto de `role.system(ctx)` para un rol dado es idéntico entre proyectos
(depende solo de `ctx.language`, casi siempre constante).

`excludeDynamicSections: true` saca esas secciones del prefijo cacheado y las
reinyecta como primer mensaje de usuario. El prefijo (preset + lo que añade
`role.system(ctx)`) queda estático y cacheable **entre proyectos**, no solo
dentro de las 100-170 turnos de uno.

> [!info] Por qué no hace falta reforzar el `cwd` en el prompt
> El propio [[Pipeline de 8 fases|CONTRACT]] ya dice explícitamente "El
> directorio de trabajo actual es la raíz del repositorio del producto" — la
> pérdida de autoridad del `cwd` al moverlo a un mensaje de usuario (el único
> tradeoff documentado por el SDK) ya está cubierta por otra vía.

> [!info] Verificado contra una ejecución real
> Se lanzó `query()` con las opciones reales del rol `backend` y se abortó en
> el mensaje `system`/`subtype: 'init'`, antes de cualquier turno facturable.
> El plugin y la skill aparecen listados correctamente
> (`agent-forge-token-efficiency:token-efficient-coding`). De paso, esta
> misma verificación destapó una fuga de aislamiento real — ver
> [[Aislamiento del proceso hijo]].

## El plugin y la Skill `token-efficient-coding`

```
.claude-plugins/token-efficient-coding/
  .claude-plugin/plugin.json
  skills/token-efficient-coding/SKILL.md
```

Cargado en `orchestrator.ts` vía `plugins: [{ type: 'local', path }]` — **al
margen de `settingSources: []`**: los plugins locales se descubren
independientemente de qué fuentes de configuración estén activas (confirmado
en la documentación oficial, no en `~/.claude` ni en `.claude/` del proyecto
generado). Esto era la pieza que faltaba para dar Skills a las fases sin
romper el aislamiento del host que ya describe
[[Orquestador#Ciclo de vida de una fase (runPhaseOnce)|el resto de `runPhaseOnce`]].

La ruta es **absoluta** (`path.join(ROOT, '.claude-plugins', ...)`) a
propósito: `plugins[].path` se resuelve contra el `cwd` del proceso Node que
llama a `query()` (dónde se lanzó `npm start`), no contra `options.cwd` (el
workspace del proyecto generado) — una ruta relativa dependería de un detalle
operativo frágil.

La Skill no se activa sola: `preamble()` en `roles.ts` añade un bloque
`EFICIENCIA` explícito a las ocho fases pidiendo que se invoque al empezar.
Skills enumeradas para una sesión aparecen en el listado que ve el modelo,
pero cargarlas de verdad requiere que el propio modelo decida invocarlas — sin
esa instrucción explícita, confiar en que lo haga por iniciativa propia habría
sido menos fiable que una regla más de las que ya sigue.

Contenido de la Skill (resumen — texto completo en el propio `SKILL.md`):
agrupar llamadas a herramientas independientes, no releer lo que se acaba de
escribir, buscar antes de leer entero, editar en vez de reescribir archivos
existentes, verificar por unidad de trabajo coherente en vez de tras cada
edición diminuta, nada de comentarios de relleno ni narración de lo obvio, y
consultas al `architect-advisor` con una sola pregunta concreta.
