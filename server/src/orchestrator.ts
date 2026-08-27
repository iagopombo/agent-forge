import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { CONFIG, ROOT } from './config.js';
import { EventLog, type ForgeEventInput, type PhaseId, type RunStatus } from './events.js';
import { buildGuard, summarizeTool } from './guard.js';
import { AGENT_PROCESS, childProcesses, killTree } from './procs.js';
import { buildAskServer } from './ask.js';
import { ARCHITECT_ADVISOR_PROMPT, PIPELINE, ROLES, type RoleContext } from './roles.js';
import { projectSlug } from './slug.js';
import crypto from 'node:crypto';

export type RunRequest = {
  idea: string;
  language?: string;
  maxReviewRounds?: number;
  maxBudgetUsd?: number;
  model?: string;
  /**
   * Techo de esfuerzo para todos los roles. El reparto por rol de `roles.ts`
   * se respeta por debajo de este límite: sirve para terminar una ejecución
   * con la cuota justa sin tener que tocar el código.
   */
  effortCap?: Effort;
  /** Slug del proyecto: nombra la carpeta y agrupa el historial. */
  slug?: string;
  /** Workspace ya existente, para retomar una ejecución interrumpida. */
  workspace?: string;
  /** Primera fase a ejecutar. Las anteriores se dan por hechas en disco. */
  startFrom?: PhaseId;
  /**
   * Fases previas ya terminadas con éxito en un intento anterior del mismo
   * proyecto (`RunStore` las recopila mirando todos los ids de ejecución que
   * comparten slug). Sin esto, retomar deja la interfaz enseñando esas fases
   * como pendientes aunque el trabajo ya esté hecho en disco.
   */
  priorPhases?: Partial<Record<PhaseId, PhaseOutcome>>;
};

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORTS)[number];

/** El menor de los dos, para que el techo nunca suba el esfuerzo de un rol. */
function capEffort(role: Effort, cap: Effort | undefined): Effort {
  if (!cap) return role;
  return EFFORTS.indexOf(role) <= EFFORTS.indexOf(cap) ? role : cap;
}

/**
 * Sin cuota: el límite se restablece con el tiempo, así que la ejecución se
 * pausa y reintenta la misma fase sola cuando vuelve la cuota, en vez de fallar.
 */
const QUOTA_ERRORS =
  /hit your [\w\s-]*?limit|usage limit|out of (extra )?usage|rate.?limit|too many requests|\bquota\b|resets?\s+\d{1,2}(:\d{2})?\s*(am|pm)/i;

/**
 * Errores que esperar no arregla: sin saldo, credenciales mal. Detienen la
 * ejecución; el resto de fases fallaría igual.
 */
const HARD_ERRORS =
  /credit balance|insufficient.credit|invalid.*api.key|authentication_error|oauth token.*expired|please run .?login/i;

/**
 * Plugin local con la Skill de ahorro de tokens para las fases del pipeline.
 * Ruta absoluta a propósito: `plugins[].path` se resuelve contra el cwd del
 * proceso Node que llama a `query()`, no contra `options.cwd` (el workspace
 * del proyecto generado) — una ruta relativa dependería de desde dónde se
 * lanzó `npm start`.
 */
const TOKEN_EFFICIENCY_PLUGIN_PATH = path.join(ROOT, '.claude-plugins', 'token-efficient-coding');

/**
 * `env` del SDK por defecto ES `process.env` completo (documentado así: "Defaults
 * to `process.env`"). Cuando este servidor se lanza desde dentro de una sesión de
 * Claude Code (como al operarlo con `npm start` desde la propia herramienta Bash
 * de un agente), el proceso hijo hereda variables como `CLAUDECODE`/
 * `CLAUDE_CODE_CHILD_SESSION`/`CLAUDE_CODE_SESSION_ID` — y con ellas presentes el
 * hijo se "puentea" a la sesión padre: hereda TODO su toolset y sus servidores
 * MCP (el Gmail/Drive/Notion/etc. del operador), saltándose `settingSources: []`
 * por completo. No es un mecanismo documentado (confirmado contra la
 * documentación oficial del SDK, no de memoria) — así que esta lista es la mejor
 * variante conocida hoy, no una garantía cerrada. Ver [[Aislamiento del proceso hijo]]
 * en el vault.
 */
const CHILD_SESSION_ENV_KEYS = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_ENTRYPOINT',
  'AI_AGENT',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'Claude',
];

