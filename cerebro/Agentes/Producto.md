---
title: Producto
tags:
  - agentes
---

# Producto

Primera fase del [[Pipeline de 8 fases|pipeline]]. `effort: 'high'`,
`model: 'claude-sonnet-5'`, `maxTurns: 40`. Único rol con `canConsult: false`
y **el único con `canAsk: true`** — ver [[Preguntas al usuario (ask)]].

El workspace está vacío al empezar. No escribe código ni elige tecnología
(eso es del [[Arquitecto]]): su salida son `docs/NOMBRE.txt` y dos documentos.

## `docs/NOMBRE.txt`

Una línea, solo el nombre del producto (p. ej. "Lectio") — nada de
descripciones. En cuanto la fase termina bien, el orquestador lo lee y
renombra la carpeta del workspace a ese nombre. Ver
[[Workspaces y slugs#La carpeta se renombra al nombre real del producto (renameToProductName)]].

## `docs/00-BRIEF.md`

1. El producto en una frase
2. Problema y usuario objetivo
3. Alcance del MVP — funcionalidades con criterio de aceptación verificable
4. Fuera del MVP, explícito
5. Modelo de datos en lenguaje natural
6. Los 3 recorridos de usuario principales
7. Monetización — modelo de precios concreto con cifras
8. Requisitos no funcionales (auth, roles, i18n, RGPD, volumen)
9. Supuestos que ha tenido que decidir por su cuenta

## `docs/00-NEGOCIO.md`

Añadido para dar, además del brief, un caso de negocio honesto sobre si esto
se puede vender:

1. **Análisis de viabilidad** — demanda real, contra qué compite, coste de
   mantener frente a ingreso, riesgos, veredicto claro (viable / viable con
   condiciones / dudoso)
2. **Guía de venta y monetización** — 2-3 modelos de precio con cifras, gancho
   de venta en una frase, canales, objeciones típicas con respuesta
3. **Compradores y público objetivo** — 4 a 6 segmentos concretos, del más
   probable al menos, cada uno con quién es, qué dolor tiene, cuánto pagaría y
   dónde encontrarlo

El prompt exacto pide explícitamente "sé honesto, no un folleto" para el
análisis de viabilidad, para que el veredicto no se infle.

## Filosofía del prompt

"Sé despiadado recortando alcance": de diez funcionalidades en la idea,
elegir las tres sin las cuales el producto no tiene sentido, y mandar el resto
a "fuera del MVP".
