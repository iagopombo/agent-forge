import fs from 'node:fs';
import { ROLES, ROLE_IDS, POSE_IDS, POSE_LABELS, sprite } from './sprites.mjs';

const cell = (role, pose) =>
  `<td><div class="cell">${sprite(role, pose, { size: 88 })}</div></td>`;

const rows = ROLE_IDS.map(
  (r) => `<tr>
    <th class="rolename"><span class="swatch" style="background:${ROLES[r].accent}"></span>${ROLES[r].label}</th>
    ${POSE_IDS.map((p) => cell(r, p)).join('')}
  </tr>`,
).join('');

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Sprites</title>
<style>
  body { margin:0; padding:28px 32px; background:#0a0c10; color:#e7eaf0;
         font-family:"Inter",ui-sans-serif,system-ui,"Segoe UI",sans-serif; }
  h1 { font-size:20px; margin:0 0 4px; letter-spacing:-.02em; }
  p.lede { margin:0 0 22px; color:#98a2b3; font-size:13px; }
  table { border-collapse:collapse; }
  th.pose { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#667085;
            font-weight:600; padding:0 0 10px; }
  th.rolename { text-align:left; font-size:13px; font-weight:600; padding-right:16px; white-space:nowrap; }
  .swatch { display:inline-block; width:9px; height:9px; border-radius:3px; margin-right:8px; vertical-align:middle; }
  td { padding:0; }
  .cell { width:104px; height:132px; display:flex; align-items:flex-end; justify-content:center;
          background:radial-gradient(60% 40% at 50% 88%, #161b26 0%, #0e1116 70%);
          border:1px solid #1b202a; border-radius:10px; margin:3px; }
  tr:hover .cell { border-color:#2b3350; }
</style></head><body>
<h1>Agent Forge · hoja de sprites de la oficina</h1>
<p class="lede">Nueve agentes × ocho posturas. Mismo personaje que el rail actual (cabeza, rubor y accesorio de cada rol), ahora con cuerpo para la vista isométrica. Cada sprite se espeja para mirar a la izquierda.</p>
<table>
  <tr><th></th>${POSE_IDS.map((p) => `<th class="pose">${POSE_LABELS[p]}</th>`).join('')}</tr>
  ${rows}
</table>
</body></html>`;

fs.writeFileSync('sheet.html', html);
console.log('ok');
