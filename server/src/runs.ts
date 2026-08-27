import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from './config.js';
import type { ForgeEvent, PhaseId, RunStatus } from './events.js';
import { Run, type PhaseOutcome, type RunRequest } from './orchestrator.js';
import { projectSlug } from './slug.js';

export type RunSummary = {
  id: string;
  slug: string;
  idea: string;
  status: RunStatus;
  createdAt: number;
  finishedAt: number;
  costUsd: number;
  currentPhase: PhaseId | null;
  workspace: string;
};

/**
 * Holds live runs in memory and mirrors every event to `.runs/<id>.jsonl` so a
 * finished run can still be inspected after the server restarts.
 */
class RunStore {
  private readonly live = new Map<string, Run>();

  constructor() {
    fs.mkdirSync(CONFIG.runsRoot, { recursive: true });
    fs.mkdirSync(CONFIG.workspacesRoot, { recursive: true });
    // Nada más arrancar no hay ninguna ejecución viva: lo que el disco siga
    // dando por «en curso» murió con el proceso anterior. Sin esto la interfaz
    // la enseña trabajando para siempre y el botón de detener no encuentra a
    // nadie a quien parar.
    void this.reapOrphans();
  }

  create(request: RunRequest): Run {
    const slug = request.slug ?? projectSlug(request.idea);
    const id = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    const priorPhases = request.startFrom ? this.priorPhaseOutcomes(slug) : undefined;
    // Si un intento anterior renombró la carpeta al nombre real del producto
    // (ver `Run.renameToProductName`), retomar tiene que apuntar ahí, no
    // reconstruir la ruta a partir del slug-de-idea (esa carpeta ya no existe).
    const workspace = request.workspace ?? (request.startFrom ? this.resolveWorkspace(slug) : undefined);
    const run = new Run(id, { ...request, slug, priorPhases, workspace });
    this.live.set(id, run);

    const stream = fs.createWriteStream(this.eventsPath(id), { flags: 'a' });
    run.log.subscribe((event) => {
      stream.write(`${JSON.stringify(event)}\n`);
      if (event.t === 'phase.end' || event.t === 'run.end' || event.t === 'run.start') {
        void this.writeManifest(run);
      }
    });

    // Fire and forget: progress is observed through the event stream.
    void run.start().catch(() => undefined);
    return run;
  }

  get(id: string): Run | undefined {
    return this.live.get(id);
  }

  /**
   * Detiene una ejecución. Si sigue viva, se para de verdad (se cierran también
   * los procesos que el agente tuviera en marcha). Si ya no está en memoria
   * porque el servidor se reinició con ella a medias, se cierra en disco para
   * que deje de figurar como «en curso». Devuelve false sólo si no consta.
   */
  async stop(id: string): Promise<boolean> {
    const live = this.live.get(id);
    if (live) {
      await live.stop();
      return true;
    }
    return this.closeOrphan(id, 'La ejecución se perdió al reiniciarse el servidor.');
  }

  /** Cierra en disco una ejecución que quedó marcada en curso sin estarlo. */
  private async closeOrphan(id: string, reason: string): Promise<boolean> {
    const file = path.join(CONFIG.runsRoot, `${id}.json`);
    let manifest: RunSummary;
    try {
      manifest = JSON.parse(await fsp.readFile(file, 'utf8')) as RunSummary;
    } catch {
      return false;
    }

    // Ya estaba cerrada: detenerla otra vez no es un error, no hay nada que hacer.
    const abierta =
      manifest.status === 'running' || manifest.status === 'queued' || manifest.status === 'paused';
    if (!abierta) return true;

    const finishedAt = Date.now();
    const closed: RunSummary = {
      ...manifest,
      status: 'stopped',
      finishedAt,
      currentPhase: null,
    };

    // El registro de eventos es lo que la interfaz reproduce al abrir la
    // ejecución, así que el final tiene que quedar escrito también ahí.
    let seq = await this.lastSeq(id);
    const events: ForgeEvent[] = [
      { t: 'log', level: 'warn', msg: reason, seq: ++seq, ts: finishedAt },
      {
        t: 'run.end',
        status: 'stopped',
        costUsd: manifest.costUsd ?? 0,
        durationMs: finishedAt - (manifest.createdAt || finishedAt),
        seq: ++seq,
        ts: finishedAt,
      },
    ];
    await fsp.appendFile(
      this.eventsPath(id),
      events.map((e) => `${JSON.stringify(e)}\n`).join(''),
      'utf8',
    );
    await fsp.writeFile(file, JSON.stringify(closed, null, 2), 'utf8');
    return true;
  }

  /** Último `seq` escrito, para seguir numerando donde lo dejó la ejecución. */
  private async lastSeq(id: string): Promise<number> {
    try {
      const raw = await fsp.readFile(this.eventsPath(id), 'utf8');
      const lines = raw.split('\n').filter(Boolean);
      const last = lines[lines.length - 1];
      return last ? ((JSON.parse(last) as ForgeEvent).seq ?? -1) : -1;
    } catch {
      return -1;
    }
  }

  private async reapOrphans(): Promise<void> {
    for (const file of await safeReaddir(CONFIG.runsRoot)) {
      if (!file.endsWith('.json')) continue;
      await this.closeOrphan(
        file.slice(0, -'.json'.length),
        'La ejecución se perdió al reiniciarse el servidor.',
      ).catch(() => false);
    }
  }

  async list(): Promise<RunSummary[]> {
    const byId = new Map<string, RunSummary>();

    for (const file of await safeReaddir(CONFIG.runsRoot)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fsp.readFile(path.join(CONFIG.runsRoot, file), 'utf8');
        const parsed = JSON.parse(raw) as RunSummary;
        byId.set(parsed.id, parsed);
      } catch {
        /* skip unreadable manifest */
      }
    }

