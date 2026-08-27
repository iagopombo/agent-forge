---
title: Arquitecto
tags:
  - agentes
---

# Arquitecto

Segunda fase. `effort: 'max'` con `model: 'claude-opus-4-8'` — el único rol,
junto con [[Revisión]], que corre en el modelo tope; ver
[[Cuota, pausas y reanudación]]. `maxTurns: 60`, `canConsult: false` (él es el
consultado, no el que consulta). El subagente `architect-advisor` que
[[Backend]], [[Frontend (agente)|Frontend]], [[Integración]] y
[[Correcciones]] consultan usa el mismo modelo que esta fase, no el global.

Lee `docs/00-BRIEF.md` y produce el contrato técnico completo:

- **`docs/01-ARCHITECTURE.md`** — stack versión por versión con justificación,
  estructura de carpetas, decisiones transversales (auth, validación, errores,
  logging, i18n, pagos), estrategia de tests, despliegue y coste mensual, y un
  apartado de "decisiones descartadas"
- **`docs/02-DATA-MODEL.md`** — entidades con tipos/nullabilidad/defaults,
  relaciones, índices, esquema real en la sintaxis del ORM elegido, datos seed
- **`docs/03-API-CONTRACT.md`** — cada endpoint con método, ruta, request/response
  de ejemplo en JSON, todos los códigos de error, si necesita sesión y qué rol
- **`docs/04-WORKPLAN.md`** — tabla de propiedad de archivos (qué escribe
  BACKEND, qué escribe FRONTEND, sin solape) y el orden de arranque
- **El esqueleto del repo** — de verdad: `package.json`, configs, `.gitignore`,
  `.env.example`, esquema de BD, tipos compartidos. Instala dependencias y
  comprueba que compila vacío. No implementa funcionalidad.

Criterio explícito: "un solo repositorio, evita microservicios: este es un
MVP", "nada de dependencias abandonadas ni versiones alpha".

## Como subagente (`architect-advisor`)

Después de su propia fase, sigue disponible como subagente de solo lectura
(`tools: ['Read', 'Glob', 'Grep']`, `effort: 'high'`) para
[[Backend]], [[Frontend (agente)|Frontend]], [[Integración]] y
[[Correcciones]] — ver [[Orquestador#Ciclo de vida de una fase (runPhaseOnce)]].
Su prompt de asesor le pide respuestas cortas y decididas, sin alternativas
abiertas, y que si su respuesta cambia el contrato ya documentado lo diga
explícitamente y señale qué documento actualizar. No edita: solo aconseja, el
ingeniero aplica el cambio.
