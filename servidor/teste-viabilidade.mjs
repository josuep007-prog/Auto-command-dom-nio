/* Fase 0 — prova de viabilidade. Nao faz parte do programa; existe para
 * responder, na maquina real do escritorio, tres perguntas que nenhuma
 * suposicao resolve:
 *
 *   1. o Node portatil roda sem privilegio de administrador?
 *   2. o banco embutido (node:sqlite) funciona nesta maquina?
 *   3. OUTRO computador do escritorio consegue alcancar esta porta?
 *
 * A terceira e a que decide. Se o Firewall barrar e nao houver como liberar,
 * o servidor local nao entrega cadastro compartilhado, e a escolha volta a ser
 * nuvem ou uma maquina administrada pela TI.
 *
 * Uso:  node servidor/teste-viabilidade.mjs
 *
 * Zero dependencias, de proposito: e assim que o servidor de verdade sera.
 */
import { createServer } from "node:http";
import { hostname, networkInterfaces, tmpdir } from "node:os";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/* O Node marca o node:sqlite como "experimental" e imprime um aviso em ingles
   no meio da saida. Trocamos por uma linha nossa: o alerta e sobre a interface
   de programacao poder mudar entre versoes do Node, nao sobre o banco perder
   dado — por baixo e o mesmo SQLite de sempre. */
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.name !== "ExperimentalWarning") console.warn(w);
});

const PORTA = Number(process.env.PORTA || 8080);
const NOME = hostname();

/* ---- 1. o basico ---- */
console.log(`\n  Node ${process.version} em ${process.platform} ${process.arch}`);
console.log(`  maquina: ${NOME}\n`);

/* ---- 2. escrita em disco e banco embutido ---- */
let bancoOk = false;
let bancoErro = "";
try {
  const { DatabaseSync } = await import("node:sqlite");
  const arquivo = join(tmpdir(), `teste-acervo-${process.pid}.db`);
  const db = new DatabaseSync(arquivo);
  db.exec("CREATE TABLE t (a TEXT)");
  db.prepare("INSERT INTO t VALUES (?)").run("funciona");
  const lido = db.prepare("SELECT a FROM t").get();
  db.close();
  unlinkSync(arquivo);
  bancoOk = lido.a === "funciona";
} catch (e) {
  bancoErro = e.message;
}
console.log(bancoOk
  ? "  [ok]   banco embutido (node:sqlite) grava e le nesta maquina\n"
    + "         o Node marca essa peca como experimental: quer dizer que a forma\n"
    + "         de chama-la pode mudar em versoes futuras, nao que o dado corra risco"
  : `  [FALHA] banco embutido: ${bancoErro}`);

/* pasta do proprio programa precisa aceitar escrita: e onde o acervo.db moraria */
let escritaOk = false;
try {
  const teste = join(process.cwd(), ".teste-escrita.tmp");
  writeFileSync(teste, "x");
  unlinkSync(teste);
  escritaOk = true;
} catch (e) {
  console.log(`  [FALHA] nao consigo gravar na pasta atual: ${e.message}`);
}
if (escritaOk) console.log("  [ok]   a pasta atual aceita escrita");

/* ---- 3. enderecos por onde as outras maquinas podem chegar ---- */
const enderecos = [];
for (const [nome, lista] of Object.entries(networkInterfaces())) {
  for (const i of lista || []) {
    if (i.family === "IPv4" && !i.internal) enderecos.push({ nome, ip: i.address });
  }
}

const visitas = [];

const servidor = createServer((req, res) => {
  const de = req.socket.remoteAddress?.replace(/^::ffff:/, "") || "?";
  const quando = new Date().toLocaleTimeString("pt-BR");
  visitas.push({ de, quando });
  console.log(`  >> acesso de ${de} as ${quando}   (total: ${visitas.length})`);

  const outras = visitas.filter((v) => !/^127\.|^::1$/.test(v.de));
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8">
<title>Teste de viabilidade</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.5rem;
      line-height:1.6;color:#0F1922}
 h1{font-size:1.6rem;letter-spacing:-.02em}
 .ok{color:#1B6E4B;font-weight:700}
 code{background:#EBF0F5;padding:.1rem .4rem;border-radius:4px;font-size:.9em}
 table{border-collapse:collapse;margin-top:1rem;font-size:.95rem}
 td,th{text-align:left;padding:.35rem .9rem .35rem 0;border-bottom:1px solid #DCE3EB}
</style>
<h1>Chegou. <span class="ok">O servidor respondeu.</span></h1>
<p>Este navegador acessou a maquina <code>${NOME}</code> pelo endereco
   <code>${req.headers.host || "?"}</code>.</p>
<p>Voce esta conectando de <code>${de}</code>.</p>
${outras.length
  ? `<p class="ok">Ja houve acesso de outra maquina da rede — o Firewall nao esta barrando.
     E isso que a Fase 0 precisava provar.</p>`
  : `<p>Ainda so houve acesso local. Abra este mesmo endereco <b>de outro computador
     do escritorio</b> — e esse o teste que decide.</p>`}
<table><tr><th>De</th><th>Quando</th></tr>
${visitas.slice(-10).reverse().map((v) => `<tr><td>${v.de}</td><td>${v.quando}</td></tr>`).join("")}
</table>
<p style="margin-top:2rem;color:#657586;font-size:.9rem">
  Para encerrar, volte ao terminal e pressione Ctrl+C.</p>`);
});

servidor.on("error", (e) => {
  console.log(`\n  [FALHA] nao consegui escutar na porta ${PORTA}: ${e.code}`);
  if (e.code === "EADDRINUSE") console.log("  a porta ja esta ocupada — tente PORTA=8081");
  if (e.code === "EACCES") console.log("  sem permissao para esta porta — use uma acima de 1024");
  process.exit(1);
});

/* 0.0.0.0 so aqui: e o unico jeito de a outra maquina alcancar, que e o teste.
   O servidor de verdade se prende so a interface da rede local. */
servidor.listen(PORTA, "0.0.0.0", () => {
  console.log(`  [ok]   escutando na porta ${PORTA}\n`);
  console.log("  Abra no navegador DESTA maquina:");
  console.log(`      http://localhost:${PORTA}\n`);
  console.log("  E agora o teste que decide — abra DE OUTRO COMPUTADOR do escritorio:");
  console.log(`      http://${NOME}:${PORTA}`);
  for (const { nome, ip } of enderecos) console.log(`      http://${ip}:${PORTA}     (${nome})`);
  console.log("\n  Cada acesso aparece aqui embaixo. Ctrl+C encerra.\n");
});
