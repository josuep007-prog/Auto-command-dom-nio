/* Sessoes e o bloqueio de tentativas.
 *
 * A sessao mora num cookie httpOnly: JavaScript da pagina nao a le, entao um
 * script injetado nao consegue roubar o acesso ao acervo.
 *
 * O bloqueio progressivo e por login E por origem. Sem ele, alguem na rede
 * poderia tentar senhas indefinidamente — e numa rede de escritorio "alguem na
 * rede" inclui qualquer maquina infectada.
 */
import { randomBytes } from "node:crypto";
import { agora } from "./banco.mjs";
import { registrar } from "./auditoria.mjs";
import * as usuarios from "./repositorio/usuarios.mjs";

export const COOKIE = "acervo_sessao";

const TENTATIVAS_ATE_BLOQUEAR = 5;
const BLOQUEIO_MS = 5 * 60 * 1000;

/* memoria, nao banco: reiniciar o servidor limpa, e tudo bem — o objetivo e
   frear ataque em curso, nao manter historico (isso e a auditoria) */
const tentativas = new Map();

const chaveTentativa = (login, origem) => `${String(login).toLowerCase()}|${origem}`;

export function estaBloqueado(login, origem) {
  const t = tentativas.get(chaveTentativa(login, origem));
  if (!t) return false;
  if (Date.now() > t.ate) { tentativas.delete(chaveTentativa(login, origem)); return false; }
  return t.contagem >= TENTATIVAS_ATE_BLOQUEAR;
}

function contarFalha(login, origem) {
  const k = chaveTentativa(login, origem);
  const t = tentativas.get(k) || { contagem: 0, ate: 0 };
  t.contagem++;
  t.ate = Date.now() + BLOQUEIO_MS;
  tentativas.set(k, t);
}

export const limparTentativas = () => tentativas.clear();

/**
 * Tenta entrar. Devolve { sessao, usuario } ou lanca ErroDeDados.
 * A mensagem e sempre a mesma para login inexistente e senha errada.
 */
export function entrar(db, { login, senha, origem = "?", horasDeSessao = 12 }) {
  if (estaBloqueado(login, origem)) {
    const e = new Error("muitas tentativas — espere alguns minutos");
    e.name = "ErroDeDados";
    e.status = 429;
    throw e;
  }

  const usuario = usuarios.autenticar(db, login, senha);
  if (!usuario) {
    contarFalha(login, origem);
    const e = new Error("login ou senha incorretos");
    e.name = "ErroDeDados";
    e.status = 401;
    throw e;
  }

  tentativas.delete(chaveTentativa(login, origem));

  const id = randomBytes(32).toString("hex");
  const expira = new Date(Date.now() + horasDeSessao * 3600_000).toISOString();
  db.prepare("INSERT INTO sessao (id, usuario_id, criada_em, expira_em, origem) VALUES (?,?,?,?,?)")
    .run(id, usuario.id, agora(), expira, origem);

  registrar(db, { usuarioId: usuario.id, acao: "entrou", entidade: "sessao" });
  return { sessao: { id, expiraEm: expira }, usuario };
}

/** Devolve o usuario da sessao, ou null. Sessao vencida e apagada na passagem. */
export function usuarioDaSessao(db, id) {
  if (!id) return null;
  const s = db.prepare("SELECT * FROM sessao WHERE id = ?").get(id);
  if (!s) return null;
  if (new Date(s.expira_em) < new Date()) {
    db.prepare("DELETE FROM sessao WHERE id = ?").run(id);
    return null;
  }
  const u = usuarios.porId(db, s.usuario_id);
  return u && u.ativo ? u : null;
}

export function sair(db, id) {
  const s = db.prepare("SELECT usuario_id FROM sessao WHERE id = ?").get(id);
  db.prepare("DELETE FROM sessao WHERE id = ?").run(id);
  if (s) registrar(db, { usuarioId: s.usuario_id, acao: "saiu", entidade: "sessao" });
}

/** Limpa sessoes vencidas. Chamada na subida e de tempos em tempos. */
export function limparSessoesVencidas(db) {
  return db.prepare("DELETE FROM sessao WHERE expira_em < ?").run(agora()).changes;
}

export const ehAdministrador = (u) => !!u && u.papel === "administrador";
