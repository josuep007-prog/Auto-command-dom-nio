/* node --test servidor/testes/*.test.mjs */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { subirApp, ACME, OUTRA } from "./ajuda.mjs";

describe("primeira conta", () => {
  test("pode ser criada sem sessao, e ja nasce administrador", async () => {
    const app = await subirApp();
    try {
      assert.equal((await app.get("/api/saude")).corpo.precisaConfigurar, true);
      const r = await app.post("/api/usuarios",
        { login: "chefe", nome: "Chefe", senha: "senha-bem-longa" });
      assert.equal(r.status, 201);
      assert.equal(r.corpo.papel, "administrador");
      assert.equal((await app.get("/api/saude")).corpo.precisaConfigurar, false);
    } finally { await app.fechar(); }
  });

  test("a janela fecha assim que existe uma conta", async () => {
    const app = await subirApp();
    try {
      await app.post("/api/usuarios", { login: "chefe", nome: "Chefe", senha: "senha-bem-longa" });
      app.esquecerCookie();
      /* sem isso, qualquer um na rede criaria conta a qualquer momento */
      const r = await app.post("/api/usuarios",
        { login: "intruso", nome: "Intruso", senha: "outra-senha-longa" });
      assert.equal(r.status, 400);
      assert.match(r.corpo.erro, /administrador/);
    } finally { await app.fechar(); }
  });
});

describe("sessao", () => {
  test("entra, e reconhecido, e sai", async () => {
    const app = await subirApp();
    try {
      await app.criarAdministrador();
      assert.equal((await app.get("/api/saude")).corpo.usuario.nome, "Chefe");
      assert.equal((await app.delete("/api/sessao")).status, 200);
      app.esquecerCookie();
      assert.equal((await app.get("/api/saude")).corpo.usuario, null);
    } finally { await app.fechar(); }
  });

  test("o cookie de sessao e httpOnly e SameSite", async () => {
    const app = await subirApp();
    try {
      await app.post("/api/usuarios", { login: "chefe", nome: "Chefe", senha: "senha-bem-longa" });
      const r = await app.post("/api/sessao", { login: "chefe", senha: "senha-bem-longa" });
      const cookie = r.cabecalhos.get("set-cookie");
      /* httpOnly e o que impede script na pagina de roubar a sessao */
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Strict/i);
    } finally { await app.fechar(); }
  });

  test("senha errada e login inexistente dao a mesma resposta", async () => {
    const app = await subirApp();
    try {
      await app.post("/api/usuarios", { login: "chefe", nome: "Chefe", senha: "senha-bem-longa" });
      app.esquecerCookie();
      const errada = await app.post("/api/sessao", { login: "chefe", senha: "errada" });
      const inexistente = await app.post("/api/sessao", { login: "ninguem", senha: "errada" });
      /* respostas diferentes entregariam quais logins existem */
      assert.equal(errada.status, 401);
      assert.equal(inexistente.status, 401);
      assert.equal(errada.corpo.erro, inexistente.corpo.erro);
    } finally { await app.fechar(); }
  });

  test("bloqueia depois de tentativas seguidas", async () => {
    const app = await subirApp();
    try {
      await app.post("/api/usuarios", { login: "chefe", nome: "Chefe", senha: "senha-bem-longa" });
      app.esquecerCookie();
      for (let i = 0; i < 5; i++) await app.post("/api/sessao", { login: "chefe", senha: "errada" });
      const r = await app.post("/api/sessao", { login: "chefe", senha: "senha-bem-longa" });
      assert.equal(r.status, 429, "senha certa depois do bloqueio ainda tem de ser barrada");
    } finally { await app.fechar(); }
  });
});

describe("as rotas de dados exigem sessao", () => {
  const protegidas = [
    ["GET", "/api/empresas"],
    ["GET", `/api/empresas/cnpj/${ACME}`],
    ["GET", "/api/empresas/1"],
    ["POST", "/api/empresas"],
    ["PUT", "/api/empresas/1"],
    ["POST", "/api/acervo/importar"],
    ["GET", "/api/acervo/empresas/1/competencias"],
  ];

  for (const [metodo, caminho] of protegidas) {
    test(`${metodo} ${caminho} responde 401 sem sessao`, async () => {
      const app = await subirApp();
      try {
        await app.criarAdministrador();
        app.esquecerCookie();
        const r = metodo === "GET" ? await app.get(caminho)
                : metodo === "POST" ? await app.post(caminho)
                : await app.put(caminho);
        assert.equal(r.status, 401, "rota de dado de cliente aberta sem sessao");
      } finally { await app.fechar(); }
    });
  }
});

describe("empresas pela API", () => {
  let app;
  before(async () => { app = await subirApp(); await app.criarAdministrador(); });
  after(async () => { await app.fechar(); });

  test("cria, busca por CNPJ e altera", async () => {
    const criada = await app.post("/api/empresas",
      { cnpj: ACME, razaoSocial: "ACME SERVICOS", codigoDominio: "77" });
    assert.equal(criada.status, 201);

    const achada = await app.get(`/api/empresas/cnpj/11.222.333%2F0001-81`);
    assert.equal(achada.status, 200);
    assert.equal(achada.corpo.codigoDominio, "77");

    const alterada = await app.put(`/api/empresas/${criada.corpo.id}`, { codigoDominio: "88" });
    assert.equal(alterada.corpo.codigoDominio, "88");

    const hist = await app.get(`/api/empresas/${criada.corpo.id}/historico`);
    assert.ok(hist.corpo.some((l) => l.acao === "alterou"));
  });

  test("CNPJ nao cadastrado responde 404, nao erro", async () => {
    /* e o 404 que a tela traduz em "siga preenchendo a mao" */
    const r = await app.get(`/api/empresas/cnpj/${OUTRA}`);
    assert.equal(r.status, 404);
  });

  test("dado invalido responde 400 dizendo qual campo", async () => {
    const r = await app.post("/api/empresas",
      { cnpj: "11222333000182", razaoSocial: "X", codigoDominio: "1" });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.campo, "cnpj");
  });
});

describe("o servidor nao entrega arquivo fora da pasta publica", () => {
  test("travessia de diretorio e barrada", async () => {
    const app = await subirApp();
    try {
      for (const tentativa of ["/../package.json", "/..%2Fpackage.json",
                               "/../../etc/passwd"]) {
        const r = await app.get(tentativa);
        assert.notEqual(r.status, 200, `serviu ${tentativa}`);
      }
    } finally { await app.fechar(); }
  });
});
