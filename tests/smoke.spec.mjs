/* O basico que nao pode quebrar: a pagina abre sozinha, as tres bibliotecas
 * embutidas sobem, a navegacao entre os modulos funciona e o modelo de
 * planilha sai como um .xlsx que o proprio SheetJS consegue reabrir. */
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { abrirApp } from "./app.mjs";

test("a pagina abre sem erro de script", async ({ page }) => {
  const erros = await abrirApp(page);
  await expect(page).toHaveTitle(/Importador Domínio/);
  await expect(page.locator("#telaInicio")).toBeVisible();
  expect(erros).toEqual([]);
});

test("as bibliotecas embutidas carregam na ordem certa", async ({ page }) => {
  await abrirApp(page);
  const libs = await page.evaluate(() => ({
    xlsx: XLSX.version,
    pdf: pdfjsLib.version,
    /* o pdf.js so dispensa o worker externo porque este global ja existe;
       inverter a ordem das tags quebra a leitura de PDF em silencio */
    worker: typeof pdfjsWorker !== "undefined",
  }));
  expect(libs.xlsx).toBe("0.18.5");
  expect(libs.pdf).toBe("3.11.174");
  expect(libs.worker).toBe(true);
});

test("os cinco blocos da tela inicial estao la", async ({ page }) => {
  await abrirApp(page);
  const blocos = page.locator("#telaInicio .bloco");
  await expect(blocos).toHaveCount(5);
  await expect(blocos).toContainText([
    /RPA/, /Lançamentos/, /Comparar folhas/, /Portal do Empregado/, /Prazos e feriados/,
  ]);
});

for (const [id, rotulo] of [["blocoRpa", "RPA"], ["blocoLanc", "Lançamentos"]]) {
  test(`o bloco ${rotulo} leva para a tela de geracao e volta`, async ({ page }) => {
    const erros = await abrirApp(page);
    await page.locator(`#${id}`).click();

    await expect(page.locator("#telaGerar")).toBeVisible();
    await expect(page.locator("#telaInicio")).toBeHidden();
    await expect(page.locator("#btnGerar")).toBeDisabled();      // sem planilha ainda

    /* a fita do leiaute mora num <details> fechado: conta, nao ve */
    expect(await page.locator("#leiaute .fita-seg").count()).toBeGreaterThan(0);
    await expect(page.locator("#leiauteTam")).toContainText(/\d+ caracteres por linha/);

    await page.locator("#btnVoltar").click();
    await expect(page.locator("#telaInicio")).toBeVisible();
    expect(erros).toEqual([]);
  });
}

test("o modelo de RPA baixa e reabre como planilha valida", async ({ page }) => {
  await abrirApp(page);
  await page.locator("#blocoRpa").click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#btnModelo").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);

  /* o .xlsx e escrito na mao pelo app (nao ha lib de escrita embutida);
     reabrir com o SheetJS e a unica forma de saber se saiu bem formado.
     Os bytes voltam para dentro da pagina porque o SheetJS so existe la —
     fetch() nao le file://, entao quem le o arquivo baixado e o Node. */
  const bytes = await readFile(await download.path());
  const abas = await page.evaluate((b64) => {
    const bin = atob(b64);
    const buf = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return XLSX.read(buf, { type: "array" }).SheetNames;
  }, bytes.toString("base64"));

  expect(abas).toContain("Parametros");
  expect(abas.some((n) => /contribuinte/i.test(n))).toBe(true);
});

test("a agenda de prazos e feriados abre", async ({ page }) => {
  const erros = await abrirApp(page);
  await page.locator("#blocoAgenda").click();
  await expect(page.locator("#modalAgenda")).toBeVisible();
  expect(erros).toEqual([]);
});
