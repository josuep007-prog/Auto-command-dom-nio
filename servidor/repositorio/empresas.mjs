/* O cadastro de empresas — o que resolve a dor que originou o projeto.
 *
 * A busca por CNPJ e o gancho principal: os tres parsers ja extraem o CNPJ do
 * PDF (nucleo/contracheque.mjs, nucleo/liquidos.mjs, nucleo/rpa.mjs), entao o
 * documento lido identifica sozinho a empresa e traz codigo no Dominio, tipo de
 * processo, descricao padrao e plano de saude — sem ninguem redigitar.
 *
 * As validacoes reaproveitam o nucleo (soDigitos, chave, cnpjValido): sao as
 * mesmas que a tela ja aplica, entao servidor e navegador recusam o mesmo dado.
 */
import { soDigitos } from "../../src/nucleo/texto.mjs";
import { cnpjValido } from "../../src/nucleo/documentos.mjs";
import { agora, emTransacao } from "../banco.mjs";
import { registrar } from "../auditoria.mjs";
import { recusar } from "../erros.mjs";

const COLUNAS = `id, cnpj, razao_social, codigo_dominio, tipo_processo_padrao,
                 descricao_servico_padrao, plano_cnpj, plano_rubricas, ativa,
                 criada_em, atualizada_em`;

/* ---- validacao e normalizacao ---- */

function normalizar(dados, { parcial = false } = {}) {
  const saida = {};

  if (dados.cnpj !== undefined || !parcial) {
    const cnpj = soDigitos(dados.cnpj);
    if (cnpj.length !== 14) recusar("o CNPJ tem 14 digitos", "cnpj");
    if (!cnpjValido(cnpj)) recusar("confira o CNPJ — os digitos verificadores nao fecham", "cnpj");
    saida.cnpj = cnpj;
  }

  if (dados.razaoSocial !== undefined || !parcial) {
    const razao = String(dados.razaoSocial ?? "").trim();
    if (razao.length < 2) recusar("informe a razao social", "razaoSocial");
    saida.razao_social = razao;
  }

  if (dados.codigoDominio !== undefined || !parcial) {
    /* texto, nao numero: o codigo pode ter zero a esquerda no cadastro */
    const codigo = soDigitos(dados.codigoDominio);
    if (!codigo) recusar("informe o codigo da empresa no Dominio", "codigoDominio");
    if (codigo.length > 10) recusar("o codigo da empresa nao passa de 10 digitos", "codigoDominio");
    saida.codigo_dominio = codigo;
  }

  if (dados.tipoProcessoPadrao !== undefined) {
    const tipo = soDigitos(dados.tipoProcessoPadrao) || "11";
    if (tipo.length > 2) recusar("o tipo do processo tem no maximo 2 digitos", "tipoProcessoPadrao");
    saida.tipo_processo_padrao = tipo;
  }

  if (dados.descricaoServicoPadrao !== undefined) {
    saida.descricao_servico_padrao =
      String(dados.descricaoServicoPadrao ?? "").trim().slice(0, 100) || null;
  }

  /* Plano de saude: os dois campos andam juntos. Ter operadora sem dizer quais
     rubricas sao de plano nao gera registro 20/25 nenhum, e o inverso produz
     rubrica declarada como plano sem CNPJ — que o gerador recusa na hora de
     montar o arquivo. Melhor recusar aqui. */
  if (dados.planoCnpj !== undefined || dados.planoRubricas !== undefined) {
    const cnpjPlano = soDigitos(dados.planoCnpj);
    const rubricas = [...new Set(
      String(dados.planoRubricas ?? "").split(/\D+/).filter(Boolean))].join(",");

    if (cnpjPlano && cnpjPlano.length !== 14)
      recusar("o CNPJ da operadora tem 14 digitos", "planoCnpj");
    if (cnpjPlano && !cnpjValido(cnpjPlano))
      recusar("confira o CNPJ da operadora — os digitos verificadores nao fecham", "planoCnpj");
    if (cnpjPlano && !rubricas)
      recusar("informe quais rubricas sao de plano de saude", "planoRubricas");
    if (rubricas && !cnpjPlano)
      recusar("informe o CNPJ da operadora do plano de saude", "planoCnpj");

    saida.plano_cnpj = cnpjPlano || null;
    saida.plano_rubricas = rubricas || null;
  }

  if (dados.ativa !== undefined) saida.ativa = dados.ativa ? 1 : 0;

  return saida;
}

/* ---- leitura ---- */

/* devolve null, nao undefined, quando nao ha linha: e esse valor que a tela usa
   para decidir seguir em branco quando a empresa nao esta cadastrada */
