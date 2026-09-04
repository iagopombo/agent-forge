/**
 * Sistema de sprites isométrico estilo Habbo para Agent Forge.
 * Fuente de verdad del DISEÑO: de aquí sale la hoja de sprites que se revisa,
 * y de aquí se porta el componente React una vez aprobada.
 *
 * Lienzo de personaje: 96 x 124. Punto de suelo: (48, 112).
 */

export const CREAM = '#efe7d8';
export const FACE = '#2b2f3a';
const LEG = '#39405142';

/** Paleta por rol: acento (rubor, props) y el tono del torso. */
export const ROLES = {
  product:     { label: 'Producto',    accent: '#f5c451', torso: '#c99a2a', torsoLo: '#a87f1f' },
  design:      { label: 'Diseño',      accent: '#ff9d7a', torso: '#d97a58', torsoLo: '#b55f42' },
  architect:   { label: 'Arquitecto',  accent: '#f2a33c', torso: '#d98324', torsoLo: '#b56a17' },
  backend:     { label: 'Backend',     accent: '#7f9cff', torso: '#5a72cc', torsoLo: '#465aa6' },
  frontend:    { label: 'Frontend',    accent: '#b98cff', torso: '#8f66cc', torsoLo: '#7050a6' },
  integration: { label: 'Integración', accent: '#63c8bf', torso: '#3f9c95', torsoLo: '#2f7d77' },
  review:      { label: 'Revisión',    accent: '#8fa8d6', torso: '#6b81ab', torsoLo: '#54678c' },
  fix:         { label: 'Correcciones',accent: '#f5c451', torso: '#b8862a', torsoLo: '#966c1e' },
  package:     { label: 'Entrega',     accent: '#b98cff', torso: '#8f66cc', torsoLo: '#7050a6' },
};

export const ROLE_IDS = Object.keys(ROLES);

/* ------------------------------------------------------------------ cabeza */

/**
 * La cabeza «blob» de Claude, idéntica en forma a `Mascot.tsx` (mismo path),
 * normalizada a UNA sola variante para que todos los roles compartan sprite y
 * los accesorios se posicionen contra una referencia fija.
 * Dibujada en su viewBox original de 96x96; quien la use la escala y traslada.
 */
const HEAD_PATH =
  'M48 18c17 0 30 12 30 29 0 10-5 18-13 23-1 .7-2 1.9-2 3.3v6c0 2.3-2.6 3.6-4.5 2.3l-9-6c-.5-.3-1-.5-1.6-.5C31 75 18 63 18 47 18 30 31 18 48 18Z';

/** `look`: hacia dónde miran los ojos (-1 izquierda, 0 centro, 1 derecha). */
function headBase(accent, look = 0, eyes = 'open') {
  const dx = look * 2.4;
  const eye =
    eyes === 'closed'
      ? `<path d="M${37 + dx} 45c2 2 6 2 8 0M${53 + dx} 45c2 2 6 2 8 0" stroke="${FACE}" stroke-width="2.6" stroke-linecap="round" fill="none"/>`
      : `<ellipse cx="${41 + dx}" cy="45" rx="3.9" ry="5.2" fill="${FACE}"/>
         <ellipse cx="${57 + dx}" cy="45" rx="3.9" ry="5.2" fill="${FACE}"/>`;
  return `
    <path d="${HEAD_PATH}" fill="${CREAM}"/>
    ${eye}
    <circle cx="34" cy="53" r="3.2" fill="${accent}" opacity="0.5"/>
    <circle cx="64" cy="53" r="3.2" fill="${accent}" opacity="0.5"/>
    <path d="M41 55c3.2 3.4 11.8 3.4 15 0" stroke="${FACE}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`;
}

