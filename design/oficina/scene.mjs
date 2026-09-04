import fs from 'node:fs';
import { ROLES, sprite } from './sprites.mjs';
import {
  COLS, ROWS, iso, depth, floor, wallLeft, wallRight,
  desk, chair, plant, cooler, whiteboard, window_, rug,
} from './room.mjs';

/**
 * Los nueve puestos en el orden del pipeline. Dos filas a los lados de un
 * pasillo central (gy = 3), que es por donde se hacen las entregas.
 * `seat` es la baldosa de la silla; `desk` la de la mesa, siempre a su derecha.
 */
export const STATIONS = [
  { role: 'product',     seat: [1, 1], desk: [2, 1] },
  { role: 'design',      seat: [3, 1], desk: [4, 1] },
  { role: 'architect',   seat: [5, 1], desk: [6, 1] },
  { role: 'backend',     seat: [7, 1], desk: [8, 1] },
  { role: 'frontend',    seat: [1, 5], desk: [2, 5] },
  { role: 'integration', seat: [3, 5], desk: [4, 5] },
  { role: 'review',      seat: [5, 5], desk: [6, 5] },
  { role: 'fix',         seat: [7, 5], desk: [8, 5] },
  { role: 'package',     seat: [9, 3], desk: [10, 3] },
];

/** Un personaje ocupa ~1 baldosa de ancho: 96 * 0.68 ≈ 65 px. */
const SCALE = 0.68;

/**
 * Coloca un sprite en la rejilla anclándolo por su punto de suelo (48, 112)
 * sobre el centro de la baldosa — que está media baldosa por debajo de la
 * esquina norte que devuelve `iso`.
 */
function actor(role, pose, gx, gy, { dir = 1, dx = 0, dy = 0, s = SCALE } = {}) {
  const p = iso(gx, gy);
  const x = p.x - 48 * s + dx;
  const y = p.y + 16 - 112 * s + dy;
  const inner = sprite(role, pose, { dir, size: 96 })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  return {
    d: depth(gx, gy) + 0.5,
    svg: `<g transform="translate(${x} ${y}) scale(${s})">${inner}</g>`,
  };
}

function bubble(text, gx, gy, dy = -96) {
  const p = iso(gx, gy);
  const w = Math.max(52, text.length * 6.1 + 16);
  return {
    d: depth(gx, gy) + 0.9,
    svg: `<g transform="translate(${p.x - w / 2} ${p.y + dy})">
      <rect x="0" y="0" width="${w}" height="22" rx="6" fill="#11141a" stroke="#2b3350" stroke-width="1.3"/>
      <path d="M${w / 2 - 4.5} 22 L${w / 2} 28 L${w / 2 + 4.5} 22Z" fill="#11141a" stroke="#2b3350" stroke-width="1.3"/>
      <text x="${w / 2}" y="15" text-anchor="middle" font-family="ui-monospace,Consolas,monospace"
            font-size="10.5" fill="#98a2b3">${text}</text>
    </g>`,
  };
}

/** El documento en vuelo entre quien entrega y quien recibe. */
function flyingDoc(gx, gy, dy) {
  const p = iso(gx, gy);
  return {
    d: depth(gx, gy) + 0.95,
    svg: `<g transform="translate(${p.x} ${p.y + dy}) rotate(-10)">
      <rect x="-7" y="-5" width="15" height="12" rx="1.4" fill="#c9d2e0"/>
      <rect x="-9" y="-7" width="15" height="12" rx="1.4" fill="#f2f5fa"/>
      <path d="M-6.5-4h10M-6.5-1h10M-6.5 2h6" stroke="#8fa0bb" stroke-width="1.2" stroke-linecap="round"/>
    </g>`,
  };
}

/**
 * Estado de la escena de ejemplo. Cubre a la vez los cuatro estados que la
 * interfaz tiene que saber contar: trabajando, terminado, entregando y en espera.
 */
const DEMO = {
  product: 'done',
  design: 'working',
  architect: 'handing',
  backend: 'receiving',
  frontend: 'idle',
  integration: 'idle',
  review: 'idle',
  fix: 'idle',
  package: 'idle',
};

