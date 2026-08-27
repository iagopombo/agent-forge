import { z } from 'zod';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

/**
 * Herramienta in-process que le da al agente de producto una vía para preguntar
 * al usuario cuando una duda de alcance cambia el producto. Bloquea la fase: el
 * handler no resuelve hasta que llega la respuesta desde la interfaz.
 *
 * El agente propone exactamente 3 opciones; la interfaz añade una cuarta libre
 * para que el usuario escriba lo que quiera. Al agente le llega el texto elegido.
 */
export function buildAskServer(ask: (question: string, options: string[]) => Promise<string>) {
  return createSdkMcpServer({
    name: 'forge',
    version: '1.0.0',
    tools: [
      tool(
        'preguntar_al_usuario',
        [
          'Hazle al usuario UNA pregunta de alcance cuando una decisión cambie de',
          'verdad el producto y no puedas resolverla razonablemente tú solo. Da',
          'exactamente 3 opciones concretas y excluyentes; la interfaz añade una',
          'cuarta para que el usuario escriba una respuesta libre. La herramienta',
          'espera y te devuelve la respuesta elegida. Úsala con moderación: solo',
          'para bifurcaciones importantes, no para detalles que puedas asumir.',
        ].join(' '),
        {
          pregunta: z.string().min(10).describe('La pregunta, clara y concreta.'),
          opciones: z
            .array(z.string().min(1))
            .length(3)
            .describe('Exactamente 3 opciones concretas y excluyentes.'),
        },
        async ({ pregunta, opciones }) => {
          const answer = await ask(pregunta, opciones);
          return { content: [{ type: 'text' as const, text: answer }] };
        },
      ),
    ],
  });
}
