/* Instantaneo dos parsers e do leiaute.
 *
 * Roda a mesma bateria sempre e compara com tests/instantaneos/parsers.json.
 * Foi escrito para provar que a extracao do nucleo nao mudou comportamento —
 * o instantaneo foi gerado a partir da versao anterior a ela e conferido byte a
 * byte. Continua valendo como rede para qualquer mexida futura nos parsers.
 *
 * Se uma mudanca no parser for intencional, regravar com:
 *   ATUALIZAR_INSTANTANEOS=1 npx playwright test parsers
 * e conferir o diff do JSON antes de commitar — e ali que a mudanca aparece.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirApp } from "./app.mjs";
import { CONTRACHEQUE, LIQUIDOS, LIQUIDOS_DEPOIS, RPA } from "./documentos.mjs";

const aqui = dirname(fileURLToPath(import.meta.url));
const ARQUIVO = resolve(aqui, "instantaneos", "parsers.json");

/* A bateria roda dentro da pagina: e o codigo entregue que responde, nao uma
   copia dele em Node. */
async function bateria(page) {
  return page.evaluate(({ CONTRACHEQUE, LIQUIDOS, LIQUIDOS_DEPOIS, RPA }) => {
    const ok = (fn) => { try { return fn(); } catch (e) { return "ERRO: " + e.message; } };
    /* Set nao sobrevive ao JSON — vira lista ordenada */
    const limpar = (v) => JSON.parse(JSON.stringify(v, (k, x) =>
      x instanceof Set ? [...x].sort() : x));

    const pgCon = [linhasDoTexto(CONTRACHEQUE)];
    const pgLiq = [linhasDoTexto(LIQUIDOS)];
    const pgRpa = [linhasDoTexto(RPA)];

    /* planilha de Lancamentos montada aqui, para exercitar MODULOS de ponta a
       ponta: parametros, itens e geracao do registro de largura fixa */
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Empresa", "ACME SERVICOS LTDA"],
      ["Código da empresa", 77],
      ["Competência (MM/AAAA)", "03/2026"],
      ["Tipo do processo", 11],
      ["Total esperado (opcional)", 800],
    ]), "Parametros");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Nome", "Código", "Vale transporte (1050)", "Premio (1080)"],
      ["MARIA DA SILVA", 12, 180, 500],
      ["JOAO PEREIRA", 13, 120, null],
    ]), "Empregados");

    return limpar({
      contracheque: ok(() => analisarContracheque(pgCon)),
      liquidos: ok(() => analisarRelacaoLiquidos(pgLiq)),
      rpa: ok(() => analisarRecibosRpa(pgRpa)),
      tipoDocumento: ok(() => [pgCon, pgLiq, pgRpa].map(detectarTipoDocumento)),
      comparacao: ok(() => compararFolhas(
        analisarRelacaoLiquidos(pgLiq),
        analisarRelacaoLiquidos([linhasDoTexto(LIQUIDOS_DEPOIS)]))),
      lancamentos: ok(() => {
        const dp = MODULOS.lancamentos.parseDePara(wb);
        const parsed = MODULOS.lancamentos.parseItensPlanilha(dp, wb);
        const r = MODULOS.lancamentos.gerar(dp, parsed.itens, parsed);
        return { dp, itens: parsed.itens, avisos: parsed.avisos,
                 linhas: r.linhas.map((l) => l.texto), comErro: r.comErro };
      }),
      modelo: ok(() => {
        const m = planilhaModelo("lancamentos",
          { empresa: "ACME", codigo: 77, competencia: "03/2026" });
        return { nome: m.nome, cor: m.cor, abas: m.abas.map((a) => a.nome) };
      }),
      conferencias: ok(() => ({
        valores: conferirValores([
          { nome: "X", valor: 0, valorBruto: 0, linhaPlanilha: 2 },
          { nome: "Y", valor: -5, valorBruto: -5, linhaPlanilha: 3 },
          { nome: "Z", valor: 1.005, valorBruto: 1.005, linhaPlanilha: 4 }]),
        data: conferirDataPagamento({ competencia: "03/2026", dataPagto: "10/07/2026" }),
      })),
      /* o ZIP grava data e hora da criacao: sem congelar o relogio, dois
         registros do mesmo conteudo diferem por terem rodado em segundos
         distintos */
      zip: ok(() => {
        const Real = Date;
        globalThis.Date = class extends Real { constructor() { super(2026, 0, 2, 3, 4, 5); } };
        try {
          return [...construirZip([{ nome: "a.txt", bytes: new TextEncoder().encode("oi") }])].join(",");
        } finally { globalThis.Date = Real; }
      }),
      csv: ok(() => csvDe(["a", "b"], [["1", "x;y"], ["2", 'as"pas']])),
    });
  }, { CONTRACHEQUE, LIQUIDOS, LIQUIDOS_DEPOIS, RPA });
}

test("os parsers e o leiaute continuam produzindo a mesma coisa", async ({ page }) => {
  const erros = await abrirApp(page);
  const atual = await bateria(page);

  /* instantaneo vazio nao prova nada: exigir que a bateria tenha achado gente */
  expect(atual.contracheque.empregados.length).toBe(2);
  expect(atual.contracheque.rubricas.length).toBeGreaterThan(0);
  expect(atual.contracheque.rubricasDescartadas.map((r) => r.descricao)).toContain("INSS");
  expect(atual.lancamentos.linhas.length).toBe(3);
  expect(atual.rpa.autonomos[0].cpfValido).toBe(true);
  expect(erros).toEqual([]);

  if (process.env.ATUALIZAR_INSTANTANEOS) {
    mkdirSync(dirname(ARQUIVO), { recursive: true });
    writeFileSync(ARQUIVO, JSON.stringify(atual, null, 1) + "\n", "utf8");
    test.info().annotations.push({ type: "instantaneo", description: "regravado" });
    return;
  }

  expect(existsSync(ARQUIVO),
    "instantaneo ausente — gere com ATUALIZAR_INSTANTANEOS=1").toBe(true);
  expect(atual).toEqual(JSON.parse(readFileSync(ARQUIVO, "utf8")));
});
