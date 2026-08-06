/* Abertura do acervo e migracoes.
 *
 * O banco e um arquivo SQLite so, aberto pelo `node:sqlite` que ja vem no Node —
 * sem dependencia externa, sem servico para instalar. Isso e o que permite
 * instalar o programa copiando uma pasta, que e a restricao do escritorio.
 *
 * As migracoes ficam em migracoes/*.sql, aplicadas em ordem de nome e
 * controladas por PRAGMA user_version. Nunca edite um .sql ja aplicado: crie o
 * proximo. Bancos em producao ja terao passado pelo antigo.
 */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACOES = resolve(AQUI, "migracoes");

/* Dinheiro entra e sai daqui como inteiro de centavos — ver o comentario no
   001-inicial.sql. A conversao mora junto do banco porque e ele quem impoe a
   regra; o resto do programa continua falando em reais. */
export const paraCentavos = (reais) =>
  reais === null || reais === undefined ? null : Math.round(Number(reais) * 100);
export const paraReais = (centavos) =>
  centavos === null || centavos === undefined ? null : centavos / 100;

export function migracoesDisponiveis() {
  return readdirSync(MIGRACOES).filter((n) => n.endsWith(".sql")).sort();
}

/**
 * Abre o acervo, aplica o que faltar e devolve a conexao.
 * @param {string} caminho  arquivo .db; ":memory:" nos testes
 */
export function abrir(caminho) {
  if (caminho !== ":memory:") mkdirSync(dirname(resolve(caminho)), { recursive: true });
  const db = new DatabaseSync(caminho);

  /* WAL deixa varias leituras correrem junto com uma escrita — o padrao de uso
     de um escritorio, onde quase tudo e consulta. Nao vale para :memory:. */
  if (caminho !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  /* SQLite ignora chave estrangeira por padrao, e por conexao. Sem isto, um
     lancamento poderia apontar para uma pessoa que nao existe. */
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  migrar(db);
  return db;
}

export function versaoDoBanco(db) {
  return db.prepare("PRAGMA user_version").get().user_version;
}

/** Aplica as migracoes pendentes. Cada uma roda dentro de uma transacao: ou
 *  entra inteira, ou nao entra — banco meio migrado e pior que nao migrado. */
export function migrar(db) {
  const arquivos = migracoesDisponiveis();
  let versao = versaoDoBanco(db);
  const aplicadas = [];

  for (let i = versao; i < arquivos.length; i++) {
    const nome = arquivos[i];
    const sql = readFileSync(join(MIGRACOES, nome), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`migracao ${nome} falhou: ${e.message}`);
    }
    aplicadas.push(nome);
  }
  return aplicadas;
}

/* Agrupa escritas numa transacao. Importar um relatorio grava em varias tabelas,
   e um erro no meio nao pode deixar metade da competencia no acervo. */
export function emTransacao(db, fn) {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export const agora = () => new Date().toISOString();
