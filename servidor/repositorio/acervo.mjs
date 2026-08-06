/* Gravacao do que foi lido de um relatorio, e as consultas sobre o acervo.
 *
 * Duas regras mandam aqui:
 *
 * FATO NUNCA E EDITADO. Importar de novo a mesma competencia nao altera linha
 * nenhuma: cria uma importacao nova, aponta para a anterior em substitui_id e
 * marca a antiga como nao vigente. As duas continuam consultaveis, que e o que
 * responde "o que valia quando enviei o S-1200" depois de uma retificacao.
 *
 * O MESMO ARQUIVO NAO ENTRA DUAS VEZES. Como o PDF nao e guardado, e o hash do
 * conteudo que identifica a origem — e e ele que torna a carga do historico
 * retomavel: reprocessar uma pasta ja lida nao duplica nada.
 */
import { chave, soDigitos, vazio } from "../../src/nucleo/texto.mjs";
import { competenciaAAAAMM } from "../../src/nucleo/numeros.mjs";
import { agora, emTransacao, paraCentavos, paraReais } from "../banco.mjs";
import { registrar } from "../auditoria.mjs";
import { recusar } from "../erros.mjs";
import * as empresas from "./empresas.mjs";

const TIPOS = new Set(["liquidos", "contracheque", "rpa"]);

/* ---- identidade ---- */

/** Acha ou cria a pessoa. Devolve o id, ou null quando nao da para identificar. */
function resolverPessoa(db, empresaId, { codigo, nome, cpf, funcao }) {
  const nomeLimpo = String(nome || "").trim();
  if (!nomeLimpo) return null;
  const nomeChave = chave(nomeLimpo);
  const cod = soDigitos(codigo);
  const cpfDigitos = soDigitos(cpf) || null;

  if (cod) {
    const existente = db.prepare(
      "SELECT * FROM pessoa WHERE empresa_id = ? AND codigo_dominio = ?").get(empresaId, cod);
    if (existente) {
      /* o cadastro evolui: nome pode ter sido corrigido, CPF pode ter chegado
         por outro relatorio. Completar o que falta, sem apagar o que ja havia. */
      if (existente.nome !== nomeLimpo || (cpfDigitos && !existente.cpf)) {
        db.prepare("UPDATE pessoa SET nome = ?, nome_chave = ?, cpf = COALESCE(cpf, ?) WHERE id = ?")
          .run(nomeLimpo, nomeChave, cpfDigitos, existente.id);
      }
      return existente.id;
    }
    const { lastInsertRowid } = db.prepare(
      `INSERT INTO pessoa (empresa_id, codigo_dominio, nome, nome_chave, cpf)
       VALUES (?, ?, ?, ?, ?)`).run(empresaId, cod, nomeLimpo, nomeChave, cpfDigitos);
    return Number(lastInsertRowid);
  }

  /* Sem codigo — o recibo de RPA nao traz. Tenta casar pelo nome dentro da
     empresa; nome ambiguo nao casa, para nao juntar duas pessoas diferentes. */
  const porNome = db.prepare(
    "SELECT id FROM pessoa WHERE empresa_id = ? AND nome_chave = ?").all(empresaId, nomeChave);
  return porNome.length === 1 ? porNome[0].id : null;
}

function resolverRubrica(db, empresaId, { codigo, descricao, tipo, natureza }) {
  const cod = soDigitos(codigo);
  if (!cod) return null;
  const existente = db.prepare(
    "SELECT * FROM rubrica WHERE empresa_id = ? AND codigo = ?").get(empresaId, cod);
  if (existente) {
    if (natureza && !existente.natureza) {
      db.prepare("UPDATE rubrica SET natureza = ? WHERE id = ?").run(natureza, existente.id);
    }
    return existente.id;
  }
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO rubrica (empresa_id, codigo, descricao, tipo, natureza) VALUES (?,?,?,?,?)")
    .run(empresaId, cod, String(descricao || "").trim() || `rubrica ${cod}`,
         tipo || null, natureza || null);
  return Number(lastInsertRowid);
}

