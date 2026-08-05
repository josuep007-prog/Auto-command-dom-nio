/* O programa servido por HTTP, com src/nucleo/*.mjs carregados como modulos ES
 * separados — nao o arquivo unico empacotado que os outros testes usam.
 *
 * Existe porque os dois caminhos podem divergir em silencio: um import errado
 * quebra aqui e passa no empacotado (o bundler resolve na hora do build), e o
 * inverso tambem vale. E e este caminho que o servidor vai entregar.
 */
import { test, expect } from "@playwright/test";

test("a versao em modulos carrega e monta a tela", async ({ page }) => {
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") erros.push("console: " + m.text()); });

  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });

  await expect(page).toHaveTitle(/Importador Domínio/);
  await expect(page.locator("#telaInicio .bloco")).toHaveCount(5);

  /* o nucleo tem de estar alcancavel: e por ele que a tela chama tudo, e e
     dele que o servidor vai importar as mesmas funcoes */
  const nucleo = await page.evaluate(() => ({
    parser: typeof analisarContracheque,
    leiaute: typeof MODULOS === "object" && Object.keys(MODULOS).sort().join(","),
    calendario: typeof feriadosNacionais,
    xlsx: typeof XLSX,
    pdf: typeof pdfjsLib,
  }));
  expect(nucleo).toEqual({
    parser: "function", leiaute: "lancamentos,rpa",
    calendario: "function", xlsx: "object", pdf: "object",
  });

  expect(erros).toEqual([]);
});

test("navegar e gerar o modelo funciona servido", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.locator("#blocoLanc").click();
  await expect(page.locator("#telaGerar")).toBeVisible();

  /* o modelo de Lancamentos passa pela pergunta do plano de saude */
  await page.locator("#btnModelo").click();
  await expect(page.locator("#modalModeloPlano")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#mdPlanoGerar").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^Modelo_Lancamentos.*\.xlsx$/);
});
