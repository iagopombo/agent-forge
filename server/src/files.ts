import fsp from 'node:fs/promises';
import path from 'node:path';

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.venv',
  '__pycache__',
  'coverage',
  '.cache',
]);

const MAX_ENTRIES = 4000;
const MAX_FILE_BYTES = 400_000;

export type FileNode = { path: string; size: number };

/** Flat listing of the workspace, minus build output and dependencies. */
export async function listWorkspace(root: string): Promise<FileNode[]> {
  const out: FileNode[] = [];

  async function walk(dir: string): Promise<void> {
    if (out.length >= MAX_ENTRIES) return;
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (out.length >= MAX_ENTRIES) return;
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const stat = await fsp.stat(full).catch(() => null);
        out.push({
          path: path.relative(root, full).split(path.sep).join('/'),
          size: stat?.size ?? 0,
        });
      }
    }
  }

  await walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Reads one workspace file, refusing anything that escapes the root. */
export async function readWorkspaceFile(
  root: string,
  relative: string,
): Promise<{ content: string; truncated: boolean } | null> {
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;

  const stat = await fsp.stat(target).catch(() => null);
  if (!stat?.isFile()) return null;

  const handle = await fsp.open(target, 'r');
  try {
    const length = Math.min(stat.size, MAX_FILE_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, 0);
    return { content: buffer.toString('utf8'), truncated: stat.size > MAX_FILE_BYTES };
  } finally {
    await handle.close();
  }
}