/** Accesorios que se LLEVAN puestos (van pegados a la cabeza en toda pose). */
const WORN = {
  product: `
    <g transform="translate(48 -2) scale(0.78)">
      <path d="M0-13c-6.6 0-11 4.4-11 10 0 3.4 1.7 5.9 3.6 7.7.9.8 1.5 1.7 1.7 2.8l.3 1.5h10.8l.3-1.5c.2-1.1.8-2 1.7-2.8C9.3 2.9 11 .4 11-3c0-5.6-4.4-10-11-10Z" fill="#f5c451"/>
      <rect x="-5" y="10" width="10" height="3.6" rx="1.8" fill="#cfa63a"/>
      <rect x="-3.5" y="14.5" width="7" height="3" rx="1.5" fill="#cfa63a"/>
      <path d="M0-18v-3M-12-13l-2.4-2M12-13l2.4-2" stroke="#f5c451" stroke-width="2.4" stroke-linecap="round"/>
    </g>`,
  architect: `
    <path d="M24 21c0-13 10-21 24-21s24 8 24 21Z" fill="#f2a33c"/>
    <path d="M45 1c-4 1-7 4-8.5 9M51 1c4 1 7 4 8.5 9" stroke="#d98324" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="44.5" y="-1" width="7" height="12" rx="2" fill="#d98324"/>
    <rect x="16" y="19" width="64" height="6" rx="3" fill="#e08b2a"/>
    <rect x="16" y="19" width="64" height="2.6" rx="1.3" fill="#f6b45c"/>`,
  frontend: `
    <path d="M27 21c0-8 9-13 21-13s21 4 21 11c0 4-4 5-9 5H35c-5 0-8-1-8-3Z" fill="#3a3350"/>
    <path d="M27 21c0-8 9-13 21-13" stroke="#5a4f7a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="66" cy="5" r="3" fill="#b98cff"/>`,
};

/** Cabeza completa de un rol, en su viewBox 96x96 original. */
export function head(role, look = 0, eyes = 'open') {
  return `${WORN[role] ?? ''}${headBase(ROLES[role].accent, look, eyes)}`;
}

/* ------------------------------------------------------- props de la mano */

/**
 * Lo que cada rol lleva EN LA MANO. Dibujado alrededor del origen (0,0), que
 * es el centro del puño: la pose decide dónde queda el puño y el prop le sigue.
 */
