# Assets de la oficina isométrica

Fuente de verdad del **diseño** de los personajes y del escenario. No es código
de la aplicación: son módulos Node sin dependencias que emiten SVG, pensados
para iterar el dibujo rápido y revisarlo en el navegador antes de portarlo a
React. El plan de implementación está en `cerebro/Arquitectura/Oficina isométrica.md`.

## Qué hay

| Archivo | Qué contiene |
|---|---|
| `sprites.mjs` | Paleta por rol, la cabeza «blob» de Claude, los accesorios (puestos y de mano) y las ocho posturas |
| `room.mjs` | Proyección isométrica 2:1, suelo, muros, mesas, sillas y decoración |
| `sheet.mjs` | Genera `sheet.html`: los 9 agentes × 8 posturas, para revisar el dibujo |
| `scene.mjs` | Genera `scene.html`: la oficina montada con una entrega en curso |

## Renderizar

```bash
cd design/oficina
node sheet.mjs      # -> sheet.html
node scene.mjs      # -> scene.html
```

Y abrir los `.html` en el navegador. No hay que instalar nada.

## Decisiones de dibujo que no son obvias

- **La cabeza es exactamente la de `Mascot.tsx`** (mismo path SVG), normalizada a
  una sola variante para que las nueve compartan sprite. Los accesorios se
  posicionan contra esa referencia fija en vez de contra nueve cabezas distintas.
- **Los accesorios se parten en dos familias.** Los que se llevan puestos (casco
  del arquitecto, boina del frontend, bombilla de producto) viajan con la cabeza
  en toda postura. Los de mano (lupa, llave, paleta, caja…) se anclan al puño,
  así que siguen al brazo cuando la postura lo mueve.
- **La pierna cercana se dibuja DELANTE del torso** en las posturas sentadas. Sin
  ese orden el muslo queda tapado y la postura lee como «inclinado hacia
  delante», no como sentado.
- **Las mesas son bajas (18 px).** Con la altura que tenían antes (26) tapaban el
  torso del agente sentado, que es justo lo que la escena tiene que contar.
- **Los carteles de pared llevan `matrix(1 0.5 0 1 0 0)`** para tumbarse sobre el
  plano del muro. Sin ese sesgo se ven de frente sobre una pared en perspectiva
  y parecen flotar.
- **Solo dos orientaciones** (derecha y su espejo), no las ocho de Habbo. El
  pipeline es una fila que avanza de izquierda a derecha, así que las otras seis
  no se llegarían a usar.
