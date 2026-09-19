---
name: cerebro-sync
description: 'Mantiene el vault de Obsidian cerebro/ al día con el código de Agent Forge. ÚSALO SIEMPRE, en la misma sesión, después de cualquier cambio en server/src, web/src, README.md, roles.ts (modelos, maxTurns, prompts), orchestrator.ts (mecanismos), o tras cualquier ejecución real que revele algo nuevo (un límite agotado, un bug, un dato de coste). También cuando el usuario pregunte "¿actualizaste Obsidian/el cerebro/el vault?". Trigger words: cerebro, vault, Obsidian, documentar, actualizar la documentación.'
---

# Sincronizar cerebro/ tras un cambio

`cerebro/` es el "segundo cerebro" de Agent Forge: documentación enlazada en
Obsidian sobre decisiones y mecanismos del proyecto. Un vault desactualizado
es tan malo como código roto — la próxima sesión (o el propio usuario) lo
tomará como cierto sin verificarlo primero. Por eso esto no es opcional ni se
pospone: se hace en el mismo turno en que se toca el código, no "más tarde".

## Cuándo se dispara

Inmediatamente después de:

1. **Cualquier edición en `server/src/` o `web/src/`** que cambie un
   comportamiento, un valor de configuración (modelo, `maxTurns`, `effort`),
   un mecanismo (pausa/reanudación, clasificación de fallos, sembrado de
   fases, guard, eventos) o arregle un bug real.
2. **Cualquier ejecución real del pipeline** (no un test unitario) que revele
   algo que no estaba documentado: un tope agotado por primera vez, un
   mensaje de error nuevo, un dato de coste, una decisión de producto o de
   arquitectura tomada de verdad.
3. **El usuario pregunta directamente** si el vault está al día, o pide
   "documentar", "actualizar el cerebro/vault/Obsidian".

No hace falta que el usuario lo pida cada vez — es la primera reacción tras
cerrar el cambio de código, antes de dar la tarea por terminada.

## Cómo hacerlo

1. **Encuentra qué nota(s) hablan de lo que acabas de tocar.** Grep por el
   nombre del archivo, la función o el valor que cambiaste dentro de
   `cerebro/` (ejemplo: si cambias `maxTurns` en `roles.ts`, busca
   `maxTurns:` en `cerebro/Agentes/*.md`). No asumas que ya está al día
   porque "seguramente alguien lo actualizó" — compruébalo leyendo la nota.
2. **Corrige lo que quedó desfasado, no solo añade lo nuevo.** Si una nota
   describe el comportamiento _viejo_ de una función que acabas de reescribir
   (ver `Orquestador.md` tras el cambio de `classifyFailure`, o
   `Backend.md`/`Frontend (agente).md` con un `maxTurns` que ya no coincidía
   con el código), esa frase vieja es un error activo en el vault, igual de
   grave que dejar un bug sin arreglar.
3. **Si es un hallazgo de una ejecución real**, documenta en la nota de
   `Pruebas/` correspondiente (crea una nueva si es un proyecto nuevo, seguir
   la estructura de las notas ya existentes: idea, tabla de intentos con
   datos reales, hallazgos, verificación manual) y enlázala desde donde
   corresponda (la nota de arquitectura del mecanismo afectado, `Aprendizajes
de cuota.md` si es de coste/cupo, `Fiabilidad del servidor de fondo.md` si
   es un incidente operativo).
4. **Todo dato tiene que venir de una fuente real** — `.runs/*.json`/`.jsonl`,
   el propio código, una captura, un comando ejecutado — nunca inventado ni
   estimado de memoria. Si no se puede verificar un número o un hecho, no se
   escribe, o se marca explícitamente como sin confirmar.
5. **Actualiza `Agent Forge.md`** (el índice) si creaste una nota nueva —
   nunca debe quedar huérfana sin enlazar desde el mapa.
6. **Usa `[[wikilinks]]`**, no enlaces markdown, para mantener consistencia
   con el resto del vault (excepto para encabezados con formato dentro del
   propio título de sección, donde el link va sin los backticks/asteriscos:
   `[[Nota#Encabezado sin formato]]`).

## Qué NO hacer

- No lo conviertas en una tarea aparte que se pregunta "¿quieres que
  actualice también el vault?" — es parte de terminar el cambio, como correr
  el typecheck.
- No reescribas una nota entera si solo cambió un dato: edita el fragmento
  concreto (frontmatter, callout, tabla) en vez de regenerar la nota.
- No documentes intención o planes ("se va a subir maxTurns si vuelve a
  pasar") como si ya hubiera pasado — solo lo que de verdad ocurrió, con su
  evidencia.
