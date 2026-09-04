import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { FileNode } from '../types';

/**
 * `touched` son las rutas que alguien ha escrito en esta sesión —los agentes,
 * la consola, o ambos—. Se usa para marcarlas y, porque su tamaño cambia con
 * cada escritura, como señal para releer el árbol: así lo que hace la consola
 * aparece aquí en directo.
 */
type Props = { runId: string; touched: Map<string, unknown> };

export function FilesPanel({ runId, touched }: Props) {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<{ content: string; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const touchedCount = touched.size;

  // Re-list when the agents report new writes, and while the run is live.
  useEffect(() => {
    let cancelled = false;
    api
      .listFiles(runId)
      .then((list) => !cancelled && setFiles(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [runId, touchedCount]);

  useEffect(() => {
    if (!selected) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setError(null);
    api
      .readFile(runId, selected)
      .then((body) => !cancelled && setContent(body))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [runId, selected, touchedCount]);

  const grouped = useMemo(() => groupByDirectory(files), [files]);

  return (
    <section className="files">
      <header className="files-head">
        <h2>Workspace</h2>
        <span className="pill">{files.length} archivos</span>
      </header>

      <div className="files-split">
        <div className="files-tree">
          {files.length === 0 && <p className="empty">Todavía no hay archivos.</p>}
          {grouped.map(([dir, entries]) => (
            <div key={dir} className="files-group">
              <h3>{dir}</h3>
              {entries.map((file) => {
                return (
                  <button
                    key={file.path}
                    type="button"
                    className={`files-item ${selected === file.path ? 'is-selected' : ''} ${
                      touched.has(file.path) ? 'is-touched' : ''
                    }`}
                    onClick={() => setSelected(file.path)}
                    title={file.path}
                  >
                    <span className="files-name">{basename(file.path)}</span>
                    <span className="files-size">{formatSize(file.size)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="files-view">
          {!selected && <p className="empty">Elige un archivo para verlo.</p>}
          {error && <p className="empty is-error">{error}</p>}
          {selected && content && (
            <>
              <div className="files-view-head">
                <code>{selected}</code>
                {content.truncated && <span className="pill is-warn">truncado</span>}
              </div>
              <pre className="code">{content.content}</pre>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function groupByDirectory(files: FileNode[]): Array<[string, FileNode[]]> {
  const map = new Map<string, FileNode[]>();
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const dir = slash === -1 ? '.' : file.path.slice(0, slash);
    const list = map.get(dir);
    if (list) list.push(file);
    else map.set(dir, [file]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function basename(p: string): string {
  const slash = p.lastIndexOf('/');
  return slash === -1 ? p : p.slice(slash + 1);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
