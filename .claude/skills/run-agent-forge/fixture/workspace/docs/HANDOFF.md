# Bitacora de traspaso

## producto — 2026-08-19

**Que hice:** convertir la idea en un brief de alcance cerrado.

**Archivos tocados:** `docs/00-BRIEF.md`.

**Supuestos asumidos:**
- Uso personal, sin colaboracion: elimina permisos y multi-tenancy.
- Usuario de pago directo, sin ciclo de venta corporativo.

**Para el arquitecto:** el criterio de aceptacion de la captura ("sin recarga de
pagina, campo enfocado") condiciona la arquitectura del cliente. La busqueda por
debajo de 100 ms con 300 tareas se resuelve en cliente; no hace falta indice de
texto completo en el servidor.
