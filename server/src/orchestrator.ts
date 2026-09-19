import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./config.js";
import {
  EventLog,
  type ForgeEventInput,
  type PhaseId,
  type RunStatus,
} from "./events.js";
import { AGENT_PROCESS, childProcesses, killTree } from "./procs.js";
import { RESUME_NOTE, ROLES, type RoleContext } from "./roles.js";
import { projectSlug } from "./slug.js";
import crypto from "node:crypto";
import {
  createSession,
  deleteSession,
  promptAsync,
  promptChildSession,
  subscribeEvents,
  type OpencodeSession,
} from "./opencode.js";
import {
  translatePartUpdated,
  extractErrorMessage,
  translateSessionStatus,
} from "./translate.js";

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

export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];

/** El menor de los dos, para que el techo nunca suba el esfuerzo de un rol. */
function capEffort(role: Effort, cap: Effort | undefined): Effort {
  if (!cap) return role;
  return EFFORTS.indexOf(role) <= EFFORTS.indexOf(cap) ? role : cap;
}

/**
 * Sin cuota: el límite se restablece con el tiempo, así que la ejecución se
 * pausa y reintenta la misma fase sola cuando vuelve la cuota, en vez de fallar.
 * OpenCode devuelve errores Anthropic-style: "Your credit balance is too low"
 * o "rate_limit_error" con retry_after. Los patrones cubren ambos formatos.
 */
const QUOTA_ERRORS =
  /credit balance is too low|hit your [\w\s-]*?limit|usage limit|out of (extra )?usage|rate.?limit|too many requests|\bquota\b|resets?\s+\d{1,2}(:\d{2})?\s*(am|pm)|retry_after/i;

/**
 * Errores que esperar no arregla: sin saldo, credenciales mal. Detienen la
 * ejecución; el resto de fases fallaría igual.
 */
const HARD_ERRORS =
  /credit balance is too low|insufficient.credit|invalid.*api.key|authentication_error|oauth token.*expired|please run .?login|provider_auth_error/i;

/**
 * Dos formas distintas en que una sesión se queda sin contexto utilizable:
 * - "Autocompact is thrashing": el SDK entró en un bucle de recompactación
 *   que no converge y se rindió antes de llegar al límite duro.
 * - "Prompt is too long": la sesión creció tanto que la API rechazó la
 *   petición de golpe — visto tras subir `settings.autoCompactWindow` por
 *   encima del valor por defecto (revertido; ver el comentario en
 *   `runPhaseOnce`), que dejó que el contexto siguiera creciendo sin
 *   compactar a tiempo.
 *
 * Ninguna de las dos es un límite de cuota ni de contenido del producto.
 * Instruir al agente por prompt para que no releyera todo tras compactar no
 * fue fiable (confirmado con una ejecución real que ignoró esa guía y volvió
 * a caer en el mismo bucle — ver [[Kairos, bot de trading (prueba)]] en el
 * vault). Lo único que rompe esto de verdad es una sesión nueva con contexto
 * vacío: se reintenta la MISMA fase igual que con cuota, pero con espera
 * mínima (no hay "hora de reset" que aguardar) y con tope de reintentos
 * (`MAX_CONTEXT_RETRIES`), porque aquí sí puede repetirse indefinidamente si
 * la fase de verdad necesita más contexto del que cabe en una sesión.
 */
const CONTEXT_THRASH_ERROR = /autocompact is thrashing|prompt is too long/i;

/** Reintentos de contexto (no de cuota) antes de rendirse y marcar fatal. */
const MAX_CONTEXT_RETRIES = 3;

