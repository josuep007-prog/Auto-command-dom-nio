/* Entrada do servidor do acervo.
 *
 *   node servidor/servidor.mjs
 *
 * Nao usa nenhuma dependencia externa. Configuracao em config.json ou em
 * variaveis ACERVO_* — ver config.mjs.
 */
import { createServer } from "node:http";
import { hostname, networkInterfaces } from "node:os";
import { abrir } from "./banco.mjs";
import { carregarConfig } from "./config.mjs";
import { criarApp } from "./rotas.mjs";
import { limparSessoesVencidas } from "./autenticacao.mjs";
import * as usuarios from "./repositorio/usuarios.mjs";

/* O aviso de "experimental" do node:sqlite e sobre a interface poder mudar
   entre versoes do Node, nao sobre o dado correr risco. Trocado por uma linha
   nossa na subida, para nao assustar quem opera. */
process.removeAllListeners("warning");
process.on("warning", (w) => { if (w.name !== "ExperimentalWarning") console.warn(w); });

const config = carregarConfig();
const db = abrir(config.banco);
const app = criarApp(db, config);

const vencidas = limparSessoesVencidas(db);

const servidor = createServer(app);

servidor.on("error", (e) => {
  console.error(`\n  nao consegui escutar na porta ${config.porta}: ${e.code}`);
  if (e.code === "EADDRINUSE") console.error("  a porta ja esta ocupada — use ACERVO_PORTA=8081");
  if (e.code === "EACCES") console.error("  sem permissao para esta porta — use uma acima de 1024");
  process.exit(1);
});

servidor.listen(config.porta, config.endereco, () => {
  const nome = hostname();
  console.log(`\n  Acervo no ar — Node ${process.version}`);
  console.log(`  banco:   ${config.banco}`);
  console.log(`  servindo: ${config.publico}`);
  if (vencidas) console.log(`  sessoes vencidas removidas: ${vencidas}`);

  console.log(`\n  desta maquina:      http://localhost:${config.porta}`);
  console.log(`  das outras maquinas: http://${nome}:${config.porta}`);
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista || []) {
      if (i.family === "IPv4" && !i.internal) console.log(`                       http://${i.address}:${config.porta}`);
    }
  }

  if (usuarios.contar(db) === 0) {
    console.log("\n  AINDA NAO HA CONTA. Abra o endereco acima para criar a primeira,");
    console.log("  que ja nasce como administrador. Enquanto nao existir conta nenhuma,");
    console.log("  qualquer um na rede pode criar a primeira — faca isso agora.");
  }
  console.log("\n  Ctrl+C encerra.\n");
});

const encerrar = () => {
  console.log("\n  encerrando…");
  servidor.close(() => { db.close(); process.exit(0); });
};
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
