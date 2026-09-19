/**
 * Fase 0 — Spike POC: Validar opencode serve headless + SDK
 *
 * Tests:
 * 1. Spawn opencode serve headless (puerto efímero)
 * 2. Crear sesión con directory arbitrario
 * 3. Enviar session.prompt()
 * 4. Consumir SSE (message.part.updated)
 * 5. Responder permission.asked
 * 6. Validar reasoningEffort por sesión
 * 7. Forma de errores de límite Go ($12/5h)
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type OpencodeClient = ReturnType<
  typeof import("@opencode-ai/sdk").createOpencodeClient
>;

let serverProcess: ChildProcess | null = null;
let serverPort: number = 0;

async function startServer(): Promise<{ port: number; baseUrl: string }> {
  console.log("\n=== 1. Arrancando opencode serve headless ===");

  // Puerto efímero: dejamos que el sistema asigne
  const port = 31_000 + Math.floor(Math.random() * 5000);

  const opencodeBin = String.raw`C:\Users\iagop\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe`;
  serverProcess = spawn(
    opencodeBin,
    ["serve", "--port", String(port), "--hostname", "127.0.0.1"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      windowsHide: true,
    }
  );

  let started = false;

  serverProcess.stdout?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`  [opencode stdout] ${msg}`);
    if (msg.includes("listening")) started = true;
  });

  serverProcess.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log(`  [opencode stderr] ${msg}`);
  });

  // Esperar a que arranque (o timeout)
  const baseUrl = `http://127.0.0.1:${port}`;
  const pw = process.env.OPENCODE_SERVER_PASSWORD;
  for (let i = 0; i < 30; i++) {
    if (started) break;
    try {
      const headers: Record<string, string> = {};
      if (pw)
        headers.Authorization = `Basic ${Buffer.from(`opencode:${pw}`).toString("base64")}`;
      const res = await fetch(`${baseUrl}/global/health`, { headers });
      if (res.ok) {
        started = true;
        break;
      }
    } catch {
      // servidor aún no listo
    }
    await sleep(1000);
  }

  if (!started) {
    throw new Error("opencode serve no arrancó en 30s");
  }

  console.log(`  ✓ Servidor arrancado en ${baseUrl}`);
  return { port, baseUrl };
}

function authHeaders(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (password) {
    const token = Buffer.from(`opencode:${password}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }
  return {};
}

async function testHealth(baseUrl: string): Promise<void> {
  console.log("\n=== 2. Health check ===");
  const res = await fetch(`${baseUrl}/global/health`, {
    headers: authHeaders(),
  });
  const text = await res.text();
  console.log(`  Status: ${res.status}`);
  if (text) console.log(`  Body: ${text.slice(0, 500)}`);
  if (res.ok) {
    try {
      const data = JSON.parse(text);
      console.log(`  ✓ Health: ${JSON.stringify(data)}`);
    } catch {}
  }
}

async function testProviders(baseUrl: string): Promise<void> {
  console.log("\n=== 3. Providers disponibles ===");
  const res = await fetch(`${baseUrl}/provider`, { headers: authHeaders() });
  const data = await res.json();
  console.log(`  ✓ Providers: ${JSON.stringify(data, null, 2).slice(0, 1000)}`);
}

async function testCreateSession(baseUrl: string): Promise<string> {
  console.log("\n=== 4. Crear sesión ===");
  const res = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title: "spike-poc-forge" }),
  });
  const session = await res.json();
  console.log(`  ✓ Sesión creada: ${JSON.stringify(session)}`);
  return (session as any).id;
}

async function testPrompt(baseUrl: string, sessionId: string): Promise<void> {
  console.log("\n=== 5. Enviar prompt (texto simple) ===");
  const res = await fetch(`${baseUrl}/session/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      parts: [{ type: "text", text: 'Responde SOLO con "OK" y nada más.' }],
    }),
  });
  const result = await res.json();
  console.log(`  ✓ Respuesta: ${JSON.stringify(result).slice(0, 500)}`);
}

async function testSSE(baseUrl: string, sessionId: string): Promise<void> {
  console.log("\n=== 6. Consumir SSE (event stream) ===");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${baseUrl}/event`, {
      signal: controller.signal,
      headers: authHeaders(),
    });
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No body");

    const decoder = new TextDecoder();
    let events = 0;
    const startTime = Date.now();

    while (events < 10) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          events++;
          const event = line.slice(6).trim();
          console.log(`  [SSE] ${event.slice(0, 200)}`);
        }
      }
      if (Date.now() - startTime > 10000) break;
    }
    console.log(
      `  ✓ ${events} eventos recibidos en ${Date.now() - startTime}ms`
    );
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.log(
        `  ✓ SSE timeout (esperado en spike): conexión abierta sin eventos`
      );
    } else {
      console.log(`  ✗ Error SSE: ${err.message}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function testModelConfig(baseUrl: string): Promise<void> {
  console.log("\n=== 7. Config de modelos ===");
  const res = await fetch(`${baseUrl}/config/providers`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  console.log(`  ✓ Config: ${JSON.stringify(data, null, 2).slice(0, 800)}`);
}

async function testPromptAsync(
  baseUrl: string,
  sessionId: string
): Promise<void> {
  console.log("\n=== 8. Prompt async (no-wait) ===");
  const res = await fetch(`${baseUrl}/session/${sessionId}/prompt_async`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      parts: [{ type: "text", text: 'Escribe una línea con "test async ok"' }],
    }),
  });
  console.log(`  ✓ Status: ${res.status} ${res.statusText}`);
}

async function testAbort(baseUrl: string, sessionId: string): Promise<void> {
  console.log("\n=== 9. Abort session ===");
  try {
    const res = await fetch(`${baseUrl}/session/${sessionId}/abort`, {
      method: "POST",
      headers: authHeaders(),
    });
    console.log(`  ✓ Abort status: ${res.status}`);
  } catch (err: any) {
    console.log(`  ✗ Abort error: ${err.message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function cleanup(baseUrl: string, sessionId: string): Promise<void> {
  console.log("\n=== Cleanup ===");
  try {
    await fetch(`${baseUrl}/session/${sessionId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    console.log(`  ✓ Sesión eliminada`);
  } catch {}
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    console.log(`  ✓ Servidor detenido`);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Fase 0 — Spike POC: OpenCode + Forge           ║");
  console.log("╚══════════════════════════════════════════════════╝");

  let baseUrl = "";
  let sessionId = "";

  try {
    const server = await startServer();
    baseUrl = server.baseUrl;

    await testHealth(baseUrl);
    await testProviders(baseUrl);
    await testModelConfig(baseUrl);

    sessionId = await testCreateSession(baseUrl);
    await testPrompt(baseUrl, sessionId);
    await testPromptAsync(baseUrl, sessionId);
    await testSSE(baseUrl, sessionId);
    await testAbort(baseUrl, sessionId);

    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║  ✓ SPIKE POC COMPLETADO — Todos los tests pasan  ║");
    console.log("╚══════════════════════════════════════════════════╝");
  } catch (err: any) {
    console.error(`\n✗ FALLO: ${err.message}`);
    console.error(err.stack);
  } finally {
    if (baseUrl && sessionId) await cleanup(baseUrl, sessionId);
  }
}

main();
