/* Confere que src/vendor/ continua sendo a biblioteca publicada, sem alteracao.
 *
 * O programa roda offline, dentro da rede do escritorio, mexendo em dado de
 * folha — e carrega as bibliotecas embutidas no proprio HTML, onde uma linha
 * enxertada passaria despercebida para sempre. Os hashes abaixo sao dos
 * arquivos oficiais do npm, conferidos byte a byte.
 *
 *   npm run verify
 *
 * Para revalidar do zero, sem confiar nesta lista:
 *   npm pack xlsx@0.18.5 pdfjs-dist@3.11.174
 *   e comparar com dist/xlsx.full.min.js e legacy/build/pdf*.min.js
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const OFICIAIS = [
  { arquivo: "xlsx.full.min.js",
    origem: "xlsx@0.18.5 › dist/xlsx.full.min.js",
    sha256: "c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99" },
  { arquivo: "pdf.min.js",
    origem: "pdfjs-dist@3.11.174 › legacy/build/pdf.min.js",
    sha256: "978fd1b2d134a98e98966186a97777bebf87d8e770dadab1ece3687e21a5aa6c" },
  { arquivo: "pdf.worker.min.js",
    origem: "pdfjs-dist@3.11.174 › legacy/build/pdf.worker.min.js",
    sha256: "38cde5311957b86bc3669f93e7d2566de333a90055ed6635bef60d9bf00e96f2" },
];

let divergiu = false;

for (const { arquivo, origem, sha256 } of OFICIAIS) {
  const bytes = await readFile(resolve(raiz, "src/vendor", arquivo));
  const achado = createHash("sha256").update(bytes).digest("hex");
  const bate = achado === sha256;
  divergiu ||= !bate;

  console.log(`  ${bate ? "ok  " : "NAO "} ${arquivo.padEnd(20)} ${origem}`);
  if (!bate) console.log(`       esperado ${sha256}\n       achado   ${achado}`);
}

if (divergiu) {
  console.error("\nsrc/vendor/ nao confere com a biblioteca publicada.");
  process.exit(1);
}
console.log("\n  as tres bibliotecas sao as publicadas, sem alteracao.");
