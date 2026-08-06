/* Sobe o servidor do acervo com um banco descartavel, para os testes de
   navegador. Apaga o banco antes de subir: cada rodada comeca do zero, senao o
   teste passa por causa do estado da rodada anterior. */
import { rmSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const banco = resolve(raiz, "test-results", "acervo-de-teste.db");

mkdirSync(dirname(banco), { recursive: true });
for (const sufixo of ["", "-wal", "-shm"]) rmSync(banco + sufixo, { force: true });

process.env.ACERVO_BANCO = banco;
process.env.ACERVO_PORTA = process.env.ACERVO_PORTA || "4174";
process.env.ACERVO_PUBLICO = resolve(raiz, "src");

await import("../servidor/servidor.mjs");
