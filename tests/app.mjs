/* Carrega o arquivo unico ja montado pelo build — e exatamente o que o
 * escritorio abre, entao um teste que passa aqui vale para o uso real. */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf8"));

export const ARQUIVO = resolve(raiz, "dist", `gerador_importacao_v${version.split(".")[0]}.html`);
export const URL_APP = pathToFileURL(ARQUIVO).href;

/** Abre o app e espera as bibliotecas embutidas registrarem seus globais. */
export async function abrirApp(page) {
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto(URL_APP);
  await page.waitForFunction(
    () => typeof XLSX !== "undefined" && typeof pdfjsLib !== "undefined",
  );
  return erros;
}
