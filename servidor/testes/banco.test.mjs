/* node --test servidor/testes/ */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { abrir, migrar, versaoDoBanco, migracoesDisponiveis,
         paraCentavos, paraReais } from "../banco.mjs";

const novo = () => abrir(":memory:");

describe("migracoes", () => {
  test("aplicam tudo num banco vazio e ficam na versao das disponiveis", () => {
    const db = novo();
    assert.equal(versaoDoBanco(db), migracoesDisponiveis().length);
  });

  test("rodar de novo nao reaplica nada", () => {
    const db = novo();
    assert.deepEqual(migrar(db), []);
  });

  test("as tabelas do acervo existem", () => {
    const db = novo();
    const tabelas = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
      .map((l) => l.name);
    for (const t of ["empresa", "pessoa", "rubrica", "competencia", "importacao",
                     "pessoa_competencia", "lancamento", "rpa_recibo",
                     "usuario", "sessao", "auditoria"]) {
      assert.ok(tabelas.includes(t), `faltou a tabela ${t}`);
    }
  });
});

describe("regras que o esquema tem de impor", () => {
  test("chave estrangeira e obrigatoria", () => {
    const db = novo();
    /* sem PRAGMA foreign_keys = ON o SQLite aceitaria calado — por isso o teste */
    assert.throws(
      () => db.prepare("INSERT INTO pessoa (empresa_id, codigo_dominio, nome, nome_chave) VALUES (?,?,?,?)")
              .run(999, "1", "FULANO", "FULANO"),
      /FOREIGN KEY/i);
  });

  test("so pode haver uma importacao vigente por empresa, competencia e tipo", () => {
    const db = novo();
    db.exec(`INSERT INTO empresa (cnpj, razao_social, codigo_dominio, tipo_processo_padrao,
                                  ativa, criada_em, atualizada_em)
             VALUES ('11222333000181','ACME','77','11',1,'2026-01-01','2026-01-01');
             INSERT INTO competencia (empresa_id, aaaamm) VALUES (1,'202603');`);
    const inserir = (hash, vigente) => db.prepare(
      `INSERT INTO importacao (empresa_id, competencia_id, tipo_documento,
                               arquivo_hash, quando, vigente)
       VALUES (1, 1, 'contracheque', ?, '2026-04-01', ?)`).run(hash, vigente);

    inserir("aaa", 1);
    assert.throws(() => inserir("bbb", 1), /UNIQUE/i,
      "duas vigentes ao mesmo tempo tinham de ser recusadas");

    /* a substituida continua no acervo — e o que da o rastro de retificacao */
    db.exec("UPDATE importacao SET vigente = 0 WHERE arquivo_hash = 'aaa'");
    inserir("bbb", 1);
    assert.equal(db.prepare("SELECT count(*) c FROM importacao").get().c, 2);
    assert.equal(db.prepare("SELECT count(*) c FROM importacao WHERE vigente = 1").get().c, 1);
  });

  test("a mesma pessoa nao entra duas vezes na mesma empresa", () => {
    const db = novo();
    db.exec(`INSERT INTO empresa (cnpj, razao_social, codigo_dominio, tipo_processo_padrao,
                                  ativa, criada_em, atualizada_em)
             VALUES ('11222333000181','ACME','77','11',1,'2026-01-01','2026-01-01')`);
    const p = db.prepare(
      "INSERT INTO pessoa (empresa_id, codigo_dominio, nome, nome_chave) VALUES (1,?,?,?)");
    p.run("12", "MARIA", "MARIA");
    assert.throws(() => p.run("12", "MARIA DA SILVA", "MARIA DA SILVA"), /UNIQUE/i);
  });
});

describe("dinheiro", () => {
  test("vai e volta em centavos, sem erro de ponto flutuante", () => {
    for (const reais of [0, 0.07, 1.1, 1234.56, 99999.99, 0.005]) {
      const c = paraCentavos(reais);
      assert.equal(Number.isInteger(c), true, `${reais} nao virou inteiro`);
      assert.equal(paraReais(c), Math.round(reais * 100) / 100);
    }
  });

  test("somar milhares de centavos nao acumula erro", () => {
    /* em ponto flutuante, 0,07 somado 10.000 vezes nao da 700 exato — e este
       o motivo de o esquema guardar inteiro */
    let centavos = 0;
    for (let i = 0; i < 10_000; i++) centavos += paraCentavos(0.07);
    assert.equal(centavos, 70_000);
    assert.equal(paraReais(centavos), 700);
  });

  test("nulo continua nulo", () => {
    assert.equal(paraCentavos(null), null);
    assert.equal(paraReais(null), null);
  });
});