export const PROPS = {
  design: `
    <g transform="scale(0.62)">
      <path d="M14 0c8 0 14 6 14 13 0 4-2 6-5 6-2 0-3-1-3-3 0-1 1-2 1-3 0-4-4-6-7-6-8 0-14 5-14 12 0 8 6 13 14 13 9 0 16-6 16-15C30 8 23 0 14 0Z" transform="translate(-14 -13)" fill="#f3e3d3" stroke="#c9a06a" stroke-width="1.4"/>
      <circle cx="-5" cy="-4" r="2.1" fill="#f5c451"/><circle cx="4" cy="-6" r="2.1" fill="#ff9d7a"/>
      <circle cx="8" cy="2" r="2.1" fill="#7f9cff"/><circle cx="-4" cy="7" r="2.1" fill="#63c8bf"/>
    </g>`,
  backend: `
    <g transform="scale(0.6)">
      <path d="M0-13 2.3-8.7 7-9.6 7.4-4.8 12-3.4 9.4 .6 12 4.6 7.4 6 7 10.8 2.3 9.9 0 14.2-2.3 9.9-7 10.8-7.4 6-12 4.6-9.4 .6-12-3.4-7.4-4.8-7-9.6-2.3-8.7Z" fill="#7f9cff"/>
      <circle r="4.4" fill="#12151d"/>
    </g>`,
  frontend: `
    <g transform="rotate(28) scale(0.7)">
      <rect x="-2.4" y="-10" width="5" height="20" rx="2.5" fill="#c9a06a"/>
      <rect x="-3" y="-15" width="6" height="6" rx="1.6" fill="#9aa4b2"/>
      <path d="M-3 -15c0-4 6-4 6 0Z" fill="#b98cff"/>
    </g>`,
  integration: `
    <g transform="translate(-14 -7) scale(0.5)">
      <path d="M0 0h7a3 3 0 016 0h7v7a3 3 0 010 6v3H0Z" fill="#63c8bf"/>
      <path d="M27 -3v6a3 3 0 006 0h1a3 3 0 010 6h-1v10H16v-6a3 3 0 000-6V-3Z" fill="#3f9c95"/>
    </g>`,
  review: `
    <g transform="scale(0.62)">
      <circle cx="0" cy="-2" r="12" fill="#0a0c10" stroke="#9fb4ff" stroke-width="4"/>
      <circle cx="0" cy="-2" r="12" fill="#7f9cff" opacity="0.14"/>
      <path d="M-3-2a3 3 0 013-3" stroke="#cdd8ff" stroke-width="2.4" stroke-linecap="round" fill="none"/>
      <rect x="8" y="6" width="7" height="17" rx="3.5" transform="rotate(-45 8 6)" fill="#7f9cff"/>
    </g>`,
  fix: `
    <g transform="rotate(-20) scale(0.72)">
      <rect x="-9" y="-4" width="18" height="8" rx="4" fill="#f5c451"/>
      <rect x="-3" y="-4" width="6" height="8" fill="#e0ad33"/>
      <circle cx="-6" cy="-1.6" r="0.9" fill="#c99a2a"/><circle cx="-6" cy="1.6" r="0.9" fill="#c99a2a"/>
      <circle cx="6" cy="-1.6" r="0.9" fill="#c99a2a"/><circle cx="6" cy="1.6" r="0.9" fill="#c99a2a"/>
    </g>`,
  package: `
    <g transform="translate(-11 -8) scale(0.42)">
      <path d="M0 8 18-1 36 8 18 17Z" fill="#c99b63"/>
      <path d="M0 8v20l18 9V17Z" fill="#a97e46"/>
      <path d="M36 8v20l-18 9V17Z" fill="#b98a54"/>
      <path d="M18 3l6 12M18 3l-6 12" stroke="#b98cff" stroke-width="3" stroke-linecap="round"/>
      <path d="M14 1c2-3 6-1 4 3M22 1c-2-3-6-1-4 3" fill="none" stroke="#b98cff" stroke-width="3" stroke-linecap="round"/>
    </g>`,
  architect: `
    <g transform="translate(-10 -6) scale(0.85)">
      <rect x="0" y="0" width="20" height="14" rx="1.5" fill="#cfe0f5"/>
      <rect x="0" y="0" width="20" height="14" rx="1.5" fill="none" stroke="#8fa8d6" stroke-width="1.2"/>
      <path d="M3 4h8M3 7h12M3 10h6" stroke="#5a72cc" stroke-width="1.3" stroke-linecap="round"/>
    </g>`,
  product: `
    <g transform="translate(-9 -7) scale(0.85)">
      <rect x="0" y="0" width="18" height="15" rx="1.6" fill="#e7eaf0"/>
      <rect x="5" y="-2.5" width="8" height="4" rx="1.6" fill="#9aa4b2"/>
      <path d="M3.5 5h11M3.5 8h11M3.5 11h7" stroke="#98a2b3" stroke-width="1.3" stroke-linecap="round"/>
    </g>`,
};

/** El documento que se entrega de un agente al siguiente. */
export const DOC = `
  <g transform="translate(-9 -7)">
    <rect x="1.5" y="2" width="16" height="13" rx="1.4" fill="#c9d2e0"/>
    <rect x="0" y="0" width="16" height="13" rx="1.4" fill="#f2f5fa"/>
    <path d="M3 3.5h10M3 6.5h10M3 9.5h6" stroke="#8fa0bb" stroke-width="1.2" stroke-linecap="round"/>
  </g>`;

/* -------------------------------------------------------------- el cuerpo */

/**
 * Presupuesto vertical del lienzo 96 x 124 (suelo en y=112):
 *   cabeza  y  4..58   (centro 32)     — grande, proporción Habbo
 *   torso   y 58..86
 *   piernas y 84..108  + pie hasta 112
 * Las piernas se dibujan ANTES que el torso pero llegan más abajo que él,
 * así que se ven enteras en vez de quedar tapadas.
 */
