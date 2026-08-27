---
name: design-goal-calibration
description: Cómo calibrar los fundamentos de web-design-craft según el objetivo real del producto — un dashboard denso, una landing de conversión, un producto de confianza (fintech/salud), una app social de delight, o una herramienta de velocidad no se diseñan igual, aunque compartan el mismo suelo de calidad. Invócala después de leer el brief, antes de diseñar la primera pantalla, para decidir con qué perfil arrancas.
---

# Calibrar el diseño al objetivo del producto

`web-design-craft` da el suelo de calidad (tipografía, espaciado, contraste,
estados). Esta skill decide **cuánto de cada cosa** — más denso o más
aireado, con color o casi sin él, con esquinas o sin ellas, animado o quieto
— según qué tiene que lograr esa pantalla concreta.

No hay un framework publicado y universalmente aceptado para esto — las
metodologías clásicas (Refactoring UI, Material, Apple HIG, Laws of UX) son
deliberadamente agnósticas de objetivo. Lo que sigue está construido a partir
de evidencia empírica real (sistemas de diseño documentados de productos con
objetivos declarados) organizada en perfiles reutilizables.

## Paso 1: identifica el objetivo antes de diseñar nada

Lee `docs/00-BRIEF.md` (y `docs/00-NEGOCIO.md` si existe — el modelo de
negocio y el público objetivo son señales directas del perfil). Pregúntate:
¿qué tiene que sentir o hacer el usuario en ESTA pantalla — decidir rápido
con muchos datos delante, dejarse convencer, confiar antes de dar datos
sensibles o dinero, disfrutar y volver, o simplemente terminar la tarea sin
fricción?

> [!important] Calibra por PANTALLA, no solo por producto
> Un mismo producto mezcla perfiles: el login de una fintech es
> confianza-primero, su panel de transacciones es dashboard-denso, su landing
> de marketing es conversión. No apliques un único perfil a todas las
> pantallas — decide el perfil dominante de cada una y anótalo en
> `docs/DESIGN.md`.

## Los 5 perfiles

Deltas sobre el baseline de `web-design-craft` — todo lo que no se menciona
aquí se queda en el valor por defecto de esa skill.

### Dashboard denso (B2B, analítica, herramientas internas, paneles de admin)

- **Paleta**: neutros + solo 3 colores semánticos (éxito/aviso/crítico) — sin
  ningún otro color decorativo. El acento de marca casi no aparece aquí.
- **Espaciado**: compacto (base 8px, no 16px+) — el objetivo es que quepa
  información, no que respire.
- **Tipografía**: cuerpo funcional (~14-16px), números en fuente
  monoespaciada y alineados a la derecha, headers de tabla `sticky`, altura
  de fila fija (~36px).
- **Animación**: mínima y funcional (fade+translateY ~400-480ms al cargar
  contenido, sin más) — nunca decorativa.
- **Jerarquía espacial**: patrón F o Z, el KPI más crítico arriba-izquierda.
  Progressive disclosure: resumen visible, detalle en drawer/hover, no todo
  al mismo nivel.
- **Principio rector**: *"pack information tight but let each metric
  breathe"* — objetivo de "glanceability" bajo 3 segundos.
- **Color y daltonismo**: nunca solo rojo/verde para estado — añade
  icono/textura, o usa azul/naranja.

### Landing de conversión (marketing, venta, páginas de producto)

- **Paleta**: 2-3 tonos + neutrales, con UN color reservado exclusivamente
  para el CTA primario — ese color no se usa para nada más en la página.
- **Tipografía**: la display SÍ es protagonista (~3-5rem, tracking negativo,
  `line-height` ajustado ~0.95-1.1) — aquí la tipografía hace de hero, no
  hace falta una imagen grande si el texto ya pega fuerte.
- **Estructura de contenido**: la prueba (social proof, cifras, logos)
  aparece ANTES que las afirmaciones grandes, no después. Un solo CTA
  primario por sección; los secundarios son enlaces de texto, no botones
  compitiendo.
- **Límites**: titular en móvil nunca por encima de ~6 líneas.
- **Copy prohibido**: evita relleno vacío tipo "revolutionize", "seamless",
  "unlock the power of" — dice lo que hace, no cómo de emocionante es.
- **Principio rector**: Von Restorff — el único elemento de color distinto
  entre elementos similares es el que se recuerda; si todo destaca, nada
  destaca.

### Confianza (fintech, salud, legal, cualquier dato sensible o dinero de por medio)

- **Paleta**: más restringida que el resto de perfiles — bicromática o casi
  monocroma es aceptable y hasta deseable; el color no es lo que genera
  confianza aquí.
