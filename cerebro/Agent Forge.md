---
title: Agent Forge
tags:
  - agent-forge
  - proyecto
  - moc
aliases:
  - Cerebro de Agent Forge
---

# Agent Forge

Le das una idea. Un equipo de ocho agentes de Claude la convierte en un repositorio
completo —producto, arquitectura, backend, frontend, integración, revisión y
entrega— mientras tú lo ves trabajar en directo desde el navegador.

Construido sobre el [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk):
los agentes no describen código, lo escriben en disco, ejecutan comandos, corren
los tests y arreglan lo que falla.

> [!info] Este vault
> Es el "segundo cerebro" del proyecto: documentación enlazada para consultar
> decisiones y mecanismos sin releer el código cada vez. No sustituye al código —
> cuando algo cambie ahí, esta nota puede quedarse desactualizada.

## Mapa

### Arquitectura
- [[Pipeline de 8 fases]] — el flujo completo, de idea a entrega
- [[Orquestador]] — la clase `Run`, el ciclo de revisión, pausa y reanudación
- [[Eventos y SSE]] — el vocabulario de eventos que conecta servidor e interfaz
- [[Seguridad (guard)]] — contención de rutas y comandos prohibidos
- [[Workspaces y slugs]] — nombres de proyecto, deduplicación del historial
- [[Eficiencia de tokens]] — caché entre proyectos (`excludeDynamicSections`)
  y la Skill que siguen las ocho fases para gastar menos
- [[Aislamiento del proceso hijo]] — fuga real de herramientas ajenas (Gmail,
  Notion, Drive, el toolset del harness) y el arreglo de tres capas

### Agentes
- [[Producto]] · [[Arquitecto]] · [[Backend]] · [[Frontend (agente)]] ·
  [[Integración]] · [[Revisión]] · [[Correcciones]] · [[Entrega]]
- [[Preguntas al usuario (ask)]] — cómo el agente de producto pregunta

### Frontend (interfaz)
- [[Interfaz y TeamFlow]] — la banda de personajes y el resto de la SPA

### Operación
- [[Cuota, pausas y reanudación]] — la nota más importante para operar esto
- [[Autenticación y consumo]] — API key vs. suscripción de Claude Code
- [[Fiabilidad del servidor de fondo]] — el servidor cayéndose y una fase colgada, dos incidentes reales sin fix de código
- [[Control de versiones]] — el repo privado en GitHub, qué queda fuera y por qué

### Pruebas reales
- [[Cuentas Claras (prueba)]]
- [[Postúlate (prueba)]]
- [[Red social de libros (prueba)]] — la más larga: diez intentos, un bug real
  de estado sembrado encontrado y arreglado, app final verificada a mano
- [[Aprendizajes de cuota]] — síntesis de coste y cupo real

## Estructura de carpetas del repo

```
server/
  src/orchestrator.ts   El pipeline: fases, ciclo de revisión, consumo de mensajes del SDK
  src/roles.ts           Los ocho agentes y sus prompts
  src/guard.ts            Contención de rutas y comandos prohibidos
  src/events.ts           Vocabulario de eventos y pub/sub con replay
  src/runs.ts             Registro de ejecuciones y persistencia en .runs/
  src/ask.ts              MCP en-proceso para preguntar al usuario
  src/slug.ts             Deriva el nombre de proyecto desde la idea
  src/index.ts             API HTTP y stream SSE
web/
  src/state.ts             Reductor que convierte eventos en estado de la interfaz
  src/components/          TeamFlow, Mascot, transcript, explorador de archivos
workspaces/<slug>/         El repositorio generado. Es del usuario, se copia donde quiera
.runs/<id>.jsonl           Registro append-only de cada ejecución
.claude/skills/run-agent-forge/
                          Harness para arrancar y pilotar la app
cerebro/                   Este vault
```

> [!note] Fuente
> El README.md de la raíz del repo trae buena parte de esto en prosa continua;
> este vault lo reorganiza en notas enlazadas y añade lo aprendido en las
> [[Aprendizajes de cuota|pruebas reales]] que el README no cubre.
