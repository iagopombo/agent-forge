---
title: Preguntas al usuario (ask)
tags:
  - agentes
---

# Preguntas al usuario (ask)

`server/src/ask.ts`. Un MCP en-proceso (`createSdkMcpServer`) que le da al
agente de [[Producto]] — el único con `canAsk: true` en `roles.ts` — una vía
para preguntar al usuario cuando una duda de alcance cambia de verdad el
producto.

## La tool `preguntar_al_usuario`

Esquema (Zod):

```ts
{
  pregunta: z.string().min(10),
  opciones: z.array(z.string().min(1)).length(3), // EXACTAMENTE 3
}
```

El agente propone exactamente 3 opciones concretas y excluyentes; la
**interfaz** añade una cuarta libre para que el usuario escriba lo que quiera
(no es parte del esquema MCP — es una decisión de la UI). El handler llama a
`ask(pregunta, opciones)`, que es `Run.askUser` — ver
[[Orquestador#Preguntas del usuario]] — y bloquea hasta que resuelve.

## Cuándo preguntar (criterio del prompt de producto)

Al empezar, repasar la idea y detectar como mucho 2-3 decisiones de alcance
que de verdad *bifurcan* el producto: a qué público si caben distintos, qué
modelo de negocio, si una pieza cara entra en el MVP. Explícitamente **no**
para detalles menores que se puedan asumir y anotar como supuesto en el brief
— "pregunta solo lo que cambiaría lo que se construye".

## Circuito completo

1. `askUser()` genera un id (`crypto.randomBytes(4)`), guarda la promesa en
   `pendingAsks`, emite el evento `ask` ([[Eventos y SSE]])
2. La interfaz muestra la pregunta con las 3 opciones + el campo libre
3. El usuario responde vía `POST /api/runs/:id/answer` con `{ id, answer }`
4. `Run.answer(id, text)` busca el id en `pendingAsks`, emite el evento
   `answer`, y resuelve la promesa — el agente recibe el texto como resultado
   de la tool y lo trata como decisión firme, reflejada en el brief
5. Si la ejecución se detiene con una pregunta abierta, `rejectAsks()` la
   rechaza con un error en vez de dejarla colgada para siempre

`Run.openQuestions` expone las preguntas pendientes ahora mismo, para que la
API las reponga si el cliente se reconecta a mitad de una espera.
