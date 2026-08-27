---
name: web-design-craft
description: Fundamentos de ejecución para diseño web — tipografía, espaciado, color, contraste, tema claro/oscuro, jerarquía, estados de interfaz, y el bloqueo explícito de patrones que delatan un diseño genérico de IA. Invócala siempre que vayas a diseñar o construir una pantalla, antes de tocar el archivo. Se usa junto con design-goal-calibration, que decide cómo calibrar estos valores según el objetivo del producto.
---

# Ejecución de diseño web

Esto es el suelo de calidad — lo que hace que un diseño se vea "hecho por
alguien que sabe" en vez de genérico, sea cual sea el objetivo del producto.
Para decidir CÓMO calibrar estos valores (más denso/más aireado, con o sin
color, animado o no) según qué vende o para quién es el producto, usa la
Skill `design-goal-calibration` — esta skill es el "cómo ejecutar bien",
aquella es el "qué knobs tocar".

## Antes de tocar el archivo: el plan

Fija por escrito (aunque sea en tu propio razonamiento, no hace falta que
sea un archivo aparte si `design-goal-calibration` ya te obliga a escribir
`docs/DESIGN.md`):

1. **4-6 tokens de color con nombre**, no "azul" y "gris" — `--color-ink`,
   `--color-accent`, no hex sueltos repartidos por el HTML.
2. **2+ roles tipográficos** (display, cuerpo, y opcionalmente utilitario/
   monoespaciado para datos) — nunca una sola fuente para todo si la pantalla
   tiene jerarquía real que mostrar.
3. **Concepto de layout en una o dos frases** — qué va arriba, qué es el
   punto de entrada visual, cómo fluye la mirada.

Deriva cada decisión posterior de ese plan. No improvises variantes a medio
construir.

## Construir de abajo a arriba, con contenido real

Átomos (label, input, botón) → moléculas (un campo de búsqueda es label +
input + botón) → organismos (una cabecera es logo + nav + búsqueda) →
pantalla completa. Nunca con lorem ipsum ni datos inventados que no
representen lo que la app real mostrará — un nombre de usuario largo, una
lista vacía, un número con muchos dígitos son los casos que rompen un layout
mal hecho, y solo se ven con contenido real.

## Tipografía

- Escala fija, no una fórmula matemática pura (los ratios modulares 1.25/
  1.333 producen saltos torpes en interfaces reales) — valores probados:
  12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 / 48px (Tailwind-style) o la escala
  de 15 niveles de Material 3 si el producto necesita más granularidad.
- **Line-height inverso al tamaño**: texto pequeño necesita más interlineado
  (14px → ~1.5), texto grande necesita menos (36px+ → ~1.1-1.2).
- **Longitud de línea**: 45-75 caracteres para texto de lectura corrida
  (`max-width` en `ch`, no en `px`).
- Cabeceras con `text-wrap: balance`; etiquetas en mayúsculas con
  `letter-spacing` ligero.
- Google Fonts es el único host externo cargable sin más; cualquier otra
  fuente va como `@font-face` con dato embebido, siempre con una pila de
  fallback real declarada (nunca una fuente sin plan B).
- Pairing deliberado: una display + una body pensadas para el tono del
  producto, no el combo "seguro" por defecto (ver bloqueo de abajo).

## Espaciado y grid

- Unidad base 4px u 8px (el consenso cruzado entre Material, Apple HIG y
  Tailwind) con subdivisión de 4px para ajustes finos.
- `gap` en flex/grid, no márgenes sueltos por elemento — los márgenes
  colisionan (se colapsan o se duplican) de forma impredecible entre
  elementos vecinos.
- Empieza con más espacio en blanco del que crees necesario y recorta desde
  ahí — la densidad excesiva agobia antes de que se note como "eficiente";
  el espacio generoso se lee como cuidado incluso cuando no hace falta
  funcionalmente (cuánto espacio exactamente lo decide
  `design-goal-calibration` según el objetivo).

## Color

- Los neutros (grises) no son grises puros — sesgados levemente hacia el
  tono del acento, para que se lean como elegidos y no como el gris por
  defecto del navegador.
- Gasta la saturación/el color fuerte **en un solo sitio** por vista; todo lo
  demás queda tranquilo. Si un acento choca con su fondo, muévelo a un tono
  análogo o bájale la saturación — no lo cambies de color sin más.
- Los colores semánticos (éxito/aviso/error) son un sistema aparte del acento
  de marca — nunca el mismo color cumple los dos papeles, y nunca dependen
  solo del color (icono + etiqueta de texto también, para daltonismo).
- Contraste mínimo WCAG AA: **4.5:1** texto normal (&lt;24px), **3:1** texto
  grande (≥24px, o ≥19px en negrita). `design-goal-calibration` te dice
  cuándo el objetivo del producto exige subir a AAA (7:1 / 4.5:1).

