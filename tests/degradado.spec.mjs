/* Sem servidor, o programa tem de funcionar como antes de o acervo existir.
 *
 * Isto não é um detalhe: a máquina hospedeira é uma estação de trabalho, que
 * dorme, reinicia e sai da tomada no meio do expediente. Quando isso acontecer
 * num dia 15, o fechamento não pode parar — e nem sequer deve aparecer mensagem
 * de erro na tela.
 *
 * O teste roda o arquivo único por file://, onde não existe servidor nenhum
 * para responder /api/*: é o cenário real de queda, reproduzido de graça.
 */
import { test, expect } from "@playwright/test";
import { abrirApp } from "./app.mjs";
import { CONTRACHEQUE } from "./documentos.mjs";

test("ler um documento e montar a planilha funciona sem acervo", async ({ page }) => {
  const erros = await abrirApp(page);

  await page.locator("#blocoLanc").click();
  await page.locator("details.colar summary").click();
  await page.locator("#cpColado").fill(CONTRACHEQUE);
  await page.locator("#btnColar").click();

  /* o modal abre com o que o parser leu, sem esperar resposta de servidor */
  await expect(page.locator("#modalContra")).toBeVisible();
  await expect(page.locator("#cpEmpresa")).toHaveValue(/ACME/);
  await expect(page.locator("#cpComp")).toHaveValue("03/2026");
  await expect(page.locator("#cpEmpregados .item")).toHaveCount(2);

  /* o botão do acervo não aparece: sem servidor ele não existe para o usuário,
     em vez de existir e falhar quando clicado */
  await expect(page.locator("#cpAcervo")).toBeHidden();

  /* e nenhum selo de "preenchido pelo cadastro", porque não houve cadastro */
  await expect(page.locator(".selo-cadastro")).toHaveCount(0);

  /* a geração continua inteira: código na mão e o modelo sai */
  await page.locator("#cpCodigo").fill("77");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#cpGerar").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Modelo_Lancamentos.*\.xlsx$/);

  /* a falha de rede não pode ter virado erro de script na página */
  expect(erros).toEqual([]);
});

test("a sonda do acervo nao quebra a partida", async ({ page }) => {
  await abrirApp(page);
  const estado = await page.evaluate(async () => {
    const r = await API.sondar();
    return { retorno: r, disponivel: API.acervoDisponivel(), usuario: API.usuarioAtual() };
  });
  /* sondar() nunca lança: devolve null e marca o acervo como indisponível */
  expect(estado).toEqual({ retorno: null, disponivel: false, usuario: null });
});

test("empresaPorCnpj devolve null em vez de estourar", async ({ page }) => {
  await abrirApp(page);
  const r = await page.evaluate(() => API.empresaPorCnpj("11.222.333/0001-81"));
  expect(r).toBe(null);
});
