import path from 'node:path';
import { z } from 'zod';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { screenshotHtmlFile } from './screenshot.js';

function isInside(workspace: string, target: string): boolean {
  const rel = path.relative(workspace, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Herramienta in-process del agente de diseño: enseña una captura de una
 * pantalla del mockup (HTML dentro del workspace) y espera el feedback del
 * usuario. Bloquea la fase, igual que `preguntar_al_usuario` de `ask.ts`, pero
 * pensada para iterar en bucle en vez de una sola pregunta de alcance —
 * el agente la llama una vez por pantalla y otra vez por cada ronda de
 * cambios, hasta que el usuario aprueba.
 */
export function buildDesignServer(
  workspace: string,
  askWithImage: (question: string, options: string[], image: string) => Promise<string>,
) {
  return createSdkMcpServer({
    name: 'forge',
    version: '1.0.0',
    tools: [
      tool(
        'mostrar_diseno',
        [
          'Enseña al usuario una captura de una pantalla del diseño actual y espera su',
          'respuesta. El archivo tiene que ser un HTML autocontenido (CSS inline o en',
          '<style>, sin peticiones a internet) dentro del workspace. Llámala cada vez',
          'que termines o cambies una pantalla, y sigue iterando con lo que responda',
          'hasta que la apruebe explícitamente. No pases a la siguiente pantalla sin',
          'que la actual esté aprobada.',
        ].join(' '),
        {
          archivo_html: z
            .string()
            .min(1)
            .describe('Ruta al HTML dentro del workspace, p. ej. "design/pantallas/feed.html".'),
          mensaje: z.string().min(1).describe('Qué le enseñas o qué le preguntas sobre este diseño.'),
        },
        async ({ archivo_html, mensaje }) => {
          const absolute = path.resolve(workspace, archivo_html);
          if (!isInside(workspace, absolute)) {
            return {
              content: [{ type: 'text' as const, text: 'Error: la ruta debe estar dentro del workspace.' }],
            };
          }

          let image: string;
          try {
            image = await screenshotHtmlFile(absolute);
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `No se pudo capturar "${archivo_html}": ${detail}. Comprueba que el archivo existe y es HTML válido autocontenido.`,
                },
              ],
            };
          }

          const answer = await askWithImage(
            mensaje,
            ['Apruébalo, sigue con esto', 'Quiero pedir cambios (lo explico abajo)'],
            image,
          );
          return { content: [{ type: 'text' as const, text: answer }] };
        },
      ),
    ],
  });
}
