import path from 'node:path';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { ForgeEventInput, PhaseId } from './events.js';

/**
 * Commands that are never appropriate for a code-generating agent working in a
 * scratch workspace: destructive to the host, or outward-facing (they publish
 * something to the internet on the user's behalf).
 */
const FORBIDDEN_COMMANDS: Array<{ re: RegExp; why: string }> = [
  { re: /\brm\s+(-[a-z]*\s+)*-?[a-z]*[rf][a-z]*\s+(\/|~|[A-Za-z]:\\)(\s|$)/i, why: 'borrado recursivo fuera del workspace' },
  { re: /\brm\s+(-[a-z]*\s+)*-?[a-z]*[rf][a-z]*\s+[^|;&]*\.\.[/\\]/i, why: 'borrado recursivo con una ruta que sale del workspace' },
  // `format` a secas es demasiado ancho: bloqueaba `--format=...` y hasta un
  // archivo llamado format.ts. Solo cuenta cuando apunta a una unidad o trae
  // los modificadores del comando de Windows.
  { re: /\b(mkfs(\.\w+)?|fdisk|diskpart)\b|\bformat\s+([A-Za-z]:|\/[a-z])/i, why: 'operación de disco' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, why: 'apagado del sistema' },
  { re: /\bsudo\b|\bsu\s+-\b/i, why: 'escalada de privilegios' },
  {
    // Cualquier intérprete al otro lado de la tubería, no solo sh. El lookahead
    // exime las descargas de localhost: `curl localhost:3000/api | node -e ...`
    // es una app probándose a sí misma, no traer código de internet y correrlo.
    re: /\b(curl|wget|iwr|Invoke-WebRequest)\b(?![^|;&]*(?:\/\/|@|\s)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/\s?]|$))[^|;&]*\|\s*(sudo\s+)?((ba|z|k)?sh|python3?|node|perl|ruby|pwsh|powershell)\b/i,
    why: 'ejecución de script remoto',
  },
  { re: /Invoke-Expression|\biex\b/i, why: 'ejecución dinámica de código' },
  // `git -C .. push` y `git --git-dir=x push` cuentan igual que `git push`. Solo
  // opciones entre medias, para no bloquear `git commit -m "push del viernes"`.
  { re: /\bgit\s+(-\S+\s+|(?<=-[A-Za-z]\s)\S+\s+)*push\b/i, why: 'publicación en remoto' },
  { re: /\bgh\s+(pr|release|repo)\s+(create|edit)\b/i, why: 'publicación en GitHub' },
  { re: /\b(npm|pnpm|yarn)\s+publish\b/i, why: 'publicación de paquete' },
  { re: /\bdocker\s+push\b/i, why: 'publicación de imagen' },
  { re: /\b(vercel|netlify|fly|railway)\s+(deploy|launch)\b/i, why: 'despliegue en producción' },
  { re: /\bnetsh\b|\biptables\b|\bufw\b/i, why: 'cambio de firewall' },
  { re: /\breg\s+(add|delete)\b|Set-ItemProperty\s+-Path\s+HK/i, why: 'cambio en el registro de Windows' },
];

/**
 * Todo lo que una fase puede necesitar de verdad. Todo lo demás se deniega,
 * venga de donde venga (herramienta nativa, MCP de la sesión que lanzó el
 * proceso, un conector de la cuenta) — ver el aviso en `buildGuard` más abajo
 * sobre por qué esto no puede ser una lista de bloqueo.
 */
const ALLOWED_TOOLS = new Set([
  'Bash',
  'Write',
  'Edit',
  'Read',
  'Glob',
  'Grep',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'Task',
  'TodoWrite',
  'Skill',
]);

/** El MCP propio de Agent Forge (preguntar_al_usuario) siempre lleva este prefijo. */
const OWN_MCP_PREFIX = 'mcp__forge__';

function isAllowedTool(name: string): boolean {
  return ALLOWED_TOOLS.has(name) || name.startsWith(OWN_MCP_PREFIX);
}

/** Tools whose input names a file we must keep inside the workspace. */
const PATH_INPUTS: Record<string, string[]> = {
  Write: ['file_path'],
  Edit: ['file_path'],
  NotebookEdit: ['notebook_path'],
  Read: ['file_path'],
};

function isInside(workspace: string, target: string): boolean {
  const rel = path.relative(workspace, path.resolve(workspace, target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Short human-readable label for a tool call, for the activity feed. */
export function summarizeTool(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : undefined);
  switch (name) {
    case 'Bash':
      return s('command')?.slice(0, 300) ?? '';
    case 'Write':
    case 'Edit':
    case 'Read':
      return s('file_path') ?? '';
    case 'Glob':
    case 'Grep':
      return s('pattern') ?? '';
    case 'Task':
      return s('description') ?? s('subagent_type') ?? '';
    case 'WebFetch':
      return s('url') ?? '';
    case 'WebSearch':
      return s('query') ?? '';
    case 'TodoWrite': {
      const todos = input.todos;
      return Array.isArray(todos) ? `${todos.length} tareas` : '';
    }
    default: {
      const first = Object.values(input).find((v) => typeof v === 'string') as string | undefined;
      return first?.slice(0, 200) ?? '';
    }
  }
}

/**
 * Permission callback. With `permissionMode: 'default'` and no `allowedTools`,
 * every tool call reaches this function. Denials are advisory to the agent: it
 * sees el mensaje y puede elegir otro enfoque.
 *
 * Lo que estos patrones NO cubren: Bash puede cambiar de directorio, así que un
 * `cd .. && rm -rf otra-cosa` pasa. El aislamiento fuerte sería un contenedor;
 * esto es un cinturón de seguridad, no una cárcel.
 *
 * ALLOWED_TOOLS deniega por defecto en vez de bloquear una lista conocida.
 * Motivo real, no preventivo: el proceso hijo que lanza `query()` puede acabar
 * viendo herramientas ajenas al pipeline (MCP conectados a la cuenta que
 * autentica al proceso, plugins/skills instalados globalmente en la máquina
 * donde corre el servidor) — nada de eso pasa por `settingSources`, y una lista
 * de bloqueo tendría que conocer de antemano el conector de turno. Denegar por
 * defecto no depende de acertar cuál es la fuga de hoy.
 */
export function buildGuard(
  workspace: string,
  phase: () => PhaseId,
  emit: (e: ForgeEventInput) => void,
): CanUseTool {
  return async (toolName, input): Promise<PermissionResult> => {
    const deny = (reason: string): PermissionResult => {
      emit({ t: 'denied', phase: phase(), name: toolName, reason });
      return {
        behavior: 'deny',
        message: `Bloqueado por Agent Forge: ${reason}. Trabaja solo dentro del workspace y sin acciones hacia el exterior.`,
      };
    };

    if (!isAllowedTool(toolName)) {
      return deny(`herramienta fuera de lo que necesita este pipeline (${toolName})`);
    }

    for (const key of PATH_INPUTS[toolName] ?? []) {
      const value = input[key];
      if (typeof value === 'string' && !isInside(workspace, value)) {
        return deny(`ruta fuera del workspace (${value})`);
      }
    }

    if (toolName === 'Bash') {
      const command = typeof input.command === 'string' ? input.command : '';
      const hit = FORBIDDEN_COMMANDS.find((f) => f.re.test(command));
      if (hit) return deny(hit.why);
    }

    return { behavior: 'allow', updatedInput: input };
  };
}
