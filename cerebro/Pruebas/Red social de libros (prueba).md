---
title: Red social de libros (prueba)
tags:
  - pruebas
---

# Red social de libros (prueba)

Tercera prueba real completa del pipeline, y la más larga: cinco días de
calendario (23 al 27 de agosto de 2026), diez ejecuciones distintas del mismo
proyecto (slug `quiero-una-red-social-donde`), hasta llegar a `done`. Datos de
`.runs/quiero-una-red-social-donde-*.json`.

## La idea

"Lectio" — red social de seguimiento de lectura: registro diario de páginas
leídas por libro, valoración y comentarios, lista TBR, feed estilo Instagram
con gente que sigues y sugerencias, búsqueda con listados "hyped" y
recomendados, y una pantalla de estadísticas con racha, mapa de calor estilo
GitHub, calendario con portadas y gráfico de géneros. Estadísticas completas
detrás de un muro premium (suscripción mensual o pago único).

La idea, tal como la escribió el usuario, traía dos preguntas incrustadas para
el equipo — no se editó el texto antes de pasarlo a la fase de
[[Producto|producto]], se envió literal:

- *"¿Los pagos se realizarán a través de la plataforma Stripe?"*
- *"¿Puede ser que un buen stack sea full Ruby on Rails? Es con el que se hizo
  Twitter en su día."*

## Diez intentos, un solo proyecto

Gracias a [[Workspaces y slugs]], las diez ejecuciones comparten slug y
carpeta de workspace:

| Ejecución | Estado | Coste acumulado |
|---|---|---|
| `...a06a18` → `...df5646` (7 intentos) | `stopped`/`failed` | de 0 a 13.25 USD |
| `...1891aa` | `stopped` (pausada por cuota, luego el servidor murió) | 19.62 USD |
| `...2adddf` | `failed` (Entrega agotó `maxTurns: 60`) | 23.21 USD |
| `...33b299` | **`done`** | 21.13 USD (coste final: las 6 fases sembradas + Entrega en 100 turnos) |

En el historial solo aparece la última. Uno de los manifiestos intermedios
(`...1356e0`) quedó con el JSON truncado a medio escribir — coincide con un
reinicio del servidor a mitad de escritura, más evidencia del patrón de
[[Fiabilidad del servidor de fondo]].

> [!info] Por qué tantos intentos
> No fue un solo problema repetido: fueron varios reales, distintos, cada uno
> con su propia recuperación —
> [[Cuota, pausas y reanudación|pausas por cuota]] (ambos límites: de
> 5h y semanal), el servidor cayéndose entre reconexiones de sesión (tres
> veces), una fase de backend colgada 5.5h sin fallar ni terminar, y dos topes
> de `maxTurns` agotados por primera vez. Todos documentados con su
> recuperación en [[Fiabilidad del servidor de fondo]] y en
> [[Aprendizajes de cuota#maxTurns también se ajusta con evidencia real, no de más]].

## Las dos preguntas del usuario, respondidas de verdad

- **Stripe**: [[Producto]] decidió que el MVP se lanza **100% gratis** para
  validar tracción antes de monetizar — la integración de pagos (Stripe
  Checkout + Billing, webhooks, gating de Mis Estadísticas) queda documentada
  en `docs/00-BRIEF.md` para una fase posterior, pero no se construye ahora.
  Decisión de alcance, trasladada al usuario y confirmada.
- **Ruby on Rails**: rechazado por el [[Arquitecto]], con motivo explícito en
  `docs/01-ARCHITECTURE.md`: *"Rails no da tipado estático ni comparte tipos
  con el frontend"* (criterio explícito de la arquitectura: TypeScript de
  punta a punta). Se eligió **Next.js 15 (App Router) + TypeScript + Prisma**
  — front y API en un único proyecto y despliegue, en vez de un backend
  aparte.

## Bug real encontrado y arreglado durante esta prueba

> [!bug] "Los otros agentes aparecen en espera, como si no hubiesen hecho su
> trabajo ya" — reporte textual del usuario
> Cada reanudación crea un run id nuevo con su propio registro de eventos
> vacío; la interfaz derivaba el estado de cada fase solo de los eventos del
> run *actual*, así que las fases ya terminadas en ejecuciones anteriores se
> veían "pendientes" hasta que de verdad les tocaba el turno. Arreglado con
> `seedPriorPhases()` — detalle completo en
> [[Orquestador#Sembrado de fases previas al retomar (seedPriorPhases)]].
> Verificado en producción real, no solo en test: al reanudar desde `package`,
> las seis fases anteriores aparecieron `ok=true` en el segundo `0` del nuevo
> run.

También en esta prueba se agotó `maxTurns` por primera vez en tres fases
distintas (backend y frontend a 120, entrega a 60) — subido con evidencia real
en cada caso, ver [[Backend]], [[Frontend (agente)]] y [[Entrega]].

## Verificación manual de la app generada

A diferencia de [[Postúlate (prueba)]] (que no llegó a producir app por la
cascada de fallos), aquí sí hubo build y arranque reales:

- `npm run build` en producción, limpio, 41 rutas compiladas (12 páginas + 29
  endpoints de API).
- `npm start` contra el Postgres local ya sembrado por la propia fase de
  [[Integración]] en su verificación (usuaria de prueba `ana_lectora`,
  `ana@example.com`).
- Login real, navegación por feed, búsqueda, estadísticas y perfil — capturas
  de pantalla del flujo completo, no solo del código. El feed mostró
  publicaciones reales del seed con barras de progreso; estadísticas mostró
  racha, mapa de calor, calendario con portadas y el gráfico de géneros, todo
  funcionando con datos reales.
- Dos avisos menores de consola (un 404 y un 401) durante la navegación
  automatizada, sin bloquear ningún flujo visible.

## `docs/00-NEGOCIO.md`, usado por primera vez en una prueba real

Esta fue la primera prueba con la extensión de [[Producto]] que añade el
análisis de viabilidad, la guía de venta/monetización y el público objetivo.
El documento salió con las tres secciones completas (65 líneas): viabilidad,
monetización (freemium con dos vías de pago diferidas) y compradores
objetivo — coherente con la decisión de lanzar gratis que se le trasladó al
usuario.
