/* Remonta o arquivo unico que o escritorio usa.
 *
 * Em desenvolvimento o app vive em src/index.html e carrega as bibliotecas
 * de vendor/ como arquivos separados — assim cada edicao mexe em 280 KB e nao
 * em 2,6 MB. O build volta a embuti-las, porque o programa roda offline, de
 * dentro de uma pasta de rede, e precisa continuar sendo um arquivo so.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...partes) => resolve(raiz, ...partes);

/* <script src="vendor/x.js"></script> — com ou sem atributos depois do src */
const TAG_VENDOR = /^[ \t]*<script src="vendor\/([^"]+)"[^>]*><\/script>[ \t]*\r?\n/gm;

/* o comentario que explica o carregamento em desenvolvimento nao faz sentido
   no arquivo entregue, onde nao ha mais o que carregar */
const NOTA_DEV = /^[ \t]*<!-- Bibliotecas de terceiros\.[\s\S]*?-->[ \t]*\r?\n/m;

async function build() {
  const { version } = JSON.parse(await readFile(p("package.json"), "utf8"));
  const fonte = await readFile(p("src/index.html"), "utf8");

  const embutidos = [];
  const partes = [];
  let fim = 0;

  /* replace() com string trocaria $& e $1 que aparecem no codigo minificado;
     por isso a substituicao e feita na mao, concatenando os pedacos */
  for (const m of fonte.matchAll(TAG_VENDOR)) {
    const nome = m[1];
    const codigo = await readFile(p("src/vendor", nome), "utf8");
    partes.push(fonte.slice(fim, m.index), "<script>\n", codigo.trimEnd(), "\n</script>\n");
    fim = m.index + m[0].length;
    embutidos.push({ nome, bytes: codigo.length });
  }
  partes.push(fonte.slice(fim));

  if (!embutidos.length) {
    throw new Error("nenhuma tag <script src=\"vendor/...\"> encontrada em src/index.html");
  }

  const saida = partes.join("").replace(NOTA_DEV, "");
  if (/<script src="vendor\//.test(saida)) {
    throw new Error("sobrou referencia a vendor/ no arquivo gerado");
  }

  const destino = p("dist", `gerador_importacao_v${version.split(".")[0]}.html`);
  await mkdir(dirname(destino), { recursive: true });
  await writeFile(destino, saida, "utf8");

  const artefato = p("dist", "artifact.html");
  const previa = paraArtifact(saida);
  await writeFile(artefato, previa, "utf8");

  const kb = (n) => (n / 1024).toFixed(0).padStart(6) + " KB";
  for (const { nome, bytes } of embutidos) console.log(`  embutido ${kb(bytes)}  ${nome}`);
  console.log(`  gerado   ${kb(saida.length)}  ${destino.slice(raiz.length + 1)}`);
  console.log(`  gerado   ${kb(previa.length)}  ${artefato.slice(raiz.length + 1)} (previa hospedada)`);
}

/* O SheetJS traz ~51 mil U+FFFD literais dentro das tabelas de code page: sao as
 * posicoes daquele code page que nao tem correspondencia em Unicode, e a propria
 * biblioteca as marca assim. Hospedagem costuma ler U+FFFD como sinal de arquivo
 * mal decodificado e recusar o envio, entao na previa o caractere vira o escape
 * \\ufffd — em JavaScript os dois produzem exatamente o mesmo caractere, dentro de
 * string ou de regex. O arquivo entregue ao escritorio nao passa por aqui: ele
 * continua byte a byte igual a biblioteca publicada no npm. */
const escaparFFFD = (s) => s.replaceAll("�", "\\ufffd");

/* A previa publicada entra dentro de um esqueleto HTML pronto, entao o conteudo
 * vai sem as tags externas — <title> e <style> ficam, porque o publicador os
 * remonta no <head> dele. O charset tambem e dele; o viewport sai junto.
 * A classe do <body> nao se perde: trocarModulo() a reescreve na partida. */
function paraArtifact(html) {
  return escaparFFFD(html)
    .replace(/^<!DOCTYPE html>\s*\r?\n/i, "")
    .replace(/^<html[^>]*>\s*\r?\n/im, "")
    .replace(/^<head>\s*\r?\n/im, "")
    .replace(/^[ \t]*<meta[^>]*>[ \t]*\r?\n/gim, "")
    .replace(/^<\/head>\s*\r?\n/im, "")
    .replace(/^<body[^>]*>\s*\r?\n/im, "")
    .replace(/\s*<\/body>\s*<\/html>\s*$/i, "\n");
}

build().catch((e) => {
  console.error("falhou:", e.message);
  process.exit(1);
});
