---
title: Kairos, bot de trading (prueba)
tags:
  - pruebas
---

# Kairos, bot de trading (prueba)

Prueba real que destapó un fallo del propio Claude Agent SDK — no del código
de Agent Forge — y sirvió para entender su mecanismo exacto y qué se puede
hacer (y qué no) desde el orquestador. Datos de `.runs/quiero-hacer-un-bot-de-*`
(slug `quiero-hacer-un-bot-de`, workspace `kairos`).

## La idea

Bot de trading con IA: barra superior con modo operar/solo-cierre y un
indicador de perfil de riesgo 1-10, resumen de capital y rendimiento diario,
gráfica de evolución, histórico de operaciones cerradas, y una sección de
"aprendizaje" donde el bot registra qué le funciona para no repetir errores.

## Lo que de verdad pasó: cuatro intentos, mismo error

| Intento                                                            | `.runs/` id                     | Fase que falló | Duración de la fase      | Coste de la fase | Coste total |
| ------------------------------------------------------------------ | ------------------------------- | -------------- | ------------------------ | ---------------- | ----------- |
| 1 (original)                                                       | `quiero-hacer-un-bot-de-2ec4cd` | frontend       | 20 720 497 ms (~5h45min) | 7.73 USD         | 29.02 USD   |
| 2 (retomado en frontend)                                           | `quiero-hacer-un-bot-de-7c4695` | frontend       | 579 870 ms (~9.6 min)    | 2.83 USD         | 24.12 USD   |
| 3 (retomado en frontend, tras subir `autoCompactWindow`)           | `quiero-hacer-un-bot-de-9dff8d` | frontend       | 701 503 ms (~11.7 min)   | 2.44 USD         | 23.73 USD   |
| 4 (retomado en frontend, tras ampliar `architect-advisor` + Skill) | `quiero-hacer-un-bot-de-73fcec` | frontend       | 653 767 ms (~10.9 min)   | ~2.92 USD        | 24.21 USD   |

Los cuatro terminaron con el mismo mensaje, textual, del SDK:

> Claude Code returned an error result: Autocompact is thrashing: the context
> refilled to the limit within 3 turns of the previous compact, 3 times in a
> row. A file being read or a tool output is likely too large for the context
> window.

