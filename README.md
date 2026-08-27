# Agent Forge

Le das una idea. Un equipo de ocho agentes de Claude la convierte en un repositorio
completo —producto, arquitectura, backend, frontend, integración, revisión y entrega—
mientras tú lo ves trabajar en directo desde el navegador.

Construido sobre el [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk):
los agentes no describen código, lo escriben en disco, ejecutan comandos, corren los
tests y arreglan lo que falla.

---

## Arranque

```bash
npm run install:all          # instala servidor y web
cp server/.env.example server/.env
```

Edita `server/.env` y pon tu clave:

```
ANTHROPIC_API_KEY=sk-ant-...
```

La clave se saca de [platform.claude.com](https://platform.claude.com/). **Si no pones
clave y tienes Claude Code con sesión iniciada, el SDK usa esa cuenta** — lee
*Autenticación y consumo* antes de decidir.

```bash
npm run dev                  # API en :5178, interfaz en :5179
```

Abre **http://localhost:5179**, describe tu idea y pulsa *Construir la aplicación*.

Para producción local: `npm run build && npm start` sirve todo desde el puerto 5178.

---

## El equipo

Cada fase es una sesión independiente del Agent SDK sobre el mismo workspace. El
contrato entre agentes son los documentos de `docs/`: cada uno lee lo que escribió el
anterior, y ninguno puede contradecirlo en silencio.

| Fase | Qué produce | Modelo |
|---|---|---|
| **Producto** | `docs/00-BRIEF.md` (alcance del MVP, usuario, recorridos, monetización) y `docs/00-NEGOCIO.md` (viabilidad, guía de venta, compradores objetivo) | Sonnet 5 |
| **Arquitecto** | Stack, modelo de datos, contrato de API, reparto de trabajo y el esqueleto del repo | Opus 4.8 |
| **Backend** | Todos los endpoints del contrato, auth, migraciones, seed y tests | Sonnet 5 |
| **Frontend** | Sistema de diseño, pantallas, sesión, capa de datos tipada | Sonnet 5 |
| **Integración** | Arranca todo desde cero, recorre los flujos y corrige los desajustes | Sonnet 5 |
| **Revisión** | Audita y dictamina en `docs/REVIEW.json`: aprobado o con bloqueantes | Opus 4.8 |
| **Correcciones** | Resuelve los bloqueantes con evidencia. Vuelve a revisión | Sonnet 5 |
| **Entrega** | README, `.env.example`, guía de despliegue, operaciones, licencia | Sonnet 5 |

**Opus 4.8 solo en arquitecto y revisión.** Son las dos fases cuyo error se propaga a
todas las demás —un mal contrato de API arrastra a backend y frontend; una revisión laxa
aprueba lo que no funciona— así que son las que más se benefician de más capacidad. El
resto ejecuta contra un contrato ya escrito: tarea bien acotada donde Sonnet 5 rinde
igual y consume mucha menos cuota. Se puede forzar otro modelo por ejecución o con
`FORGE_MODEL` — ver *Autenticación y consumo* más abajo.

**El agente de producto puede preguntarte.** Ante una duda de alcance que de verdad
bifurca el producto —a qué público, qué modelo de negocio, si una pieza cara entra en el
MVP— lanza una pregunta con tres opciones concretas y una cuarta libre para que escribas la
tuya. El pipeline se pausa hasta que respondes desde la interfaz; tu respuesta pasa a ser
una decisión firme del brief. Solo el agente de producto pregunta, y solo para lo que
cambiaría lo que se construye: los detalles menores los sigue asumiendo y anotando.

**Si te quedas sin cuota, la ejecución se pausa y se reanuda sola.** En vez de fallar, la
fase espera a que la cuota vuelva (lee la hora de reset del propio aviso) y la reintenta: el
agente relee su trabajo y continúa. Puedes cerrar el navegador. Los errores que esperar no
arregla —clave de API mal, saldo agotado— sí detienen la ejecución.

**Cada proyecto vive en su carpeta y tiene un registro.** El workspace se llama como el
proyecto (`workspaces/aforo/`), derivado de la idea, y el historial muestra una entrada por
proyecto: los reintentos y las reanudaciones del mismo proyecto comparten carpeta y no se
duplican en la lista.

**El arquitecto sigue disponible después de su fase.** Backend, frontend, integración y
correcciones lo tienen como subagente: cuando el contrato tiene un hueco, preguntan en
lugar de improvisar. Esas consultas aparecen marcadas en el transcript.

**El ciclo revisión → correcciones → revisión** se repite hasta que el revisor aprueba o
se agotan las rondas configuradas. Si se agotan, la entrega sigue adelante y los
bloqueantes abiertos quedan documentados. Si la fase de revisión *falla*, no hay veredicto:
se entrega avisando de que va sin auditar, nunca dando por buena una revisión que no ocurrió.

**Una ejecución interrumpida se retoma, no se repite.** El contrato entre agentes vive en
`docs/`, así que el que entra lee lo que dejó el anterior. Retomar reutiliza el workspace y
empieza por la primera fase sin terminar.

---

## Autenticación y consumo

El SDK resuelve credenciales en este orden, y la primera que encuentra gana:

1. **`ANTHROPIC_API_KEY`** en `server/.env` → cuenta de API, facturación por token.
   El contador *Coste est.* se aproxima a lo que vas a pagar de verdad.
2. **Sesión de Claude Code** (`~/.claude`) → tu suscripción. No se te cobra por token:
   **se consume tu cuota**, la misma que gastas usando Claude Code normalmente.

Para saber cuál está activa ahora mismo, mira el aviso al arrancar el servidor: si dice
que falta `ANTHROPIC_API_KEY`, estás en el caso 2.

**Con suscripción vas a chocar contra los límites.** Esto no es una advertencia teórica: la
primera ejecución de prueba agotó la cuota en la fase de arquitectura, y la segunda también.
El arquitecto va a `effort: 'max'`, que es lo más caro que existe.

Cuando pasa, la ejecución **se pausa y se reanuda sola** cuando la cuota vuelve (ver *El
equipo* arriba): no arrasa las fases restantes ni la das por perdida. Si prefieres no
esperar y la ejecución terminó marcada como fallida por otra razón, el workspace conserva
todo lo escrito y en la cabecera aparece **«Retomar en \<fase\>»**, que reutiliza el mismo
directorio y arranca por la primera fase sin terminar.

Por defecto **cada rol ya usa el modelo que menos cuota le hace falta** (ver
*El equipo* arriba): esa es la primera palanca, no hace falta tocar nada. Si aun así no
te cabe, de menos a más agresiva:

- `effortCap` en la ejecución: un techo para todos los roles (`medium` corta muchísimo).
  El reparto relativo de `roles.ts` se respeta por debajo del techo.
- `model` en la ejecución, o `FORGE_MODEL=claude-sonnet-5` para forzar el mismo modelo
  en las ocho fases, pisando el reparto por rol.
- Reducir las rondas de revisión a `0` y revisar tú.
- Poner una `ANTHROPIC_API_KEY` y pagar por token, que es el camino previsto por el SDK.

Las dos primeras van en el cuerpo de `POST /api/runs`:

```bash
curl -X POST localhost:5178/api/runs -H 'Content-Type: application/json' -d '{
  "idea": "…",
  "model": "claude-sonnet-5",
  "effortCap": "medium",
  "resumeOf": "2026-08-20-a2f2c2",
  "startFrom": "architect"
}'
```

`FORGE_MAX_BUDGET_USD` sigue funcionando como freno en ambos modos: se calcula sobre la
estimación, así que sirve para cortar una fase desbocada aunque no estés pagando dólares.

> El [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) indica que la
> autenticación prevista para aplicaciones construidas sobre él es la API key, y que el
> login de claude.ai no está permitido para productos ofrecidos a terceros. Esto es una
> herramienta personal usando tu propia cuenta, así que no aplica — pero tenlo presente
> si algún día la compartes.

## Seguridad

Cada ejecución vive en `workspaces/<id>/` y nada sale de ahí:

- **Contención de rutas.** Cualquier escritura fuera del workspace se rechaza.
- **Comandos prohibidos.** Borrado recursivo fuera del workspace, operaciones de disco,
  escalada de privilegios, ejecución de scripts remotos, cambios de firewall o registro.
- **Nada hacia fuera.** `git push`, `npm publish`, `docker push` y los despliegues están
  bloqueados. Los agentes construyen; publicar es decisión tuya.
- **Aislamiento de configuración.** `settingSources: []` — un run no hereda tu
  `~/.claude`, tus permisos ni tus `CLAUDE.md`.
- **La API solo sirve workspaces.** El identificador de la URL se valida entero
  (`[A-Za-z0-9._-]+`), no con `basename`: Express decodifica `%2f` antes de llegar al
  handler, así que un id como `..%2f..%2f` bastaba para leer el repositorio completo.

Lo que **no** cubre: Bash puede cambiar de directorio. Un `cd .. && rm -rf otra-cosa` pasa
el filtro. Los patrones son un cinturón de seguridad para la conducta del agente, no una
cárcel; el aislamiento fuerte sería un contenedor.

Los bloqueos son informativos para el agente: los ve y busca otro camino. Aparecen en
rojo en el transcript.

El guard vive en `server/src/guard.ts`. Si añades tolerancias, ten en cuenta que poner un
nombre de herramienta en `allowedTools` **anula el guard para esa herramienta** —
el SDK la autoaprueba antes de consultar el callback.

---

## Configuración

Todo por variables de entorno en `server/.env`:

| Variable | Por defecto | Qué hace |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Tu clave. Sin ella se usan las credenciales de Claude Code |
| `PORT` | `5178` | Puerto de la API |
| `FORGE_MODEL` | *(sin definir)* | Fuerza un modelo para las ocho fases, pisando el reparto por rol |
| `FORGE_MAX_REVIEW_ROUNDS` | `2` | Ciclos de corrección antes de entregar igualmente |
| `FORGE_MAX_BUDGET_USD` | `25` | Techo de gasto **por fase**. Al alcanzarlo, la fase para |

Las rondas y el presupuesto también se ajustan por ejecución desde el formulario.

El modelo y el esfuerzo de razonamiento van por rol en `server/src/roles.ts`, pensados
para no agotar cuota de suscripción: **Opus 4.8** solo en arquitecto y revisión —las dos
fases cuyo error se propaga a todas las demás—, **Sonnet 5** en el resto. El esfuerzo
sigue la misma lógica: `max` en arquitecto y revisor, `xhigh` en los que escriben código,
`high` en producto y entrega.

---

## Qué esperar

Es lento. La fase de producto por sí sola tarda un par de minutos antes de escribir la
primera línea: el agente está razonando, y verás ese razonamiento en la columna izquierda.
Una ejecución completa son entre una y varias horas.

**Cuánto consume depende de con qué te autentiques** (ver *Autenticación y consumo* más
abajo). El contador de la interfaz dice *Coste est.* porque es exactamente eso: la
estimación que hace el SDK a tarifa de API. Con suscripción no es un cobro, es un
indicador de consumo.

Los resultados mejoran mucho con ideas concretas. *"Un SaaS de reservas para peluquerías
donde el cliente reserva online y el negocio ve la agenda del día"* produce bastante más
que *"una app de reservas"*.

Puedes cerrar el navegador: la ejecución continúa en el servidor. Al volver a abrir la
ejecución, el stream se reproduce desde el principio.

---

## Estructura

```
server/
  src/orchestrator.ts   El pipeline: fases, ciclo de revisión, consumo de mensajes del SDK
  src/roles.ts          Los ocho agentes y sus prompts. Aquí se ajusta la calidad
  src/guard.ts          Contención de rutas y comandos prohibidos
  src/events.ts         Vocabulario de eventos y pub/sub con replay
  src/runs.ts           Registro de ejecuciones y persistencia en .runs/
  src/index.ts          API HTTP y stream SSE
web/
  src/state.ts          Reductor que convierte eventos en estado de la interfaz
  src/useForgeRun.ts    Suscripción SSE con buffer (cientos de deltas por segundo)
  src/components/       Rail de fases, transcript, explorador de archivos
workspaces/<id>/        El repositorio generado. Es tuyo, cópialo donde quieras
.runs/<id>.jsonl        Registro append-only de cada ejecución
.claude/skills/run-agent-forge/
                        Harness para arrancar y pilotar la app (ver su SKILL.md)
```

Ese harness trae una ejecución real grabada, así que
`node .claude/skills/run-agent-forge/driver.mjs ui` levanta la interfaz entera con datos y
saca capturas **sin gastar cuota**. Útil para tocar el frontend sin pagar cada recarga.

### Dónde tocar

- **Calidad del resultado** → `server/src/roles.ts`. Los prompts son el 90% del producto.
- **Añadir o quitar una fase** → `PIPELINE` en `roles.ts` y el bucle de `orchestrator.ts`.
- **Más permisos para los agentes** → `FORBIDDEN_COMMANDS` en `guard.ts`.
