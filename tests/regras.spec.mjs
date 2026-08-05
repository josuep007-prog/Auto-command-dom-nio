/* As regras que o programa aplica sozinho e ninguem confere na tela: feriado
 * movel, dia util, prazo do S-1200, digito de CPF/CNPJ e conversao de valor.
 * Rodam dentro da propria pagina, entao testam o codigo que vai ser entregue,
 * sem copia nem reimplementacao. */
import { test, expect } from "@playwright/test";
import { abrirApp } from "./app.mjs";

/* roda uma expressao no contexto da pagina, onde as funcoes do app vivem */
const naPagina = (page, fn, arg) => page.evaluate(fn, arg);

test.beforeEach(async ({ page }) => { await abrirApp(page); });

test("Pascoa e feriados moveis batem com o calendario", async ({ page }) => {
  const pascoa = await naPagina(page, (anos) =>
    anos.map((a) => {
      const d = domingoDePascoa(a);
      return `${a}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }), [2024, 2025, 2026, 2027]);

  expect(pascoa).toEqual(["2024-03-31", "2025-04-20", "2026-04-05", "2027-03-28"]);

  /* Carnaval e Corpus Christi saem da Pascoa; se a conta escorregar um dia,
     o dia util seguinte muda e o prazo do eSocial vai junto */
  const moveis2026 = await naPagina(page, () =>
    feriadosNacionais(2026).filter((f) => f.movel).map((f) => `${f.nome}=${dataBR(f.data)}`));

  expect(moveis2026).toEqual([
    "Carnaval (segunda)=16/02/2026",
    "Carnaval (terça)=17/02/2026",
    "Quarta-feira de Cinzas=18/02/2026",
    "Sexta-feira Santa=03/04/2026",
    "Domingo de Páscoa=05/04/2026",
    "Corpus Christi=04/06/2026",
  ]);
});

test("Consciencia Negra entra como feriado nacional", async ({ page }) => {
  /* Lei 14.759/2024 — o 20/11 passou a ser nacional e desloca prazo */
  const tem = await naPagina(page, () =>
    feriadosNacionais(2026).some((f) => f.nome === "Consciência Negra" && f.legal));
  expect(tem).toBe(true);
});

test("dia util ignora fim de semana e feriado", async ({ page }) => {
  const r = await naPagina(page, () => {
    const dia = (a, m, d) => new Date(a, m - 1, d);
    return {
      sabado: ehDiaUtil(dia(2026, 1, 3)),
      domingo: ehDiaUtil(dia(2026, 1, 4)),
      segunda: ehDiaUtil(dia(2026, 1, 5)),
      natal: ehDiaUtil(dia(2026, 12, 25)),
      motivoNatal: motivoNaoUtil(dia(2026, 12, 25)),
      /* 15/11/2026 e domingo e feriado: tem de pular para 16, segunda */
      pulaDoDomingoFeriado: dataBR(proximoDiaUtil(dia(2026, 11, 15))),
    };
  });

  expect(r).toEqual({
    sabado: false, domingo: false, segunda: true, natal: false,
    motivoNatal: "Natal", pulaDoDomingoFeriado: "16/11/2026",
  });
});

test("prazo do S-1200 cai no dia 15 do mes seguinte, postergado quando nao e util", async ({ page }) => {
  const casos = await naPagina(page, (comps) =>
    comps.map((c) => {
      const p = prazosDaCompetencia(c);
      return `${c} -> ${dataBR(p.s1200.limite)}${p.s1200.postergado ? " (postergado)" : ""}`;
    }), ["01/2026", "02/2026", "10/2026", "11/2026"]);

  expect(casos).toEqual([
    "01/2026 -> 16/02/2026 (postergado)",  /* 15/02 e domingo */
    "02/2026 -> 16/03/2026 (postergado)",  /* 15/03 e domingo */
    "10/2026 -> 16/11/2026 (postergado)",  /* 15/11 e domingo E feriado */
    "11/2026 -> 15/12/2026",               /* terca-feira comum */
  ]);
});

test("competencia 13 (decimo terceiro) nao tem prazo de S-1200", async ({ page }) => {
  const r = await naPagina(page, () => prazosDaCompetencia("13/2026"));
  expect(r.aaaamm).toBe("202613");
  expect(r.s1200).toBeNull();
});

test("competencia aceita os formatos que o usuario digita", async ({ page }) => {
  const r = await naPagina(page, () =>
    ["03/2026", "3/2026", "2026-03", "202603"].map((v) => competenciaAAAAMM(v)));
  expect(r).toEqual(["202603", "202603", "202603", "202603"]);

  const erro = await naPagina(page, () => {
    try { competenciaAAAAMM("marco"); return null; } catch (e) { return e.message; }
  });
  expect(erro).toMatch(/competência inválida/);
});

test("CPF e CNPJ conferem o digito verificador", async ({ page }) => {
  const r = await naPagina(page, () => ({
    cpfOk: cpfValido("529.982.247-25"),
    cpfDigitoErrado: cpfValido("529.982.247-26"),
    cpfRepetido: cpfValido("111.111.111-11"),
    cpfCurto: cpfValido("5299822472"),
    cnpjOk: cnpjValido("11.222.333/0001-81"),
    cnpjDigitoErrado: cnpjValido("11.222.333/0001-82"),
  }));

  expect(r).toEqual({
    cpfOk: true, cpfDigitoErrado: false, cpfRepetido: false, cpfCurto: false,
    cnpjOk: true, cnpjDigitoErrado: false,
  });
});

test("valor vira centavos com o tamanho do campo", async ({ page }) => {
  const r = await naPagina(page, () => ({
    milhar: centavos("1.234,56", 11),
    simples: centavos("10", 11),
    virgula: centavos("0,07", 11),
    negativo: (() => { try { centavos("-5", 11); return null; } catch (e) { return "recusado"; } })(),
    estoura: (() => { try { centavos("99999999999", 11); return null; } catch (e) { return "recusado"; } })(),
  }));

  expect(r).toEqual({
    milhar: "00000123456", simples: "00000001000", virgula: "00000000007",
    negativo: "recusado", estoura: "recusado",
  });
});
