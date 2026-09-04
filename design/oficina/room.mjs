/**
 * El escenario: una oficina isométrica 2:1 (rombo de 64x32 por baldosa),
 * la misma proyección que usa Habbo.
 *
 * Rejilla lógica (gx, gy) -> pantalla:
 *   sx = ORIGIN_X + (gx - gy) * 32
 *   sy = ORIGIN_Y + (gx + gy) * 16
 * Cuanto mayor es (gx + gy), más "cerca" de la cámara: ese valor es también el
 * orden de pintado (depth sort), y es lo que evita que un personaje del fondo
 * se dibuje encima de una mesa de delante.
 */

export const TILE_W = 64;
export const TILE_H = 32;
export const ORIGIN_X = 268;
export const ORIGIN_Y = 168;

/** Rejilla del suelo. 10 x 7 baldosas da sitio a nueve puestos y un pasillo. */
export const COLS = 11;
export const ROWS = 6;

export function iso(gx, gy) {
  return {
    x: ORIGIN_X + (gx - gy) * (TILE_W / 2),
    y: ORIGIN_Y + (gx + gy) * (TILE_H / 2),
  };
}

/** Profundidad de pintado: más alto = más cerca de la cámara = se pinta después. */
export const depth = (gx, gy) => gx + gy;

const FLOOR_A = '#232a38';
const FLOOR_B = '#1e2532';
const FLOOR_EDGE = '#2b3444';
const WALL_L = '#1a202b';
const WALL_R = '#151a24';
const WALL_TOP = '#28303f';

/* ------------------------------------------------------------------ suelo */

function tile(gx, gy) {
  const { x, y } = iso(gx, gy);
  const fill = (gx + gy) % 2 === 0 ? FLOOR_A : FLOOR_B;
  return `<path d="M${x} ${y} L${x + 32} ${y + 16} L${x} ${y + 32} L${x - 32} ${y + 16}Z"
    fill="${fill}" stroke="${FLOOR_EDGE}" stroke-width="0.8"/>`;
}

export function floor() {
  let out = '';
  for (let gy = 0; gy < ROWS; gy++) {
    for (let gx = 0; gx < COLS; gx++) out += tile(gx, gy);
  }
  return out;
}

/* ------------------------------------------------------------------ muros */

const WALL_H = 132;

/** Muro del fondo-izquierda (corre a lo largo de gy, en gx = -1). */
export function wallLeft() {
  const a = iso(0, 0);
  const b = iso(0, ROWS);
  return `
    <path d="M${a.x} ${a.y} L${b.x} ${b.y} L${b.x} ${b.y - WALL_H} L${a.x} ${a.y - WALL_H}Z" fill="${WALL_L}"/>
    <path d="M${a.x} ${a.y - WALL_H} L${b.x} ${b.y - WALL_H} L${b.x} ${b.y - WALL_H - 10} L${a.x} ${a.y - WALL_H - 10}Z" fill="${WALL_TOP}"/>`;
}

/** Muro del fondo-derecha (corre a lo largo de gx, en gy = -1). */
export function wallRight() {
  const a = iso(0, 0);
  const b = iso(COLS, 0);
  return `
    <path d="M${a.x} ${a.y} L${b.x} ${b.y} L${b.x} ${b.y - WALL_H} L${a.x} ${a.y - WALL_H}Z" fill="${WALL_R}"/>
    <path d="M${a.x} ${a.y - WALL_H} L${b.x} ${b.y - WALL_H} L${b.x} ${b.y - WALL_H - 10} L${a.x} ${a.y - WALL_H - 10}Z" fill="${WALL_TOP}"/>`;
}

/* ---------------------------------------------------------------- muebles */

/**
 * Caja isométrica genérica anclada en coordenadas de PANTALLA (px, py = esquina
 * norte de su base). Absoluta a propósito: así el mismo helper sirve para un
 * mueble colocado en la rejilla y para uno dibujado dentro de un `<g>` local.
 */
function boxAt(px, py, w, d, h, top, left, right) {
  const halfW = (w * TILE_W) / 2;
  const halfD = (d * TILE_W) / 2;
  const tN = { x: px, y: py - h };
  const tE = { x: px + halfW, y: py + (w * TILE_H) / 2 - h };
  const tS = { x: px + halfW - halfD, y: py + (w * TILE_H) / 2 + (d * TILE_H) / 2 - h };
  const tW = { x: px - halfD, y: py + (d * TILE_H) / 2 - h };
  return `
    <path d="M${tN.x} ${tN.y} L${tE.x} ${tE.y} L${tS.x} ${tS.y} L${tW.x} ${tW.y}Z" fill="${top}"/>
    <path d="M${tW.x} ${tW.y} L${tS.x} ${tS.y} L${tS.x} ${tS.y + h} L${tW.x} ${tW.y + h}Z" fill="${left}"/>
    <path d="M${tS.x} ${tS.y} L${tE.x} ${tE.y} L${tE.x} ${tE.y + h} L${tS.x} ${tS.y + h}Z" fill="${right}"/>`;
}

/** La misma caja, colocada por rejilla. */
function box(gx, gy, w, d, h, top, left, right) {
  const p = iso(gx, gy);
  return boxAt(p.x, p.y, w, d, h, top, left, right);
}

/**
 * Escritorio con monitor. `on` enciende la pantalla (fase trabajando).
 * Bajo a propósito (18 px): una mesa más alta tapa el torso del agente sentado
 * y la postura deja de leerse — que es justo lo que la escena tiene que contar.
 */
