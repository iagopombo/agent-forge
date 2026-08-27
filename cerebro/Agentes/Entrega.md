---
title: Entrega
tags:
  - agentes
---

# Entrega

Última fase del [[Pipeline de 8 fases|pipeline]], siempre se ejecuta pase lo
que pase con el ciclo de revisión. `effort: 'high'`,
`model: 'claude-sonnet-5'`, `maxTurns: 100`, `canConsult: false`.

> [!info] Por qué 100 y no 60
> Tope subido tras [[Red social de libros (prueba)]]: con 60 turnos, la fase
> agotó el límite a mitad de la limpieza de repositorio (revisando
> `.gitignore`, `.env.test`, logs sueltos) antes de terminar el README y el
> resto de la entrega — falló con `"Reached maximum number of turns (60)"`,
> no por cuota. Subida con el mismo criterio que [[Backend]] y
> [[Frontend (agente)]]: según evidencia real, no de más.

Convierte un repositorio que funciona en un producto que alguien puede
comprar, desplegar y mantener:

1. **README.md** — qué es y a quién sirve, stack, arranque local paso a paso
   con comandos verificados por el propio agente, variables de entorno
   explicadas una a una, cómo correr los tests, estructura del proyecto
2. **`.env.example`** completo, con comentario de origen de cada variable
3. **`docs/DEPLOY.md`** — despliegue en el destino que eligió el arquitecto,
   proveedor de BD, variables en producción, dominio, backups, coste mensual
4. **`docs/OPERACIONES.md`** — qué monitorizar, dónde están los logs, cómo
   hacer y restaurar una copia de seguridad, fallos probables con su solución
5. **LICENSE** propietaria y **CHANGELOG.md** en `0.1.0`
6. Limpieza: archivos muertos, código comentado, dependencias sin usar, logs
   de depuración; `.gitignore` cubriendo `.env`, build y dependencias
7. Verificación final: instalación limpia, typecheck, build y tests, con la
   salida pegada en el resumen

Regla explícita: "un README con un comando que falla es peor que no tener
README" — cada comando documentado tiene que haberse ejecutado de verdad en
ese workspace.
