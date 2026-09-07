# Agent Forge

Agent Forge convierte una idea de producto en un repositorio completo de
aplicación, ejecutando un equipo fijo de agentes de Claude (uno por fase) sobre
un mismo workspace en disco. Este glosario fija el vocabulario de Agent Forge
**la fábrica** — no el de las aplicaciones que fabrica, que tienen su propio
`docs/` por proyecto (ver más abajo).

## Language

### Pipeline y ejecución

**Fase**:
Una sesión independiente del Claude Agent SDK que cubre un rol fijo del
pipeline (Producto, Diseño, Arquitecto, Backend, Frontend, Integración,
Revisión, Correcciones, Entrega). Lee lo que dejó la fase anterior en el
`docs/` del workspace y no puede contradecirlo en silencio.
_Avoid_: paso, etapa, step

**Ejecución**:
Una pasada completa (o parcial, si retoma una anterior) del pipeline sobre una
idea, identificada por un id único. Puede terminar, fallar, pausarse por cuota
o detenerse a mano; al reanudarse nunca repite desde cero, continúa donde se
quedó.
_Avoid_: run en prosa (vale como nombre de clase/variable, no como término del glosario), sesión, instancia

**Workspace**:
La carpeta en disco (`workspaces/<slug>/`) donde vive el repositorio que se
está generando. Es el límite de contención: el guard impide que cualquier fase
escriba o borre fuera de ella. Se renombra al nombre real del producto en
cuanto Producto lo decide, pero conserva su slug interno para poder localizarla
al reanudar.
_Avoid_: proyecto (el proyecto es la idea de negocio; el workspace es su carpeta), directorio de trabajo

**Slug de proyecto** vs **id de ejecución**:
Dos identificadores que se confunden fácil. El **slug** identifica el
_proyecto_ (determinista: la misma idea siempre da el mismo slug; agrupa
carpeta e historial). El **id** (`slug-hex`) identifica _una ejecución
concreta_ (su registro de eventos, sus endpoints). Dos ejecuciones del mismo
proyecto comparten slug y carpeta, pero tienen ids y registros separados.

**Ronda**:
Una vuelta del ciclo Revisión → Correcciones → Revisión. Se repite hasta que
el veredicto es favorable o se agotan las rondas configuradas; agotarlas no
bloquea la entrega, solo deja constancia de lo que quedó sin resolver.
_Avoid_: iteración, ciclo (el ciclo es el mecanismo completo; la ronda es cada vuelta)

**Bloqueante**:
Un problema que Revisión considera lo bastante grave como para no dar el visto
bueno. Correcciones existe para resolverlos.
_Avoid_: issue, bug (un bloqueante es un hallazgo de revisión, no cualquier bug del código generado)

**Veredicto**:
El resultado de una ronda de Revisión: aprobado o con bloqueantes. Solo cuenta
como tal si la fase de Revisión terminó bien — si Revisión falla, no hay
veredicto, y eso se dice explícitamente en vez de asumir aprobado por defecto.

**Retomar**:
Arrancar una ejecución nueva que continúa una anterior interrumpida: salta las
fases que ya tienen un resultado válido en disco y empieza en la primera fase
sin terminar. Distinto de la pausa por cuota: la pausa es automática y ocurre
dentro de la misma ejecución; retomar es una ejecución nueva sobre el mismo
workspace.

**Pausa** vs **fatal**:
Los dos desenlaces posibles del fallo de una fase, y no son intercambiables. Una
**pausa** es un fallo reconocible como agotamiento de cuota: la ejecución
espera a que vuelva y reintenta la misma fase sola, sin intervención. Cualquier
otro fallo es **fatal** y para la ejecución entera. Por diseño, todo lo que no
se reconoce como cuota se trata como fatal por defecto — nunca al revés.
_Avoid_: error a secas (siempre precisar si es pausa o fatal)

**Coste estimado**:
La cifra que muestra la interfaz durante una ejecución. Nunca es una factura
real: con la suscripción de Claude Code no hay cobro por token, solo consumo
de cuota. La cifra es la estimación que hace el SDK a tarifa de API, útil para
comparar gasto relativo entre fases, no como coste real.
_Avoid_: coste, precio, factura (a secas — siempre "estimado")

### Agentes (roles del pipeline)

**Producto**:
Primera fase. Convierte la idea en un nombre de producto y dos documentos:
alcance del MVP con sus recorridos y monetización, y un caso de negocio
honesto (viabilidad, guía de venta, compradores). El único rol que puede
preguntarle algo al usuario, y solo cuando la duda bifurca de verdad el
producto.

