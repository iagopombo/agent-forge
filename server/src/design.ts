import path from "node:path";
import { screenshotHtmlFile } from "./screenshot.js";

function isInside(workspace: string, target: string): boolean {
  const rel = path.relative(workspace, path.resolve(workspace, target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Request payload for /internal/design endpoint.
 */
export type DesignRequest = {
  workspace: string;
  archivo_html: string;
  mensaje: string;
};

/**
 * Validates a design request payload.
 * Returns null if valid, or an error message if invalid.
 */
export function validateDesignRequest(payload: unknown): string | null {
  const req = payload as DesignRequest;
  if (!req || typeof req !== "object") return "Payload inválido";
  if (typeof req.workspace !== "string" || req.workspace.length === 0) {
    return "workspace es requerido";
  }
  if (typeof req.archivo_html !== "string" || req.archivo_html.length === 0) {
    return "archivo_html es requerido";
  }
  if (typeof req.mensaje !== "string" || req.mensaje.length === 0) {
    return "mensaje es requerido";
  }
  if (!isInside(req.workspace, path.resolve(req.workspace, req.archivo_html))) {
    return "La ruta debe estar dentro del workspace";
  }
  return null;
}

/**
 * Takes a screenshot of an HTML file and returns the base64 image.
 */
export async function captureDesign(
  workspace: string,
  archivoHtml: string
): Promise<{ ok: boolean; image?: string; error?: string }> {
  const absolute = path.resolve(workspace, archivoHtml);
  if (!isInside(workspace, absolute)) {
    return { ok: false, error: "La ruta debe estar dentro del workspace." };
  }

  try {
    const image = await screenshotHtmlFile(absolute);
    return { ok: true, image };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `No se pudo capturar "${archivoHtml}": ${detail}. Comprueba que el archivo existe y es HTML válido autocontenido.`,
    };
  }
}
