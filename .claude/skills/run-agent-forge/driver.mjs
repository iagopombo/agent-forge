#!/usr/bin/env node
/**
 * Harness de arranque y pilotaje de Agent Forge.
 *
 *   node .claude/skills/run-agent-forge/driver.mjs smoke   API + replay, sin gastar cuota
 *   node .claude/skills/run-agent-forge/driver.mjs ui      lo anterior + capturas del navegador
 *   node .claude/skills/run-agent-forge/driver.mjs live    ejecucion real (CONSUME CUOTA)
 *   node .claude/skills/run-agent-forge/driver.mjs serve    servidor en primer plano
 *
 * No forma parte del producto: es utillaje de agente.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const UNIT = path.resolve(SKILL_DIR, '..', '..', '..'); // agent-forge/
const SHOTS = path.join(SKILL_DIR, 'shots');
const PORT = Number(process.env.FORGE_PORT ?? 5178);
const BASE = `http://localhost:${PORT}`;
const FIXTURE_ID = 'fixture-demo';
const IS_WIN = process.platform === 'win32';

let serverProc = null;

/* ─────────────────────────── utilidades ─────────────────────────── */

const log = (...a) => console.log('·', ...a);
const ok = (...a) => console.log('  ✓', ...a);

function fail(msg) {
  console.error('  ✗', msg);
  process.exitCode = 1;
  throw new Error(msg);
}

function check(cond, msg) {
  if (!cond) fail(msg);
  ok(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────── servidor ─────────────────────────── */

/** Fecha del archivo mas reciente del arbol, para detectar un dist rancio. */
function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const t = entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs;
    if (t > newest) newest = t;
  }
  return newest;
}

/** El servidor sirve web/dist en el mismo origen, asi evitamos el proxy de Vite. */
function ensureWebBuilt() {
  const dist = path.join(UNIT, 'web', 'dist', 'index.html');
  // Comprobar solo la existencia hace que el driver sirva un bundle viejo y las
  // capturas muestren la interfaz anterior: hay que comparar fechas.
  if (fs.existsSync(dist)) {
    const built = fs.statSync(dist).mtimeMs;
    const sources = Math.max(
      newestMtime(path.join(UNIT, 'web', 'src')),
      fs.statSync(path.join(UNIT, 'web', 'index.html')).mtimeMs,
    );
    if (built >= sources) {
      ok('web/dist esta al dia');
      return;
    }
    log('web/dist esta rancio (hay fuentes mas nuevas), recompilando…');
  } else {
    log('web/dist no existe, compilando (tarda ~1 min la primera vez)…');
  }
  // Comando en una sola cadena: pasar un array con shell:true dispara DEP0190.
  const r = spawnSync('npm --prefix web run build', { cwd: UNIT, stdio: 'inherit', shell: true });
  if (r.status !== 0) fail('el build del frontend fallo');
  ok('frontend compilado');
}

async function startServer() {
  // Si ya hay uno escuchando, lo reutilizamos en vez de chocar con el puerto.
  if (await health().catch(() => null)) {
    ok(`ya hay un servidor en ${PORT}, lo reutilizo`);
    return;
  }

  log('arrancando el servidor…');
  serverProc = spawn('npm --prefix server run start', {
    cwd: UNIT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    detached: !IS_WIN,
  });

  let out = '';
  serverProc.stdout.on('data', (d) => (out += d));
  serverProc.stderr.on('data', (d) => (out += d));

  for (let i = 0; i < 60; i++) {
    const h = await health().catch(() => null);
    if (h) {
      ok(`servidor arriba en ${BASE} (modelo ${h.model})`);
      if (!h.hasApiKey) {
        log('  aviso: sin ANTHROPIC_API_KEY -> usara las credenciales de Claude Code');
      }
      return;
    }
    if (serverProc.exitCode !== null) fail(`el servidor murio al arrancar:\n${out}`);
    await sleep(500);
  }
  fail(`el servidor no respondio en 30s. Salida:\n${out}`);
}

