---
title: Skills de diseño (perfect-design)
tags:
  - arquitectura
---

# Skills de diseño (perfect-design)

Plugin `.claude-plugins/perfect-design/` con dos Skills para
[[Diseño]] y [[Frontend (agente)|frontend]] — las dos únicas fases que toman
decisiones visuales. Pedido explícitamente por el usuario: quería que el
agente de diseño "genere diseños perfectos dependiendo del objetivo que se
busque con la aplicación", no solo que aplique buen gusto genérico.

Cargado igual que [[Eficiencia de tokens|el plugin de eficiencia de tokens]]
(`plugins: [{ type: 'local', path }]`, al margen de `settingSources`), pero
**condicionado a la fase** — `DESIGN_QUALITY_PHASES = new Set(['design',
'frontend'])` en `orchestrator.ts` — porque a diferencia del de eficiencia
(que aplica a las nueve fases), esto no le sirve de nada a backend o
arquitecto: listarlo ahí solo costaría tokens sin uso. Verificado con una
sesión real abortada en el `init` (misma técnica que el resto de
verificaciones de plugins de esta sesión): `design` ve las dos skills,
`architect` no ve ninguna de las dos.

## Por qué dos skills, no una

- **`web-design-craft`** — el suelo de calidad que no cambia nunca: escalas
  tipográficas, grid de espaciado, contraste, el patrón exacto de tokens para
  tema claro/oscuro, estados de interfaz obligatorios, umbrales duros
  (44px de objetivo táctil, 4.5:1 de contraste AA, 7±2 ítems de nav...), y el
  bloqueo explícito de los combos que delatan "diseño genérico de IA".
- **`design-goal-calibration`** — cuánto de cada cosa según el objetivo real
  de esa pantalla concreta. Esto es lo que de verdad pedía el usuario y lo
  que NO existe como framework publicado y ampliamente aceptado (ver más
  abajo) — se construyó a partir de evidencia empírica real, no de opinión.

Separadas porque tienen ciclos de vida distintos: la primera es estable
(tipografía y contraste no cambian con el tiempo); la segunda es el sitio
donde añadir perfiles nuevos si hace falta, sin tocar la otra.

## De dónde sale el contenido — investigación real, no inventada

Dos hilos de investigación en paralelo antes de escribir una sola línea de
skill:

1. **Skills propias de Anthropic ya instaladas en esta sesión**
   (`artifact-design`, `dataviz`), leídas a fondo: el patrón exacto de
   theming con tokens, la regla de "gasta el color fuerte en un solo sitio",
   el bloqueo de los tres combos genéricos de IA, el checklist de calidad de
   build (comillas dobles, `tabular-nums`, `overflow-x` en tablas anchas), y
   el proceso de plan-antes-de-código (4-6 tokens de color con nombre, 2+
   roles tipográficos, concepto de layout en una frase).
2. **Búsqueda pública** (WebSearch/WebFetch), con hallazgos reales citables:
   - [`google-labs-code/design.md`](https://github.com/google-labs-code/design.md)
     — spec abierta de Google Labs para un formato `DESIGN.md`
     (frontmatter YAML + prosa, 8 secciones fijas). Confirma que **no
     existe** en la spec un framework de calibración por objetivo — deja
     "unknown sections" para extensión, sin más. Ese vacío es justo lo que
     resuelve `design-goal-calibration`.
   - [`designmd.app/library`](https://designmd.app/library) — biblioteca
     comunitaria de cientos de archivos DESIGN.md reales. La fuente de la
     tabla comparativa de arquetipos de abajo: mismo esquema de tokens,
     valores numéricos muy distintos según el objetivo declarado del
     producto (Data-Dense Dashboard, SaaS Enterprise Analytics, Editorial
     Product Landing, Cobalt Grid, Wealth Video Hero).
   - Plugin oficial `frontend-design` de
     [`anthropics/claude-code`](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
     — el patrón "dos pasadas" (plan, luego autocrítica contra el bloqueo de
     genérico-IA) y "quita un accesorio antes de terminar".
   - [`szilu/ux-designer-skill`](https://github.com/szilu/ux-designer-skill)
     — tabla de umbrales numéricos (contraste, touch target, duración de
     animación, Ley de Miller) y árboles de decisión (modal vs. panel
     lateral vs. página completa).
   - Metodologías clásicas — Refactoring UI (Wathan/Schoger), Material
     Design 3, Apple HIG, Tailwind default theme, WCAG 2.x, Laws of UX
     (Yablonski), heurísticas de Nielsen Norman Group, Atomic Design (Brad
     Frost) — todas deliberadamente agnósticas de objetivo de producto, lo
     que confirma que el hueco real a llenar era la calibración por
     objetivo, no el suelo de calidad (eso ya está bien cubierto en la
     literatura pública).

> [!info] Conclusión de la investigación, textual
> "No existe un framework publicado único y ampliamente adoptado tipo 'si tu
> producto es X, usa estos valores Y' con la autoridad de un NN/g o un W3C."
> Lo que sí existe es un formato estandarizado (DESIGN.md) y una biblioteca
> empírica de instancias reales clasificadas por vertical — de ahí se
> condensaron los cinco perfiles de `design-goal-calibration` en vez de
> intentar derivarlos de las metodologías universales.

## Los cinco perfiles (resumen — contenido completo en la Skill)

| Perfil | Paleta | Densidad | Radio | Animación | Contraste |
|---|---|---|---|---|---|
| Dashboard denso | Neutros + 3 semánticos, nada más | Compacta (8px) | — | Mínima, funcional | AA |
| Landing de conversión | 2-3 tonos + 1 acento exclusivo del CTA | Media | — | — | AA |
| Confianza (fintech/salud) | Bicromática o casi monocroma | Media-generosa | — | Lenta, "respirable" (4-6s) o ninguna | **AAA** |
| Delight/social | Permiso amplio de color vivo | Media | — | Microinteracciones en cada acción | AA |
| Utilidad/velocidad | Bicromática, punto de partida | Compacta | **0px, a propósito** | Ninguna | AA |

Regla explícita en la skill: **calibrar por pantalla, no por producto** — un
login de fintech es confianza-primero aunque su dashboard de transacciones
sea denso-primero. `docs/DESIGN.md` documenta el perfil elegido para cada
pantalla, no uno solo para todo el producto.

## `docs/DESIGN.md` cambió de estructura

Antes era libre ("el sistema de diseño y la lista de pantallas aprobadas").
Ahora sigue una estructura fija inspirada en el formato DESIGN.md público:
Overview (perfil elegido y por qué, pantalla por pantalla si se mezclan),
Colors, Typography, Spacing, Shapes, pantallas aprobadas con su ruta, y
Do's/Don'ts explícitos para que frontend no reintroduzca lo que diseño ya
descartó (p. ej. "sin animación de carga: este perfil es de velocidad"). Ver
[[Diseño]].

## Verificación

Misma técnica que el resto de plugins de esta sesión: `query()` real
abortado en el mensaje `system`/`init`, antes de cualquier turno facturable.
Confirmado que `design` ve `agent-forge-perfect-design:web-design-craft` y
`agent-forge-perfect-design:design-goal-calibration` listadas, y que
`architect` no ve ninguna de las dos — el filtro por fase en
`DESIGN_QUALITY_PHASES` funciona.

No verificado (ni es verificable sin gastar cuota real): que el modelo
invoque las skills de verdad y que el resultado visual sea mejor — eso solo
lo confirma la primera ejecución real.