function buildScene() {
  const items = [];

  for (const s of STATIONS) {
    const [dgx, dgy] = s.desk;
    const [sgx, sgy] = s.seat;
    const busy = DEMO[s.role] === 'working';
    items.push({ d: depth(dgx, dgy), svg: desk(dgx, dgy, ROLES[s.role].accent, busy) });
    items.push({ d: depth(sgx, sgy) - 0.1, svg: chair(sgx, sgy, 1) });
  }

  items.push({ d: depth(0, 6), svg: plant(0, 6) });
  items.push({ d: depth(10, 0), svg: plant(10, 0) });
  items.push({ d: depth(0, 2), svg: cooler(0, 2) });

  for (const s of STATIONS) {
    const state = DEMO[s.role];
    const [sgx, sgy] = s.seat;

    if (state === 'working') {
      items.push(actor(s.role, 'type', sgx, sgy));
      items.push(bubble('escribiendo…', sgx, sgy));
    } else if (state === 'done') {
      items.push(actor(s.role, 'sit', sgx, sgy));
      items.push(bubble('listo ✓', sgx, sgy));
    } else if (state !== 'handing' && state !== 'receiving') {
      items.push(actor(s.role, 'idle', sgx, sgy));
    }
  }

  // La entrega ocurre EN EL PASILLO: el arquitecto se ha levantado y ha bajado
  // a gy=3; el backend sale a su encuentro desde la baldosa siguiente.
  items.push(actor('architect', 'give', 5, 3));
  items.push(bubble('¡el contrato!', 5, 3, -100));
  items.push(actor('backend', 'take', 7, 3, { dir: -1 }));
  items.push(flyingDoc(6, 3, -34));

  items.sort((a, b) => a.d - b.d);
  return items.map((i) => i.svg).join('');
}

// Encuadre calculado a partir de la rejilla, para no dejar lienzo muerto.
const minX = iso(0, ROWS).x - 40;
const maxX = iso(COLS, 0).x + 40;
const minY = iso(0, 0).y - 152;
const maxY = iso(COLS, ROWS).y + 46;
const W = Math.round(maxX - minX);
const H = Math.round(maxY - minY);

const svg = `<svg viewBox="${Math.round(minX)} ${Math.round(minY)} ${W} ${H}" width="${W}" height="${H}" fill="none">
  <defs>
    <radialGradient id="amb" cx="50%" cy="26%" r="78%">
      <stop offset="0%" stop-color="#161d2e"/><stop offset="100%" stop-color="#0a0c10"/>
    </radialGradient>
  </defs>
  <rect x="${Math.round(minX)}" y="${Math.round(minY)}" width="${W}" height="${H}" fill="url(#amb)"/>
  ${wallRight()}
  ${wallLeft()}
  ${floor()}
  ${rug(0, 2.55, 11, 1.9)}
  ${whiteboard(7)}
  ${window_(4)}
  ${buildScene()}
</svg>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Oficina</title>
<style>
 body{margin:0;padding:26px 30px;background:#0a0c10;color:#e7eaf0;
      font-family:"Inter",ui-sans-serif,system-ui,"Segoe UI",sans-serif}
 h1{font-size:19px;margin:0 0 4px;letter-spacing:-.02em}
 p.lede{margin:0 0 18px;color:#98a2b3;font-size:13px;max-width:104ch;line-height:1.55}
 .frame{border:1px solid #232935;border-radius:14px;overflow:hidden;
        background:#0a0c10;display:inline-block;line-height:0}
 .frame svg{width:1180px;height:auto}
 .legend{display:flex;gap:22px;flex-wrap:wrap;margin-top:16px;font-size:12px;color:#98a2b3}
 .legend b{color:#e7eaf0;font-weight:600}
</style></head><body>
<h1>Agent Forge · la oficina isométrica</h1>
<p class="lede">Proyección 2:1 (baldosa 64×32), la de Habbo. Nueve puestos en el orden del pipeline a los lados de un pasillo central. En esta escena conviven los cuatro estados que la interfaz tiene que saber contar: <b>producto</b> ya terminó y sigue sentado, <b>diseño</b> está tecleando con el monitor encendido, el <b>arquitecto se ha levantado al pasillo y le pasa el contrato al backend</b>, que sale a recibirlo, y el resto espera de pie en su sitio.</p>
<div class="frame">${svg}</div>
<div class="legend">
  <span><b>Sentado + monitor encendido</b> = fase trabajando</span>
  <span><b>Sentado + «listo ✓»</b> = fase terminada</span>
  <span><b>En el pasillo con documento</b> = entrega entre fases</span>
  <span><b>De pie en su sitio</b> = fase en espera</span>
</div>
</body></html>`;

fs.writeFileSync('scene.html', html);
console.log(`escena ${W}x${H}`);
