---
title: Aprendizajes de cuota
tags:
  - pruebas
  - operacion
---

# Aprendizajes de cuota

Síntesis de lo que las pruebas reales ([[Cuentas Claras (prueba)]],
[[Postúlate (prueba)]], [[Red social de libros (prueba)]]) enseñaron sobre
coste y cupo, más allá de lo que dice el código en abstracto. Ver el mecanismo
en [[Cuota, pausas y reanudación]].

## Coste real de una app de complejidad media

- [[Cuentas Claras (prueba)|Cuentas Claras]], con Sonnet y `effortCap:
  medium`, completó las 5 fases lineales + ciclo de revisión + entrega por
  **18.67 USD** de coste estimado (a tarifa de API), en el intento que llegó
  a `done`. Un primer intento fallido del mismo proyecto había gastado 4.37
  USD adicionales antes de fallar.
- La fase de producto en solitario ronda 0.50-0.81 USD con una sola pregunta
  de alcance (dato de [[Postúlate (prueba)|Postúlate]] y
  [[Red social de libros (prueba)]]).
- [[Red social de libros (prueba)|La red social de libros]], con el reparto de
  modelos por rol (Sonnet salvo Arquitecto/Revisión en Opus 4.8) en vez de
  Opus en las ocho fases, completó por **21.13 USD** en el run final — segundo
  punto de datos de coste, en el mismo orden de magnitud que Cuentas Claras
  pese a llevar dos fases con Opus 4.8 (Arquitecto sola costó 4.01 USD de esos
  21.13).
- Con suscripción, ese "coste" nunca es una factura: es la estimación del SDK
  a tarifa de API, usada solo como indicador de consumo relativo — ver
  [[Autenticación y consumo]].

## El plan Pro tiene dos límites, no uno

Confirmado empíricamente, no solo por la documentación de Anthropic:

1. **Ventanas móviles de ~5 horas.** Los avisos con hora de reset
   (`"resets 5:30pm"`, `"resets 6pm"`) son de esta clase; `parseResetAt()` los
   entiende y el orquestador espera automáticamente.
2. **Un tope semanal aparte** (`"hit your weekly limit"`). Vaciar las
   ventanas de 5h del día no dice nada de cuánta cuota semanal queda — y al
   revés, tener ventana libre no garantiza que quede cupo semanal.

**Implicación práctica:** una sola app de complejidad media (Cuentas Claras)
ya consumió del orden de 3 ventanas de 5h en el intento que completó. Encadenar
varias apps en la misma semana con suscripción es más probable que tope con
el **límite semanal** antes que con las ventanas diarias — el semanal es el
techo real a tener en cuenta al planificar cuánto trabajo cabe, no las
ventanas de 5h por separado.

## Lo que no salió gratis: un bug de cascada, ya arreglado

[[Postúlate (prueba)]] destapó que el corte ante un fallo no reconocido **no
estaba garantizado**: `classifyFailure()` solo marcaba `fatal` para texto que
coincidía con `HARD_ERRORS`. Un fallo que llegaba como un código de salida de
proceso crudo (sin texto reconocible, como el `"Claude Code process exited
with code 1073807364"` de esa prueba) no armaba ninguna señal, así que el
pipeline seguía a la fase siguiente en vez de detenerse — y si el motivo de
fondo persistía, las fases restantes fallaban en cascada casi
instantáneamente, igual que el bug que la detección de cuota por texto ya
resolvió para los mensajes que sí reconoce.

**Arreglado** invirtiendo el criterio por defecto en `classifyFailure()`:
ahora detener es lo que pasa salvo que el error suene a cuota, no al revés.
Detalle en [[Cuota, pausas y reanudación#Fail-safe por defecto]] y en
[[Postúlate (prueba)]].

## maxTurns también se ajusta con evidencia real, no de más

[[Red social de libros (prueba)]] agotó el tope de turnos tres veces en total
para una app de complejidad media: [[Backend]] y [[Frontend (agente)]]
(120→170) y [[Entrega]] (60→100, esta última en dos intentos: el primero con
60 falló, el reintento con 100 sí llegó). Mismo criterio que las expresiones
de `QUOTA_ERRORS`: subir el tope cuando un caso real lo agota, no de forma
preventiva en fases que no lo han demostrado necesitar.

## Para la próxima prueba

- ~~Confirmar el coste total de una ejecución que sí complete sin fallos de
  entorno de por medio~~ — hecho: [[Red social de libros (prueba)]], 21.13
  USD en el run final que llegó a `done`.
- Cuando aparezca un mensaje de agotamiento de cuota con una frase nueva no
  cubierta por `QUOTA_ERRORS`, añadirla al patrón en vez de reintentar a
  mano — ver la lista de frases ya cubiertas en
  [[Cuota, pausas y reanudación#Las dos expresiones regulares]].
