import { sanitizarNomeArquivo, vazio } from "./texto.mjs";
import { competenciaAAAAMM } from "./numeros.mjs";

export const XL = (()=>{
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const colLetra=n=>{let s="";n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26;}return s;};

  const STYLES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><color rgb="FF0F1922"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF0F1922"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF7A8794"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF0F1922"/><name val="Calibri"/></font>
<font><sz val="10.5"/><color rgb="FF3D4E5C"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFCOR_TEMA"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFFCF0"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFC9D2DC"/></left><right style="thin"><color rgb="FFC9D2DC"/></right><top style="thin"><color rgb="FFC9D2DC"/></top><bottom style="thin"><color rgb="FFC9D2DC"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyProtection="1"><protection locked="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyProtection="1"><protection locked="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment vertical="center" wrapText="1"/><protection locked="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyProtection="1"><protection locked="1"/></xf>
<xf numFmtId="49" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="164" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="165" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1" applyProtection="1"><alignment wrapText="1" vertical="top"/><protection locked="1"/></xf>
<xf numFmtId="1" fontId="5" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyProtection="1"><protection locked="1"/></xf>
<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyProtection="1"><protection locked="1"/></xf>
<xf numFmtId="49" fontId="2" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyProtection="1"><alignment vertical="center" wrapText="1"/><protection locked="0"/></xf>
<xf numFmtId="49" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyProtection="1"><protection locked="0"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  function celulaXml(ref,c){
    if(c===null||c===undefined) return "";
    const s=c.s!==undefined?` s="${c.s}"`:"";
    if(vazio(c.v)) return `<c r="${ref}"${s}/>`;
    if(c.t==="n") return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
  }
  function sheetXml(def){
    const linhas=def.linhas||[];
    let maxC=0; linhas.forEach(l=>{ if(l&&l.length>maxC) maxC=l.length; });
    const dim=`A1:${colLetra(Math.max(0,maxC-1))}${Math.max(1,linhas.length)}`;
    const cols=(def.larguras&&def.larguras.length)
      ? "<cols>"+def.larguras.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("")+"</cols>" : "";
    let sheetData="<sheetData>";
    linhas.forEach((linha,r)=>{
      if(!linha||!linha.length) return;
      const alt=(def.alturas&&def.alturas[r])?` ht="${def.alturas[r]}" customHeight="1"`:"";
      let cells=""; linha.forEach((c,ci)=>{ cells+=celulaXml(colLetra(ci)+(r+1),c); });
      if(cells) sheetData+=`<row r="${r+1}"${alt}>${cells}</row>`;
    });
    sheetData+="</sheetData>";
    /* atenção: no OOXML cada atributo indica o que fica BLOQUEADO — 1 proíbe, 0 libera */
    const linhas01 = def.permitirInserir ? "0" : "1";
    const prot=def.protegida
      ? `<sheetProtection sheet="1" objects="1" scenarios="1" selectLockedCells="0" selectUnlockedCells="0" formatCells="0" formatColumns="0" formatRows="0" insertRows="${linhas01}" deleteRows="${linhas01}" insertColumns="1" deleteColumns="1" sort="0" autoFilter="0" pivotTables="1"/>` : "";
    const painel=def.congelar
      ? `<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${def.congelar}" topLeftCell="A${def.congelar+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${def.congelar+1}" sqref="A${def.congelar+1}"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>`;
    const merges=(def.merges&&def.merges.length)
      ? `<mergeCells count="${def.merges.length}">`+def.merges.map(m=>`<mergeCell ref="${m}"/>`).join("")+`</mergeCells>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dim}"/>${painel}<sheetFormatPr defaultRowHeight="15"/>${cols}${sheetData}${prot}${merges}</worksheet>`;
  }
  function montar(abas, corTema){
    const partes=[];
    partes.push({nome:"[Content_Types].xml", texto:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${abas.map((a,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`});
    partes.push({nome:"_rels/.rels", texto:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`});
    partes.push({nome:"xl/workbook.xml", texto:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="21000" windowHeight="13000"/></bookViews><sheets>${abas.map((a,i)=>`<sheet name="${esc(a.nome)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`});
    partes.push({nome:"xl/_rels/workbook.xml.rels", texto:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((a,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}<Relationship Id="rId${abas.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`});
    partes.push({nome:"xl/styles.xml", texto:STYLES.replace("COR_TEMA", corTema||"6B33C7")});
    abas.forEach((a,i)=>partes.push({nome:`xl/worksheets/sheet${i+1}.xml`, texto:sheetXml(a)}));
    return partes.map(p=>({nome:p.nome, bytes:new TextEncoder().encode(p.texto)}));
  }
  return {montar};
})();

export const S=(v,s)=>({v,t:"s",s});
export const N=(v,s)=>({v,t:"n",s});
export const EST={titulo:1, cab:2, rotulo:3, txt:4, valor:5, data:6, nota:7, inteiro:8,
           cabEdit:11, exemploTxt:12, exemploNum:13};

export function planilhaModelo(modulo, dados){
  const d = dados || {};
  const hoje=new Date();
  const compAtual=`${String(hoje.getMonth()+1).padStart(2,"0")}/${hoje.getFullYear()}`;
  const vaziasTxt=(n,cols)=>Array.from({length:n},()=>cols.map(c=>c==="n"?N(null,EST.valor):(c==="i"?N(null,EST.inteiro):S("",EST.txt))));

  if(modulo==="rpa"){
    const descPadrao = String(d.descricaoPadrao||"AUTONOMO").trim() || "AUTONOMO";
    let dataPadrao = d.dataPagamento || "";
    if(!dataPadrao){
      try{
        const a = competenciaAAAAMM(d.competencia||compAtual);
        const ano=Number(a.slice(0,4)), mes=Number(a.slice(4,6));
        const dia=new Date(ano,mes,0).getDate();
        dataPadrao = `${String(dia).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`;
      }catch(e){}
    }
    const abaParam={nome:"Parametros", protegida:true, larguras:[34,28],
      linhas:[
        [S("Parâmetros do lote de RPA",EST.titulo)],
        [S("Preencha só as células com fundo creme. O resto da planilha está travado de propósito.",EST.nota)],
        [],
        [S("Empresa",EST.rotulo), S(d.empresa||"",EST.txt)],
        [S("Código da empresa",EST.rotulo), N(vazio(d.codigo)?null:Number(d.codigo),EST.inteiro)],
        [S("Competência (MM/AAAA)",EST.rotulo), S(d.competencia||compAtual,EST.txt)],
        [S("Data de pagamento",EST.rotulo), S(dataPadrao,EST.txt)],
        [S("Descrição padrão do serviço",EST.rotulo), S(descPadrao,EST.txt)],
        [S("Total esperado (opcional)",EST.rotulo), N(vazio(d.totalEsperado)?null:Number(d.totalEsperado),EST.valor)],
        [],
        [S("Descrição padrão: vale para as linhas que ficarem sem descrição própria.",EST.nota)],
        [S("O nº de cada RPA é sorteado pelo gerador na hora de montar o arquivo.",EST.nota)],
        [S("Total esperado: soma que você espera do lote. O gerador confere e avisa se der diferença.",EST.nota)],
      ],
      alturas:{1:28, 10:24, 11:24, 12:24}};

    const tiposRpa = ["s","i","s","s","n"];
    const contribuintes = (d.contribuintes||[]).filter(c=>!vazio(c.nome));
    const linhasContrib = contribuintes.map(c=>[
      S(String(c.nome),EST.txt),
      N(vazio(c.codigo)?null:Number(String(c.codigo).replace(/\D/g,"")),EST.inteiro),
      S(c.cpf||"",EST.txt),
      S(c.descricao||descPadrao,EST.txt),
      N(vazio(c.valor)?null:Number(c.valor),EST.valor),
    ]);
    const exemploContrib = [S("EXEMPLO — apague esta linha",EST.exemploTxt),N(1,EST.exemploNum),
      S("000.000.000-00",EST.exemploTxt),
      S(descPadrao,EST.exemploTxt),N(1500,EST.exemploNum)];

    const abaContrib={nome:"Contribuintes", protegida:true, permitirInserir:true, congelar:1,
      larguras:[40,12,17,46,15],
      linhas:[
        [S("Nome",EST.cab),S("Código",EST.cab),S("CPF",EST.cab),
         S("Descrição do serviço",EST.cab),S("Valor",EST.cab)],
        ...(contribuintes.length ? linhasContrib : [exemploContrib]),
        ...vaziasTxt(contribuintes.length ? 15 : 60, tiposRpa),
      ],
      alturas:{0:30}};

    const abaInstr={nome:"Instrucoes", protegida:true, larguras:[110],
      linhas:[
        [S("Como preencher esta planilha",EST.titulo)],
        [],
        [S("1. Aba Parametros — informe empresa, código, competência e data de pagamento do lote.",EST.nota)],
        [S("2. Aba Contribuintes — o escritório preenche Nome, Código e CPF de antemão; o cliente completa só a coluna Valor.",EST.nota)],
        [S("3. O valor lançado é o LÍQUIDO. O Domínio calcula INSS, IRRF e ISS a partir dele (registro Sefip 13).",EST.nota)],
        [S("4. Contribuintes de categoria Padrão não entram aqui — lance direto no Domínio.",EST.nota)],
        [S("5. Linhas sem valor são ignoradas. Linhas com valor e sem código viram aviso.",EST.nota)],
        [S("6. O nº de cada RPA é sorteado pelo gerador; não existe coluna para ele.",EST.nota)],
        [S("7. Não renomeie as abas nem mexa nos cabeçalhos — o gerador procura por eles.",EST.nota)],
        [],
        [S("Depois de preenchida, arraste esta planilha para o Gerador de importação Domínio.",EST.nota)],
        [S("O arquivo .txt gerado entra no Domínio em Utilitários > Importação > de Arquivo Texto.",EST.nota)],
      ],
      alturas:{0:26}};

    const nomeRpa = d.empresa
      ? `Modelo_RPA_${sanitizarNomeArquivo(d.empresa)}.xlsx` : "Modelo_RPA.xlsx";
    return {abas:[abaParam,abaContrib,abaInstr], cor:"6B33C7", nome:nomeRpa};
  }

  /* modo simplificado: a operadora e as rubricas de plano já foram informadas no
     programa, então viram PARÂMETRO — e a aba PlanoSaude nem existe nesta planilha.
     O valor lançado na coluna da rubrica já vale como titular daquele empregado. */
  const ps = d.planoSaude;
  const modoSimples = !!(ps && ps.rubricas && ps.rubricas.length);

  const notasParam = [
    [S("Tipo do processo: 11 = folha mensal. Deixe 11 se não souber.",EST.nota)],
    [S("Total esperado: soma que você espera do lote. O gerador confere e avisa se der diferença.",EST.nota)],
    ...(modoSimples ? [[S("Plano de saúde: o valor lançado nessas rubricas entra como do próprio "+
      "empregado da linha (titular), com o CNPJ acima. Não há nada mais a preencher.",EST.nota)]] : []),
  ];
  const linhasParam = [
    [S("Parâmetros do lote de Lançamentos",EST.titulo)],
    [S("Preencha só as células com fundo creme. O resto da planilha está travado de propósito.",EST.nota)],
    [],
    [S("Empresa",EST.rotulo), S(d.empresa||"",EST.txt)],
    [S("Código da empresa",EST.rotulo), N(vazio(d.codigo)?null:Number(d.codigo),EST.inteiro)],
    [S("Competência (MM/AAAA)",EST.rotulo), S(d.competencia||compAtual,EST.txt)],
    [S("Tipo do processo",EST.rotulo), N(vazio(d.tipoProcesso)?11:Number(d.tipoProcesso),EST.inteiro)],
    [S("Total esperado (opcional)",EST.rotulo), N(vazio(d.totalEsperado)?null:Number(d.totalEsperado),EST.valor)],
    ...(modoSimples ? [
      [],
      [S("Plano de saúde — CNPJ da operadora",EST.rotulo), S(ps.cnpj,EST.txt)],
      [S("Plano de saúde — rubricas (códigos)",EST.rotulo), S(ps.rubricas.join(", "),EST.txt)],
    ] : []),
    [],
    ...notasParam,
  ];
  const alturasParam = {1:28};
  notasParam.forEach((_,i)=>{ alturasParam[linhasParam.length - notasParam.length + i] = 24; });

  const abaParam={nome:"Parametros", protegida:true, larguras:[34,28],
    linhas: linhasParam, alturas: alturasParam};

  /* colunas de rubrica: vêm do contracheque quando houver, senão duas de exemplo.
     Sempre sobram colunas em branco destravadas para o escritório nomear. */
  const rubricas = (d.rubricas && d.rubricas.length)
    ? d.rubricas
    : [{descricao:"Vale transporte", codigo:1050},{descricao:"Prêmio", codigo:1080}];
  const colsRubrica = rubricas.map(r=>S(`${r.descricao} (${r.codigo})`, EST.cabEdit));
  const sobras = Math.max(2, 6-colsRubrica.length);
  for(let i=0;i<sobras;i++) colsRubrica.push(S("",EST.cabEdit));

  const tipos = ["s","i", ...colsRubrica.map(()=>"n")];
  const empregados = (d.empregados||[]).filter(e=>!vazio(e.nome));
  const linhasEmpregados = empregados.map(e=>[
    S(String(e.nome),EST.txt),
    N(vazio(e.codigo)?null:Number(String(e.codigo).replace(/\D/g,"")),EST.inteiro),
    /* com "trazer valores", cada célula recebe o que aquela pessoa teve na rubrica */
    ...colsRubrica.map((_,i)=>{
      const r = rubricas[i];
      const v = (d.trazerValores && r && r.porEmpregado) ? r.porEmpregado[e.codigoOriginal] : null;
      return N(vazio(v)?null:Number(v), EST.valor);
    }),
  ]);
  const linhaExemplo = [S("EXEMPLO — apague esta linha",EST.exemploTxt),N(1,EST.exemploNum),
    N(180,EST.exemploNum), ...colsRubrica.slice(1).map(()=>S("",EST.exemploTxt))];

  const abaEmpr={nome:"Empregados", protegida:true, permitirInserir:true, congelar:1,
    larguras:[40,12, ...colsRubrica.map(()=>22)],
    linhas:[
      [S("Nome",EST.cab),S("Código",EST.cab), ...colsRubrica],
      ...(empregados.length ? linhasEmpregados : [linhaExemplo]),
      ...vaziasTxt(empregados.length ? 15 : 60, tipos),
    ],
    alturas:{0:32}};

  const abaInstr={nome:"Instrucoes", protegida:true, larguras:[110],
    linhas:[
      [S("Como preencher esta planilha",EST.titulo)],
      [],
      [S("1. Aba Parametros — informe empresa, código e competência da folha.",EST.nota)],
      [S("2. Aba Empregados — cada coluna de valor é uma rubrica, e o cabeçalho tem que terminar com o código entre parênteses.",EST.nota)],
      [S("   Exemplo de cabeçalho válido: Vale transporte (1050)",EST.nota)],
      [S("3. Renomeie as colunas de rubrica conforme a empresa. As colunas de cabeçalho roxo estão liberadas para digitar.",EST.nota)],
      [S("   Colunas de cabeçalho vazio são ignoradas; colunas sem código entre parênteses geram aviso.",EST.nota)],
      [S("4. O escritório preenche Nome e Código de antemão; o cliente completa só os valores.",EST.nota)],
      [S("5. Célula vazia não vira lançamento. Zero vira lançamento de R$ 0,00.",EST.nota)],
      [S("6. Não renomeie as abas — o gerador procura por elas.",EST.nota)],
      [],
      [S("Abas opcionais — preencha só se a folha tiver esses casos:",EST.nota)],
      [S("Pensao: gera o registro 30, com o código do dependente e o valor.",EST.nota)],
      [S("Servicos: gera o registro 40, com serviço, rubrica e valor.",EST.nota)],
      ...(modoSimples ? [
      [S("Plano de saúde: já está tudo configurado na aba Parametros — operadora e rubricas.",EST.nota)],
      [S("   Lance o valor na coluna da rubrica, na aba Empregados, como qualquer outra. O valor entra como do próprio empregado da linha (titular).",EST.nota)],
      [S("   Esta planilha não tem aba de plano de saúde para preencher, e não precisa mesmo.",EST.nota)],
      ] : [
      [S("PlanoSaude: marca quais rubricas são de plano de saúde e gera os registros 20 (operadora) e 25 (beneficiário).",EST.nota)],
      [S("   CASO COMUM — uma linha só, com Código da rubrica e CNPJ da Operadora. Deixe as três últimas colunas vazias.",EST.nota)],
      [S("   O valor continua sendo lançado na coluna daquela rubrica, na aba Empregados, como qualquer outra rubrica.",EST.nota)],
      [S("   COM DEPENDENTE — acrescente uma linha por beneficiário, repetindo a rubrica e preenchendo empregado, dependente e valor.",EST.nota)],
      [S("   Linha de rateio sem Código do dependente é o titular. O registro 10 sai com a SOMA do rateio.",EST.nota)],
      [S("   Se a soma do rateio não bater com o valor da aba Empregados, o gerador avisa e grava a soma do rateio.",EST.nota)],
      ]),
      [],
      [S("Faltas com data (registros 11 e 12) ainda não entram por aqui — lance direto no Domínio.",EST.nota)],
      [],
      [S("Depois de preenchida, arraste esta planilha para o Gerador de importação Domínio.",EST.nota)],
      [S("O arquivo .txt gerado entra no Domínio em Utilitários > Importação > de Arquivo Texto.",EST.nota)],
      ...(empregados.length
        ? [[],[S("Nomes, códigos e rubricas vieram do contracheque de "+(d.competencia||"")+". Confira antes de mandar para o cliente.",EST.nota)]]
        : []),
    ],
    alturas:{0:26}};

  /* abas opcionais: cada uma gera um tipo de registro complementar do leiaute */
  const abaCompl = (nome, cabecalhos, larguras, tipos, exemplo) => ({
    nome, protegida:true, permitirInserir:true, congelar:1, larguras,
    linhas:[
      cabecalhos.map(t=>S(t,EST.cab)),
      exemplo.map((v,i)=> typeof v==="number" ? N(v,EST.exemploNum) : S(v,EST.exemploTxt)),
      ...vaziasTxt(25, tipos),
    ],
    alturas:{0:28}});

  const abaPensao = abaCompl("Pensao",
    ["Código do dependente","Valor"],
    [24,16], ["i","n"],
    ["EXEMPLO — apague", 0]);

  const abaServicos = abaCompl("Servicos",
    ["Código do serviço","Código da rubrica","Valor"],
    [22,20,16], ["i","i","n"],
    ["EXEMPLO — apague","", 0]);

  /* no modo simplificado a aba PlanoSaude não é gerada: não há o que preencher nela */
  const abaPlano = modoSimples ? null : abaCompl("PlanoSaude",
    ["Código da rubrica","CNPJ da Operadora","Código do empregado","Código do dependente","Valor"],
    [20,24,22,24,16], ["i","s","i","i","n"],
    ["EXEMPLO — apague","","","", 0]);

  const nomeArq = d.empresa
    ? `Modelo_Lancamentos_${sanitizarNomeArquivo(d.empresa)}.xlsx`
    : "Modelo_Lancamentos.xlsx";
  return {abas:[abaParam,abaEmpr,abaPlano,abaPensao,abaServicos,abaInstr].filter(Boolean),
          cor:"0E6B7D", nome:nomeArq};
}

/* Plano de saúde no modelo seco: aqui não houve contracheque, então não existe
   rubrica conhecida — o usuário digita o código (e o nome) que vai virar coluna.
   Painel intocado devolve null e o modelo sai como sempre foi. */
