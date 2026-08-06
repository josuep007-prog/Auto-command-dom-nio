/* node --test servidor/testes/*.test.mjs */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { abrir } from "../banco.mjs";
import { historico } from "../auditoria.mjs";
import * as empresas from "../repositorio/empresas.mjs";

/* CNPJs com digito verificador correto — a validacao do nucleo os exige */
const ACME = "11222333000181";
const OUTRA = "44556677000186";
const OPERADORA = "99887766000105";

const base = {
  cnpj: ACME,
  razaoSocial: "ACME SERVICOS LTDA",
  codigoDominio: "77",
};

const novo = () => abrir(":memory:");

describe("cadastro de empresas", () => {
  test("cria e devolve o que foi gravado", () => {
    const db = novo();
    const e = empresas.criar(db, base, { usuarioId: null });
    assert.equal(e.cnpj, ACME);
    assert.equal(e.razaoSocial, "ACME SERVICOS LTDA");
    assert.equal(e.codigoDominio, "77");
    assert.equal(e.tipoProcessoPadrao, "11", "o padrao do gerador e 11");
    assert.equal(e.ativa, true);
  });

  test("aceita o CNPJ formatado, guarda so digitos", () => {
    const db = novo();
    const e = empresas.criar(db, { ...base, cnpj: "11.222.333/0001-81" });
    assert.equal(e.cnpj, ACME);
  });

  test("preserva zero a esquerda no codigo do Dominio", () => {
    const db = novo();
    /* por isso a coluna e TEXT: "007" e "7" sao cadastros diferentes no Dominio */
    const e = empresas.criar(db, { ...base, codigoDominio: "007" });
    assert.equal(e.codigoDominio, "007");
  });

  test("recusa CNPJ com digito verificador errado", () => {
    const db = novo();
    assert.throws(() => empresas.criar(db, { ...base, cnpj: "11222333000182" }),
      (e) => e.name === "ErroDeDados" && e.campo === "cnpj");
  });

  test("recusa CNPJ repetido", () => {
    const db = novo();
    empresas.criar(db, base);
    assert.throws(() => empresas.criar(db, { ...base, razaoSocial: "OUTRA" }),
      (e) => e.name === "ErroDeDados" && /ja existe/.test(e.message));
  });

  test("recusa sem codigo no Dominio — sem ele nao se monta o registro", () => {
    const db = novo();
    assert.throws(() => empresas.criar(db, { ...base, codigoDominio: "" }),
      (e) => e.campo === "codigoDominio");
  });
});

describe("busca por CNPJ — o gancho que o PDF dispara", () => {
  test("encontra pelo CNPJ que o parser extraiu, formatado ou nao", () => {
    const db = novo();
    empresas.criar(db, base);
    assert.equal(empresas.porCnpj(db, "11.222.333/0001-81").codigoDominio, "77");
    assert.equal(empresas.porCnpj(db, ACME).codigoDominio, "77");
  });

  test("devolve nulo para empresa desconhecida, sem quebrar", () => {
    const db = novo();
    /* e o que produz o modo degradado: a tela segue com os campos em branco */
    assert.equal(empresas.porCnpj(db, OUTRA), null);
    assert.equal(empresas.porCnpj(db, "nao e cnpj"), null);
  });

  test("consulta a dado de cliente fica registrada", () => {
    const db = novo();
    const e = empresas.criar(db, base);
    empresas.porCnpj(db, ACME, { usuarioId: null });
    const leituras = historico(db, "empresa", e.id).filter((l) => l.acao === "leu");
    assert.equal(leituras.length, 1);
  });
});

describe("plano de saude — os dois campos andam juntos", () => {
  test("aceita operadora com rubricas", () => {
    const db = novo();
    const e = empresas.criar(db, { ...base, planoCnpj: OPERADORA, planoRubricas: "8500, 8501" });
    assert.equal(e.planoCnpj, OPERADORA);
    assert.deepEqual(e.planoRubricas, ["8500", "8501"]);
  });

  test("recusa operadora sem dizer quais rubricas sao de plano", () => {
    const db = novo();
    /* sem rubrica declarada nao sai registro 20/25 nenhum — o dado seria inutil */
    assert.throws(() => empresas.criar(db, { ...base, planoCnpj: OPERADORA }),
      (e) => e.campo === "planoRubricas");
  });

  test("recusa rubricas sem operadora", () => {
    const db = novo();
    /* o gerador recusa rubrica de plano sem CNPJ na hora de montar o arquivo;
       melhor recusar no cadastro do que descobrir no fechamento */
    assert.throws(() => empresas.criar(db, { ...base, planoRubricas: "8500" }),
      (e) => e.campo === "planoCnpj");
  });

  test("recusa CNPJ de operadora invalido", () => {
    const db = novo();
    assert.throws(
      () => empresas.criar(db, { ...base, planoCnpj: "99887766000106", planoRubricas: "8500" }),
      (e) => e.campo === "planoCnpj");
  });
});

describe("alteracao e auditoria", () => {
  test("altera e registra apenas o que mudou", () => {
    const db = novo();
    const e = empresas.criar(db, base);
    empresas.atualizar(db, e.id, { codigoDominio: "88" });

    const alteracoes = historico(db, "empresa", e.id).filter((l) => l.acao === "alterou");
    assert.equal(alteracoes.length, 1);
    assert.deepEqual(alteracoes[0].antes, { codigoDominio: "77" });
    assert.deepEqual(alteracoes[0].depois, { codigoDominio: "88" });
  });

  test("gravar sem mudar nada nao polui a auditoria", () => {
    const db = novo();
    const e = empresas.criar(db, base);
    empresas.atualizar(db, e.id, { codigoDominio: "77" });
    assert.equal(historico(db, "empresa", e.id).filter((l) => l.acao === "alterou").length, 0);
  });

  test("recusa mudar para um CNPJ que ja e de outra empresa", () => {
    const db = novo();
    const a = empresas.criar(db, base);
    empresas.criar(db, { ...base, cnpj: OUTRA, razaoSocial: "OUTRA LTDA" });
    assert.throws(() => empresas.atualizar(db, a.id, { cnpj: OUTRA }),
      (e) => e.campo === "cnpj");
  });
});

describe("listagem", () => {
  test("filtra por razao social, CNPJ ou codigo, e esconde inativas", () => {
    const db = novo();
    empresas.criar(db, base);
    const b = empresas.criar(db, { ...base, cnpj: OUTRA, razaoSocial: "BETA COMERCIO", codigoDominio: "99" });

    assert.equal(empresas.listar(db).length, 2);
    assert.equal(empresas.listar(db, { busca: "beta" })[0].razaoSocial, "BETA COMERCIO");
    assert.equal(empresas.listar(db, { busca: "44556" })[0].id, b.id);
    assert.equal(empresas.listar(db, { busca: "99" })[0].id, b.id);

    empresas.atualizar(db, b.id, { ativa: false });
    assert.equal(empresas.listar(db).length, 1);
    assert.equal(empresas.listar(db, { incluirInativas: true }).length, 2);
  });
});
