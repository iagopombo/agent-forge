---
name: token-efficient-coding
description: Prácticas para gastar menos tokens sin bajar la calidad al construir el producto — cuándo releer un archivo, cuándo agrupar llamadas a herramientas, cuándo verificar. Invócala al empezar la fase y síguela durante toda la sesión.
---

# Trabajar gastando menos tokens

Estas reglas no cambian QUÉ construyes ni bajan el listón de calidad — cambian
CÓMO llegas ahí gastando menos. Ignóralas si entran en conflicto directo con
una regla de tu fase (verificar antes de terminar, por ejemplo, no se negocia).

## Herramientas

- **Agrupa llamadas independientes en el mismo turno.** Si vas a leer tres
  archivos que no dependen entre sí, o vas a comprobar dos cosas que no se
  condicionan, pídelas juntas en vez de una por turno. Cada turno adicional es
  una vuelta completa al modelo.
- **No releas lo que acabas de escribir.** El resultado de `Write`/`Edit` ya
  confirma que se guardó. Vuelve a leer solo cuando necesites algo que de
  verdad no sabes — el resultado de un build, un archivo que tocó otro
  proceso, un estado que cambió desde la última vez que lo viste.
- **Busca antes de leer entero.** Para encontrar un símbolo, una función o
  comprobar si algo existe, usa Grep/Glob primero. No abras un archivo grande
  de punta a punta cuando solo necesitas una parte — y si ya sabes la parte,
  usa el rango (offset/límite) en vez de todo el archivo.
- **Edita en vez de reescribir.** Para un archivo que ya existe, un cambio
  puntual con Edit cuesta tokens de salida proporcionales al cambio; reescribir
  el archivo entero con Write cuesta proporcional al archivo completo. Usa
  Write solo para archivos nuevos o cuando de verdad cambia casi todo.

## Verificación

- **Verifica por unidad de trabajo, no por línea tocada.** Agrupa un conjunto
  coherente de cambios (un endpoint, un componente, una migración) antes de
  correr typecheck/build/tests — no dispares la suite entera después de cada
  edición diminuta. Esto no reduce cuánto verificas al terminar la fase (eso
  lo exige tu fase igualmente): reduce cuántas veces un log largo de build
  entra en el contexto por el camino.
- Un resultado de verificación que ya leíste no hace falta repetirlo si nada
  relevante cambió desde entonces.

## Lo que escribes

- **Sin comentarios de relleno.** Un comentario que solo repite lo que el
  código ya dice en su nombre es texto pagado dos veces. Coméntalo solo
  cuando el motivo no sea obvio: una restricción externa, un workaround, un
  invariante que sorprendería a quien lo lea después.
- **Sin narrar lo obvio.** No escribas "ahora voy a hacer X" para luego
  hacer X — hazlo directamente. Reserva la prosa para justificar una decisión
  que de verdad lo necesita (una elección de arquitectura, un recorte de
  alcance, un supuesto).
- **No repitas contenido que ya vive en disco.** Si algo ya está en
  `docs/03-API-CONTRACT.md` o en cualquier otro documento del contrato,
  referéncialo (`docs/03-API-CONTRACT.md`, endpoint tal) en vez de
  reescribirlo o citarlo entero en tu resumen o en un documento nuevo.
- **Resúmenes y entrada de HANDOFF.md, con puntero, no con contenido.**
  Cuando te refieras a un archivo que ya escribiste, nombra la ruta; no pegues
  su contenido en el resumen ni en el handoff.

## Si consultas al arquitecto (architect-advisor)

Una pregunta concreta por consulta, no una revisión abierta de todo tu
enfoque. La respuesta que recibes ya es corta y decidida a propósito — que la
pregunta lo sea también.
