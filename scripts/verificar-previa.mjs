/* Garante que a previa hospedada continua sendo o mesmo programa que o arquivo
 * entregue ao escritorio.
 *
 * A previa passa por uma transformacao: os ~51 mil U+FFFD literais das tabelas
 * de code page do SheetJS viram o escape �, porque hospedagem recusa o
 * caractere cru. Em JavaScript os dois sao o mesmo caractere — mas so dentro de
 * string ou de regex. Se alguma ocorrencia estivesse em outro contexto, o escape
 * mudaria o codigo em silencio, e e exatamente isso que esta checagem pega:
 * carrega os dois arquivos, remonta as tabelas em memoria e compara.
 */
import { chromium } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf8"));

async function assinatura(page, arquivo) {
  await page.goto(pathToFileURL(resolve(raiz, "dist", arquivo)).href);
  await page.waitForFunction(() => typeof XLSX !== "undefined");
  return page.evaluate(() => {
    const cp = typeof cptable !== "undefined" ? cptable : (XLSX.cptable || null);
    const ids = cp ? Object.keys(cp).filter((k) => /^\d+$/.test(k)).sort() : [];
    const tabelas = ids.map((id) => `${id}:${(cp[id].dec || []).join("")}`).join("|");
    /* soma de verificacao, para nao trafegar megabytes de volta */
    let h = 0;
    for (let i = 0; i < tabelas.length; i++) h = (h * 31 + tabelas.charCodeAt(i)) >>> 0;
    return { versao: XLSX.version, codepages: ids.length, tamanho: tabelas.length, hash: h };
  });
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
const entregue = await assinatura(pagina, `gerador_importacao_v${version.split(".")[0]}.html`);
const previa = await assinatura(pagina, "artifact.html");
await navegador.close();

console.log(`  entregue  SheetJS ${entregue.versao} · ${entregue.codepages} code pages · hash ${entregue.hash}`);
console.log(`  previa    SheetJS ${previa.versao} · ${previa.codepages} code pages · hash ${previa.hash}`);

if (!entregue.codepages) {
  console.error("\nnao alcancei as tabelas de code page — esta checagem nao provou nada.");
  process.exit(1);
}
if (entregue.hash !== previa.hash || entregue.tamanho !== previa.tamanho ||
    entregue.versao !== previa.versao) {
  console.error("\na previa divergiu do arquivo entregue.");
  process.exit(1);
}
console.log("\n  a previa e o mesmo programa do arquivo entregue.");