/**
 * `env` explícito para el proceso hijo: copia de `process.env` sin las claves
 * de sesión de arriba. `env` en `Options` REEMPLAZA `process.env` por completo
 * (no hace merge), así que hay que partir de una copia entera, no solo pasar
 * las claves que nos importan — de lo contrario el hijo perdería `PATH`, `HOME`
 * y todo lo que `Bash`/`npm` necesitan para funcionar.
 */
const SPAWN_ENV: Record<string, string | undefined> = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !CHILD_SESSION_ENV_KEYS.includes(key)),
);

/**
 * Segunda capa, independiente de `SPAWN_ENV`: como el mecanismo de puenteo no
 * está documentado, no hay garantía de que limpiar variables de entorno lo
 * cubra todo. Restringir `tools` explícitamente es un cinturón de seguridad
 * que no depende de acertar con la causa exacta — lo que no está en esta lista
 * no existe para el agente, venga de donde venga.
 */
const PIPELINE_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
  'Skill',
];

/** Momento (ms epoch) en que la cuota se restablece, si el error lo dice. */
function parseResetAt(msg: string): number | null {
  const m = msg.match(/resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/pm/i.test(m[3] ?? '')) hour += 12;
  const at = new Date();
  at.setHours(hour, m[2] ? Number(m[2]) : 0, 0, 0);
  if (at.getTime() <= Date.now()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

export type PhaseOutcome = {
  ok: boolean;
  summary: string;
  costUsd: number;
  durationMs: number;
};

type ReviewBlocker = { id?: string; file?: string; problem?: string; fix?: string };
type ReviewFile = { verdict?: string; blockers?: ReviewBlocker[]; summary?: string };

/**
 * Deliberately no `allowedTools`: a bare tool name there auto-approves the tool
 * *before* `canUseTool` is consulted, which would silently disable the workspace
 * containment check. Everything that needs a decision reaches the guard instead.
 */

export class Run {
  readonly log: EventLog;
  /**
   * No es `readonly`: `renameToProductName()` la reasigna tras la fase de
   * producto. `slug` sí es fijo — es lo que usa `RunStore` para agrupar
   * intentos y reanudar por idea; solo cambia el nombre visible de la carpeta.
   */
  workspace: string;
  readonly slug: string;
  status: RunStatus = 'queued';
  costUsd = 0;
  startedAt = 0;
  finishedAt = 0;
  currentPhase: PhaseId | null = null;
  readonly phases = new Map<PhaseId, PhaseOutcome>();

  private readonly abort = new AbortController();
  /**
   * PID del proceso que el SDK lanzó para la fase en curso, si se localizó.
   * Abortar sólo le manda SIGTERM a él: lo que el agente hubiera arrancado con
   * Bash (un `npm install`, un servidor de desarrollo) sobrevive y sigue
   * trabajando después de que la interfaz diga «detenida». Con el PID se puede
   * matar el árbol entero.
   */
  private child: number | null = null;
  /** Cambia con cada fase, para que un rastreo tardío no pise al siguiente. */
  private phaseSeq = 0;
  /** Motivo por el que no tiene sentido seguir con las fases que faltan. */
  private fatal: string | null = null;
  /** Señal de "sin cuota" detectada en la fase en curso, con hora de reset. */
  private pauseSignal: { reason: string; resumeAt: number | null } | null = null;
  /** Tope de espera acumulada sin cuota antes de rendirse (8 h). */
  private static readonly MAX_PAUSE_MS = 8 * 60 * 60 * 1000;
  /** Preguntas del agente esperando respuesta del usuario, por id. */
  private readonly pendingAsks = new Map<
    string,
    { phase: PhaseId; resolve: (answer: string) => void; reject: (err: Error) => void }
  >();

  /** Preguntas abiertas ahora mismo, para que la API las reponga al reconectar. */
  get openQuestions(): Array<{ id: string; phase: PhaseId }> {
    return [...this.pendingAsks.entries()].map(([id, a]) => ({ id, phase: a.phase }));
  }

  constructor(
    readonly id: string,
    readonly request: RunRequest,
  ) {
    this.log = new EventLog(CONFIG.eventBufferSize);
    this.slug = request.slug ?? projectSlug(request.idea);
    // La carpeta se llama como el proyecto, no como el id: varios intentos del
    // mismo proyecto comparten workspace y continúan el trabajo anterior.
    this.workspace = request.workspace ?? path.join(CONFIG.workspacesRoot, this.slug);
  }

  private emit = (e: ForgeEventInput) => this.log.emit(e);

  /**
   * Detiene la ejecución de verdad: corta el diálogo con el modelo y se lleva
   * por delante los procesos que el agente hubiera dejado en marcha. La promesa
   * se resuelve cuando ya no queda nada trabajando, así que la API puede
   * contestar «hecho» sin mentir.
   */
  async stop(): Promise<void> {
    if (this.status !== 'running' && this.status !== 'queued' && this.status !== 'paused') return;
    this.status = 'stopped';
    this.rejectAsks('La ejecución se detuvo.');
    this.emit({ t: 'log', level: 'warn', msg: 'Ejecución detenida por el usuario.' });
    // Primero el árbol y después el aborto, no al revés: abortar le manda
    // SIGTERM al proceso del SDK, y una vez muerto ya no se puede bajar por sus
    // hijos: el `npm install` que hubiera lanzado quedaría huérfano y vivo.
    await this.killAgentProcesses();
    this.abort.abort();
  }

  /** Cierra el árbol de procesos de la fase en curso. Nunca lanza. */
  private async killAgentProcesses(): Promise<void> {
    const pid = this.child;
    this.child = null;
    if (pid === null) return;
    await killTree(pid);
  }

  /**
   * Localiza el proceso que el SDK acaba de lanzar, comparando los hijos
   * directos de este servidor antes y después de arrancar la fase. Se descarta
   * lo que no tenga pinta de agente porque `childProcesses` usa un `powershell`
   * auxiliar que también aparecería como hijo nuevo.
   */
  private async trackChild(before: Set<number>, gen: number): Promise<void> {
    for (let intento = 0; intento < 20; intento++) {
      if (this.stopped || gen !== this.phaseSeq) return;
      const nuevo = (await childProcesses(process.pid)).find(
        (p) => !before.has(p.pid) && AGENT_PROCESS.test(p.name),
      );
      if (nuevo) {
        if (gen === this.phaseSeq) this.child = nuevo.pid;
        return;
      }
      await this.sleep(500);
    }
  }

  /**
   * Herramienta de producto: plantea una pregunta y espera. La promesa se
   * resuelve desde `answer()` cuando el usuario contesta por la interfaz, o se
   * rechaza si la ejecución se detiene con la pregunta abierta.
   */
  private askUser = (question: string, options: string[]): Promise<string> =>
    new Promise((resolve, reject) => {
      const id = crypto.randomBytes(4).toString('hex');
      const phase = this.currentPhase ?? 'product';
      this.pendingAsks.set(id, { phase, resolve, reject });
      this.emit({ t: 'ask', phase, id, question, options });
    });

  /** Contesta una pregunta abierta. Devuelve false si el id ya no existe. */
  answer(id: string, text: string): boolean {
    const pending = this.pendingAsks.get(id);
    if (!pending) return false;
    this.pendingAsks.delete(id);
    this.emit({ t: 'answer', phase: pending.phase, id, answer: text });
    pending.resolve(text);
    return true;
  }

  private rejectAsks(reason: string): void {
    for (const [, a] of this.pendingAsks) a.reject(new Error(reason));
    this.pendingAsks.clear();
  }

  async start(): Promise<void> {
    this.status = 'running';
    this.startedAt = Date.now();
    await fs.mkdir(path.join(this.workspace, 'docs'), { recursive: true });

    this.emit({
      t: 'run.start',
      runId: this.id,
      idea: this.request.idea,
      workspace: this.workspace,
    });

    this.seedPriorPhases();

    try {
      await this.pipeline();
      if (this.status === 'running') {
        // "Terminada" solo si todas las fases que se ejecutaron salieron bien.
        // Antes bastaba con llegar al final del bucle, aunque no hubiera
        // sobrevivido ninguna.
        const fallidas = [...this.phases.values()].filter((p) => !p.ok).length;
        this.status = this.fatal || fallidas > 0 ? 'failed' : 'done';
        if (fallidas > 0) {
          this.emit({
            t: 'log',
            level: 'error',
            msg: `La ejecución termina con ${fallidas} fase(s) fallida(s).${this.fatal ? ` Causa: ${this.fatal}` : ''}`,
          });
        }
      }
    } catch (err) {
      if (!this.stopped) {
        this.status = 'failed';
        this.emit({ t: 'log', level: 'error', msg: describeError(err) });
      }
    } finally {
      this.finishedAt = Date.now();
      this.currentPhase = null;
      this.emit({
        t: 'run.end',
        status: this.status,
        costUsd: this.costUsd,
        durationMs: this.finishedAt - this.startedAt,
      });
    }
  }

  /**
   * Retomar crea un id de ejecución nuevo con su propio registro de eventos
   * vacío: sin esto, la interfaz enseña como pendientes fases de un intento
   * anterior del mismo proyecto que ya terminaron con éxito. Reproduce su
   * phase.start/phase.end para que se vean hechas desde el primer instante, y
   * suma su coste al total — si no, "Coste est." de esta ejecución solo
   * contaría lo gastado en este intento, no lo del proyecto entero.
   */
  private seedPriorPhases(): void {
    const prior = this.request.priorPhases;
    if (!prior) return;
    const order = Object.keys(ROLES) as PhaseId[];
    const from = this.request.startFrom;
    const cutoff = from ? order.indexOf(from) : order.length;
    for (const phase of order.slice(0, cutoff < 0 ? order.length : cutoff)) {
      const outcome = prior[phase];
      if (!outcome) continue;
      this.emit({ t: 'phase.start', phase, label: ROLES[phase].label, round: 1 });
      this.phases.set(phase, outcome);
      this.costUsd += outcome.costUsd;
      this.emit({ t: 'phase.end', phase, ...outcome });
    }
  }

  /**
   * Tras la fase de producto, si escribió docs/NOMBRE.txt, renombra la
   * carpeta del workspace de su slug-de-idea a un slug del nombre real del
   * producto ("lectio" en vez de "quiero-una-red-social-donde"). No toca
   * `this.slug` (eso seguiría rompiendo `RunStore.priorPhaseOutcomes` /
   * la reanudación por idea, que dependen de que el slug derivado de la idea
   * sea estable) — solo el nombre de carpeta que ve quien mire el disco.
   *
   * Falla en silencio (log, no excepción): renombrar es cosmético, nunca
   * debe tirar abajo una ejecución que por lo demás va bien.
   */
  private async renameToProductName(): Promise<void> {
    const nameFile = path.join(this.workspace, 'docs', 'NOMBRE.txt');
    let raw: string;
    try {
      raw = (await fs.readFile(nameFile, 'utf8')).trim();
    } catch {
      return;
    }
    if (!raw) return;

    const targetSlug = projectSlug(raw);
    const currentName = path.basename(this.workspace);
    if (!targetSlug || targetSlug === currentName) return;

    const target = path.join(CONFIG.workspacesRoot, targetSlug);
    try {
      await fs.access(target);
      this.emit({
        t: 'log',
        level: 'warn',
        msg: `No se renombra a "${targetSlug}": ya existe una carpeta con ese nombre. Se queda en "${currentName}".`,
      });
      return;
    } catch {
      // No existe: el nombre está libre.
    }

    try {
      await fs.rename(this.workspace, target);
    } catch (err) {
      this.emit({
        t: 'log',
        level: 'warn',
        msg: `No se pudo renombrar la carpeta a "${targetSlug}": ${describeError(err)}. Se queda en "${currentName}".`,
      });
      return;
    }

    this.workspace = target;
    this.emit({
      t: 'log',
      level: 'info',
      msg: `Carpeta renombrada de "${currentName}" a "${targetSlug}" (nombre del producto).`,
    });
  }

  private async pipeline(): Promise<void> {
    const ctx: RoleContext = {
      idea: this.request.idea,
      language: this.request.language ?? 'español',
      round: 1,
      previous: '',
      blockers: [],
    };

    // Al retomar, las fases anteriores ya dejaron su rastro en docs/ y en el
    // código: el contrato entre agentes está en disco, no en esta variable.
    const from = this.request.startFrom;
    const desde = from ? PIPELINE.indexOf(from) : 0;
    if (from) {
      ctx.previous = `Retomas una ejecución interrumpida en la fase "${from}". El workspace ya tiene trabajo anterior: lee docs/ y el código existente antes de escribir nada, y continúa desde ahí en lugar de empezar de cero.`;
    }

    for (const phase of PIPELINE.slice(desde < 0 ? PIPELINE.length : desde)) {
      if (this.halted) return;
      const outcome = await this.runPhase(phase, ctx);
      ctx.previous = outcome.summary;
      if (phase === 'product' && outcome.ok) await this.renameToProductName();
    }

    // Review -> fix -> review, until the reviewer passes or we run out of rounds.
    const maxRounds = this.request.maxReviewRounds ?? CONFIG.maxReviewRounds;
    if (from === 'package') return void (await this.runPhase('package', ctx));

    for (let round = 1; round <= maxRounds + 1; round++) {
      if (this.halted) return;

      ctx.round = round;
      const review = await this.runPhase('review', ctx);
      ctx.previous = review.summary;

      if (!review.ok) {
        // Una revisión que no llegó a ejecutarse no aprueba nada.
        this.emit({
          t: 'log',
          level: 'warn',
          msg: 'La fase de revisión falló, así que no hay veredicto. Se entrega sin auditar.',
        });
        break;
      }

      const verdict = await this.readVerdict();
      this.emit({
        t: 'review',
        verdict: verdict.pass ? 'pass' : 'changes_requested',
        blockers: verdict.blockers,
        round,
      });

      if (verdict.pass || verdict.blockers.length === 0) break;

      if (round > maxRounds) {
        this.emit({
          t: 'log',
          level: 'warn',
          msg: `Se agotaron las ${maxRounds} rondas de corrección con ${verdict.blockers.length} bloqueante(s) abiertos. Ver docs/05-REVIEW.md.`,
        });
        break;
      }

      ctx.blockers = verdict.blockers;
      const fix = await this.runPhase('fix', ctx);
      ctx.previous = fix.summary;
      ctx.blockers = [];
    }

    if (this.halted) return;
    await this.runPhase('package', ctx);
  }

  private get stopped(): boolean {
    return this.status === 'stopped' || this.abort.signal.aborted;
  }

  /** Parada por el usuario o por un error que no se arregla pasando de fase. */
  private get halted(): boolean {
    return this.stopped || this.fatal !== null;
  }

  /** Reads docs/REVIEW.json, tolerating a reviewer that wrapped it in a code fence. */
  private async readVerdict(): Promise<{ pass: boolean; blockers: string[] }> {
    const file = path.join(this.workspace, 'docs', 'REVIEW.json');
    let parsed: ReviewFile | null = null;
    try {
      const raw = await fs.readFile(file, 'utf8');
      const json = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      parsed = JSON.parse(json) as ReviewFile;
    } catch {
      this.emit({
        t: 'log',
        level: 'warn',
        msg: 'No se pudo leer docs/REVIEW.json; se asume que la revisión pasó.',
      });
      return { pass: true, blockers: [] };
    }

    const blockers = (parsed.blockers ?? []).map(
      (b) => `[${b.id ?? '?'}] ${b.file ?? 'sin archivo'} — ${b.problem ?? ''} → ${b.fix ?? ''}`,
    );
    return { pass: parsed.verdict === 'pass' && blockers.length === 0, blockers };
  }

  /**
   * Ejecuta una fase reintentándola mientras el motivo del fallo sea "sin
   * cuota": pausa, espera a que la cuota vuelva y vuelve a intentar la MISMA
   * fase, que relee su trabajo y continúa. Los demás resultados (éxito, tope de
   * turnos, error duro) salen tal cual.
   */
  private async runPhase(phase: PhaseId, ctx: RoleContext): Promise<PhaseOutcome> {
    for (;;) {
      const outcome = await this.runPhaseOnce(phase, ctx);
      if (!this.pauseSignal || this.stopped) return outcome;
      const resumed = await this.waitForQuota(phase, this.pauseSignal);
      this.pauseSignal = null;
      if (!resumed) return outcome; // parada o se agotó la espera
      // reintenta la misma fase
    }
  }

  /** Pausa hasta que se estime que la cuota volvió. Devuelve false si se paró. */
  private async waitForQuota(
    phase: PhaseId,
    signal: { reason: string; resumeAt: number | null },
  ): Promise<boolean> {
    const startedWaiting = Date.now();
    this.status = 'paused';
    this.emit({ t: 'paused', phase, reason: signal.reason, resumeAt: signal.resumeAt });

    while (!this.stopped) {
      if (Date.now() - startedWaiting > Run.MAX_PAUSE_MS) {
        this.fatal = 'Se agotó la espera de cuota (8 h) sin que se restableciera.';
        this.emit({ t: 'log', level: 'error', msg: this.fatal });
        return false;
      }
      // Hasta la hora de reset (con 60 s de margen), o 5 min si no la sabemos.
      const target = signal.resumeAt ? signal.resumeAt + 60_000 : Date.now() + 5 * 60_000;
      const remaining = target - Date.now();
      if (remaining <= 0) break;
      await this.sleep(Math.min(remaining, 15_000)); // troceado, para cortar al parar
      if (this.status === 'paused' && Date.now() >= target) break;
    }

    if (this.stopped) return false;
    this.status = 'running';
    this.emit({ t: 'resumed', phase });
    return true;
  }

  /** Espera interrumpible: se corta en cuanto la ejecución se detiene. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      // La señal vive tanto como la ejecución, así que cada espera tiene que
      // retirar su oyente: si no, una fase larga los va acumulando.
      const done = () => {
        clearTimeout(timer);
        this.abort.signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.abort.signal.addEventListener('abort', done, { once: true });
    });
  }

  private async runPhaseOnce(phase: PhaseId, ctx: RoleContext): Promise<PhaseOutcome> {
    const role = ROLES[phase];
    const startedAt = Date.now();
    this.currentPhase = phase;
    this.emit({ t: 'phase.start', phase, label: role.label, round: ctx.round });

    // Foto de los hijos directos antes de que el SDK lance el suyo: el que
    // aparezca después es esta fase, y su árbol es lo que hay que cerrar al
    // detener. Se saca ya, porque `query()` arranca el proceso en cuanto se
    // pide el primer mensaje.
    const gen = ++this.phaseSeq;
    this.child = null;
    const before = new Set((await childProcesses(process.pid)).map((p) => p.pid));

    const options: Options = {
      cwd: this.workspace,
      model: this.request.model ?? CONFIG.model ?? role.model,
      effort: capEffort(role.effort, this.request.effortCap),
      maxTurns: role.maxTurns,
      maxBudgetUsd: this.request.maxBudgetUsd ?? CONFIG.maxBudgetUsd,
      permissionMode: 'default',
      canUseTool: buildGuard(this.workspace, () => phase, this.emit),
      // Ver CHILD_SESSION_ENV_KEYS/SPAWN_ENV/PIPELINE_TOOLS arriba: dos capas
      // independientes contra el puenteo del proceso hijo a la sesión de
      // Claude Code que lanzó este servidor.
      env: SPAWN_ENV,
      tools: PIPELINE_TOOLS,
      // Opus 5 omits reasoning by default, which makes a long first turn look
      // like the agent has frozen. Summaries keep the live view alive.
      thinking: { type: 'adaptive', display: 'summarized' },
      // Isolate from the host's ~/.claude and any project settings: a run must
      // depend only on what this orchestrator passes in.
      settingSources: [],
      persistSession: false,
      includePartialMessages: true,
      forwardSubagentText: true,
      abortController: this.abort,
      // El plugin es independiente de settingSources (no depende de ~/.claude
      // ni de .claude/ del proyecto generado). excludeDynamicSections saca
      // cwd/memoria/git del prefijo cacheado del sistema (cwd cambia por
      // proyecto, así que sin esto el prompt del sistema nunca compartía
      // caché entre dos ejecuciones de Agent Forge distintas) y lo reinyecta
      // como primer mensaje de usuario — el propio CONTRACT ya deja claro que
      // cwd es la raíz del repo, así que no se pierde nada steering ahí.
      plugins: [{ type: 'local', path: TOKEN_EFFICIENCY_PLUGIN_PATH }],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: role.system(ctx),
        excludeDynamicSections: true,
      },
      stderr: (data) => {
        const msg = data.trim();
        if (msg) this.emit({ t: 'log', level: 'warn', msg: msg.slice(0, 500) });
      },
      // El agente de producto puede preguntar al usuario ante una duda de
      // alcance. La herramienta vive en este proceso y bloquea hasta la respuesta.
      ...(role.canAsk ? { mcpServers: { forge: buildAskServer(this.askUser) } } : {}),
      ...(role.canConsult
        ? {
            agents: {
              'architect-advisor': {
                description:
                  'El arquitecto del proyecto. Consúltalo cuando el contrato de API, el modelo de datos o la arquitectura tengan un hueco, una ambigüedad o una contradicción con el código real.',
                prompt: ARCHITECT_ADVISOR_PROMPT,
                tools: ['Read', 'Glob', 'Grep'],
                model: this.request.model ?? CONFIG.model ?? ROLES.architect.model,
                effort: 'high' as const,
              },
            },
          }
        : {}),
    };

    let summary = '';
    let ok = false;
    let costUsd = 0;

    // En paralelo, porque el proceso todavía no existe: aparecerá mientras el
    // primer mensaje viaja de vuelta.
    void this.trackChild(before, gen);

    try {
      for await (const message of query({ prompt: role.prompt(ctx), options })) {
        this.consume(phase, message);
        if (message.type === 'result') {
          costUsd = message.total_cost_usd ?? 0;
          ok = message.subtype === 'success' && !message.is_error;
          summary =
            message.subtype === 'success'
              ? message.result
              : `La fase terminó por "${message.subtype}". ${(message.errors ?? []).join(' ')}`.trim();
          // El SDK no siempre lanza: a veces el motivo viene en el resultado.
          if (!ok) this.classifyFailure(summary);
        }
      }
    } catch (err) {
      if (this.stopped) throw err;
      const detalle = describeError(err);
      summary = `La fase falló: ${detalle}`;
      this.emit({ t: 'log', level: 'error', msg: summary });
      this.classifyFailure(detalle);
    }

    this.child = null;
    this.costUsd += costUsd;
    const outcome: PhaseOutcome = { ok, summary, costUsd, durationMs: Date.now() - startedAt };
    // Sin cuota no cuenta como fase hecha: se registra al reintentar y salir bien.
    if (!this.pauseSignal) {
      this.phases.set(phase, outcome);
      this.emit({ t: 'phase.end', phase, ...outcome });
    }
    return outcome;
  }

  /**
   * Clasifica el motivo de un fallo: sin cuota (pausa) o fatal (detiene).
   * Solo lo que suena a cuota se reintenta solo; todo lo demás —incluido un
   * error que no encaja en ningún patrón conocido, como un código de salida
   * crudo del proceso— es fatal por defecto. La alternativa (dejar pasar lo
   * no reconocido) cae en cascada: las fases siguientes fallan una tras otra
   * en milisegundos porque les falta el trabajo de la que sí murió.
   */
  private classifyFailure(detail: string): void {
    if (QUOTA_ERRORS.test(detail)) {
      this.pauseSignal = { reason: detail, resumeAt: parseResetAt(detail) };
      return;
    }
    this.fatal = detail;
    this.emit({
      t: 'log',
      level: 'error',
      msg: HARD_ERRORS.test(detail)
        ? 'Se detiene la ejecución: el resto de fases fallaría igual. El trabajo hecho sigue en el workspace.'
        : 'Se detiene la ejecución: el error no tiene forma de aviso de cuota conocido, así que no se reintenta solo. El trabajo hecho sigue en el workspace.',
    });
  }

  /** Turns SDK messages into UI events. */
  private consume(phase: PhaseId, message: SDKMessage): void {
    // Deltas arrive as stream events; the matching full assistant message is
    // used only for tool calls, so prose is never emitted twice.
    if (message.type === 'stream_event') {
      const sub = message.parent_tool_use_id !== null;
      const event = message.event;
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta' && delta.text) {
          this.emit({ t: 'text', phase, delta: delta.text, sub });
        } else if (delta.type === 'thinking_delta' && delta.thinking) {
          this.emit({ t: 'thinking', phase, delta: delta.thinking, sub });
        }
      }
      return;
    }

    if (message.type !== 'assistant') return;

    const sub = message.parent_tool_use_id !== null;
    for (const block of message.message.content) {
      if (block.type !== 'tool_use') continue;
      const input = (block.input ?? {}) as Record<string, unknown>;

      this.emit({
        t: 'tool',
        phase,
        id: block.id,
        name: block.name,
        summary: summarizeTool(block.name, input),
        sub,
      });

      if (block.name === 'Write' || block.name === 'Edit') {
        const file = input.file_path;
        if (typeof file === 'string') {
          this.emit({
            t: 'file',
            phase,
            path: path.relative(this.workspace, file).split(path.sep).join('/'),
            action: block.name === 'Write' ? 'write' : 'edit',
          });
        }
      }

      if (block.name === 'Task') {
        this.emit({
          t: 'consult',
          phase,
          agent: typeof input.subagent_type === 'string' ? input.subagent_type : 'subagente',
          question: typeof input.description === 'string' ? input.description : '',
        });
      }
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
