import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';

/**
 * Captura un HTML local con Chrome headless y la devuelve como PNG en base64
 * (data URL, lista para meter en un <img src>). Usa el Chrome del sistema
 * (`channel: 'chrome'`) en vez de un Chromium propio — igual que
 * `.claude/skills/run-agent-forge`, sin descarga extra de navegador.
 *
 * Lanza y cierra el navegador en cada llamada a propósito: la fase de diseño
 * espera minutos a que el usuario responda entre captura y captura, así que
 * mantener un navegador abierto no ahorra nada que importe frente al riesgo
 * de dejarlo colgado si algo falla a medio camino.
 */
export async function screenshotHtmlFile(absolutePath: string): Promise<string> {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(pathToFileURL(absolutePath).href, { waitUntil: 'networkidle', timeout: 15_000 });
    const buffer = await page.screenshot({ fullPage: true });
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } finally {
    await browser.close();
  }
}
