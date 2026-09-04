import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { CONFIG } from './config.js';
import { consoles, replayConsole, type ConsoleEvent } from './console.js';
import type { PhaseId } from './events.js';
import { listWorkspace, readWorkspaceFile } from './files.js';
import { ROLES } from './roles.js';
import { EFFORTS, type Effort } from './orchestrator.js';
import { projectSlug } from './slug.js';
import { runs } from './runs.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: CONFIG.model, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.get('/api/roles', (_req, res) => {
  res.json(
    Object.values(ROLES).map((role) => ({
      id: role.id,
      label: role.label,
      short: role.short,
    })),
  );
});

app.post('/api/runs', (req, res) => {
  const idea = typeof req.body?.idea === 'string' ? req.body.idea.trim() : '';
  if (idea.length < 15) {
    res.status(400).json({ error: 'Describe la idea con al menos 15 caracteres.' });
    return;
  }

  // Retomar: como la carpeta se llama por el proyecto, la misma idea apunta al
  // mismo workspace. Se reutiliza y se empieza por la fase que quedó a medias.
  let startFrom: PhaseId | undefined;
  if (req.body?.resumeOf !== undefined) {
    const workspace = path.join(CONFIG.workspacesRoot, projectSlug(idea));
    if (!fs.existsSync(workspace)) {
      res.status(400).json({ error: 'No existe el workspace de la ejecución que quieres retomar.' });
      return;
    }
    const phase = String(req.body?.startFrom ?? '');
    if (!(phase in ROLES)) {
      res.status(400).json({ error: `startFrom debe ser una de: ${Object.keys(ROLES).join(', ')}.` });
      return;
    }
    startFrom = phase as PhaseId;
  }

  const run = runs.create({
    idea,
    language: typeof req.body?.language === 'string' ? req.body.language : undefined,
    maxReviewRounds: numberOrUndefined(req.body?.maxReviewRounds, 0),
    maxBudgetUsd: numberOrUndefined(req.body?.maxBudgetUsd, 0.01),
    model: typeof req.body?.model === 'string' ? req.body.model : undefined,
    effortCap: (EFFORTS as readonly string[]).includes(String(req.body?.effortCap))
      ? (req.body.effortCap as Effort)
      : undefined,
    startFrom,
  });

  res.status(201).json({ id: run.id, workspace: run.workspace });
});

app.get('/api/runs', async (_req, res) => {
  res.json(await runs.list());
});

app.get('/api/runs/:id', async (req, res) => {
  const summaries = await runs.list();
  const summary = summaries.find((s) => s.id === req.params.id);
  if (!summary) {
    res.status(404).json({ error: 'No existe esa ejecución.' });
    return;
  }
  res.json(summary);
});

app.post('/api/runs/:id/answer', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: 'No existe esa ejecución o ya terminó.' });
    return;
  }
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : '';
  if (!id || !answer) {
    res.status(400).json({ error: 'Faltan el id de la pregunta o la respuesta.' });
    return;
  }
  const ok = run.answer(id, answer);
  if (!ok) {
    res.status(409).json({ error: 'Esa pregunta ya no está abierta.' });
    return;
  }
  res.json({ ok: true });
});

/**
 * Se contesta cuando la ejecución está parada de verdad, no cuando se le ha
 * pedido que pare: la interfaz usa la respuesta para dar el botón por bueno.
 */
app.post('/api/runs/:id/stop', async (req, res) => {
  if (!workspaceFor(req.params.id) || !(await runs.stop(req.params.id))) {
    res.status(404).json({ error: 'No existe esa ejecución.' });
    return;
  }
  res.json({ ok: true });
});

/**
 * Live event stream. `?from=N` resumes at a sequence number, so a browser that
 * reloads mid-run replays what it missed instead of starting blank.
 */