    // Live runs are authoritative over whatever was last flushed to disk.
    for (const run of this.live.values()) byId.set(run.id, toSummary(run));

    // Un registro por proyecto: de los intentos con el mismo slug se queda el
    // más reciente (que además comparte carpeta con los anteriores).
    const byProject = new Map<string, RunSummary>();
    for (const s of byId.values()) {
      // Los registros viejos no llevan slug; se deriva de la idea para que
      // también se agrupen por proyecto.
      const key = s.slug ?? projectSlug(s.idea);
      const prev = byProject.get(key);
      if (!prev || s.createdAt > prev.createdAt) byProject.set(key, s);
    }

    return [...byProject.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Carpeta de un run. La carpeta se llama por el proyecto (slug), no por el id,
   * así que no se puede componer con `join(root, id)`: se lee del run vivo o de
   * su manifiesto en disco.
   */
  async workspaceOf(id: string): Promise<string | null> {
    const live = this.live.get(id);
    if (live) return live.workspace;
    try {
      const raw = await fsp.readFile(path.join(CONFIG.runsRoot, `${id}.json`), 'utf8');
      const manifest = JSON.parse(raw) as RunSummary;
      return manifest.workspace ?? null;
    } catch {
      return null;
    }
  }

  /** Replays a finished run's events from disk when it is no longer in memory. */
  async replay(id: string, from: number): Promise<ForgeEvent[]> {
    try {
      const raw = await fsp.readFile(this.eventsPath(id), 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ForgeEvent)
        .filter((e) => e.seq >= from);
    } catch {
      return [];
    }
  }

  private eventsPath(id: string): string {
    return path.join(CONFIG.runsRoot, `${id}.jsonl`);
  }

  /**
   * Fases ya terminadas con éxito para este proyecto, mirando TODOS los ids de
   * ejecución que comparten slug (cada intento/reanudación crea uno nuevo con
   * su propio registro). Se usa al retomar, para que `Run.seedPriorPhases`
   * pueda reproducirlas y la interfaz no las enseñe como pendientes.
   *
   * Sync a propósito: `create()` es síncrono (el id se devuelve en la
   * respuesta HTTP antes de que la fase arranque) y esto solo lee un puñado
   * de manifiestos y registros pequeños, nunca en el camino caliente de una
   * fase en marcha.
   */
  private priorPhaseOutcomes(slug: string): Partial<Record<PhaseId, PhaseOutcome>> {
    const latest = new Map<PhaseId, { outcome: PhaseOutcome; ts: number }>();

    for (const file of safeReaddirSync(CONFIG.runsRoot)) {
      if (!file.endsWith('.json')) continue;
      let manifest: RunSummary;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(CONFIG.runsRoot, file), 'utf8'));
      } catch {
        continue;
      }
      if ((manifest.slug ?? projectSlug(manifest.idea)) !== slug) continue;

      let raw: string;
      try {
        raw = fs.readFileSync(this.eventsPath(manifest.id), 'utf8');
      } catch {
        continue;
      }
      for (const line of raw.split('\n')) {
        if (!line) continue;
        let event: ForgeEvent;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.t !== 'phase.end' || !event.ok) continue;
        const prev = latest.get(event.phase);
        if (!prev || event.ts > prev.ts) {
          latest.set(event.phase, {
            outcome: { ok: true, summary: event.summary, costUsd: event.costUsd, durationMs: event.durationMs },
            ts: event.ts,
          });
        }
      }
    }

    const result: Partial<Record<PhaseId, PhaseOutcome>> = {};
    for (const [phase, { outcome }] of latest) result[phase] = outcome;
    return result;
  }

  /**
   * Ruta de workspace más reciente conocida para este slug, mirando todos los
   * manifiestos que lo comparten (mismo patrón que `priorPhaseOutcomes`).
   * Hace falta porque el nombre de carpeta puede haber cambiado a mitad de un
   * intento anterior (`Run.renameToProductName`): reconstruir la ruta a
   * partir del slug apuntaría a una carpeta que ya no existe.
   */
  private resolveWorkspace(slug: string): string | undefined {
    let latest: { workspace: string; createdAt: number } | undefined;
    for (const file of safeReaddirSync(CONFIG.runsRoot)) {
      if (!file.endsWith('.json')) continue;
      let manifest: RunSummary;
      try {
        manifest = JSON.parse(fs.readFileSync(path.join(CONFIG.runsRoot, file), 'utf8'));
      } catch {
        continue;
      }
      if ((manifest.slug ?? projectSlug(manifest.idea)) !== slug) continue;
      if (!manifest.workspace) continue;
      if (!latest || manifest.createdAt > latest.createdAt) {
        latest = { workspace: manifest.workspace, createdAt: manifest.createdAt };
      }
    }
    return latest?.workspace;
  }

  private async writeManifest(run: Run): Promise<void> {
    const file = path.join(CONFIG.runsRoot, `${run.id}.json`);
    await fsp.writeFile(file, JSON.stringify(toSummary(run), null, 2), 'utf8');
  }
}

function toSummary(run: Run): RunSummary {
  return {
    id: run.id,
    slug: run.slug,
    idea: run.request.idea,
    status: run.status,
    createdAt: run.startedAt,
    finishedAt: run.finishedAt,
    costUsd: run.costUsd,
    currentPhase: run.currentPhase,
    workspace: run.workspace,
  };
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await fsp.readdir(dir);
  } catch {
    return [];
  }
}

function safeReaddirSync(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export const runs = new RunStore();
