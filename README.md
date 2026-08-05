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
  index.html        o programa: HTML, CSS e as ~4.400 linhas de regra de negócio
  vendor/           bibliotecas de terceiros, sem alteração
    xlsx.full.min.js      SheetJS 0.18.5    — lê as planilhas de-para
    pdf.min.js            pdf.js 3.11.174   — lê os PDFs do Domínio
    pdf.worker.min.js     pdf.js 3.11.174   — worker, carregado na thread principal
scripts/
  build.mjs         volta a embutir vendor/ e escreve dist/
tests/
  smoke.spec.mjs    a página abre, os módulos navegam, o modelo sai válido
  regras.spec.mjs   feriado móvel, dia útil, prazo do S-1200, CPF/CNPJ, centavos
```

O motivo do split: o arquivo entregue tem 2,6 MB, dos quais 2,3 MB são as duas
bibliotecas minificadas. Editar o programa nesse formato é lento e qualquer
diff fica ilegível. Em desenvolvimento o `src/index.html` tem 280 KB e carrega
as bibliotecas como arquivo; o build faz o caminho de volta. O resultado é
idêntico ao original — mesmo tamanho em bytes.

**A ordem das tags de `vendor/` importa.** O `pdf.js` só dispensa o worker
externo porque o global `pdfjsWorker` já está definido quando ele sobe. Inverter
as duas linhas quebra a leitura de PDF sem dar nenhum erro visível.

## Trabalhando no programa

```bash
npm install          # só na primeira vez
npm run dev          # abre em http://localhost:4173
```

Também dá para abrir `src/index.html` direto no navegador — o programa não
depende de servidor. Editou, salvou, recarregou.

## Gerando o arquivo de entrega

```bash
npm run build        # escreve dist/gerador_importacao_v27.html
```

O número da versão sai do campo `version` do `package.json`, que é onde ele
mora agora. Para publicar a v28, é ali que se muda.

`dist/` não é versionado: são 2,6 MB que o build reproduz a qualquer momento a
partir de `src/`.

## Testes

```bash
npm test             # faz o build e roda tudo no Chromium
npm run test:ui      # modo interativo, para ver o teste rodando
```

Os testes carregam o arquivo **já montado**, por `file://` — o mesmo contexto
de segurança em que o escritório usa o programa. O que passa no teste vale para
o uso real.

`regras.spec.mjs` roda as funções puras dentro da própria página, em vez de
reimplementá-las em Node. É de propósito: as datas de feriado e o prazo do
S-1200 são exatamente o tipo de conta que ninguém confere na tela, e testar uma
cópia da regra não provaria nada sobre a regra que vai ser entregue.
