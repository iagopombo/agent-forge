---
title: Revisión
tags:
  - agentes
---

# Revisión

Primera fase del ciclo de calidad (ver
[[Pipeline de 8 fases#El ciclo revisión → correcciones → revisión]]).
`effort: 'max'` con `model: 'claude-opus-4-8'` — junto con [[Arquitecto]], el
único rol en el modelo tope. `maxTurns: 60`, `canConsult: false`. No escribe
código: solo dictamina. Solo puede escribir `docs/05-REVIEW.md` y
`docs/REVIEW.json`.

## Qué es bloqueante

- No arranca, no compila, o un flujo principal está roto
- Funcionalidad del MVP ausente o simulada con datos falsos
- Agujero de seguridad: falta de autorización, inyección, secreto en el repo,
  contraseñas sin hash, endpoint privado sin sesión, IDOR
- Pérdida o corrupción de datos
- Incumplimiento del contrato de API entre las dos mitades

Lo demás (estilo, pulido visual menor, deuda técnica sin impacto) va a
"mejoras", no a bloqueantes — el prompt pide explícitamente no inflar la
lista, porque "cada uno cuesta una ronda completa de trabajo al equipo".

## Método

No se fía de lo que dicen los documentos: ejecuta el código, instala, arranca,
prueba los flujos, lee los endpoints sensibles buscando la comprobación de
permisos, y busca secretos en el repositorio.

## `docs/REVIEW.json`

Formato exacto que consume el orquestador (`readVerdict()` en
[[Orquestador]]):

```json
{
  "verdict": "pass" | "changes_requested",
  "blockers": [
    { "id": "B1", "file": "ruta/al/archivo.ts", "severity": "critical" | "high",
      "problem": "qué está mal", "fix": "qué hay que hacer exactamente" }
  ],
  "improvements": ["texto libre"],
  "summary": "dos frases"
}
```

Si esta fase falla (p. ej. por cuota), no hay veredicto de ninguna clase — ver
la advertencia en [[Pipeline de 8 fases]].