const OUTLINE = '#1d212a';
const LIMB = '#4a5266';
const SHOE = '#272c38';

const shadow = (rx = 19, o = 0.32) =>
  `<ellipse cx="48" cy="112" rx="${rx}" ry="5.5" fill="#000" opacity="${o}"/>`;

/** Brazo recto desde el hombro. `a` en grados, 0 = colgando hacia abajo. */
function arm(x, y, a, len, fill, prop = '') {
  return `<g transform="translate(${x} ${y}) rotate(${a})">
    <rect x="-4.6" y="-4.6" width="9.2" height="${len}" rx="4.6" fill="${fill}" stroke="${OUTLINE}" stroke-width="1.4"/>
    <circle cx="0" cy="${len - 6}" r="5.4" fill="${CREAM}" stroke="${OUTLINE}" stroke-width="1.4"/>
    ${prop ? `<g transform="translate(0 ${len - 6}) rotate(${-a})">${prop}</g>` : ''}
  </g>`;
}

/** Pierna con rodilla: muslo desde la cadera, espinilla desde la rodilla. */
function leg(x, y, thighA, thighL, shinA, shinL) {
  return `<g transform="translate(${x} ${y}) rotate(${thighA})">
    <rect x="-5" y="-5" width="10" height="${thighL + 5}" rx="5" fill="${LIMB}" stroke="${OUTLINE}" stroke-width="1.4"/>
    <g transform="translate(0 ${thighL}) rotate(${shinA})">
      <rect x="-5" y="-5" width="10" height="${shinL + 5}" rx="5" fill="${LIMB}" stroke="${OUTLINE}" stroke-width="1.4"/>
      <ellipse cx="0.5" cy="${shinL + 1}" rx="6.6" ry="4.3" fill="${SHOE}" stroke="${OUTLINE}" stroke-width="1.4"/>
    </g>
  </g>`;
}

/** Torso trapezoidal: hombros estrechos, base ancha. `y` es la línea de hombro. */
function torso(role, y = 58) {
  const { torso: c, torsoLo } = ROLES[role];
  const h = 28;
  return `
    <path d="M36 ${y}c0-4 5-6 12-6s12 2 12 6l2 ${h}c0 4-6 6-14 6s-14-2-14-6Z"
          fill="${c}" stroke="${OUTLINE}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M35.4 ${y + h - 6}c6 3 19 3 25 0l.6 6c0 4-6 6-13 6s-13-2-13-6Z" fill="${torsoLo}"/>`;
}

/** Cabeza colocada sobre el cuerpo (su viewBox propio es 96x96, centro ~48,48). */
function headOn(role, cx, cy, look, eyes, scale = 0.66) {
  return `<g transform="translate(${cx} ${cy}) scale(${scale}) translate(-48 -48)">${head(role, look, eyes)}</g>`;
}

/* ---------------------------------------------------------------- posturas */

