/**
 * Fase 1 — Ciclo de vida del servidor OpenCode headless.
 *
 * Responsibilities:
 * - Spawn `opencode serve` as a child process (port, env saneado, teardown)
 * - Create sessions per phase via HTTP API
 * - Send prompts (sync and async)
 * - Abort running sessions
 * - Consume the global SSE event stream
 *
 * Does NOT translate events — that's translate.ts.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { CONFIG, OPENCODE_BIN } from "./config.js";
import { authHeaders, type OpencodeEvent } from "./translate.js";

// ─── Server lifecycle ──────────────────────────────────────────────

let serverProcess: ChildProcess | null = null;
let serverPort = 0;
let serverReady = false;

/**
 * Arranca opencode serve headless en un puerto efímero.
 * Idempotente: si ya está arrancado, no hace nada.
 */
export async function startOpencodeServer(): Promise<{
  port: number;
  baseUrl: string;
}> {
  if (serverReady && serverPort) {
    const baseUrl = `http://127.0.0.1:${serverPort}`;
    return { port: serverPort, baseUrl };
  }

  // Puerto efímero: 32000 + random para evitar colisiones
  serverPort = 32_000 + Math.floor(Math.random() * 8000);

  const env: Record<string, string | undefined> = { ...process.env };

  // Limpiar variables de sesión de Claude Code que OpenCode no necesita
  const CLAUDE_KEYS = [
    "CLAUDECODE",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_CODE_BRIDGE_SESSION_ID",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDE_CODE_ENTRYPOINT",
    "AI_AGENT",
    "CLAUDE_PID",
    "CLAUDE_EFFORT",
    "Claude",
  ];
  for (const key of CLAUDE_KEYS) delete env[key];

  serverProcess = spawn(
    OPENCODE_BIN,
    ["serve", "--port", String(serverPort), "--hostname", "127.0.0.1"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      windowsHide: true,
    }
  );

  serverProcess.stdout?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg?.includes("listening")) serverReady = true;
  });

  serverProcess.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`[opencode] ${msg}`);
  });

  serverProcess.on("exit", () => {
    serverReady = false;
    serverProcess = null;
  });

  // Esperar a que el servidor esté listo
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  for (let i = 0; i < 40; i++) {
    if (serverReady) break;
    try {
      const res = await fetch(`${baseUrl}/global/health`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch {}
    await sleep(500);
  }

  if (!serverReady) {
    serverProcess?.kill("SIGTERM");
    throw new Error("opencode serve no arrancó en 20s");
  }

  return { port: serverPort, baseUrl };
}

/**
 * Detiene el servidor OpenCode y limpia recursos.
 */
export async function stopOpencodeServer(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
  serverReady = false;
  serverPort = 0;
}

/** El servidor está listo para recibir peticiones. */
export function isOpencodeReady(): boolean {
  return serverReady;
}

/** URL base del servidor (http://127.0.0.1:PORT). */
export function opencodeBaseUrl(): string {
  return `http://127.0.0.1:${serverPort}`;
}

// ─── Sessions ──────────────────────────────────────────────────────

export type OpencodeSession = {
  id: string;
  slug: string;
  projectID: string;
  directory: string;
  title: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
};

/**
 * Crea una sesión OpenCode para una fase del pipeline.
 * El directory es el workspace del proyecto generado.
 */
export async function createSession(
  workspace: string,
  title: string
): Promise<OpencodeSession> {
  const res = await fetch(`${opencodeBaseUrl()}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
  return res.json() as Promise<OpencodeSession>;
}

/**
 * Elimina una sesión (cleanup al terminar una fase).
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${opencodeBaseUrl()}/session/${sessionId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

/**
 * Aborta una sesión en ejecución.
 */
export async function abortSession(sessionId: string): Promise<boolean> {
  const res = await fetch(`${opencodeBaseUrl()}/session/${sessionId}/abort`, {
    method: "POST",
    headers: authHeaders(),
  });
  return res.ok;
}

// ─── Prompts ───────────────────────────────────────────────────────

export type OpencodePromptResult = {
  info: {
    id: string;
    role: "assistant";
    error?: {
      name: string;
      data: { message: string; statusCode?: number; isRetryable?: boolean };
    };
    tokens: {
      input: number;
      output: number;
      reasoning: number;
      cache: { read: number; write: number };
    };
    cost: number;
  };
  parts: Array<{ type: string; text?: string }>;
};

/**
 * Envía un prompt síncrono a una sesión y espera la respuesta completa.
 */
export async function promptSync(
  sessionId: string,
  text: string,
  opts?: { model?: string; agent?: string; system?: string }
): Promise<OpencodePromptResult> {
  const body: Record<string, unknown> = {
    parts: [{ type: "text", text }],
  };
  if (opts?.model) {
    const [providerID, modelID] = opts.model.includes("/")
      ? opts.model.split("/", 2)
      : ["anthropic", opts.model];
    body.model = { providerID, modelID };
  }
  if (opts?.agent) body.agent = opts.agent;
  if (opts?.system) body.system = opts.system;

  const res = await fetch(`${opencodeBaseUrl()}/session/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`promptSync failed: ${res.status}`);
  return res.json() as Promise<OpencodePromptResult>;
}

/**
 * Envía un prompt asíncrono (fire and forget).
 * El resultado llega por SSE events.
 */
export async function promptAsync(
  sessionId: string,
  text: string,
  opts?: { model?: string; agent?: string; system?: string }
): Promise<void> {
  const body: Record<string, unknown> = {
    parts: [{ type: "text", text }],
  };
  if (opts?.model) {
    const [providerID, modelID] = opts.model.includes("/")
      ? opts.model.split("/", 2)
      : ["anthropic", opts.model];
    body.model = { providerID, modelID };
  }
  if (opts?.agent) body.agent = opts.agent;
  if (opts?.system) body.system = opts.system;

  const res = await fetch(
    `${opencodeBaseUrl()}/session/${sessionId}/prompt_async`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok && res.status !== 204)
    throw new Error(`promptAsync failed: ${res.status}`);
}

// ─── SSE event stream ──────────────────────────────────────────────

export type SSEUnsubscribe = () => void;

/**
 * Suscribe al stream SSE global de eventos.
 * Retorna una función para cancelar la suscripción.
 * Filtra eventos de una sesión concreta.
 */
export function subscribeEvents(
  sessionId: string,
  onEvent: (event: OpencodeEvent) => void
): SSEUnsubscribe {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${opencodeBaseUrl()}/event`, {
        signal: controller.signal,
        headers: authHeaders(),
      });
      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const event = JSON.parse(raw) as OpencodeEvent;
            // Filtrar por sesión si el evento tiene sessionID
            const props = (event as any).properties;
            if (props?.sessionID && props.sessionID !== sessionId) continue;
            onEvent(event);
          } catch {
            // eventos no JSON (keep-alive comments, etc.)
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") console.error("[SSE]", err.message);
    }
  })();

  return () => controller.abort();
}

// ─── Permissions ───────────────────────────────────────────────────

/**
 * Responde a una petición de permiso (permission.asked).
 */
export async function respondPermission(
  sessionId: string,
  permissionId: string,
  response: "allow" | "deny",
  remember?: boolean
): Promise<boolean> {
  const res = await fetch(
    `${opencodeBaseUrl()}/session/${sessionId}/permissions/${permissionId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ response, remember }),
    }
  );
  return res.ok;
}

// ─── Health / Config ───────────────────────────────────────────────

export async function healthCheck(): Promise<{
  healthy: boolean;
  version: string;
}> {
  const res = await fetch(`${opencodeBaseUrl()}/global/health`, {
    headers: authHeaders(),
  });
  return res.json() as Promise<{ healthy: boolean; version: string }>;
}

export async function getProviders(): Promise<unknown> {
  const res = await fetch(`${opencodeBaseUrl()}/config/providers`, {
    headers: authHeaders(),
  });
  return res.json();
}

// ─── Helpers ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
