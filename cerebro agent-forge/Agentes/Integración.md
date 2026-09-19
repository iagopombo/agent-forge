---
title: Integración
tags:
  - agentes
---

# Integración

Quinta y última fase lineal del [[Pipeline de 8 fases|pipeline]]. `effort:
'xhigh'`, `model: 'claude-sonnet-5'`, `maxTurns: 100`, `canConsult: true`. El
primero que ejecuta el producto entero de punta a punta.

Puede tocar cualquier archivo, pero con el mínimo cambio necesario para que
todo encaje — "no rediseñes el trabajo de nadie". Método:

1. Instala desde cero, como quien acaba de clonar el repo
2. Arranca base de datos, migraciones y seed
3. Arranca backend y frontend, comprueba que levantan sin errores
4. Recorre cada flujo de usuario del brief ejercitando la API de verdad (curl
   o tests), comparando campo a campo con `docs/03-API-CONTRACT.md`
5. Arregla cada desajuste en el lado que esté equivocado respecto al contrato
6. Escribe tests de integración de los flujos completos
7. Deja un único comando de arranque para desarrollo

El prompt señala explícitamente los desajustes clásicos backend/frontend a
vigilar: nombres de campo, formato de fecha, forma de la paginación,
envoltura de la respuesta, códigos de error, CORS, cabeceras de auth,
variables de entorno de build.

Criterio de terminado: desde un checkout limpio, todo el ciclo
instalar→migrar→sembrar→arrancar→usar funciona, con typecheck/build/tests en
verde — y el agente pega la salida real de los comandos en su resumen, no una
afirmación.