/** Momento (ms epoch) en que la cuota se restablece, si el error lo dice. */
function parseResetAt(msg: string): number | null {
  const m = msg.match(/resets?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (/pm/i.test(m[3] ?? "")) hour += 12;
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

type ReviewBlocker = {
  id?: string;
  file?: string;
  problem?: string;
  fix?: string;
};
type ReviewFile = {
  verdict?: string;
  blockers?: ReviewBlocker[];
  summary?: string;
};

/**
 * Qué fases quedan invalidadas (no se siembran como "hechas") cuando se
 * retoma en una fase dada. No es solo la propia fase: si se retoma en
 * 'frontend', un 'integration' con éxito de un intento MÁS ANTIGUO validó un
 * frontend que ya no existe — hay que invalidarlo también. Usado por
 * `Run.seedPriorPhases`.
 */
const DOWNSTREAM_OF: Partial<Record<PhaseId, Set<PhaseId>>> = {
  product: new Set([
    "product",
    "design",
    "architect",
    "backend",
    "frontend",
    "integration",
  ]),
  design: new Set(["design", "frontend", "integration"]),
  architect: new Set(["architect", "backend", "frontend", "integration"]),
  backend: new Set(["backend", "frontend", "integration"]),
  frontend: new Set(["frontend", "integration"]),
  integration: new Set(["integration"]),
};

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
  status: RunStatus = "queued";
  costUsd = 0;
  startedAt = 0;
  finishedAt = 0;
  currentPhase: PhaseId | null = null;
  readonly phases = new Map<PhaseId, PhaseOutcome>();

  private readonly abort = new AbortController();
  /**
   * PIDs de los procesos que el SDK lanzó para las fases en curso. Antes era
   * un único valor porque solo había una fase activa a la vez — ahora diseño
   * puede correr en paralelo con arquitecto/backend, así que puede haber más
   * de un hijo vivo al mismo tiempo. No hace falta saber qué PID es de qué
   * fase: `stop()` los mata todos igual.
   */
  private children = new Set<number>();
  /**
   * Generación por fase (no global): si una fase se reintenta tras una pausa
   * de cuota, su propio contador sube para que un rastreo tardío de ESA fase
   * no pise al reintento. Con generación global, el reintento de una fase
   * invalidaría por error el rastreo de otra fase corriendo en paralelo.
   */
  private phaseGen = new Map<PhaseId, number>();
  /** Ver `resumeNoteFor`: el aviso de reanudación se entrega una sola vez. */
  private resumeNoteConsumed = false;
  /** Reintentos por thrashing de contexto ya consumidos, por fase (`MAX_CONTEXT_RETRIES`). */
  private contextRetries = new Map<PhaseId, number>();
  /** Motivo por el que no tiene sentido seguir con las fases que faltan. */
  private fatal: string | null = null;
  /**
   * Estado de cada fase actualmente arrancada (corriendo o pausada por
   * cuota), para derivar `status` sin que una pausa de una fase (p. ej.
   * diseño) tape que otra (arquitecto/backend) sigue trabajando de verdad.
   */
  private activePhases = new Map<PhaseId, "running" | "paused">();
  /** Tope de espera acumulada sin cuota antes de rendirse (8 h). */
  private static readonly MAX_PAUSE_MS = 8 * 60 * 60 * 1000;
  /** Preguntas del agente esperando respuesta del usuario, por id. */
  private readonly pendingAsks = new Map<
    string,
    {
      phase: PhaseId;
      resolve: (answer: string) => void;
      reject: (err: Error) => void;
    }
  >();

  /** Preguntas abiertas ahora mismo, para que la API las reponga al reconectar. */
  get openQuestions(): Array<{ id: string; phase: PhaseId }> {
    return [...this.pendingAsks.entries()].map(([id, a]) => ({
      id,
      phase: a.phase,
    }));
  }

  constructor(
    readonly id: string,
    readonly request: RunRequest
  ) {
    this.log = new EventLog(CONFIG.eventBufferSize);
    this.slug = request.slug ?? projectSlug(request.idea);
    // La carpeta se llama como el proyecto, no como el id: varios intentos del
    // mismo proyecto comparten workspace y continúan el trabajo anterior.
    this.workspace =
      request.workspace ?? path.join(CONFIG.workspacesRoot, this.slug);
  }

  private emit = (e: ForgeEventInput) => this.log.emit(e);

  /**
   * Detiene la ejecución de verdad: corta el diálogo con el modelo y se lleva
   * por delante los procesos que el agente hubiera dejado en marcha. La promesa
   * se resuelve cuando ya no queda nada trabajando, así que la API puede
   * contestar «hecho» sin mentir.
   */
  async stop(): Promise<void> {
    if (
      this.status !== "running" &&
      this.status !== "queued" &&
      this.status !== "paused"
    )
      return;
    this.status = "stopped";
    this.rejectAsks("La ejecución se detuvo.");
    this.emit({
      t: "log",
      level: "warn",
      msg: "Ejecución detenida por el usuario.",
    });
    // Primero el árbol y después el aborto, no al revés: abortar le manda
    // SIGTERM al proceso del SDK, y una vez muerto ya no se puede bajar por sus
    // hijos: el `npm install` que hubiera lanzado quedaría huérfano y vivo.
    await this.killAgentProcesses();
    this.abort.abort();
  }

  /** Cierra el árbol de procesos de cualquier fase en curso. Nunca lanza. */
  private async killAgentProcesses(): Promise<void> {
    const pids = [...this.children];
    this.children.clear();
    await Promise.all(pids.map((pid) => killTree(pid)));
  }

  /**
   * Localiza el proceso que el SDK acaba de lanzar, comparando los hijos
   * directos de este servidor antes y después de arrancar la fase. Se
   * descarta lo que no tenga pinta de agente (`childProcesses` usa un
   * `powershell` auxiliar que también aparecería como hijo nuevo) y lo que ya
   * esté reclamado por otra fase corriendo en paralelo — sin ese filtro, dos
   * fases arrancando casi a la vez (diseño y arquitecto) podrían pelearse por
   * el mismo PID recién aparecido.
   *
   * Devuelve el PID encontrado (o `undefined` si se agotan los intentos) para
   * que quien llama pueda quitarlo de `children` cuando la fase termine.
   */
  private async trackChild(
    before: Set<number>,
    stopCheck: () => boolean
  ): Promise<number | undefined> {
    for (let intento = 0; intento < 20; intento++) {
      if (this.stopped || stopCheck()) return undefined;
      const nuevo = (await childProcesses(process.pid)).find(
        (p) =>
          !before.has(p.pid) &&
          AGENT_PROCESS.test(p.name) &&
          !this.children.has(p.pid)
      );
      if (nuevo) {
        if (!stopCheck()) this.children.add(nuevo.pid);
        return nuevo.pid;
      }
      await this.sleep(500);
    }
    return undefined;
  }

  /**
   * Pregunta al usuario (producto) o le enseña un diseño y espera su
   * respuesta (diseño). La promesa se resuelve desde `answer()` cuando el
   * usuario contesta por la interfaz, o se rechaza si la ejecución se detiene
   * con la pregunta abierta. `phase` viene siempre explícito de quien llama
   * (no de `this.currentPhase`): con dos fases activas a la vez, adivinarlo
   * sería ambiguo.
   */
  private askUser = (
    phase: PhaseId,
    question: string,
    options: string[],
    image?: string
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      const id = crypto.randomBytes(4).toString("hex");
      this.pendingAsks.set(id, { phase, resolve, reject });
      this.emit({ t: "ask", phase, id, question, options, image });
    });

  /** Contesta una pregunta abierta. Devuelve false si el id ya no existe. */
  answer(id: string, text: string): boolean {
    const pending = this.pendingAsks.get(id);
    if (!pending) return false;
    this.pendingAsks.delete(id);
    this.emit({ t: "answer", phase: pending.phase, id, answer: text });
    pending.resolve(text);
    return true;
  }

  private rejectAsks(reason: string): void {
    for (const [, a] of this.pendingAsks) a.reject(new Error(reason));
    this.pendingAsks.clear();
  }

  /**
   * Deriva `status` de qué fases hay activas ahora mismo. Con una sola fase a
   * la vez, "pausada por cuota" y "el run está pausado" eran la misma cosa;
   * con diseño corriendo en paralelo con arquitecto/backend ya no lo son —
   * si diseño se queda sin cuota pero arquitecto sigue trabajando, el run
   * entero sigue "running" de verdad, no "paused". Solo se marca `paused`
   * cuando TODAS las fases activas lo están.
   */
  private updateStatus(): void {
    if (this.stopped || this.fatal !== null) return;
    const states = [...this.activePhases.values()];
    if (states.length === 0) return; // nada activo ahora mismo: no tocar el status
    this.status = states.every((s) => s === "paused") ? "paused" : "running";
  }

  async start(): Promise<void> {
    this.status = "running";
    this.startedAt = Date.now();
    await fs.mkdir(path.join(this.workspace, "docs"), { recursive: true });

    this.emit({
      t: "run.start",
      runId: this.id,
      idea: this.request.idea,
      workspace: this.workspace,
    });

    this.seedPriorPhases();

    try {
      await this.pipeline();
      if (this.status === "running") {
        // "Terminada" solo si todas las fases que se ejecutaron salieron bien.
        // Antes bastaba con llegar al final del bucle, aunque no hubiera
        // sobrevivido ninguna.
        const fallidas = [...this.phases.values()].filter((p) => !p.ok).length;
        this.status = this.fatal || fallidas > 0 ? "failed" : "done";
        if (fallidas > 0) {
          this.emit({
            t: "log",
            level: "error",
            msg: `La ejecución termina con ${fallidas} fase(s) fallida(s).${this.fatal ? ` Causa: ${this.fatal}` : ""}`,
          });
        }
      }
    } catch (err) {
      if (!this.stopped) {
        this.status = "failed";
        this.emit({ t: "log", level: "error", msg: describeError(err) });
      }
    } finally {
      this.finishedAt = Date.now();
      this.currentPhase = null;
      this.emit({
        t: "run.end",
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
   *
   * Siembra lo que haya en `prior` salvo la fase que se va a reintentar Y
   * todo lo que dependa de ella (`DOWNSTREAM_OF`) — no "todo lo anterior a
   * startFrom" por posición: con diseño corriendo en paralelo con
   * arquitecto/backend no hay un orden lineal único que representar.
   *
   * La exclusión en cascada importa de verdad: si se retoma en 'frontend'
   * pero un intento MÁS ANTIGUO de este mismo proyecto llegó a completar
   * 'integration' con éxito, esa `prior['integration']` sigue siendo la más
   * reciente con éxito — pero validó un frontend que ya no existe. Sin
   * excluirla también, se sembraría como "hecha" una integración que en
   * realidad nunca vio el frontend que se está a punto de reconstruir.
   * `RunStore.priorPhaseOutcomes` ya solo trae fases con éxito, así que no
   * hay riesgo de sembrar algo que en realidad falló — el riesgo era este.
   */
  private seedPriorPhases(): void {
    const prior = this.request.priorPhases;
    if (!prior) return;
    const from = this.request.startFrom;
    const invalidated = from ? DOWNSTREAM_OF[from] : undefined;
    for (const [phase, outcome] of Object.entries(prior) as [
      PhaseId,
      PhaseOutcome,
    ][]) {
      if (invalidated?.has(phase)) continue;
      this.emit({
        t: "phase.start",
        phase,
        label: ROLES[phase].label,
        round: 1,
      });
      this.phases.set(phase, outcome);
      this.costUsd += outcome.costUsd;
      this.emit({ t: "phase.end", phase, ...outcome });
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
    const nameFile = path.join(this.workspace, "docs", "NOMBRE.txt");
    let raw: string;
    try {
      raw = (await fs.readFile(nameFile, "utf8")).trim();
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
        t: "log",
        level: "warn",
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
        t: "log",
        level: "warn",
        msg: `No se pudo renombrar la carpeta a "${targetSlug}": ${describeError(err)}. Se queda en "${currentName}".`,
      });
      return;
    }

    this.workspace = target;
    // Antes del `log`: `RunStore` vuelca el manifiesto al ver este evento, así
    // que si el proceso muere justo después, el disco ya sabe la carpeta real.
    this.emit({ t: "workspace", workspace: target });
    this.emit({
      t: "log",
      level: "info",
      msg: `Carpeta renombrada de "${currentName}" a "${targetSlug}" (nombre del producto).`,
    });
  }

  /**
   * product -> (diseño || arquitecto -> backend) -> frontend -> integración
   * -> review/fix/package. La única rama en paralelo es diseño frente a
   * arquitecto+backend: diseño no depende de la arquitectura (trabaja del
   * brief), y frontend no puede empezar sin backend (necesita la API real) ni
   * sin diseño (necesita las pantallas aprobadas) — así que frontend es
   * donde las dos ramas se juntan.
   */
  private async pipeline(): Promise<void> {
    const ctx: RoleContext = {
      idea: this.request.idea,
      language: this.request.language ?? "español",
      round: 1,
      previous: "",
      design: "",
      blockers: [],
      resumeNote: "",
    };

    // Al retomar, las fases anteriores ya dejaron su rastro en docs/ y en el
    // código: el contrato entre agentes está en disco, no en `ctx.previous`
    // (que una reanudación sobrescribe varias veces con resúmenes legítimos
    // antes de que le toque el turno a la fase retomada). El aviso de
    // reanudación viaja en `ctx.resumeNote`, fijado justo antes de cada
    // llamada a `runPhase` vía `resumeNoteFor` — así llega intacto a la fase
    // exacta que se retoma, y a ninguna otra.
    const from = this.request.startFrom;

    // --- producto: siempre primero, nunca en paralelo con nada ---
    const seededProduct = this.phases.get("product");
    if (seededProduct) {
      ctx.previous = seededProduct.summary;
    } else {
      if (this.halted) return;
      ctx.resumeNote = this.resumeNoteFor("product");
      const outcome = await this.runPhase("product", ctx);
      ctx.previous = outcome.summary;
      if (outcome.ok) await this.renameToProductName();
    }

    // --- diseño || (arquitecto -> backend), en paralelo ---
    if (this.halted) return;

    const designCtx: RoleContext = {
      ...ctx,
      resumeNote: this.resumeNoteFor("design"),
    };
    const mainCtx: RoleContext = { ...ctx, resumeNote: "" };

    const designWork: Promise<PhaseOutcome> = this.phases.get("design")
      ? Promise.resolve(this.phases.get("design")!)
      : this.runPhase("design", designCtx);

    const mainWork: Promise<PhaseOutcome> = (async () => {
      mainCtx.resumeNote = this.resumeNoteFor("architect");
      const architectOutcome =
        this.phases.get("architect") ??
        (await this.runPhase("architect", mainCtx));
      mainCtx.previous = architectOutcome.summary;
      if (this.halted || !architectOutcome.ok) return architectOutcome;

      mainCtx.resumeNote = this.resumeNoteFor("backend");
      return this.phases.get("backend") ?? this.runPhase("backend", mainCtx);
    })();

    const [designOutcome, backendOutcome] = await Promise.all([
      designWork,
      mainWork,
    ]);
    ctx.design = designOutcome.summary;
    ctx.previous = backendOutcome.summary;

    if (this.halted) return;

    // --- frontend: necesita diseño Y backend ---
    const seededFrontend = this.phases.get("frontend");
    if (seededFrontend) {
      ctx.previous = seededFrontend.summary;
    } else {
      ctx.resumeNote = this.resumeNoteFor("frontend");
      const frontendOutcome = await this.runPhase("frontend", ctx);
      ctx.previous = frontendOutcome.summary;
    }

    if (this.halted) return;

    // --- integración ---
    const seededIntegration = this.phases.get("integration");
    if (seededIntegration) {
      ctx.previous = seededIntegration.summary;
    } else {
      ctx.resumeNote = this.resumeNoteFor("integration");
      const integrationOutcome = await this.runPhase("integration", ctx);
      ctx.previous = integrationOutcome.summary;
    }

    // Review -> fix -> review, until the reviewer passes or we run out of rounds.
    const maxRounds = this.request.maxReviewRounds ?? CONFIG.maxReviewRounds;
    if (from === "package") {
      ctx.resumeNote = this.resumeNoteFor("package");
      return void (await this.runPhase("package", ctx));
    }

    for (let round = 1; round <= maxRounds + 1; round++) {
      if (this.halted) return;

      ctx.round = round;
      ctx.resumeNote = this.resumeNoteFor("review");
      const review = await this.runPhase("review", ctx);
      ctx.previous = review.summary;

      if (!review.ok) {
        // Una revisión que no llegó a ejecutarse no aprueba nada.
        this.emit({
          t: "log",
          level: "warn",
          msg: "La fase de revisión falló, así que no hay veredicto. Se entrega sin auditar.",
        });
        break;
      }

      const verdict = await this.readVerdict();
      this.emit({
        t: "review",
        verdict: verdict.pass ? "pass" : "changes_requested",
        blockers: verdict.blockers,
        round,
      });

      if (verdict.pass || verdict.blockers.length === 0) break;

      if (round > maxRounds) {
        this.emit({
          t: "log",
          level: "warn",
          msg: `Se agotaron las ${maxRounds} rondas de corrección con ${verdict.blockers.length} bloqueante(s) abiertos. Ver docs/05-REVIEW.md.`,
        });
        break;
      }

      ctx.blockers = verdict.blockers;
      ctx.resumeNote = this.resumeNoteFor("fix");
      const fix = await this.runPhase("fix", ctx);
      ctx.previous = fix.summary;
      ctx.blockers = [];
    }

    if (this.halted) return;
    ctx.resumeNote = this.resumeNoteFor("package");
    await this.runPhase("package", ctx);
  }

  /**
   * Da el aviso de reanudación exactamente una vez, y solo a la fase que de
   * verdad se está retomando (`this.request.startFrom`). Se llama en cada
   * punto del pipeline donde una fase está a punto de arrancar de verdad —
   * incluidas las que corren en paralelo (diseño frente a arquitecto) —
   * porque con dos ramas simultáneas no basta con fijar el aviso una vez al
   * principio: una copia de `ctx` que no es la fase retomada podría heredarlo
   * igual y mostrarlo donde no toca. El flag de un solo uso evita además que
   * una ronda 2+ de review/fix repita un aviso que ya cumplió su propósito
   * en la ronda 1.
   */
  private resumeNoteFor(phase: PhaseId): string {
    if (this.resumeNoteConsumed || this.request.startFrom !== phase) return "";
    this.resumeNoteConsumed = true;
    return RESUME_NOTE;
  }

  private get stopped(): boolean {
    return this.status === "stopped" || this.abort.signal.aborted;
  }

  /** Parada por el usuario o por un error que no se arregla pasando de fase. */
  private get halted(): boolean {
    return this.stopped || this.fatal !== null;
  }

  /** Reads docs/REVIEW.json, tolerating a reviewer that wrapped it in a code fence. */
  private async readVerdict(): Promise<{ pass: boolean; blockers: string[] }> {
    const file = path.join(this.workspace, "docs", "REVIEW.json");
    let parsed: ReviewFile | null = null;
    try {
      const raw = await fs.readFile(file, "utf8");
      const json = raw
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "");
      parsed = JSON.parse(json) as ReviewFile;
    } catch {
      this.emit({
        t: "log",
        level: "warn",
        msg: "No se pudo leer docs/REVIEW.json; se asume que la revisión pasó.",
      });
      return { pass: true, blockers: [] };
    }

    const blockers = (parsed.blockers ?? []).map(
      (b) =>
        `[${b.id ?? "?"}] ${b.file ?? "sin archivo"} — ${b.problem ?? ""} → ${b.fix ?? ""}`
    );
    return {
      pass: parsed.verdict === "pass" && blockers.length === 0,
      blockers,
    };
  }

  /**
   * Ejecuta una fase reintentándola mientras el motivo del fallo sea "sin
   * cuota": pausa, espera a que la cuota vuelva y vuelve a intentar la MISMA
   * fase, que relee su trabajo y continúa. Los demás resultados (éxito, tope de
   * turnos, error duro) salen tal cual.
   *
   * Lleva la cuenta de esta fase en `activePhases` (running/paused) para que
   * `updateStatus()` sepa si el run en conjunto sigue trabajando de verdad
   * aunque ESTA fase esté esperando cuota — importa porque con diseño en
   * paralelo con arquitecto/backend, una pausa de una no es una pausa de todas.
   */
  private async runPhase(
    phase: PhaseId,
    ctx: RoleContext
  ): Promise<PhaseOutcome> {
    this.activePhases.set(phase, "running");
    this.updateStatus();
    try {
      for (;;) {
        const { pauseSignal, ...outcome } = await this.runPhaseOnce(phase, ctx);
        if (!pauseSignal || this.stopped) {
          ctx.resumeNote = ""; // no debe sobrevivir a la fase siguiente que reutiliza `ctx`
          return outcome;
        }

        if (CONTEXT_THRASH_ERROR.test(pauseSignal.reason)) {
          const retries = (this.contextRetries.get(phase) ?? 0) + 1;
          this.contextRetries.set(phase, retries);
          if (retries > MAX_CONTEXT_RETRIES) {
            this.fatal = pauseSignal.reason;
            this.emit({
              t: "log",
              level: "error",
              msg: `Se detiene la ejecución: la fase se quedó sin contexto utilizable ${MAX_CONTEXT_RETRIES} veces seguidas, incluso con sesiones nuevas. Probablemente necesita más contexto del que cabe en una sesión. El trabajo hecho sigue en el workspace.`,
            });
            return outcome;
          }
          // Una sesión con contexto vacío es lo único que rompe el bucle de
          // recompactación (ver CONTEXT_THRASH_ERROR) — pero sin este aviso el
          // agente nuevo no sabe que ya hay trabajo suyo a medio hacer en disco.
          ctx.resumeNote = RESUME_NOTE;
        }

        this.activePhases.set(phase, "paused");
        this.updateStatus();
        const resumed = await this.waitForQuota(phase, pauseSignal);
        if (!resumed) return outcome; // parada o se agotó la espera
        this.activePhases.set(phase, "running");
        this.updateStatus();
        // reintenta la misma fase
      }
    } finally {
      this.activePhases.delete(phase);
      this.updateStatus();
    }
  }

  /** Pausa hasta que se estime que la cuota volvió. Devuelve false si se paró. */
  private async waitForQuota(
    phase: PhaseId,
    signal: { reason: string; resumeAt: number | null }
  ): Promise<boolean> {
    const startedWaiting = Date.now();
    this.emit({
      t: "paused",
      phase,
      reason: signal.reason,
      resumeAt: signal.resumeAt,
    });

    while (!this.stopped) {
      if (Date.now() - startedWaiting > Run.MAX_PAUSE_MS) {
        this.fatal =
          "Se agotó la espera de cuota (8 h) sin que se restableciera.";
        this.emit({ t: "log", level: "error", msg: this.fatal });
        return false;
      }
      // Hasta la hora de reset (con 60 s de margen), o 5 min si no la sabemos.
      const target = signal.resumeAt
        ? signal.resumeAt + 60_000
        : Date.now() + 5 * 60_000;
      const remaining = target - Date.now();
      if (remaining <= 0) break;
      await this.sleep(Math.min(remaining, 15_000)); // troceado, para cortar al parar
    }

    if (this.stopped) return false;
    this.emit({ t: "resumed", phase });
    return true;
  }

  /** Espera interrumpible: se corta en cuanto la ejecución se detiene. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      // La señal vive tanto como la ejecución, así que cada espera tiene que
      // retirar su oyente: si no, una fase larga los va acumulando.
      const done = () => {
        clearTimeout(timer);
        this.abort.signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.abort.signal.addEventListener("abort", done, { once: true });
    });
  }

  private async runPhaseOnce(
    phase: PhaseId,
    ctx: RoleContext
  ): Promise<
    PhaseOutcome & {
      pauseSignal: { reason: string; resumeAt: number | null } | null;
    }
  > {
    const role = ROLES[phase];
    const startedAt = Date.now();
    this.currentPhase = phase;
    this.emit({ t: "phase.start", phase, label: role.label, round: ctx.round });

    const model = this.request.model ?? CONFIG.model ?? role.model;
    let summary = "";
    let ok = false;
    let costUsd = 0;
    let pauseSignal: { reason: string; resumeAt: number | null } | null = null;

    // Crear sesión OpenCode para esta fase
    let session: OpencodeSession;
    try {
      session = await createSession(this.workspace, `${phase}-${this.id}`);
    } catch (err) {
      const detalle = describeError(err);
      summary = `No se pudo crear la sesión: ${detalle}`;
      this.emit({ t: "log", level: "error", msg: summary });
      pauseSignal = this.classifyFailure(detalle);
      const outcome: PhaseOutcome = {
        ok: false,
        summary,
        costUsd: 0,
        durationMs: Date.now() - startedAt,
      };
      return { ...outcome, pauseSignal };
    }

    // Preparar el prompt del sistema + usuario
    const systemPrompt = role.system(ctx);
    const userPrompt = role.prompt(ctx);
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    // Suscribirse a eventos SSE ANTES de enviar el prompt
    let resolved = false;
    const completionPromise = new Promise<void>((resolve) => {
      const unsub = subscribeEvents(session.id, (event) => {
        if (resolved) return;

        // Manejar errores de sesión
        if (event.type === "session.error") {
          const msg = extractErrorMessage(event);
          if (msg) {
            summary = msg;
            this.emit({
              t: "log",
              level: "error",
              msg: `Fase ${phase}: ${msg}`,
            });
            pauseSignal = this.classifyFailure(msg);
          }
          resolved = true;
          unsub();
          resolve();
          return;
        }

        // Traducir eventos de partes a ForgeEvents
        if (event.type === "message.part.updated") {
          const part = event.properties?.part as any;
          const delta = event.properties?.delta as string | undefined;
          if (part) {
            const translated = translatePartUpdated(
              part,
              delta,
              phase,
              this.workspace
            );
            for (const e of translated) {
              this.emit(e as ForgeEventInput);
            }
          }
        }

        // Detectar cuando la sesión termina (idle después de estar busy)
        if (event.type === "session.status") {
          const status = translateSessionStatus(event);
          if (status?.status === "idle") {
            resolved = true;
            unsub();
            resolve();
          }
        }
      });

      // Si la ejecución se aborta, cancelar la suscripción
      this.abort.signal.addEventListener(
        "abort",
        () => {
          unsub();
          resolved = true;
          resolve();
        },
        { once: true }
      );
    });

    // Enviar el prompt (async — el resultado llega por SSE)
    try {
      await promptAsync(session.id, fullPrompt, { model });
    } catch (err) {
      if (this.stopped) {
        await deleteSession(session.id).catch(() => {});
        throw err;
      }
      const detalle = describeError(err);
      summary = `La fase falló al enviar prompt: ${detalle}`;
      this.emit({ t: "log", level: "error", msg: summary });
      pauseSignal = this.classifyFailure(detalle);
      await deleteSession(session.id).catch(() => {});
      const outcome: PhaseOutcome = {
        ok: false,
        summary,
        costUsd: 0,
        durationMs: Date.now() - startedAt,
      };
      return { ...outcome, pauseSignal };
    }

    // Esperar a que la sesión termine
    await completionPromise;

    // Obtener el resultado final de la sesión
    try {
      const resp = await fetch(
        `${(await import("./opencode.js")).opencodeBaseUrl()}/session/${session.id}/message`,
        { headers: (await import("./translate.js")).authHeaders() }
      );
      if (resp.ok) {
        const msgs = (await resp.json()) as Array<{ info: any; parts: any[] }>;
        // Buscar el último mensaje del asistente con contenido de texto
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i];
          if (msg?.info?.role === "assistant") {
            const textParts = (msg.parts ?? []).filter(
              (p: any) => p.type === "text"
            );
            if (textParts.length > 0) {
              summary = textParts
                .map((p: any) => p.text)
                .join("\n")
                .slice(0, 5000);
              costUsd = msg.info.cost ?? 0;
              ok = !msg.info.error;
              break;
            }
          }
        }
      }
    } catch {
      // Si no podemos leer los mensajes, usamos lo que tengamos
      if (!summary) summary = "Fase completada (sin resumen disponible)";
    }

    // Limpiar la sesión
    await deleteSession(session.id).catch(() => {});

    if (this.stopped) throw new Error("Ejecución detenida");

    this.costUsd += costUsd;
    const outcome: PhaseOutcome = {
      ok,
      summary,
      costUsd,
      durationMs: Date.now() - startedAt,
    };
    if (!pauseSignal) {
      this.phases.set(phase, outcome);
      this.emit({ t: "phase.end", phase, ...outcome });
    }
    return { ...outcome, pauseSignal };
  }

  /**
   * Clasifica el motivo de un fallo: sin cuota (pausa, devuelta para que
   * `runPhase` reintente) o fatal (detiene toda la ejecución vía `this.fatal`
   * — eso sí es un campo compartido a propósito: un error fatal para de
   * verdad, aunque haya otra fase corriendo en paralelo). Solo lo que suena a
   * cuota se reintenta solo; todo lo demás —incluido un error que no encaja
   * en ningún patrón conocido, como un código de salida crudo del proceso— es
   * fatal por defecto. La alternativa (dejar pasar lo no reconocido) cae en
   * cascada: las fases siguientes fallan una tras otra en milisegundos porque
   * les falta el trabajo de la que sí murió.
   */
  private classifyFailure(
    detail: string
  ): { reason: string; resumeAt: number | null } | null {
    if (QUOTA_ERRORS.test(detail)) {
      return { reason: detail, resumeAt: parseResetAt(detail) };
    }
    if (CONTEXT_THRASH_ERROR.test(detail)) {
      return { reason: detail, resumeAt: Date.now() };
    }
    this.fatal = detail;
    this.emit({
      t: "log",
      level: "error",
      msg: HARD_ERRORS.test(detail)
        ? "Se detiene la ejecución: el resto de fases fallaría igual. El trabajo hecho sigue en el workspace."
        : "Se detiene la ejecución: el error no tiene forma de aviso de cuota conocido, así que no se reintenta solo. El trabajo hecho sigue en el workspace.",
    });
    return null;
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
