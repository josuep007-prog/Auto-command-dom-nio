/* node --test servidor/testes/*.test.mjs */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { abrir } from "../banco.mjs";
import * as empresas from "../repositorio/empresas.mjs";
import * as acervo from "../repositorio/acervo.mjs";
import { historico } from "../auditoria.mjs";

const ACME = "11222333000181";

function montar() {
  const db = abrir(":memory:");
  const empresa = empresas.criar(db,
    { cnpj: ACME, razaoSocial: "ACME SERVICOS", codigoDominio: "77" });
  return { db, empresa };
}

const folha = (hash, liquidoMaria = 3500) => ({
  tipoDocumento: "contracheque",
  cnpj: ACME,
  competencia: "03/2026",
  arquivoNome: "contracheque.pdf",
  arquivoHash: hash,
  paginas: 2,
  pessoas: [
    { codigo: "12", nome: "MARIA DA SILVA", funcao: "ANALISTA", grupo: "empregados", liquido: liquidoMaria },
    { codigo: "13", nome: "JOAO PEREIRA", funcao: "AUXILIAR", grupo: "empregados", liquido: 2000 },
  ],
  lancamentos: [
    { pessoaCodigo: "12", rubricaCodigo: "1050", rubricaDescricao: "VALE TRANSPORTE", valor: 180 },
    { pessoaCodigo: "12", rubricaCodigo: "1080", rubricaDescricao: "PREMIO", valor: 500 },
    { pessoaCodigo: "13", rubricaCodigo: "1050", rubricaDescricao: "VALE TRANSPORTE", valor: 120 },
  ],
});

describe("gravar o que foi lido", () => {
  test("grava pessoas, rubricas e lancamentos", () => {
    const { db } = montar();
    const r = acervo.importar(db, folha("hash-a"));
    assert.equal(r.repetido, false);
    assert.deepEqual(r.gravados, { pessoas: 2, lancamentos: 3, recibos: 0 });
    assert.deepEqual(r.avisos, []);

    const detalhe = acervo.detalheDaImportacao(db, r.importacaoId);
    assert.equal(detalhe.pessoas.length, 2);
    /* dinheiro guardado em centavos, devolvido em reais */
    assert.equal(detalhe.pessoas.find((p) => p.codigo_dominio === "12").liquido, 3500);
    assert.equal(detalhe.lancamentos.find((l) => l.rubrica === "1080").valor, 500);
  });

  test("recusa empresa que nao esta cadastrada", () => {
    const db = abrir(":memory:");
    /* o cadastro e o ponto do projeto: gravar folha de empresa desconhecida
       criaria acervo orfao, sem codigo no Dominio para gerar o .txt depois */
    assert.throws(() => acervo.importar(db, folha("hash-a")),
      (e) => e.name === "ErroDeDados" && e.campo === "cnpj");
  });

  test("recusa competencia invalida", () => {
    const { db } = montar();
    assert.throws(() => acervo.importar(db, { ...folha("h"), competencia: "marco" }),
      (e) => e.campo === "competencia");
  });
});

describe("o mesmo arquivo nao entra duas vezes", () => {
  test("reimportar o mesmo hash devolve a importacao existente", () => {
    const { db } = montar();
    const primeira = acervo.importar(db, folha("hash-a"));
    const segunda = acervo.importar(db, folha("hash-a"));

    assert.equal(segunda.repetido, true);
    assert.equal(segunda.importacaoId, primeira.importacaoId);
    /* e o que torna a carga do historico retomavel: reprocessar uma pasta ja
       lida nao duplica nada */
    assert.equal(db.prepare("SELECT count(*) c FROM lancamento").get().c, 3);
  });
});