export function desk(gx, gy, accent = '#7f9cff', on = false) {
  const p = iso(gx, gy);
  const screen = on ? accent : '#2a3140';
  return `
    ${box(gx, gy, 1.05, 1.05, 18, '#3b4353', '#2b3140', '#232936')}
    <g transform="translate(${p.x - 1} ${p.y - 24})">
      <rect x="-13" y="-21" width="26" height="18" rx="2.2" fill="#12161f" stroke="#39425a" stroke-width="1.5"/>
      <rect x="-11" y="-19" width="22" height="14" rx="1.3" fill="${screen}" opacity="${on ? 0.85 : 1}"/>
      ${on ? `<path d="M-8-15.5h11M-8-12h15M-8-8.5h7" stroke="#0f1420" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/>` : ''}
      <rect x="-2.5" y="-3" width="5" height="4" fill="#39425a"/>
      <rect x="-7.5" y="1" width="15" height="2.4" rx="1.2" fill="#39425a"/>
    </g>`;
}

/** Silla. `dir` 1 mira a la derecha (hacia la mesa), -1 a la izquierda. */
export function chair(gx, gy, dir = 1) {
  const p = iso(gx, gy);
  return `<g transform="translate(${p.x} ${p.y})${dir === -1 ? ' scale(-1 1)' : ''}">
    <path d="M-19 -16 L-3 -8 L-3 -32 L-19 -40Z" fill="#2f3646"/>
    ${boxAt(0, 0, 0.62, 0.62, 15, '#3a4253', '#2a3140', '#222834')}
  </g>`;
}

/* ----------------------------------------------------------- decoración */

export function plant(gx, gy) {
  const p = iso(gx, gy);
  return `<g transform="translate(${p.x} ${p.y})">
    <ellipse cx="0" cy="2" rx="13" ry="6" fill="#000" opacity="0.28"/>
    <path d="M-9 0 L9 0 L6 -16 L-6 -16Z" fill="#8a5a3c"/>
    <path d="M-6.5-16 L6.5-16 L5.5-20 L-5.5-20Z" fill="#a06a48"/>
    <path d="M0-20c-11 0-16-9-13-17 6 2 10 6 13 12 3-6 7-10 13-12 3 8-2 17-13 17Z" fill="#3f9c95"/>
    <path d="M0-22c-6-4-8-11-6-18 5 3 7 10 6 18Z" fill="#63c8bf"/>
  </g>`;
}

export function cooler(gx, gy) {
  const p = iso(gx, gy);
  return `<g transform="translate(${p.x} ${p.y})">
    <ellipse cx="0" cy="2" rx="12" ry="5.5" fill="#000" opacity="0.28"/>
    ${boxAt(0, 0, 0.5, 0.5, 34, '#39425a', '#252b39', '#1e232e')}
    <path d="M-9 -36c0-8 4-13 9-13s9 5 9 13Z" fill="#7f9cff" opacity="0.55"/>
  </g>`;
}

/**
 * Pizarra colgada en el muro del fondo-derecha. La matriz la inclina al plano
 * del muro (que baja media unidad por cada una que avanza): sin ese sesgo el
 * cartel se ve de frente sobre una pared en perspectiva y "flota".
 */
export function whiteboard(gx) {
  const p = iso(gx, 0);
  return `<g transform="translate(${p.x} ${p.y - 78}) matrix(1 0.5 0 1 0 0)">
    <rect x="-38" y="-26" width="76" height="50" rx="3" fill="#e9edf4"/>
    <rect x="-38" y="-26" width="76" height="50" rx="3" fill="none" stroke="#9aa4b2" stroke-width="2.5"/>
    <path d="M-28-14h34M-28-6h48M-28 2h26M-28 10h40" stroke="#7f9cff" stroke-width="2.4" stroke-linecap="round" opacity="0.75"/>
    <path d="M12 10l6 6 12-16" stroke="#52d18a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>`;
}

/** Ventana en el muro del fondo-izquierda, con vista nocturna. */
export function window_(gy) {
  const p = iso(0, gy);
  return `<g transform="translate(${p.x} ${p.y - 78})">
    <path d="M0-34 L34 -17 L34 27 L0 10Z" fill="#0d1626"/>
    <path d="M0-34 L34 -17 L34 27 L0 10Z" fill="none" stroke="#39425a" stroke-width="3"/>
    <path d="M0-12 L34 5" stroke="#39425a" stroke-width="2.5"/>
    <path d="M17-25.5 L17 18.5" stroke="#39425a" stroke-width="2.5"/>
    <circle cx="25" cy="-6" r="4" fill="#f5c451" opacity="0.85"/>
    <circle cx="9" cy="1" r="1.4" fill="#cdd8ff" opacity="0.7"/>
    <circle cx="27" cy="12" r="1.2" fill="#cdd8ff" opacity="0.5"/>
  </g>`;
}

/** Alfombra del pasillo central, para marcar el recorrido de las entregas. */
export function rug(gx, gy, w, d) {
  const p = iso(gx, gy);
  const halfW = (w * TILE_W) / 2;
  const halfD = (d * TILE_W) / 2;
  const N = { x: p.x, y: p.y };
  const E = { x: p.x + halfW, y: p.y + (w * TILE_H) / 2 };
  const S = { x: p.x + halfW - halfD, y: p.y + (w * TILE_H) / 2 + (d * TILE_H) / 2 };
  const W = { x: p.x - halfD, y: p.y + (d * TILE_H) / 2 };
  return `<path d="M${N.x} ${N.y} L${E.x} ${E.y} L${S.x} ${S.y} L${W.x} ${W.y}Z"
    fill="#2b3350" opacity="0.55" stroke="#3a4570" stroke-width="1.5"/>`;
}
