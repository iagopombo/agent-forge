---
title: Frontend (agente)
tags:
  - agentes
aliases:
  - Frontend
---

# Frontend (agente)

> [!note] No confundir con la interfaz de Agent Forge
> Esta nota es sobre el **rol del pipeline** que construye el frontend del
> producto generado. La interfaz de Agent Forge en sí (la SPA que muestra el
> progreso en vivo) está documentada en [[Interfaz y TeamFlow]].

Cuarta fase. `effort: 'xhigh'`, `model: 'claude-sonnet-5'`, `maxTurns: 170`,
`canConsult: true`.

> [!info] Por qué 170 y no 120
> Tope subido tras [[Red social de libros (prueba)]]: con complejidad media,
> los 120 turnos previos se agotaron a mitad de camino (83 archivos escritos,
> pantallas de estadísticas sin terminar). Igual que [[Backend]], subido con
> margen en vez de reintentar cada vez que el frontend crece.

Implementa toda la interfaz contra el backend ya construido: sistema de
diseño (tokens de color/tipografía/espaciado/radios, reutilizados, nada de
valores sueltos), layout y navegación, todas las pantallas de los recorridos
de usuario del brief, autenticación en cliente (login, registro, sesión
persistente, rutas protegidas), capa de acceso a datos tipada contra el
contrato, y la landing pública si el producto la necesita para vender.

Reglas explícitas: consume la API real (nada de datos falsos incrustados),
cada vista resuelve sus cuatro estados (cargando/vacío/error/con datos),
formularios con validación coherente cliente-servidor, accesibilidad (HTML
semántico, foco visible, contraste, navegable con teclado), responsive
probado mentalmente a 360px y 1440px, modo claro y oscuro si el stack lo
permite sin coste extra.

Si necesita un endpoint que no existe, consulta al
[[Arquitecto|architect-advisor]] en vez de inventarlo.

Criterio de terminado: typecheck y build de producción en verde, sin errores
de consola, verificado por el propio agente.