function resolverCompetencia(db, empresaId, aaaamm) {
  const existente = db.prepare(
    "SELECT id FROM competencia WHERE empresa_id = ? AND aaaamm = ?").get(empresaId, aaaamm);
  if (existente) return existente.id;
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO competencia (empresa_id, aaaamm) VALUES (?, ?)").run(empresaId, aaaamm);
  return Number(lastInsertRowid);
}

/* ---- gravacao ---- */

/**
 * Grava um relatorio lido. Espera o que os parsers do nucleo ja produzem,
 * traduzido pela tela para esta forma.
 */
export function importar(db, dados, ctx = {}) {
  const tipo = String(dados.tipoDocumento || "");
  if (!TIPOS.has(tipo)) recusar(`tipo de documento desconhecido: "${tipo}"`, "tipoDocumento");
  if (!dados.arquivoHash) recusar("falta o hash do arquivo de origem", "arquivoHash");

  let aaaamm;
  try { aaaamm = competenciaAAAAMM(dados.competencia); }
  catch { recusar("competencia invalida — use MM/AAAA", "competencia"); }

  return emTransacao(db, () => {
    const empresa = dados.empresaId
      ? empresas.porId(db, Number(dados.empresaId))
      : empresas.porCnpj(db, dados.cnpj);
    if (!empresa)
      recusar("empresa nao esta cadastrada — cadastre antes de gravar no acervo", "cnpj");

    const competenciaId = resolverCompetencia(db, empresa.id, aaaamm);

    /* mesmo arquivo, mesma competencia, mesmo tipo: nao grava de novo */
    const jaLido = db.prepare(
      `SELECT id, vigente FROM importacao
        WHERE empresa_id = ? AND competencia_id = ? AND tipo_documento = ? AND arquivo_hash = ?`)
      .get(empresa.id, competenciaId, tipo, dados.arquivoHash);
    if (jaLido && jaLido.vigente)
      return { importacaoId: jaLido.id, repetido: true, avisos: [], gravados: {} };

    /* a anterior sai de cena mas continua no acervo */
    const anterior = db.prepare(
      `SELECT id FROM importacao
        WHERE empresa_id = ? AND competencia_id = ? AND tipo_documento = ? AND vigente = 1`)
      .get(empresa.id, competenciaId, tipo);
    if (anterior) {
      db.prepare("UPDATE importacao SET vigente = 0 WHERE id = ?").run(anterior.id);
    }

    const { lastInsertRowid } = db.prepare(
      `INSERT INTO importacao (empresa_id, competencia_id, tipo_documento, arquivo_nome,
                               arquivo_hash, paginas, quando, usuario_id, substitui_id, vigente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(empresa.id, competenciaId, tipo, dados.arquivoNome || null, dados.arquivoHash,
           dados.paginas ?? null, agora(), ctx.usuarioId ?? null, anterior ? anterior.id : null);
    const importacaoId = Number(lastInsertRowid);

    const avisos = [];
    const gravados = { pessoas: 0, lancamentos: 0, recibos: 0 };
    const idPorCodigo = new Map();

    for (const p of dados.pessoas || []) {
      const pessoaId = resolverPessoa(db, empresa.id, p);
      if (!pessoaId) {
        avisos.push(`${p.nome || "(sem nome)"} — sem codigo no Dominio e sem correspondencia pelo nome; ficou de fora`);
        continue;
      }
      idPorCodigo.set(String(p.codigo ?? p.nome), pessoaId);
      db.prepare(
        `INSERT INTO pessoa_competencia (importacao_id, competencia_id, pessoa_id,
                                         grupo, funcao, liquido_centavos)
         VALUES (?, ?, ?, ?, ?, ?)`)
        .run(importacaoId, competenciaId, pessoaId, p.grupo || null,
             p.funcao || null, vazio(p.liquido) ? null : paraCentavos(p.liquido));
      gravados.pessoas++;
    }

    for (const l of dados.lancamentos || []) {
      const pessoaId = idPorCodigo.get(String(l.pessoaCodigo));
      if (!pessoaId) {
        avisos.push(`lancamento de ${l.rubricaDescricao || l.rubricaCodigo} sem pessoa identificada (codigo ${l.pessoaCodigo}); ficou de fora`);
        continue;
      }
      const rubricaId = resolverRubrica(db, empresa.id, {
        codigo: l.rubricaCodigo, descricao: l.rubricaDescricao,
        tipo: l.rubricaTipo, natureza: l.natureza });
      if (!rubricaId) {
        avisos.push(`lancamento sem codigo de rubrica para ${l.pessoaCodigo}; ficou de fora`);
        continue;
      }
      db.prepare(
        `INSERT INTO lancamento (importacao_id, competencia_id, pessoa_id, rubrica_id,
                                 referencia, valor_centavos, natureza)
         VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(importacaoId, competenciaId, pessoaId, rubricaId,
             l.referencia ?? null, paraCentavos(l.valor ?? 0), l.natureza || null);
      gravados.lancamentos++;
    }

    for (const rec of dados.recibos || []) {
      const pessoaId = idPorCodigo.get(String(rec.pessoaCodigo));
      if (!pessoaId) {
        avisos.push(`recibo ${rec.numero || ""} sem pessoa identificada; ficou de fora`);
        continue;
      }
      db.prepare(
        `INSERT INTO rpa_recibo (importacao_id, competencia_id, pessoa_id, numero,
                                 data_pagamento, descricao, valor_centavos)
         VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(importacaoId, competenciaId, pessoaId, rec.numero || null,
             rec.dataPagamento || null, rec.descricao || null,
             vazio(rec.valor) ? null : paraCentavos(rec.valor));
      gravados.recibos++;
    }

    registrar(db, { usuarioId: ctx.usuarioId ?? null, acao: "importou",
                    entidade: "importacao", entidadeId: importacaoId,
                    depois: { empresa: empresa.razaoSocial, competencia: aaaamm,
                              tipo, ...gravados,
                              substituiu: anterior ? anterior.id : null } });

    return { importacaoId, repetido: false, substituiu: anterior ? anterior.id : null,
             empresaId: empresa.id, competencia: aaaamm, avisos, gravados };
  });
}

/* ---- consultas ---- */

export function competenciasDaEmpresa(db, empresaId) {
  return db.prepare(
    `SELECT c.aaaamm,
            count(DISTINCT i.tipo_documento) AS tipos,
            max(i.quando) AS ultima_importacao
       FROM competencia c
       JOIN importacao i ON i.competencia_id = c.id AND i.vigente = 1
      WHERE c.empresa_id = ?
      GROUP BY c.id ORDER BY c.aaaamm DESC`).all(empresaId);
}

export function detalheDaImportacao(db, importacaoId) {
  const imp = db.prepare("SELECT * FROM importacao WHERE id = ?").get(importacaoId);
  if (!imp) return null;
  const pessoas = db.prepare(
    `SELECT p.codigo_dominio, p.nome, pc.grupo, pc.funcao, pc.liquido_centavos
       FROM pessoa_competencia pc JOIN pessoa p ON p.id = pc.pessoa_id
      WHERE pc.importacao_id = ? ORDER BY p.nome`).all(importacaoId);
  const lancamentos = db.prepare(
    `SELECT p.codigo_dominio AS pessoa, r.codigo AS rubrica, r.descricao,
            l.referencia, l.valor_centavos, l.natureza
       FROM lancamento l
       JOIN pessoa p ON p.id = l.pessoa_id
       JOIN rubrica r ON r.id = l.rubrica_id
      WHERE l.importacao_id = ?`).all(importacaoId);

  return {
    ...imp,
    vigente: !!imp.vigente,
    pessoas: pessoas.map((p) => ({ ...p, liquido: paraReais(p.liquido_centavos) })),
    lancamentos: lancamentos.map((l) => ({ ...l, valor: paraReais(l.valor_centavos) })),
  };
}

/** Historico de importacoes de uma competencia, da mais recente para a mais
 *  antiga — inclusive as substituidas, que e o ponto de versionar. */
export function versoesDaCompetencia(db, empresaId, aaaamm, tipo) {
  return db.prepare(
    `SELECT i.* FROM importacao i JOIN competencia c ON c.id = i.competencia_id
      WHERE i.empresa_id = ? AND c.aaaamm = ? AND i.tipo_documento = ?
      ORDER BY i.id DESC`).all(empresaId, aaaamm, tipo)
    .map((i) => ({ ...i, vigente: !!i.vigente }));
}
