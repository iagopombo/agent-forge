---
title: Fiabilidad del servidor de fondo
tags:
  - operacion
---

# Fiabilidad del servidor de fondo

Dos incidentes reales durante la prueba de [[Pruebas/Postúlate (prueba)|Postúlate]] y
la de la red social de lectura, ninguno de los dos por un bug en el código de
Agent Forge — ambos por cómo vive el servidor cuando quien lo lanza es una
sesión de Claude Code en segundo plano.

## El servidor se cae entre reconexiones de sesión

`npm start &` se lanzó como proceso hijo de esta sesión. En algún punto entre
turnos el proceso desapareció sin volcado de error (`/api/health` empezó a
devolver conexión rechazada) — coincide con el patrón ya visto de "shell en
segundo plano sin registro de finalización" al reanudar una sesión. El
workspace no se pierde (`docs/` y el código ya escrito siguen en disco); lo
que se pierde es la ejecución en memoria. Recuperación: reiniciar el servidor
y retomar con `resumeOf` + `startFrom` en la fase que quedó a medias — ver
[[Cuota, pausas y reanudación]].

> [!warning] Esto no es un caso que `classifyFailure` pueda atrapar
> El proceso del servidor entero desaparece, no solo la fase — no hay ningún
> evento de error que capturar porque no hay proceso vivo que lo emita. La
> única señal es `/api/health` sin respuesta. No hay arreglo de código posible
> aquí: es responsabilidad de quien opera el servidor comprobar que sigue vivo.

Volvió a pasar una tercera vez en la misma prueba de la red social de libros,
justo mientras la ejecución estaba en pausa por cuota esperando el reset de
las 5:00 — al reiniciar, `reapOrphans` cerró correctamente esa ejecución como
`stopped` (ver [[Workspaces y slugs#Reaparición de huérfanos (reapOrphans)]]),
así que no hizo falta más que retomar. Tres apariciones en la misma sesión de
trabajo refuerzan la conclusión: es un patrón operativo del entorno, no un bug
puntual a perseguir en el código.

## Un run reanudado por API deja el navegador mirando el intento viejo

Al reanudar con `POST /api/runs` (`resumeOf` + `startFrom`) en vez de desde el
botón "Retomar" de la propia interfaz, el navegador que ya tenía la pestaña
abierta sigue conectado por SSE al `runId` **anterior** — el que falló — hasta
que se recarga o se vuelve a hacer clic en el proyecto del historial. No es un
bug: el id nuevo no tiene forma de llegarle a una pestaña que no lo pidió. Se
vio en esta misma prueba: el navegador seguía enseñando el intento de Entrega
fallido por `maxTurns` mucho después de que el reintento hubiera terminado
`done`. `GET /api/runs` (o recargar) siempre da el id correcto, porque
[[Workspaces y slugs#Deduplicación del historial (RunStore.list())]] se queda
con el más reciente por slug.

## Una fase se cuelga sin fallar ni terminar

Aparte, la fase `backend` de la red social de lectura se quedó **5.5 horas**
sin emitir ningún evento nuevo tras un `Write` a `src/server/storage/local.ts`
— ni éxito, ni error, ni el siguiente turno. El proceso `claude` de esa fase
seguía vivo (visible en `Get-Process`, con tiempo de CPU acumulado), así que
no fue un cierre limpio: quedó esperando algo que nunca volvió.

Investigado: `server/src/guard.ts` no tiene ningún `await` fuera de la propia
función `canUseTool` (una sola función async, sin llamadas a red ni a
procesos hijos) — descarta que el bloqueo esté en la contención de rutas.
Sin más evidencia (no hay traza, no hay error), la hipótesis más probable es
un cuelgue a nivel de sistema operativo (E/S de disco, antivirus escaneando
el archivo recién escrito) o del propio proceso del SDK al comunicarse con su
subproceso — no una función identificable del código de este repo.

**No se investigó más a fondo** porque no había manera de reproducirlo ni una
pista de código a seguir, y forzar un diagnóstico sin evidencia real es
inventarse una causa. Recuperación aplicada: `POST /api/runs/:id/stop` (mata
el árbol de procesos de la fase) y retomar con `startFrom: 'backend'`.

**Si vuelve a pasar**, el diagnóstico es: comparar la hora del último evento
del `.jsonl` contra la hora actual. Si la diferencia es de minutos, puede ser
solo una fase larga (turnos de 10-15 min con `effort: 'xhigh'` son normales).
Si es de horas sin ni un evento de `log`, `text` o `thinking` de por medio, es
este cuelgue — parar y retomar, no esperar más.