describe("retificacao: versiona, nao sobrescreve", () => {
  test("a nova vira vigente e a anterior continua consultavel", () => {
    const { db, empresa } = montar();
    const antes = acervo.importar(db, folha("hash-a", 3500));
    const depois = acervo.importar(db, folha("hash-b", 3900));

    assert.equal(depois.substituiu, antes.importacaoId);

    const versoes = acervo.versoesDaCompetencia(db, empresa.id, "202603", "contracheque");
    assert.equal(versoes.length, 2, "a anterior tem de continuar no acervo");
    assert.equal(versoes[0].id, depois.importacaoId);
    assert.equal(versoes[0].vigente, true);
    assert.equal(versoes[1].vigente, false);

    /* o que valia antes da retificacao continua respondendo — e isso que
       sustenta "o que eu enviei no S-1200 daquele mes?" */
    assert.equal(acervo.detalheDaImportacao(db, antes.importacaoId)
      .pessoas.find((p) => p.codigo_dominio === "12").liquido, 3500);
    assert.equal(acervo.detalheDaImportacao(db, depois.importacaoId)
      .pessoas.find((p) => p.codigo_dominio === "12").liquido, 3900);
  });

  test("so uma versao vigente por competencia e tipo", () => {
    const { db, empresa } = montar();
    acervo.importar(db, folha("hash-a"));
    acervo.importar(db, folha("hash-b"));
    acervo.importar(db, folha("hash-c"));
    const vigentes = acervo.versoesDaCompetencia(db, empresa.id, "202603", "contracheque")
      .filter((v) => v.vigente);
    assert.equal(vigentes.length, 1);
  });

  test("a competencia aparece uma vez so na listagem, mesmo com varias versoes", () => {
    const { db, empresa } = montar();
    acervo.importar(db, folha("hash-a"));
    acervo.importar(db, folha("hash-b"));
    const comps = acervo.competenciasDaEmpresa(db, empresa.id);
    assert.equal(comps.length, 1);
    assert.equal(comps[0].aaaamm, "202603");
  });
});

describe("casar identidade entre relatorios", () => {
  test("o RPA sem codigo casa pela pessoa ja conhecida", () => {
    const { db } = montar();
    acervo.importar(db, folha("hash-a"));

    /* o recibo de RPA nao traz o codigo do contribuinte — o proprio programa
       avisa isso. Casar pelo nome e o que evita cadastro duplicado. */
    const r = acervo.importar(db, {
      tipoDocumento: "rpa", cnpj: ACME, competencia: "03/2026", arquivoHash: "hash-rpa",
      pessoas: [{ codigo: "", nome: "MARIA DA SILVA" }],
      recibos: [{ pessoaCodigo: "", numero: "1234", valor: 1200,
                  dataPagamento: "20260410", descricao: "CONSULTORIA" }],
    });
    assert.deepEqual(r.avisos, []);
    assert.equal(r.gravados.recibos, 1);
    assert.equal(db.prepare("SELECT count(*) c FROM pessoa").get().c, 2,
      "nao pode ter criado pessoa nova");
  });

  test("sem codigo e sem correspondencia, avisa em vez de inventar", () => {
    const { db } = montar();
    const r = acervo.importar(db, {
      tipoDocumento: "rpa", cnpj: ACME, competencia: "03/2026", arquivoHash: "h",
      pessoas: [{ codigo: "", nome: "DESCONHECIDO QUALQUER" }],
    });
    assert.equal(r.gravados.pessoas, 0);
    assert.match(r.avisos[0], /sem codigo/);
  });

  test("um relatorio completa o CPF que o outro nao trouxe", () => {
    const { db } = montar();
    acervo.importar(db, folha("hash-a"));
    acervo.importar(db, {
      tipoDocumento: "rpa", cnpj: ACME, competencia: "04/2026", arquivoHash: "h2",
      pessoas: [{ codigo: "12", nome: "MARIA DA SILVA", cpf: "529.982.247-25" }],
    });
    const p = db.prepare("SELECT cpf FROM pessoa WHERE codigo_dominio = '12'").get();
    assert.equal(p.cpf, "52998224725", "o CPF do recibo tinha de completar o cadastro");
  });
});

describe("auditoria da importacao", () => {
  test("registra o que entrou e o que foi substituido", () => {
    const { db } = montar();
    const primeira = acervo.importar(db, folha("hash-a"));
    const segunda = acervo.importar(db, folha("hash-b"));

    const reg = historico(db, "importacao", segunda.importacaoId)[0];
    assert.equal(reg.acao, "importou");
    assert.equal(reg.depois.substituiu, primeira.importacaoId);
    assert.equal(reg.depois.lancamentos, 3);
  });
});