- **Contraste**: sube el objetivo a **WCAG AAA** (7:1 texto normal, 4.5:1
  grande), no solo AA — el público de estos productos incluye
  desproporcionadamente usuarios mayores y pantallas corporativas tenues.
- **Animación**: lenta y "respirable" si la hay (loops de 4-6s, nunca rápida
  ni urgente) — la urgencia visual genera ansiedad cuando hay dinero o salud
  de por medio. Nunca uses vídeo o movimiento para *explicar* una cifra o un
  término financiero: si el movimiento parece que quiere convencer en vez de
  informar, la confianza se rompe.
- **Disclosure**: términos, costes y condiciones visibles sin que el usuario
  tenga que buscarlos — nunca ocultos en un enlace pequeño al fondo.
- **Señales de credibilidad** (marco de NN/g, aplicable directamente):
  calidad visual del diseño, disclosure por adelantado, contenido
  comprensivo y verificable, conexión clara con una identidad de empresa
  real (no una landing anónima). Los premios al *producto/servicio* generan
  más confianza que los premios al *diseño del sitio* — si hay que mostrar
  un sello, que sea del primero.
- **Degradación elegante obligatoria**: no asumas que autoplay, animaciones
  pesadas o JS avanzado van a funcionar — un porcentaje alto de este público
  navega con bloqueos activos.

### Delight / consumo social (apps de uso diario, comunidad, hábito)

- **Microinteracciones**: cada acción del usuario tiene una confirmación
  animada, no solo un cambio de texto — dispara la sensación de progreso que
  trae de vuelta.
- **Progreso visible**: barras, contadores o rachas en cualquier flujo
  repetible (esto es exactamente lo que ya pide `docs/00-BRIEF.md` cuando
  el producto tiene rachas/objetivos — refuérzalo visualmente, no lo trates
  solo como un dato más).
- **Celebración en milestones**: un hito cumplido (objetivo alcanzado, racha
  larga) tiene un momento visual propio, no se muestra igual que cualquier
  otro estado.
- **Paleta y tono**: más permiso para color vivo y personalidad que en
  cualquier otro perfil — pero sigue gastando la saturación fuerte con
  criterio (ver `web-design-craft`), no en todos los elementos a la vez.
- **Principio rector**: el refuerzo tiene que sentirse inmediato — anima el
  éxito, no solo lo declares.

### Utilidad / velocidad (herramientas simples, dev tools, utilidades de un solo uso)

- **Menos es la propuesta de valor, no falta de esfuerzo**: cuanto más vende
  el producto velocidad o precisión, menos decoración necesita — corner
  radius, sombra y animación se convierten en ruido a eliminar, no en pulido
  a añadir. `border-radius: 0` es una elección válida y deliberada aquí.
- **Paleta**: la más restringida de todos los perfiles — bicromática
  (tinta + papel) es el punto de partida, no la excepción.
- **Tipografía**: funcional, sin display protagonista — el contenido es la
  interfaz.
- **Principio rector**: *"precision isn't a feature — it's the entire value
  proposition"* — cada elemento decorativo que no sirve a la tarea es una
  distracción de esa propuesta.

## Perfil por defecto si nada encaja claramente

Si una pantalla no cae claramente en ninguno de los cinco, usa el baseline
puro de `web-design-craft` sin ningún delta — no fuerces un perfil que no
encaja solo por completitud.

## Cómo documentarlo en `docs/DESIGN.md`

Estructura (inspirada en el formato abierto DESIGN.md, adaptada a lo que este
pipeline necesita — no hace falta el YAML frontmatter completo, sí las
secciones):

1. **Overview** — qué perfil(es) de los cinco aplica el producto y por qué,
   pantalla por pantalla si se mezclan.
2. **Colors** — los 4-6 tokens con nombre y su rol (no solo el hex).
3. **Typography** — los roles (display/body/utilitario) con tamaño y
   line-height de cada uno.
4. **Spacing** — la unidad base elegida (4/8px) y la densidad (compacta,
   media, generosa) según el perfil.
5. **Shapes** — radio de esquina elegido (incluido "0, a propósito" si el
   perfil de velocidad lo pide) y por qué.
6. **Pantallas aprobadas** — ruta de cada HTML en `design/pantallas/` con
   una frase de qué resuelve.
7. **Do's and Don'ts** — 3-5 restricciones explícitas para que el frontend no
   reintroduzca lo que este documento ya descartó (p. ej. "sin animación de
   carga: este perfil es de velocidad").