const paraFora = (l) => !l ? null : {
  id: l.id,
  cnpj: l.cnpj,
  razaoSocial: l.razao_social,
  codigoDominio: l.codigo_dominio,
  tipoProcessoPadrao: l.tipo_processo_padrao,
  descricaoServicoPadrao: l.descricao_servico_padrao,
  planoCnpj: l.plano_cnpj,
  planoRubricas: l.plano_rubricas ? l.plano_rubricas.split(",") : [],
  ativa: !!l.ativa,
  criadaEm: l.criada_em,
  atualizadaEm: l.atualizada_em,
};

export function porId(db, id) {
  return paraFora(db.prepare(`SELECT ${COLUNAS} FROM empresa WHERE id = ?`).get(id));
}

/** O gancho: o CNPJ lido do PDF identifica a empresa. Aceita formatado ou nao. */
export function porCnpj(db, cnpj, ctx = {}) {
  const digitos = soDigitos(cnpj);
  if (digitos.length !== 14) return null;
  const achada = paraFora(
    db.prepare(`SELECT ${COLUNAS} FROM empresa WHERE cnpj = ?`).get(digitos));
  /* consulta a dado de cliente e registrada — ver auditoria.mjs */
  if (achada) registrar(db, { usuarioId: ctx.usuarioId ?? null, acao: "leu",
                              entidade: "empresa", entidadeId: achada.id });
  return achada;
}

export function listar(db, { busca = "", incluirInativas = false } = {}) {
  const termo = `%${String(busca).trim().toLowerCase()}%`;
  return db.prepare(
    `SELECT ${COLUNAS} FROM empresa
      WHERE (? = 1 OR ativa = 1)
        AND (? = '%%' OR lower(razao_social) LIKE ? OR cnpj LIKE ? OR codigo_dominio LIKE ?)
      ORDER BY razao_social`)
    .all(incluirInativas ? 1 : 0, termo, termo, termo, termo)
    .map(paraFora);
}

/* ---- escrita ---- */

export function criar(db, dados, ctx = {}) {
  const c = normalizar(dados);
  return emTransacao(db, () => {
    const jaExiste = db.prepare("SELECT id FROM empresa WHERE cnpj = ?").get(c.cnpj);
    if (jaExiste) recusar("ja existe empresa cadastrada com esse CNPJ", "cnpj");

    const quando = agora();
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO empresa (cnpj, razao_social, codigo_dominio, tipo_processo_padrao,
                            descricao_servico_padrao, plano_cnpj, plano_rubricas,
                            ativa, criada_em, atualizada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(c.cnpj, c.razao_social, c.codigo_dominio, c.tipo_processo_padrao ?? "11",
           c.descricao_servico_padrao ?? null, c.plano_cnpj ?? null,
           c.plano_rubricas ?? null, c.ativa ?? 1, quando, quando);

    const criada = porId(db, Number(lastInsertRowid));
    registrar(db, { usuarioId: ctx.usuarioId ?? null, acao: "criou",
                    entidade: "empresa", entidadeId: criada.id, depois: criada });
    return criada;
  });
}

export function atualizar(db, id, dados, ctx = {}) {
  const c = normalizar(dados, { parcial: true });
  return emTransacao(db, () => {
    const antes = porId(db, id);
    if (!antes) recusar("empresa nao encontrada");

    if (c.cnpj && c.cnpj !== antes.cnpj) {
      const outra = db.prepare("SELECT id FROM empresa WHERE cnpj = ? AND id <> ?")
        .get(c.cnpj, id);
      if (outra) recusar("ja existe outra empresa com esse CNPJ", "cnpj");
    }

    const campos = Object.keys(c);
    if (campos.length) {
      db.prepare(`UPDATE empresa SET ${campos.map((k) => `${k} = ?`).join(", ")},
                  atualizada_em = ? WHERE id = ?`)
        .run(...campos.map((k) => c[k]), agora(), id);
    }

    const depois = porId(db, id);
    /* so registra o que mudou de fato: auditoria cheia de linha identica vira
       ruido, e ai ninguem le */
    const mudou = Object.keys(depois).filter(
      (k) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]) && k !== "atualizadaEm");
    if (mudou.length) {
      registrar(db, { usuarioId: ctx.usuarioId ?? null, acao: "alterou",
                      entidade: "empresa", entidadeId: id,
                      antes: Object.fromEntries(mudou.map((k) => [k, antes[k]])),
                      depois: Object.fromEntries(mudou.map((k) => [k, depois[k]])) });
    }
    return depois;
  });
}