**Diseño**:
Fase que corre en paralelo con Arquitecto/Backend, no en serie. Maqueta
pantallas como HTML autocontenido, se las enseña como capturas al usuario e
itera con su feedback hasta que las aprueba. Su salida documenta el perfil de
objetivo elegido por pantalla (p. ej. confianza vs. velocidad), los tokens de
color/tipografía/espaciado y las pantallas aprobadas — el contrato que
Frontend traduce al framework real en vez de diseñar por su cuenta.
_Avoid_: prototipo, mockup a secas (el mockup es el artefacto; Diseño es la fase)

**Arquitecto**:
Corre en paralelo con Diseño. Define stack, modelo de datos, contrato de API y
reparto de trabajo, y deja el esqueleto del repo. Sigue disponible después de
su fase como consultor de solo lectura para Backend, Frontend, Integración y
Correcciones cuando el contrato tiene un hueco.
_Avoid_: tratar "arquitecto" y "arquitecto-consultor" como roles distintos — son la misma fase en dos momentos

**Backend / Frontend / Integración / Revisión / Correcciones / Entrega**:
El resto de fases lineales: implementan el contrato de API, construyen la
interfaz contra el diseño aprobado y el backend real, arrancan todo desde cero
y corrigen desajustes, auditan, resuelven bloqueantes, y empaquetan la entrega
final (README, guía de despliegue). Entrega corre siempre, incluso si se
agotaron las rondas de revisión sin converger.

**Preguntar al usuario**:
El mecanismo (no una fase) que deja a una fase bloquearse esperando una
respuesta humana, fuera del ciclo de cuota. Producto lo usa para decisiones de
alcance (tres opciones concretas más una libre); Diseño lo reutiliza con una
captura de pantalla adjunta para iterar el mockup.
_Avoid_: pregunta a secas — puede confundirse con cualquier pregunta suelta del prompt

### Seguridad y contención

**Guard**:
La única puerta por la que pasa cualquier llamada a herramienta de una fase.
Exige primero que la herramienta esté en una lista de permitidas, y solo
entonces comprueba rutas y comandos. Sin esa lista de permitidas, cualquier
herramienta ajena que el proceso llegue a ver (de una cuenta con MCPs
conectados, por ejemplo) se permitiría por omisión.
_Avoid_: sandbox, cárcel — el propio diseño es explícito en que esto es un cinturón de seguridad para la conducta cooperativa del agente, no aislamiento fuerte

**Contención de rutas**:
La comprobación de que cualquier ruta de archivo que toque una fase cae dentro
de su workspace, nunca fuera.

**Comando prohibido**:
Un patrón de `Bash` bloqueado explícitamente porque los agentes construyen
pero no publican ni despliegan: publicar en remoto, borrar fuera del
workspace, apagar el sistema, escalar privilegios, desplegar a producción. Esa
decisión es siempre del usuario.
_Avoid_: comando peligroso a secas — son patrones concretos y documentados, no un juicio general

### Interfaz y eventos

**Evento**:
La unidad del vocabulario compartido entre el orquestador, el stream en vivo y
la interfaz. Todo lo que la interfaz muestra mientras una ejecución corre es
la traducción de un evento.

**TeamFlow**:
La banda horizontal de personajes (uno por fase) que muestra el progreso de
una ejecución. Dibuja las fases en fila aunque Diseño corra en paralelo con
Arquitecto/Backend — simplificación visual consciente: el estado de cada nodo
es real e independiente, aunque el dibujo no distinga "en serie" de "en
paralelo".

**Transcript**:
El panel que reproduce texto, razonamiento y llamadas a herramienta de la fase
seleccionada, reconstruido a partir de sus eventos.

### Documentación del propio repo (tres capas, no confundir)

**Cerebro**:
El vault de Obsidian en `cerebro/`. Documenta cómo funciona Agent Forge por
dentro — decisiones, mecanismos, aprendizajes de pruebas reales — para
consultar sin releer el código cada vez. No sustituye al código: puede quedar
desactualizado si algo cambia y la nota correspondiente no se toca.
_Avoid_: "docs" a secas — para no confundirlo con el `docs/` de un workspace generado

**CONTEXT.md** (este archivo):
El glosario corto y opinado del vocabulario de Agent Forge — la fábrica —,
para que cualquier agente que trabaje en este repo use los mismos términos. No
resume el código ni sustituye al cerebro: es deliberadamente más corto y más
estable que ambos.

**`docs/` del workspace generado**:
Los documentos que las fases van dejando dentro de `workspaces/<slug>/docs/`
(brief, arquitectura, contrato de API, veredicto de revisión...). Es el
contrato _entre fases de una ejecución_, sobre el producto que se está
generando — no tiene relación con este `CONTEXT.md` ni con `cerebro/`, que
hablan de Agent Forge mismo.