const POSES = {
  idle: (role) => {
    const c = ROLES[role].torso;
    return `${shadow()}
      ${leg(43, 84, 2, 14, 0, 12)}${leg(53, 84, -2, 14, 0, 12)}
      ${torso(role)}
      ${arm(35, 63, 10, 26, c)}
      ${arm(61, 63, -16, 26, c, PROPS[role] ?? '')}
      ${headOn(role, 48, 32, 0, 'open')}`;
  },

  walkA: (role) => {
    const c = ROLES[role].torso;
    return `${shadow(15, 0.24)}
      ${leg(46, 83, 30, 14, -14, 12)}${leg(51, 83, -26, 14, 16, 12)}
      ${torso(role, 56)}
      ${arm(35, 61, -26, 26, c)}
      ${arm(61, 61, 30, 26, c, PROPS[role] ?? '')}
      ${headOn(role, 48, 30, 0.7, 'open')}`;
  },

  walkB: (role) => {
    const c = ROLES[role].torso;
    return `${shadow(15, 0.24)}
      ${leg(46, 85, -26, 14, 16, 12)}${leg(51, 85, 30, 14, -14, 12)}
      ${torso(role, 59)}
      ${arm(35, 64, 30, 26, c)}
      ${arm(61, 64, -26, 26, c, PROPS[role] ?? '')}
      ${headOn(role, 48, 33, 0.7, 'open')}`;
  },

  /**
   * Sentado de perfil hacia la mesa (a la derecha). La pierna lejana va detrás
   * del torso y la cercana DELANTE: sin ese orden el muslo queda tapado y la
   * postura lee como "inclinado hacia delante", no como sentado.
   */
  sit: (role) => {
    const c = ROLES[role].torso;
    return `${shadow(15, 0.22)}
      ${leg(44, 84, 86, 17, -86, 17)}
      ${torso(role, 62)}
      ${leg(47, 88, 86, 18, -86, 18)}
      ${arm(38, 68, 64, 25, c)}
      ${arm(57, 67, 70, 27, c)}
      ${headOn(role, 47, 37, 0.9, 'open')}`;
  },

  type: (role) => {
    const c = ROLES[role].torso;
    return `${shadow(15, 0.22)}
      ${leg(44, 84, 86, 17, -86, 17)}
      ${torso(role, 62)}
      ${leg(47, 88, 86, 18, -86, 18)}
      ${arm(38, 68, 76, 25, c)}
      ${arm(57, 67, 58, 27, c)}
      ${headOn(role, 47, 38, 0.9, 'closed')}`;
  },

  /** Entregando: los dos brazos al frente, el documento en la mano de delante. */
  give: (role) => {
    const c = ROLES[role].torso;
    return `${shadow()}
      ${leg(43, 84, 6, 14, 0, 12)}${leg(53, 84, -6, 14, 0, 12)}
      ${torso(role)}
      ${arm(37, 64, 72, 24, c)}
      ${arm(59, 63, 82, 26, c, DOC)}
      ${headOn(role, 48, 32, 1, 'open')}`;
  },

  /** Recibiendo: brazos al frente y algo más altos, manos abiertas y vacías. */
  take: (role) => {
    const c = ROLES[role].torso;
    return `${shadow()}
      ${leg(43, 84, 6, 14, 0, 12)}${leg(53, 84, -6, 14, 0, 12)}
      ${torso(role)}
      ${arm(37, 62, 94, 24, c)}
      ${arm(59, 61, 100, 26, c)}
      ${headOn(role, 48, 30, 1, 'open')}`;
  },

  /** Terminado: brazos en alto y ojos cerrados de contento. */
  cheer: (role) => {
    const c = ROLES[role].torso;
    return `${shadow(17, 0.2)}
      ${leg(43, 84, -10, 14, 4, 12)}${leg(53, 84, 10, 14, -4, 12)}
      ${torso(role, 56)}
      ${arm(35, 61, 152, 26, c)}
      ${arm(61, 61, -152, 26, c, PROPS[role] ?? '')}
      ${headOn(role, 48, 28, 0, 'closed')}`;
  },
};

export const POSE_IDS = Object.keys(POSES);
export const POSE_LABELS = {
  idle: 'quieto',
  walkA: 'andar 1',
  walkB: 'andar 2',
  sit: 'sentado',
  type: 'tecleando',
  give: 'entregando',
  take: 'recibiendo',
  cheer: 'terminado',
};

/** Un sprite completo. `dir: -1` espeja el lienzo para mirar a la izquierda. */
export function sprite(role, pose, { dir = 1, size = 96 } = {}) {
  const inner = POSES[pose](role);
  const open = dir === -1 ? '<g transform="translate(96 0) scale(-1 1)">' : '<g>';
  return `<svg width="${size}" height="${(size * 124) / 96}" viewBox="0 0 96 124" fill="none">${open}${inner}</g></svg>`;
}
