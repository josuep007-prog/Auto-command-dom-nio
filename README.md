# Gerador de importação Domínio

Programa de página única que monta os arquivos de importação do Domínio a
partir dos relatórios que o próprio Domínio emite. Roda inteiro no navegador,
sem servidor e sem internet: o arquivo entregue ao escritório é um `.html` só,
que se abre com dois cliques de dentro da pasta de rede.

## O que ele faz

| Módulo | Entrada | Saída |
| --- | --- | --- |
| **RPA** | Recibo de pagamento a autônomo (PDF) | `.txt` de importação + planilha de-para |
| **Lançamentos** | Contracheque / recibo de pagamento (PDF ou texto colado) | `.txt` de importação + planilha de-para |
| **Comparar folhas** | Duas Relações Gerais dos Líquidos (PDF) | Diferenças mês a mês + `.csv` |
| **Portal do Empregado** | Export do Onvio (`.xlsx`) | Quem está sem acesso ou sem documento |
| **Prazos e feriados** | — | Calendário do eSocial, dias úteis e data meta |

Os registros complementares do leiaute do Domínio cobertos são o **10**
(lançamento), **11** e **12**, **20**/**25** (plano de saúde e beneficiários),
**30** (pensão alimentícia) e **40** (lançamento por serviço).

## Como o repositório está organizado

```
src/
  index.html        só a tela: HTML e CSS (1.211 linhas)
  app.mjs           camada de tela: render, modais, ligação de eventos
  nucleo/           a regra de negócio, sem DOM — roda igual no navegador e no servidor
    texto.mjs           normalização de nome, CNPJ/CPF formatado, moeda
    numeros.mjs         campos de largura fixa, centavos, data, competência
    documentos.mjs      dígito verificador de CPF e CNPJ
    calendario.mjs      feriados, dia útil, prazo do S-1200
    leitura.mjs         PDF e texto colado viram linhas com células
    contracheque.mjs    empregados e rubricas do recibo de pagamento
    liquidos.mjs        Relação Geral dos Líquidos
    rpa.mjs             recibos de pagamento a autônomo
    comparacao.mjs      conferência mês a mês
    planilha.mjs        leitura das abas do de-para
    conferencias.mjs    valores fora do padrão, Latin-1, planilha antiga
    leiaute.mjs         os registros 10/20/25/30/40 e o Sefip 13 do RPA
    modelo.mjs          escrita do .xlsx modelo
    arquivo.mjs         bytes Latin-1, ZIP, CSV, nome do arquivo de saída
  vendor/           bibliotecas de terceiros, sem alteração
    xlsx.full.min.js      SheetJS 0.18.5    — lê as planilhas de-para
    pdf.min.js            pdf.js 3.11.174   — lê os PDFs do Domínio
    pdf.worker.min.js     pdf.js 3.11.174   — worker, carregado na thread principal
servidor/            o acervo — em construção, ver o plano
  FASE-0.md             prova de viabilidade, para rodar na máquina do escritório
  teste-viabilidade.mjs o servidor mínimo dessa prova
  banco.mjs             abre o SQLite, aplica migrações
  migracoes/*.sql       o esquema, aplicado em ordem e controlado por user_version
  repositorio/          consultas por assunto
  auditoria.mjs         quem leu e quem alterou o quê
  testes/               node --test, sem navegador
scripts/
  build.mjs             empacota app.mjs + nucleo/, embute vendor/, escreve dist/
  verificar-vendor.mjs  confere o SHA-256 das bibliotecas contra o npm
  verificar-previa.mjs  prova que a prévia hospedada é o mesmo programa
tests/
  smoke.spec.mjs    a página abre, os módulos navegam, o modelo sai válido
  regras.spec.mjs   feriado móvel, dia útil, prazo do S-1200, CPF/CNPJ, centavos
  parsers.spec.mjs  instantâneo dos parsers e do leiaute
  servido.spec.mjs  a versão em módulos, carregada por HTTP
  documentos.mjs    contracheque, Relação de Líquidos e RPA sintéticos
```

**Por que o núcleo é separado.** Ele não toca no DOM, então o mesmo código roda
no navegador e no servidor — é o que garante que os dois leiam um relatório do
mesmo jeito. Enquanto a camada de tela não for modularizada, `app.mjs` publica o
núcleo em `globalThis`: isso é uma ponte transitória, comentada no próprio
arquivo, que permitiu extrair a regra sem reescrever a tela junto.

**Por que o build empacota.** Módulo ES não carrega de `file://`, e o programa
precisa abrir com dois cliques de uma pasta de rede. O `esbuild` junta o grafo
num script clássico; as bibliotecas voltam a ser embutidas na sequência.

**A ordem das tags de `vendor/` importa.** O `pdf.js` só dispensa o worker
externo porque o global `pdfjsWorker` já está definido quando ele sobe. Inverter
as duas linhas quebra a leitura de PDF sem dar nenhum erro visível.

## O acervo (em construção)

O programa está virando um acervo da folha: empresas, pessoas e os cálculos de
cada competência, alimentado pelos relatórios que o Domínio já emite. Roda num
servidor na rede do escritório. O desenho completo está no plano; o que já
existe aqui é a base do banco.

**Sem nenhuma dependência.** O servidor usa só o que vem no Node: `node:sqlite`
para o banco, `node:http`, `node:crypto`, `node:test`. Isso não é purismo — é o
que permite instalar copiando uma pasta, num ambiente onde não se pode instalar
programas.

```bash
npm run test:servidor        # node --test, sem navegador
```

Duas regras atravessam o esquema (`servidor/migracoes/001-inicial.sql`):

- **Dinheiro é inteiro, em centavos.** Ponto flutuante não representa 0,07
  exatamente, e somar milhares de lançamentos acumula erro — numa folha, isso é
  diferença em contracheque. Há teste somando 0,07 dez mil vezes.
- **Fato nunca é editado.** Toda linha aponta para a importação que a trouxe.
  Reimportar um relatório corrigido cria uma importação nova e marca a anterior
  como não vigente, que continua consultável. É o rastro de retificação (S-1298)
  sem nenhum `UPDATE` destrutivo, e um índice parcial garante que só exista uma
  versão vigente por empresa, competência e tipo de documento.

Antes de qualquer implantação, rode a **Fase 0** (`servidor/FASE-0.md`): ela
responde, na máquina real, se o Node portátil roda sem administrador e — o que
decide — se outro computador do escritório alcança a porta.

## Conferindo as bibliotecas

```bash
npm run verify
```

As três são byte a byte iguais às publicadas no npm — `xlsx@0.18.5` (`dist/`) e
`pdfjs-dist@3.11.174` (`legacy/build/`, não `build/`: o programa usa a versão
transpilada). O script guarda o SHA-256 de cada uma e reclama se mudar.

Vale rodar isso porque o programa manipula dado de folha, roda offline e carrega
as bibliotecas de dentro do próprio HTML — uma linha enxertada ali passaria
despercebida para sempre.

## Trabalhando no programa

```bash
npm install          # só na primeira vez
npm run dev          # abre em http://localhost:4173
```

Precisa ser por servidor, mesmo que local: `src/index.html` carrega `app.mjs`
como módulo ES, e módulo não carrega de `file://`. Para abrir com dois cliques,
use o arquivo gerado por `npm run build`.

## Gerando o arquivo de entrega

```bash
npm run build        # escreve dist/gerador_importacao_v27.html
```

O número da versão sai do campo `version` do `package.json`, que é onde ele
mora agora. Para publicar a v28, é ali que se muda.

`dist/` não é versionado: são 2,6 MB que o build reproduz a qualquer momento a
partir de `src/`.

O build também escreve `dist/artifact.html`, que é o mesmo programa preparado
para ser hospedado como página — serve para abrir a prévia num navegador de
verdade sem instalar nada. Duas diferenças em relação ao arquivo entregue, as
duas só na prévia:

- vai sem as tags externas (`<html>`, `<head>`, `<body>`), porque a hospedagem
  monta o próprio esqueleto em volta;
- os ~51 mil `U+FFFD` das tabelas de code page do SheetJS viram o escape
  `�`. São caracteres legítimos da biblioteca — marcam as posições daquele
  code page sem correspondência em Unicode —, mas hospedagem os lê como arquivo
  mal decodificado e recusa o envio. Em JavaScript o escape produz exatamente o
  mesmo caractere.

`npm run test` roda `verificar-previa.mjs` antes dos testes: ele carrega os dois
arquivos, remonta as tabelas de code page em memória e compara. Se o escape
algum dia cair fora de uma string, a divergência aparece ali.

## Testes

```bash
npm test             # faz o build e roda tudo no Chromium
npm run test:ui      # modo interativo, para ver o teste rodando
```

A maioria carrega o arquivo **já montado**, por `file://` — o mesmo contexto de
segurança em que o escritório usa o programa. `servido.spec.mjs` é a exceção:
carrega `src/` por HTTP, com os módulos separados, porque os dois caminhos podem
divergir em silêncio (um import errado quebra servido e passa empacotado, já que
o bundler resolve na hora do build).

As funções são exercitadas **dentro da própria página**, não reimplementadas em
Node. É de propósito: as datas de feriado e o prazo do S-1200 são o tipo de
conta que ninguém confere na tela, e testar uma cópia da regra não provaria nada
sobre a regra que vai ser entregue.

`parsers.spec.mjs` guarda um instantâneo da leitura de um contracheque, de uma
Relação de Líquidos e de um recibo de RPA sintéticos (`tests/documentos.mjs`),
mais a geração dos registros de largura fixa. Ele nasceu para provar que a
extração do núcleo não mudou comportamento — a saída foi comparada com a versão
anterior à extração e bateu em todas as doze comparações. Para mudar um parser
de propósito, regrave e confira o diff do JSON:

```bash
ATUALIZAR_INSTANTANEOS=1 npx playwright test parsers
```

Os documentos são texto, não PDF: `linhasDoTexto()` produz a mesma estrutura que
`linhasDoPdf()` extrai de um PDF, o que permite exercitar os parsers sem trazer
folha de pagamento real para o repositório.