## Tema claro/oscuro (si el producto lo necesita)

Patrón de tokens exacto — cualquier otra estructura rompe en alguno de los
tres estados reales del visor (claro explícito, oscuro explícito, "sistema"
sin marcar):

```css
:root { /* paleta clara completa, como tokens */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* redefine los tokens */ }
}
:root[data-theme="dark"] { /* redefine los tokens otra vez */ }
```

- Los componentes se pintan SOLO con tokens, nunca con un valor de color
  suelto dentro de un bloque de media/atributo — es el bug número uno que
  rompe el tema.
- `body` necesita un token de `background` explícito — si queda transparente,
  hereda en silencio el fondo del contenedor que lo aloja.
- Si el producto se compromete a un solo tema (sin selector), sigue pintando
  todo explícitamente con tokens — no dejes nada a un valor por defecto del
  navegador que podría no sostenerse en cualquier fondo.
- Si el producto necesita que el color se adapte de verdad (alto contraste,
  modo oscuro real), usa roles semánticos (`--color-surface`,
  `--color-on-surface`) en vez de hex fijos — así el tema cambia sin tocar
  ni un componente.

## Jerarquía y lectura

- La jerarquía se marca con tamaño + peso + color **a la vez**, nunca solo
  con la posición en el layout.
- Las interfaces de producto se escanean, no se leen de arriba a abajo:
  resumen/lo crítico primero, detalle después o bajo demanda (acordeón,
  drawer, hover) — no un muro de información al mismo nivel.
- Los elementos interactivos tienen que **parecer** interactivos (botones
  con relieve/color propio, enlaces distinguibles del texto normal) — nunca
  un diseño tan plano que el usuario tenga que adivinar qué se puede tocar.

## Estados de interfaz (obligatorios, no opcionales)

Cada vista que muestra datos resuelve sus cuatro estados: cargando, vacío,
error, con datos. Un mockup que solo enseña el estado "con datos" no está
terminado — al menos esboza cómo se ve vacío y con error, porque son los
estados que más tiempo ve un usuario real en un producto nuevo.

Formularios: validación con mensaje que explica qué falló y cómo arreglarlo
(nunca "algo salió mal" a secas), botón bloqueado mientras se envía.

## Umbrales duros (no se negocian por estética)

| Qué | Valor |
|---|---|
| Objetivo táctil mínimo (botón, icono pulsable) | 44×44px |
| Espacio entre controles interactivos adyacentes | 12-48px |
| Contraste AA texto normal / grande | 4.5:1 / 3:1 |
| Umbral de respuesta percibida como "instantánea" | &lt;100ms |
| Umbral de productividad percibida (Doherty) | &lt;400ms — por encima, hace falta spinner/skeleton |
| Duración de animación "natural" | 300-500ms |
| Auto-cierre de un toast/notificación | 4-8s |
| Ítems de navegación de primer nivel | 7±2 (Ley de Miller) — más que eso, agrupar |
| Foco de teclado visible | Siempre, sin excepción |
| `prefers-reduced-motion` | Respetado siempre — sin animación si el usuario lo pide |

## El bloqueo de "esto es obviamente un diseño de IA"

Evita estos tres combos salvo que el usuario los pida explícitamente — son
los defaults que delatan que nadie tomó una decisión real:

1. Fondo crema cálido (`#F4F1EA`) + tipografía serif de titular + acento
   terracota.
2. Negro casi puro + un único acento verde ácido o bermellón como "el" color.
3. Estilo broadsheet: reglas finas, cero `border-radius`, columnas densas
   tipo periódico.

Tampoco: Inter/Space Grotesk como combo "seguro" sin pensarlo, marcadores de
sección con emoji, todo centrado, `rounded-lg` en cada tarjeta sin motivo,
tarjetas con barra de acento redondeada por defecto.

## Antes de dar una pantalla por terminada

- Quita un accesorio — si dudas si un elemento decorativo sobra, sobra.
- Sin solapamientos, sin etiquetas sin cerrar, atributos con comillas dobles.
- Columnas de números con `font-variant-numeric: tabular-nums` y alineadas a
  la derecha.
- Tablas u otro contenido ancho dentro de su propio contenedor con
  `overflow-x: auto` — la página nunca desplaza en horizontal.
- Responsive de verdad: compruébalo mentalmente a 360px y 1440px, no solo al
  ancho en el que lo escribiste.

## Copy (el texto también es diseño)

Nombra las cosas como las ve el usuario, no con el nombre interno del
sistema. Voz activa. Los botones dicen exactamente qué va a pasar ("Eliminar
cuenta", no "Confirmar"). Los errores explican qué falló y cómo arreglarlo,
sin disculpas vagas ni jerga técnica cruda.
