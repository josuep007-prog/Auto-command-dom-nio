/* Contas de acesso.
 *
 * Login por pessoa, nunca senha compartilhada do escritorio: o cadastro e
 * comum a todos, e quando um codigo de empresa sair errado — e o .txt entrar
 * torto na folha — a auditoria precisa dizer quem alterou. Senha unica nao
 * responde isso.
 *
 * A senha e guardada com scrypt, que e proposital: e lento de proposito, para
 * que tentar milhoes de senhas custe caro. Nunca guardamos a senha em si.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { agora, emTransacao } from "../banco.mjs";
import { registrar } from "../auditoria.mjs";
import { recusar } from "../erros.mjs";

/* Custo do scrypt. N=16384 leva dezenas de milissegundos numa maquina comum:
   imperceptivel para quem faz login, caro para quem tenta forca bruta. */
const CUSTO = { N: 16384, r: 8, p: 1 };
const TAMANHO = 64;

const PAPEIS = new Set(["operador", "administrador"]);

const derivar = (senha, sal) =>
  scryptSync(String(senha).normalize("NFC"), sal, TAMANHO, CUSTO).toString("hex");

const paraFora = (l) => !l ? null : {
  id: l.id, login: l.login, nome: l.nome, papel: l.papel,
  ativo: !!l.ativo, criadoEm: l.criado_em,
};

export function porId(db, id) {
  return paraFora(db.prepare("SELECT * FROM usuario WHERE id = ?").get(id));
}

export function porLogin(db, login) {
  return paraFora(db.prepare("SELECT * FROM usuario WHERE login = ?")
    .get(String(login || "").trim().toLowerCase()));
}

export function listar(db) {
  return db.prepare("SELECT * FROM usuario ORDER BY nome").all().map(paraFora);
}

export function contar(db) {
  return db.prepare("SELECT count(*) c FROM usuario WHERE ativo = 1").get().c;
}

export function criar(db, { login, nome, senha, papel = "operador" }, ctx = {}) {
  const usuario = String(login || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(usuario))
    recusar("o login usa de 3 a 32 caracteres, entre letras, numeros, ponto, hifen e sublinhado", "login");
  if (String(nome || "").trim().length < 2) recusar("informe o nome da pessoa", "nome");
  if (String(senha || "").length < 8) recusar("a senha precisa de pelo menos 8 caracteres", "senha");
  if (!PAPEIS.has(papel)) recusar("papel desconhecido", "papel");

  return emTransacao(db, () => {
    if (porLogin(db, usuario)) recusar("ja existe conta com esse login", "login");
    const sal = randomBytes(16).toString("hex");
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO usuario (login, nome, senha_hash, senha_sal, papel, ativo, criado_em)
       VALUES (?, ?, ?, ?, ?, 1, ?)`)
      .run(usuario, String(nome).trim(), derivar(senha, sal), sal, papel, agora());

    const criado = porId(db, Number(lastInsertRowid));
    registrar(db, { usuarioId: ctx.usuarioId ?? null, acao: "criou",
                    entidade: "usuario", entidadeId: criado.id,
                    depois: { login: criado.login, nome: criado.nome, papel: criado.papel } });
    return criado;
  });
}

/**
 * Confere login e senha. Devolve o usuario ou null — nunca diz *qual* dos dois
 * errou, porque isso entregaria quais logins existem.
 */
export function autenticar(db, login, senha) {
  const linha = db.prepare("SELECT * FROM usuario WHERE login = ?")
    .get(String(login || "").trim().toLowerCase());

  /* Mesmo sem o usuario existir, derivamos uma senha: sem isso, login
     inexistente responderia perceptivelmente mais rapido que senha errada, e
     daria para descobrir quem tem conta so pelo tempo de resposta. */
  const sal = linha ? linha.senha_sal : "sal-inexistente";
  const esperado = linha ? linha.senha_hash : derivar("nada", sal);
  const obtido = derivar(senha ?? "", sal);

  const confere = timingSafeEqual(Buffer.from(obtido, "hex"), Buffer.from(esperado, "hex"));
  if (!linha || !confere || !linha.ativo) return null;
  return paraFora(linha);
}

export function trocarSenha(db, id, senhaNova, ctx = {}) {
  if (String(senhaNova || "").length < 8)
    recusar("a senha precisa de pelo menos 8 caracteres", "senha");
  return emTransacao(db, () => {
    const usuario = porId(db, id);
    if (!usuario) recusar("conta nao encontrada");
    const sal = randomBytes(16).toString("hex");
    db.prepare("UPDATE usuario SET senha_hash = ?, senha_sal = ? WHERE id = ?")
      .run(derivar(senhaNova, sal), sal, id);
    /* a senha nao entra na auditoria, nem cifrada: o registro diz que mudou */
    registrar(db, { usuarioId: ctx.usuarioId ?? null, acao: "alterou",
                    entidade: "usuario", entidadeId: id, depois: { senha: "trocada" } });
    return usuario;
  });
}

export function desativar(db, id, ctx = {}) {
  return emTransacao(db, () => {
    const usuario = porId(db, id);
    if (!usuario) recusar("conta nao encontrada");
    db.prepare("UPDATE usuario SET ativo = 0 WHERE id = ?").run(id);
    db.prepare("DELETE FROM sessao WHERE usuario_id = ?").run(id);
    registrar(db, { usuarioId: ctx.usuarioId ?? null, acao: "removeu",
                    entidade: "usuario", entidadeId: id, antes: usuario });
    return { ...usuario, ativo: false };
  });
}