function stopServer() {
  if (!serverProc) return;
  // npm lanza un hijo: hay que matar el arbol o tsx queda huerfano ocupando el puerto.
  if (IS_WIN) {
    spawnSync('taskkill', ['/pid', String(serverProc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-serverProc.pid, 'SIGTERM');
    } catch {
      /* ya muerto */
    }
  }
  serverProc = null;
  log('servidor detenido');
}

/* ─────────────────────────── API ─────────────────────────── */

async function api(pathname, init) {
  const res = await fetch(`${BASE}${pathname}`, init);
  if (!res.ok) throw new Error(`${pathname} -> ${res.status}`);
  return res.json();
}

const health = () => api('/api/health');

/** Lee el stream SSE hasta agotar el tiempo o cumplirse una condicion. */
async function readEvents(runId, { seconds = 20, until = null, from = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), seconds * 1000);
  const events = [];
  const query = from === null ? '' : `?from=${from}`;
  try {
    const res = await fetch(`${BASE}/api/runs/${runId}/events${query}`, { signal: controller.signal });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        // La trama de cierre tambien lleva un `data:`, y colarla contaba un
        // evento de mas al final de cada replay.
        if (frame.includes('event: end')) return events;
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const event = JSON.parse(line.slice(6));
        events.push(event);
        if (until?.(event, events)) {
          controller.abort();
          return events;
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  } finally {
    clearTimeout(timer);
  }
  return events;
}

/* ─────────────────────────── fixture ─────────────────────────── */

/**
 * Instala una ejecucion grabada en .runs/ y workspaces/. El servidor la sirve por
 * su ruta de replay, asi que la interfaz se puebla entera sin llamar a Claude.
 */
function installFixture() {
  const raw = fs.readFileSync(path.join(SKILL_DIR, 'fixture', 'events.jsonl'), 'utf8');
  const workspace = path.join(UNIT, 'workspaces', FIXTURE_ID);

  const events = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const e = JSON.parse(line);
      if (e.runId) e.runId = FIXTURE_ID;
      if (e.workspace) e.workspace = workspace;
      return e;
    });

  const last = events[events.length - 1];
  events.push({
    t: 'run.end',
    status: 'stopped',
    costUsd: 0.87,
    durationMs: 174000,
    seq: last.seq + 1,
    ts: last.ts + 1000,
  });

  fs.mkdirSync(path.join(UNIT, '.runs'), { recursive: true });
  fs.writeFileSync(
    path.join(UNIT, '.runs', `${FIXTURE_ID}.jsonl`),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n',
  );
  fs.writeFileSync(
    path.join(UNIT, '.runs', `${FIXTURE_ID}.json`),
    JSON.stringify(
      {
        id: FIXTURE_ID,
        slug: FIXTURE_ID,
        idea: events[0].idea,
        status: 'stopped',
        createdAt: events[0].ts,
        finishedAt: last.ts + 1000,
        costUsd: 0.87,
        currentPhase: null,
        workspace,
      },
      null,
      2,
    ),
  );

  // El panel de archivos lee del workspace real, no de los eventos.
  const src = path.join(SKILL_DIR, 'fixture', 'workspace');
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.cpSync(src, workspace, { recursive: true });

  ok(`fixture instalado como "${FIXTURE_ID}" (${events.length} eventos)`);
  return events.length;
}

/* ─────────────────────────── modos ─────────────────────────── */

