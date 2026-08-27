import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const isWindows = process.platform === 'win32';

export type ProcInfo = { pid: number; name: string };

/**
 * Procesos que el SDK lanza para hacer de agente. Sirve para distinguir al hijo
 * de verdad del `powershell` que estas mismas funciones usan para preguntarle
 * al sistema quién es hijo de quién.
 */
export const AGENT_PROCESS = /^(claude|node|bun)(\.exe)?$/i;

/** Tabla `pid -> {ppid, name}` de todo lo que corre ahora mismo. */
async function processTable(): Promise<Map<number, { ppid: number; name: string }>> {
  const table = new Map<number, { ppid: number; name: string }>();
  let stdout = '';
  try {
    if (isWindows) {
      ({ stdout } = await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.Name)" }',
        ],
        { windowsHide: true, timeout: 15_000, maxBuffer: 1 << 24 },
      ));
    } else {
      ({ stdout } = await run('ps', ['-eo', 'pid=,ppid=,comm='], {
        timeout: 15_000,
        maxBuffer: 1 << 24,
      }));
    }
  } catch {
    // Sin permisos, sin `ps`, o el sistema tardó demasiado: quien llama sigue.
    return table;
  }

  for (const line of stdout.split(/\r?\n/)) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    table.set(Number(m[1]), { ppid: Number(m[2]), name: basename(m[3]!.trim()) });
  }
  return table;
}

function basename(command: string): string {
  return command.split(/[/\\]/).pop() ?? command;
}

/** Hijos directos de un proceso. Lista vacía si no se pudo averiguar. */
export async function childProcesses(pid: number): Promise<ProcInfo[]> {
  const table = await processTable();
  const kids: ProcInfo[] = [];
  for (const [child, info] of table) {
    if (info.ppid === pid) kids.push({ pid: child, name: info.name });
  }
  return kids;
}

/**
 * Mata un proceso y toda su descendencia. Mejor esfuerzo: si el proceso ya
 * había muerto, o el sistema no deja mirar, no pasa nada.
 */
export async function killTree(pid: number): Promise<void> {
  if (isWindows) {
    // `/T` es justo lo que falta al abortar: baja por el árbol y se lleva
    // también las shells que el agente hubiera dejado corriendo.
    try {
      await run('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        timeout: 15_000,
      });
    } catch {
      /* el proceso ya no existía */
    }
    return;
  }

  // De las hojas a la raíz, para que un padre no reponga a un hijo al morir.
  const table = await processTable();
  const order: number[] = [];
  const collect = (parent: number) => {
    for (const [child, info] of table) {
      if (info.ppid === parent && !order.includes(child)) {
        collect(child);
        order.push(child);
      }
    }
  };
  collect(pid);
  order.push(pid);

  for (const victim of order) {
    try {
      process.kill(victim, 'SIGKILL');
    } catch {
      /* ya no existe */
    }
  }
}
