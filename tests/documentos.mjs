/* Documentos sinteticos em texto, no formato que o Dominio imprime.
 *
 * Sao texto e nao PDF de proposito: linhasDoTexto() separa colunas por dois ou
 * mais espacos e produz a mesma estrutura de "paginas" que linhasDoPdf() extrai
 * de um PDF. Isso permite exercitar os parsers de verdade sem carregar um
 * arquivo de folha real para dentro do repositorio.
 */

/* Contracheque: dois empregados, rubrica fixa, variavel e uma que o Dominio
   calcula sozinho (INSS, que tem de cair em rubricasDescartadas). A linha de
   TOTAL existe para confirmar que e ignorada. */
export const CONTRACHEQUE = [
  "ACME SERVICOS LTDA  CNPJ: 12.345.678/0001-95",
  "Recibo de Pagamento de Salario   Competencia: 03/2026",
  "",
  "Codigo    Nome                Funcao",
  "12        MARIA DA SILVA      ANALISTA",
  "Codigo    Descricao           Referencia   Vencimentos   Descontos",
  "1001      SALARIO BASE        30,00        3.500,00",
  "1050      VALE TRANSPORTE     6,00         180,00",
  "9001      INSS                             385,00",
  "1080      PREMIO                           500,00",
  "          TOTAL                            4.180,00      385,00",
  "",
  "Codigo    Nome                Funcao",
  "13        JOAO PEREIRA        AUXILIAR",
  "Codigo    Descricao           Referencia   Vencimentos   Descontos",
  "1001      SALARIO BASE        30,00        2.000,00",
  "1050      VALE TRANSPORTE     6,00         120,00",
].join("\n");

/* Relacao Geral dos Liquidos: os dois grupos que o programa usa, e um total de
   empresa que fecha com a soma — se nao fechasse, viraria aviso. */
export const LIQUIDOS = [
  "Relacao Geral dos Liquidos",
  "Empresa:   ACME SERVICOS LTDA",
  "CNPJ:   12.345.678/0001-95",
  "Calculo:   Mensal",
  "Competencia:   03/2026",
  "Emissao:   05/04/2026",
  "",
  "Empregados",
  "12    MARIA DA SILVA    3.500,00",
  "13    JOAO PEREIRA      2.000,00",
  "",
  "Contribuintes",
  "90    CARLOS AUTONOMO   1.200,00",
  "",
  "Total da Empresa    6.700,00",
].join("\n");

/* O mes seguinte: um liquido mudou e a competencia avancou. Serve a conferencia
   mes a mes. */
export const LIQUIDOS_DEPOIS = LIQUIDOS
  .replace("3.500,00", "3.900,00")
  .replace("Competencia:   03/2026", "Competencia:   04/2026");

/* Recibo de RPA: o CPF e valido de verdade, para o digito verificador ser
   exercitado no caminho do parser, nao so no teste de regra. */
export const RPA = [
  "RECIBO DE PAGAMENTO A AUTONOMO",
  "ACME SERVICOS LTDA    12.345.678/0001-95",
  "Nome Completo",
  "CARLOS AUTONOMO",
  "CPF   529.982.247-25",
  "No Recibo",
  "1234",
  "Data   10/04/2026",
  "Especificacao dos servicos de   CONSULTORIA   a importancia de R$ 1.200,00",
  "Valor Liquido    1.200,00",
].join("\n");