async function smoke() {
  ensureWebBuilt();
  installFixture();
  await startServer();

  const h = await health();
  check(h.ok === true, 'GET /api/health responde');

  const roles = await api('/api/roles');
  check(roles.length === 8, `GET /api/roles devuelve las 8 fases (${roles.map((r) => r.short).join(', ')})`);

  const runs = await api('/api/runs');
  check(
    runs.some((r) => r.id === FIXTURE_ID),
    'GET /api/runs incluye el fixture',
  );

  // Ruta de replay: el run no esta en memoria, sale del .jsonl en disco.
  const events = await readEvents(FIXTURE_ID, { seconds: 20 });
  check(events.length > 100, `el replay SSE devuelve ${events.length} eventos`);
  check(events[0].t === 'run.start', 'el primer evento es run.start');
  check(
    events.some((e) => e.t === 'file' && e.path.endsWith('.md')),
    'el replay contiene eventos de archivo',
  );

  const files = await api(`/api/runs/${FIXTURE_ID}/files`);
  check(files.length > 0, `GET /files lista ${files.length} archivos del workspace`);

  const doc = await api(`/api/runs/${FIXTURE_ID}/file?path=docs/00-BRIEF.md`);
  check(doc.content.length > 100, 'GET /file devuelve el contenido del brief');

  check(events[events.length - 1].t === 'run.end', 'el replay termina en run.end');
  const desde = await readEvents(FIXTURE_ID, { seconds: 20, from: 100 });
  check(desde[0]?.seq === 100, '?from=N reanuda exactamente en ese numero de secuencia');

  // Contencion de rutas. La travesia por el id es la que abrio todo el repo una vez:
  // Express decodifica %2f antes de llegar al handler.
  const travesias = [
    [`/api/runs/${FIXTURE_ID}/file?path=../../../server/.env`, 'ruta que sale del workspace'],
    [`/api/runs/${FIXTURE_ID}/file?path=..%2f..%2f..%2fserver%2f.env`, 'ruta escapada en URL'],
    [`/api/runs/${FIXTURE_ID}/file?path=C:\\Windows\\win.ini`, 'ruta absoluta del sistema'],
    [`/api/runs/${FIXTURE_ID}/file?path=docs`, 'un directorio en vez de un archivo'],
    ['/api/runs/..%2f..%2f/files', 'id con travesia (listado)'],
    ['/api/runs/..%2f..%2f/file?path=server/.env', 'id con travesia (lectura)'],
  ];
  for (const [pathname, label] of travesias) {
    const res = await fetch(`${BASE}${pathname}`);
    check(res.status === 404, `rechazado con 404: ${label}`);
  }

  const bad = await fetch(`${BASE}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea: 'corta' }),
  });
  check(bad.status === 400, 'POST /api/runs rechaza una idea demasiado corta');

  const spa = await fetch(`${BASE}/una/ruta/cualquiera`);
  check(spa.status === 200 && (await spa.text()).includes('<div id="root"'), 'cualquier ruta sirve la SPA');
  check((await fetch(`${BASE}/api/no-existe`)).status === 404, 'una ruta /api desconocida es 404, no la SPA');

  console.log('\nSMOKE OK — sin consumir cuota\n');
}

async function ui() {
  await smoke();

  const { chromium } = await import('playwright-core');
  fs.mkdirSync(SHOTS, { recursive: true });

  log('abriendo Chrome…');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('.new-run h1');
    check(
      (await page.textContent('.new-run h1')).includes('construimos'),
      'la pantalla inicial renderiza el formulario',
    );
    await page.screenshot({ path: path.join(SHOTS, '01-nueva-app.png') });

    // El ejemplo rellena el textarea y habilita el boton: prueba de que el form vive.
    await page.click('.examples button >> nth=0');
    check((await page.inputValue('.field textarea')).length > 40, 'el ejemplo rellena la idea');
    check(await page.isEnabled('.primary'), 'el boton de construir se habilita');

    // Por id, no por posicion: el historial puede tener ejecuciones reales delante.
    await page.click(`.run-item[data-run-id="${FIXTURE_ID}"]`);
    await page.waitForSelector('.flow', { timeout: 15000 });
    await page.waitForSelector('.transcript-body .say, .transcript-body .think', { timeout: 20000 });

    const nodes = await page.locator('.flow-node').count();
    check(nodes === 8, 'la banda del equipo muestra los 8 agentes');

    const done = await page.locator('.flow-node.is-done').count();
    check(done >= 1, `hay ${done} agente(s) con la fase completada`);

    const mascots = await page.locator('.flow-node svg').count();
    check(mascots >= 8, `cada agente tiene su personaje (${mascots} dibujos)`);

    const files = await page.locator('.files-item').count();
    check(files > 0, `el panel de archivos lista ${files} archivo(s)`);
    await page.screenshot({ path: path.join(SHOTS, '02-ejecucion.png') });

    // El transcript del arquitecto debe traer razonamiento en vivo grabado.
    await page.click('.flow-node >> nth=1');
    await page.waitForTimeout(400);
    await page.check('.toggle input');
    await page.waitForSelector('.transcript-body .think', { timeout: 10000 });
    check(
      (await page.locator('.transcript-body .think').count()) > 0,
      'el conmutador de razonamiento muestra los bloques de pensamiento',
    );

    // Abrimos un archivo del workspace.
    await page.click('.files-item >> nth=0');
    await page.waitForSelector('.code', { timeout: 10000 });
    check((await page.textContent('.code')).length > 100, 'el visor muestra el contenido del archivo');
    await page.screenshot({ path: path.join(SHOTS, '03-archivos.png') });

    // Responsive: la barra lateral se retira en pantallas estrechas.
    await page.setViewportSize({ width: 700, height: 900 });
    await page.waitForTimeout(300);
    check(!(await page.locator('.sidebar').isVisible()), 'la barra lateral se oculta en movil');
    await page.screenshot({ path: path.join(SHOTS, '04-movil.png') });

    check(errors.length === 0, `sin errores de consola${errors.length ? `: ${errors[0]}` : ''}`);
  } finally {
    await browser.close();
  }

  console.log(`\nUI OK — capturas en ${path.relative(UNIT, SHOTS)}/\n`);
}

async function live(idea) {
  ensureWebBuilt();
  await startServer();

  const prompt =
    idea ?? 'Un panel para que un fisioterapeuta gestione pacientes, sesiones y bonos.';
  log(`ejecucion real: "${prompt}"`);
  log('ATENCION: esto consume cuota de tu cuenta.');

  const run = await api('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea: prompt, maxReviewRounds: 0, maxBudgetUsd: 3 }),
  });
  ok(`run creado: ${run.id}`);

  // Paramos en cuanto el primer agente escribe un archivo: eso ya demuestra
  // la cadena completa SDK -> guard -> disco -> SSE sin gastar el pipeline entero.
  log('esperando a la primera escritura en disco (hasta 6 min)…');
  const events = await readEvents(run.id, {
    seconds: 360,
    until: (e) => e.t === 'file',
  });

  const kinds = {};
  for (const e of events) kinds[e.t] = (kinds[e.t] ?? 0) + 1;
  console.log('  eventos:', JSON.stringify(kinds));

  const wrote = events.filter((e) => e.t === 'file');
  check(wrote.length > 0, `el agente pidio escribir ${wrote.map((e) => e.path).join(', ')}`);

  // El evento 'file' se emite con la peticion de la herramienta, no cuando el
  // byte toca el disco: parar aqui mismo aborta la escritura. Esperamos al disco.
  let onDisk = [];
  for (let i = 0; i < 20; i++) {
    onDisk = await api(`/api/runs/${run.id}/files`).catch(() => []);
    if (onDisk.length > 0) break;
    await sleep(1000);
  }

  await fetch(`${BASE}/api/runs/${run.id}/stop`, { method: 'POST' });
  ok('run detenido');

  check(onDisk.length > 0, `el workspace tiene ${onDisk.length} archivo(s) en disco`);
  const doc = await api(`/api/runs/${run.id}/file?path=${encodeURIComponent(onDisk[0].path)}`);
  check(doc.content.length > 500, `${onDisk[0].path} trae ${doc.content.length} caracteres reales`);
  check((kinds.text ?? 0) > 0, 'llega prosa en streaming');

  // El razonamiento es adaptativo: unas veces son cientos de deltas y otras
  // ninguno. Se informa, no se exige.
  log(`razonamiento en este turno: ${kinds.thinking ?? 0} deltas`);

  console.log('\nLIVE OK\n');
}

/* ─────────────────────────── main ─────────────────────────── */

const mode = process.argv[2] ?? 'smoke';

try {
  if (mode === 'smoke') await smoke();
  else if (mode === 'ui') await ui();
  else if (mode === 'live') await live(process.argv[3]);
  else if (mode === 'serve') {
    ensureWebBuilt();
    installFixture();
    await startServer();
    console.log(`\nServidor en ${BASE} — Ctrl-C para salir\n`);
    await new Promise(() => {});
  } else {
    console.error(`modo desconocido: ${mode}. Usa smoke | ui | live | serve`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('\nFALLO:', err.message);
  process.exitCode = 1;
} finally {
  if (mode !== 'serve') stopServer();
}
