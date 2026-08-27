---
title: Workspaces y slugs
tags:
  - arquitectura
---

# Workspaces y slugs

Antes cada ejecución tenía su propia carpeta (`workspaces/<id>/`) y su propia
fila en el historial. Ahora el nombre de carpeta y la agrupación del historial
son por **proyecto**, no por ejecución.

## `projectSlug()` (`server/src/slug.ts`)

Deriva un identificador legible de la idea del usuario:

- Si la idea empieza por un nombre propio seguido de `:`, `—` o `-`
  (`"Aforo: una herramienta..."`, `"Postúlate: ..."`), usa ese nombre.
- Si no, usa las cinco primeras palabras.
- Normaliza a minúsculas, quita acentos (`normalize('NFD')` + strip de
  diacríticos), sustituye lo que no sea `a-z0-9` por guiones, recorta guiones
  en los extremos y trunca a 48 caracteres.
- Si todo eso da vacío, cae a `'proyecto'`.

**Determinista**: la misma idea siempre da el mismo slug. Eso es justo lo que
permite retomar sin cálculo extra — ver [[Pipeline de 8 fases#Retomar una ejecución interrumpida]].

## Nombre de carpeta

En el constructor de `Run` (`orchestrator.ts`):

```ts
this.slug = request.slug ?? projectSlug(request.idea);
this.workspace = request.workspace ?? path.join(CONFIG.workspacesRoot, this.slug);
```

La carpeta se llama `workspaces/<slug>/`, no `workspaces/<id>/`. Varios
intentos de la misma idea (un reintento tras fallar, una reanudación tras
quedarse sin cuota) apuntan a la misma carpeta y continúan el trabajo anterior
en vez de partir de cero.

## La carpeta se renombra al nombre real del producto (`renameToProductName`)

El slug derivado de la idea es el nombre de carpeta *inicial*, no el
definitivo. La fase de [[Producto]] escribe ahora `docs/NOMBRE.txt` (una
línea, solo el nombre — p. ej. "Lectio") antes del brief; en cuanto esa fase
termina bien, `Run.renameToProductName()` (`orchestrator.ts`) lo lee, deriva
un slug del nombre con la misma `projectSlug()` de siempre, y si es distinto
del nombre de carpeta actual, hace `fs.rename()` de verdad —
`workspaces/quiero-una-red-social-donde/` pasa a ser `workspaces/lectio/`.

> [!info] `this.slug` NO cambia — solo la carpeta
> `run.slug` sigue siendo el slug derivado de la **idea**, porque es lo que
> `RunStore.priorPhaseOutcomes()` y la reanudación por idea necesitan estable
> (ver [[Cuota, pausas y reanudación]]). Solo cambia `run.workspace` — el
> nombre de carpeta que ve quien mire el disco.

Casos cubiertos, con prueba determinista (`probe-rename.mts`, sin gastar
cuota — construye `Run` con un workspace de mentira y llama al método
directamente): sin `docs/NOMBRE.txt` no pasa nada; si el nombre ya coincide
con la carpeta no hay rename; si ya existe una carpeta con ese nombre (choque
con otro proyecto) se queda en el nombre original y avisa por log en vez de
pisar nada; si `fs.rename` falla (Windows con el directorio bloqueado, por
ejemplo) se captura y se sigue trabajando en la carpeta vieja — renombrar es
cosmético, nunca debe tirar abajo una ejecución que por lo demás va bien.

### El problema que esto le crea a reanudar, y cómo se resolvió

Si una reanudación reconstruye la ruta del workspace como
`workspacesRoot/<slug>` (lo que hacía siempre `RunStore.create()`), después
de un rename esa ruta ya no existe — apuntaría a la carpeta vieja, borrada.
`RunStore.resolveWorkspace(slug)` mira todos los manifiestos que comparten
slug (mismo patrón que `priorPhaseOutcomes`) y devuelve el `workspace` del
más reciente; `create()` lo usa cuando la petición trae `startFrom` y no
especifica `workspace` explícito. Así una reanudación después de un rename
sigue encontrando la carpeta correcta.

## El id de ejecución sigue siendo único

`RunStore.create()` (`server/src/runs.ts`) construye el id como
`${slug}-${6 hex aleatorios}` — p. ej. `cuentas-claras-una-app-para-bbfa28`.
El id identifica la *ejecución* (para el registro de eventos, para
`/api/runs/:id/...`); el slug identifica el *proyecto* (para la carpeta y la
deduplicación del historial). Dos ejecuciones del mismo proyecto comparten
slug y carpeta, pero tienen ids distintos y ficheros `.runs/<id>.jsonl`
separados.

## Deduplicación del historial (`RunStore.list()`)

Cada manifiesto en `.runs/*.json` se agrupa por `slug ?? projectSlug(idea)`
(el `??` cubre los registros antiguos, de antes de que el manifiesto llevara
`slug`). De cada grupo se queda **solo el más reciente** (`createdAt` mayor).
Así el historial muestra una entrada por proyecto, no una por intento.

> [!info] Ejemplo real
> `cuentas-claras-una-app-para-c2d9c1` (falló a los 20 min, 4.37 USD) y
> `cuentas-claras-una-app-para-bbfa28` (terminó `done`, 18.67 USD) comparten
> slug `cuentas-claras-una-app-para` y la misma carpeta de workspace. En el
> historial solo aparece la segunda. Ver [[Cuentas Claras (prueba)]].

## `workspaceOf(id)`

Como la carpeta ya no se puede componer con `join(root, id)`, `runs.ts` expone
`workspaceOf(id)` que resuelve la ruta real: del `Run` vivo si está en
memoria, o leyendo `workspace` del manifiesto `.runs/<id>.json` si no. Los
endpoints `GET /api/runs/:id/files` y `/file` en `index.ts` pasan siempre por
aquí (después de que `workspaceFor(id)` valide la *forma* del id — ver
[[Seguridad (guard)#Otros aislamientos (no en guard.ts, pero parte del mismo perímetro)]]).

## Reaparición de huérfanos (`reapOrphans`)

Al arrancar, `RunStore` recorre `.runs/*.json` y cierra en disco cualquier
manifiesto que quedara marcado `running`/`queued`/`paused` — el proceso
anterior murió con esa ejecución a medias, así que sin esto la interfaz la
mostraría trabajando para siempre y el botón de detener no encontraría a nadie
a quien parar.
