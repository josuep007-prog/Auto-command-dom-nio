/* O caminho inteiro, com o servidor de verdade no ar:
 *
 *   criar a primeira conta -> cadastrar a empresa -> ler um documento ->
 *   os campos se preenchem sozinhos pelo CNPJ -> gravar no acervo
 *
 * É a prova de que as Fases 2 e 3 funcionam juntas. Roda contra
 * scripts/servidor-de-teste.mjs, que sobe com um banco descartável.
 */
import { test, expect } from "@playwright/test";
import { CONTRACHEQUE } from "./documentos.mjs";

const BASE = "http://127.0.0.1:4174";
/* o CNPJ e o que esta DENTRO do documento sintetico: e ele que o parser
   extrai e que dispara a busca no cadastro */
const ACME = "12345678000195";

/* o banco é o mesmo para todo o arquivo: os testes rodam em ordem e um
   depende do anterior, então serial */
test.describe.configure({ mode: "serial" });

test("a primeira conta é criada e entra", async ({ page }) => {
  await page.goto(BASE);
  const saude = await page.evaluate(() => API.sondar());
  expect(saude.precisaConfigurar).toBe(true);

  const criada = await page.evaluate(() => API.criarPrimeiraConta(
    { login: "chefe", nome: "Chefe do DP", senha: "uma-senha-longa" }));
  expect(criada.ok).toBe(true);
  expect(criada.usuario.papel).toBe("administrador");

  const entrou = await page.evaluate(() => API.entrar("chefe", "uma-senha-longa"));
  expect(entrou.ok).toBe(true);
});

test("cadastra a empresa", async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => API.entrar("chefe", "uma-senha-longa"));

  const r = await page.evaluate((cnpj) => API.salvarEmpresa({
    cnpj, razaoSocial: "ACME SERVICOS LTDA", codigoDominio: "4321",
    tipoProcessoPadrao: "11",
  }), ACME);
  expect(r.ok).toBe(true);
  expect(r.empresa.codigoDominio).toBe("4321");
});

test("o CNPJ do documento preenche os campos sozinho", async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => API.entrar("chefe", "uma-senha-longa"));

  await page.locator("#blocoLanc").click();
  await page.locator("details.colar summary").click();
  await page.locator("#cpColado").fill(CONTRACHEQUE);
  await page.locator("#btnColar").click();

  await expect(page.locator("#modalContra")).toBeVisible();

  /* isto é a dor original resolvida: ninguém digitou o código da empresa */
  await expect(page.locator("#cpCodigo")).toHaveValue("4321");
  await expect(page.locator(".selo-cadastro")).toBeVisible();
  await expect(page.locator("#cpAcervo")).toBeVisible();
});

test("grava no acervo, e regravar o mesmo arquivo não duplica", async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => API.entrar("chefe", "uma-senha-longa"));

  await page.locator("#blocoLanc").click();
  await page.locator("details.colar summary").click();
  await page.locator("#cpColado").fill(CONTRACHEQUE);
  await page.locator("#btnColar").click();
  await expect(page.locator("#cpAcervo")).toBeVisible();

  await page.locator("#cpAcervo").click();
  await expect(page.locator("#cpAcervo")).toHaveText(/gravado no acervo/i);

  /* o botão continua ali; clicar de novo tem de reconhecer o mesmo arquivo */
  await page.locator("#cpAcervo").click();
  await expect(page.locator("#cpAcervo")).toHaveText(/já estava no acervo/i);

  /* e o acervo conhece a competência, uma vez só */
  const comps = await page.evaluate(async () => {
    const empresa = await API.empresaPorCnpj("12345678000195");
    const r = await fetch(`/api/acervo/empresas/${empresa.id}/competencias`,
                          { credentials: "same-origin" });
    return r.json();
  });
  expect(comps).toHaveLength(1);
  expect(comps[0].aaaamm).toBe("202603");
});

test("sem sessão, as rotas de dados não respondem", async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => API.sair());
  const r = await page.evaluate(() => fetch("/api/empresas",
    { credentials: "same-origin" }).then((x) => x.status));
  expect(r).toBe(401);
});