`classifyFailure()` (ver [[Orquestador#Fatal vs. pausa (classifyFailure)]]) no
reconoce este texto como cuota (`QUOTA_ERRORS`) ni como los errores duros ya
catalogados (`HARD_ERRORS`) — cae en el "cualquier otra cosa" que marca
`fatal` por defecto y detiene la ejecución entera. Comportamiento correcto: no
hay forma sensata de reintentar sola una fase que entró en este bucle.

## Por qué frontend y no otra fase

De las nueve fases, frontend es la que más contexto necesita tener presente a
la vez: depende de [[Diseño]] (4 mockups HTML) Y de [[Backend]] (contrato de
API + tipos compartidos + rutas ya escritas) además de su propio código — más
que cualquier otra fase del pipeline.

## Diagnóstico real: qué pasa dentro del "thrashing"

El `.jsonl` del intento 3 lo muestra con nombre y apellido. El agente relee
los mismos archivos dos veces, con un hueco de ~4.5 minutos de "pensamiento"
en medio (justo donde ocurrió una compactación automática):

| Archivo                        | 1ª lectura (`seq`) | 2ª lectura (`seq`), tras el hueco |
| ------------------------------ | ------------------ | --------------------------------- |
| `docs/04-WORKPLAN.md`          | 31                 | 148                               |
| `docs/00-BRIEF.md`             | 52                 | 208                               |
| `docs/DESIGN.md`               | 53                 | 209                               |
| `apps/web/package.json`        | 103                | 180                               |
| `apps/web/vite.config.ts`      | 104                | 181                               |
| `apps/web/tsconfig.json`       | 105                | 183                               |
| `apps/web/index.html`          | 107                | 182                               |
| `packages/shared/src/enums.ts` | 101                | 184                               |

Mecanismo: tras compactar, el resumen en prosa no le basta al agente para
escribir código tipado contra el contrato exacto (necesita el nombre de campo
literal, no un resumen). Relee casi todo lo que ya había leído para
recuperar ese detalle — eso rellena el contexto casi de inmediato, dispara
otra compactación, y se repite hasta que el SDK detecta el patrón ("compactó
y se volvió a llenar en 3 turnos, tres veces seguidas") y aborta.

> [!bug] El aviso de retomada nunca llegaba a la fase retomada
> Antes de esta prueba, `Run.pipeline()` guardaba el aviso "retomas una
> ejecución interrumpida, lee docs/ antes de escribir nada" en `ctx.previous`
> — el mismo campo que cada fase (producto, backend...) sobrescribe con su
> propio resumen antes de que le toque el turno a la fase realmente retomada.
> El aviso se perdía siempre, silenciosamente. **Arreglado**: nuevo campo
> `ctx.resumeNote`, separado de `previous`, entregado una sola vez y solo a la
> fase exacta de `request.startFrom` vía `Run.resumeNoteFor(phase)` (con un
> flag de un solo uso — cubre también ramas en paralelo, donde una copia de
> `ctx` para diseño podría heredar por error el aviso pensado para
> arquitecto). Verificado en el intento 2: el log del agente empieza
> literalmente pensando _"I should first check HANDOFF.md for any prior
> interrupted attempt..."_ — pero el aviso arregla la reanudación, no el
> thrashing: el intento 2 falló igual, por el bucle de recompactación de
> arriba, no por falta de contexto de reanudación.

## Tres intentos de arreglo que NO lo resolvieron

1. **Subir `settings.autoCompactWindow` a 500 000** en las opciones de
   `query()` (`runPhaseOnce`, `server/src/orchestrator.ts`). Hipótesis: el
   umbral de auto-compactación de Claude Code es más conservador que la
   ventana real del modelo (Sonnet 5 tiene 1M de contexto), así que darle más
   margen antes de la primera compactación evitaría el problema. **Resultado:
   no lo evitó** (intento 3, con este cambio ya activo, falló igual y en
   menos tiempo que el intento 2). Razón: el cambio solo retrasa _cuándo_
   ocurre la primera compactación; en cuanto ocurre — inevitable en una fase
   larga — el reflejo de releer todo para reorientarse es el mismo,
   independientemente de lo grande que sea la ventana. Se dejó en el código
   (no hace daño, da algo de margen) pero no se documenta como el arreglo.

2. **Hook `PostCompact` para inyectar un aviso justo tras compactar**
   ("no reconstruyas releyendo todo, confía en el resumen o pregunta un dato
   concreto"). Verificado con una consulta a la documentación del SDK antes
   de escribir código: `systemMessage` y `additionalContext` en el hook
   `PostCompact` son **solo para mostrar en la interfaz — el modelo nunca los
   ve**. Y no hay ningún otro hook entre una compactación y el siguiente turno
   del modelo que sirva aquí: `UserPromptSubmit` (la única vía documentada
   con `additionalContext` que sí llega al modelo) solo dispara cuando un
   humano somete un prompt nuevo, y cada fase del pipeline manda un único
   prompt inicial (`role.prompt(ctx)`) y luego el agente trabaja solo con
   herramientas — no hay "siguiente prompt del usuario" dentro de una fase.
   **Descartado por imposible en esta arquitectura, no por falta de tiempo.**

3. **Ampliar `architect-advisor` + la Skill `token-efficient-coding`** para
   que el agente delegara la reconfirmación de un dato puntual en vez de
   releer un documento entero (ver [[Eficiencia de tokens]] y
   [[Agentes/Arquitecto|Arquitecto]]). **Tampoco lo resolvió**: el intento 4,
   con este cambio activo, volvió a caer en el mismo bucle — y el `.jsonl`
   muestra que el agente **ni siquiera llamó** a la herramienta Task en toda
   la fase; simplemente releyó `00-BRIEF.md`, `03-API-CONTRACT.md`,
   `DESIGN.md` y las rutas del backend por segunda vez, igual que en el
   intento 3. Conclusión: instruir comportamiento por prompt no es fiable
   cuando el modelo está bajo presión de contexto — hacía falta un mecanismo
   del propio orquestador, no una petición al agente.

## El arreglo real: reintento mecánico con sesión nueva

`classifyFailure()` ahora reconoce `"autocompact is thrashing"`
(`CONTEXT_THRASH_ERROR`) como una señal de pausa-y-reintento, igual que
`QUOTA_ERRORS` — pero con reintento casi inmediato (`resumeAt: Date.now()`,
~60 s de margen) en vez de esperar una hora de reset real, y con un tope de
`MAX_CONTEXT_RETRIES` (3) para no reintentar indefinidamente si la fase de
verdad necesita más contexto del que cabe en una sesión. Antes de cada
reintento, `runPhase` fija `ctx.resumeNote = RESUME_NOTE` — el mismo aviso de
retomada entre ejecuciones, reutilizado aquí para "retomar dentro de la misma
ejecución" — así la sesión nueva sabe que ya hay trabajo suyo en disco.
Detalle mecánico completo en
[[Orquestador#Fatal vs. pausa (classifyFailure)]].

La diferencia de fondo con los intentos 1-3: una sesión nueva de `query()`
tiene contexto **realmente vacío**, no un historial compactado que el modelo
decide (o no) tratar con cuidado. Es la única forma de garantizar que no
vuelva a entrar en el mismo bucle de recompactación, en vez de pedírselo y
esperar que lo cumpla.

> [!warning] Sin verificar todavía contra una ejecución real
> Implementado y con typecheck en verde, pero sin un intento 5 que confirme
> que el reintento mecánico rompe el bucle de verdad. Actualizar esta nota
> con el resultado.

## Efecto secundario: dos incidentes de fiabilidad del servidor, no del pipeline

Relanzar estos intentos destapó dos reinicios espurios de `node --watch` en
Windows (falsos positivos de cambio sobre `node_modules/iconv-lite` y sobre
`server/src/files.ts`, ninguno de los dos una edición real) que mataron
ejecuciones en memoria sin relación con el bug de autocompactación. Detalle
completo y el arreglo operativo (servidor sin `--watch` mientras hay una
ejecución real larga en curso) en
[[Fiabilidad del servidor de fondo#`node --watch` se reinicia solo por falsos positivos en Windows, sin que nadie edite nada]].

## Qué faltó verificar

Los cuatro intentos se detuvieron en frontend — no hay build de producción,
ni typecheck, ni app funcionando que verificar a mano todavía, a diferencia
de [[Cuentas Claras (prueba)]].