app.get('/api/runs/:id/events', async (req, res) => {
  const from = Number(req.query.from ?? req.header('last-event-id') ?? 0) || 0;
  const run = runs.get(req.params.id);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: unknown, seq: number) => {
    res.write(`id: ${seq}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const close = () => {
    res.write('event: end\ndata: {}\n\n');
    res.end();
  };

  if (!run) {
    // Finished run: replay from disk and close.
    const valid = workspaceFor(req.params.id) !== null;
    if (valid) for (const event of await runs.replay(req.params.id, from)) send(event, event.seq);
    close();
    return;
  }

  for (const event of run.log.since(from)) send(event, event.seq);

  // Una ejecución terminada sigue en memoria mientras vive el proceso. Sin este
  // cierre el navegador se queda con la conexión abierta y "en directo" para
  // siempre sobre algo que ya no va a emitir nada.
  if (run.status !== 'running' && run.status !== 'queued' && run.status !== 'paused') {
    close();
    return;
  }

  const unsubscribe = run.log.subscribe((event) => send(event, event.seq));
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

/**
 * Consola de Claude Code sobre el workspace de una ejecución. Abrir el stream
 * crea la sesión pero no lanza ningún proceso: eso pasa con el primer mensaje.
 */
app.get('/api/runs/:id/console/events', async (req, res) => {
  const workspace = await consoleWorkspace(req.params.id);
  if (!workspace) {
    res.status(404).json({ error: 'No existe el workspace de esa ejecución.' });
    return;
  }

  const from = Number(req.query.from ?? req.header('last-event-id') ?? 0) || 0;
  const session = await consoles.open(req.params.id, workspace);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Una consola recién abierta no tiene ni un evento que mandar, y sin un primer
  // byte el proxy de desarrollo retiene las cabeceras: el navegador se queda en
  // "conectando…" sobre un stream que en realidad ya está abierto.
  res.write(': open\n\n');

  const send = (event: ConsoleEvent) => {
    res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  // El búfer en memoria solo tiene lo de esta sesión; lo anterior está en disco.
  const buffered = session.log.since(from);
  const firstBuffered = buffered[0]?.seq ?? Infinity;
  for (const event of await replayConsole(req.params.id, from)) {
    if (event.seq < firstBuffered) send(event);
  }
  for (const event of buffered) send(event);

  const unsubscribe = session.log.subscribe(send);
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.post('/api/runs/:id/console/message', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'Escribe un mensaje.' });
    return;
  }
  const workspace = await consoleWorkspace(req.params.id);
  if (!workspace) {
    res.status(404).json({ error: 'No existe el workspace de esa ejecución.' });
    return;
  }
  (await consoles.open(req.params.id, workspace)).send(text);
  res.json({ ok: true });
});

app.post('/api/runs/:id/console/interrupt', (req, res) => {
  const session = consoles.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Esa consola no está abierta.' });
    return;
  }
  session.interrupt();
  res.json({ ok: true });
});

app.get('/api/runs/:id/files', async (req, res) => {
  // workspaceFor sólo valida la forma del id (frena la travesía); la carpeta
  // real la resuelve runs.workspaceOf, porque se llama por el proyecto.
  const workspace = workspaceFor(req.params.id) ? await runs.workspaceOf(req.params.id) : null;
  if (!workspace || !fs.existsSync(workspace)) {
    res.status(404).json({ error: 'Workspace no encontrado.' });
    return;
  }
  res.json(await listWorkspace(workspace));
});

app.get('/api/runs/:id/file', async (req, res) => {
  const relative = typeof req.query.path === 'string' ? req.query.path : '';
  const workspace = workspaceFor(req.params.id) ? await runs.workspaceOf(req.params.id) : null;
  const file = workspace ? await readWorkspaceFile(workspace, relative) : null;
  if (!file) {
    res.status(404).json({ error: 'Archivo no encontrado.' });
    return;
  }
  res.json(file);
});

// Serve the built UI when it exists; in development Vite serves it instead.
if (fs.existsSync(CONFIG.webDist)) {
  app.use(express.static(CONFIG.webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(CONFIG.webDist, 'index.html'));
  });
}

/**
 * Un id de ejecución solo puede ser un nombre de carpeta dentro de `workspaces/`.
 * Express decodifica `%2f` antes de llegar aquí, así que `..%2f..%2f` llegaría
 * como `../../` y `path.basename` lo dejaría en `..`: suficiente para listar y
 * leer todo el repositorio, incluido `server/.env`. Se valida la forma entera.
 */
function workspaceFor(id: string): string | null {
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id === '.' || id === '..') return null;
  return path.join(CONFIG.workspacesRoot, id);
}

/** Workspace existente de una ejecución, o null si el id o la carpeta no valen. */
async function consoleWorkspace(id: string): Promise<string | null> {
  if (!workspaceFor(id)) return null;
  const workspace = await runs.workspaceOf(id);
  return workspace && fs.existsSync(workspace) ? workspace : null;
}

/** `min` distingue las rondas (0 = «no revises») del presupuesto (0 no significa nada). */
function numberOrUndefined(value: unknown, min: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : undefined;
}

app.listen(CONFIG.port, () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('\n  ⚠  Sin ANTHROPIC_API_KEY: el SDK usará las credenciales de Claude Code.');
    console.warn('     Eso consume cuota de tu suscripción, no dólares por token.');
    console.warn('     Para facturar por API, crea server/.env con ANTHROPIC_API_KEY=sk-ant-...\n');
  }
  console.log(`  Agent Forge escuchando en http://localhost:${CONFIG.port}`);
  console.log(`  Modelo: ${CONFIG.model}`);
  console.log(`  Workspaces: ${CONFIG.workspacesRoot}\n`);
});
