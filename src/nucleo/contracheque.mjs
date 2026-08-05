import { chave } from "./texto.mjs";
import { RE_CNPJ, RE_CODIGO, ehMoeda, limparDescricao, moedaParaNumero } from "./leitura.mjs";

export const RUB_TOTAL      = /^(total|totais|base(s)? |faixa|valor l[íi]quido|l[íi]quido|liquido|dep[óo]sito|a receber|resumo|salario base$|sal[áa]rio base$)/i;
export const RUB_AUTOMATICA = new RegExp([
  /* tributos e encargos */
  "(^|\\b)(inss|i\\.?n\\.?s\\.?s|irrf|i\\.?r\\.?r\\.?f|imposto( de)? renda|ir sobre|ir retido",
  "|fgts|f\\.?g\\.?t\\.?s|contribui[çc][ãa]o previdenci|sal[áa]rio fam[íi]lia|sal-familia|arredondamento",
  /* o Domínio calcula sozinho */
  "|f[ée]rias|rescis|m[ée]dia|aviso pr[ée]vio|aviso indeniz",
  "|13[º°]|d[ée]cimo|\\b13\\s*[ºo°.]?\\s*sal",
  "|desc\\.?\\s*emp\\.?\\s*cred|cred\\.?\\s*trab|credito do trabalhador",
  "|saldo de sal|saldo sal|dias normais|pr[óo]\\s*-?\\s*labore",
  ")",   /* sem \\b no fim: sao prefixos (rescis -> RESCISAO, insalubr -> INSALUBRIDADE) */
].join(""), "i");
export const RUB_FIXA       = /(^|\b)(sal[áa]rio( base| mensal| contratual| nominal)?|ordenado|vencimento base|hora normal|horas normais)/i;
export const RUB_VARIAVEL   = /(^|\b)(hora[s]? extra|h\.?\s?e\.?\s?\d|adicional|noturn|insalubr|periculos|dsr|d\.?s\.?r|repouso remunerado|falta|atraso|comiss|pr[êe]mio|gratifica|bonifica|produtividade|ajuda de custo|di[áa]ria|reembolso|vale|adiantamento|copartic|plano de sa[úu]de|assist[êe]ncia|odontol|empr[ée]stimo|pens[ãa]o|aux[íi]lio|aux|abono|sindical|mensalidade|convenio|conv[êe]nio|desconto|desc|estorno|provisao|provis[ãa]o|cesta|quebra de caixa)/i;

export const MESES_BUSCA = {janeiro:1,fevereiro:2,"março":3,marco:3,abril:4,maio:5,junho:6,
  julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12};

/* --- PDF: reconstrói linhas a partir das coordenadas dos fragmentos --- */

/* --- classificação de rubrica --- */
export function classificarRubrica(desc){
  if(RUB_TOTAL.test(desc))      return "total";
  if(RUB_AUTOMATICA.test(desc)) return "automatica";
  if(RUB_VARIAVEL.test(desc))   return "variavel";
  if(RUB_FIXA.test(desc))       return "fixa";
  return "indefinida";
}

export function analisarContracheque(paginas){
  const todas = [].concat(...paginas);
  const avisos=[];

  /* --- empresa e CNPJ --- */
  let empresa="", cnpj="";
  for(let i=0;i<Math.min(todas.length,14);i++){
    const m = todas[i].texto.match(RE_CNPJ);
    if(m && !cnpj){
      cnpj = m[0];
      /* só o que vem ANTES do CNPJ — depois costuma ser cabeçalho alinhado à direita */
      const antes = todas[i].texto.slice(0, todas[i].texto.indexOf(m[0]))
        .replace(/cnpj:?/i,"").replace(/[-–|]\s*$/,"").trim();
      if(antes.replace(/[^A-Za-zÀ-ÿ]/g,"").length>=6) empresa=antes;
      else if(i>0) empresa=todas[i-1].texto.trim();
      break;
    }
  }
  if(!empresa){
    const cand = todas.slice(0,6).find(l=>
      l.texto.replace(/[^A-Za-zÀ-ÿ]/g,"").length>=10 && !/recibo|demonstrativo|folha|p[áa]gina/i.test(l.texto));
    if(cand) empresa=cand.texto.trim();
  }
  empresa = empresa.replace(/\s*[-–|]\s*$/,"").trim();

  /* --- competência --- */
  let competencia="";
  for(const l of todas){
    let m = l.texto.match(/(?:compet[êe]ncia|refer[êe]ncia|m[êe]s\/ano|per[íi]odo)\D{0,4}(\d{1,2})[\/\-](\d{4})/i);
    if(m){ competencia=String(m[1]).padStart(2,"0")+"/"+m[2]; break; }
    m = l.texto.match(/\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:de\s*|\/)\s*(\d{4})\b/i);
    if(m){
      const mes = MESES_BUSCA[m[1].toLowerCase()];
      if(mes){ competencia=String(mes).padStart(2,"0")+"/"+m[2]; break; }
    }
  }
  if(!competencia){
    for(const l of todas){
      const m = l.texto.match(/\b(0[1-9]|1[0-2])\/(20\d{2})\b/);
      if(m){ competencia=m[1]+"/"+m[2]; break; }
    }
  }

  /* --- empregados: cabeçalho "Código | Nome" e a linha logo abaixo --- */
  const empregados=[], vistosEmp=new Map();
  const registrar=(cod,nome,funcao)=>{
    cod=String(cod).trim(); nome=String(nome).trim().replace(/\s+/g," ");
    if(!cod||!nome) return null;
    if(nome.replace(/[^A-Za-zÀ-ÿ]/g,"").length<4) return null;
    const k=cod+"|"+chave(nome);
    if(vistosEmp.has(k)) return vistosEmp.get(k);
    const e={codigo:cod, codigoOriginal:cod, nome, funcao:(funcao||"").trim(), rubricas:new Set()};
    vistosEmp.set(k,e); empregados.push(e);
    return e;
  };

  const ehCabecalhoEmp = l => {
    const t=l.texto.toLowerCase();
    return /c[óo]digo|matr[íi]cula/.test(t) && /nome|funcion[áa]rio|empregado/.test(t)
           && !l.celulas.some(c=>ehMoeda(c.t));
  };
  /* o PDF do Domínio quebra o nome em várias células ("MARCELA","FITTIPALDI",
     "MARCONDES"). Cada célula de dado é atribuída ao cabeçalho mais próximo e
     depois as células do mesmo cabeçalho são juntadas de volta. */
  const colunaDe = (linhaDados, cabecalho, alvo) => {
    const partes=[];
    for(const c of linhaDados.celulas){
      let perto=null, dist=Infinity;
      for(const h of cabecalho.celulas){
        const d=Math.abs(c.x-h.x);
        if(d<dist){ dist=d; perto=h; }
      }
      if(perto===alvo) partes.push(c.t);
    }
    return partes.join(" ").replace(/\s+/g," ").trim();
  };

  for(let i=0;i<todas.length-1;i++){
    if(!ehCabecalhoEmp(todas[i])) continue;
    const cab=todas[i], dados=todas[i+1];
    if(dados.celulas.some(c=>ehMoeda(c.t))) continue;
    const cCod = cab.celulas.find(c=>/c[óo]digo|matr[íi]cula/i.test(c.t));
    const cNome= cab.celulas.find(c=>/nome|funcion[áa]rio|empregado/i.test(c.t));
    const cFun = cab.celulas.find(c=>/fun[çc][ãa]o|cargo/i.test(c.t));
    if(!cCod||!cNome) continue;
    const vCod = colunaDe(dados, cab, cCod);
    const vNome= colunaDe(dados, cab, cNome);
    let vFun = cFun ? colunaDe(dados, cab, cFun) : "";
    /* no recibo do Domínio o cargo vem na linha seguinte, antes de "Admissão:" */
    if(!vFun && todas[i+2] && /admiss/i.test(todas[i+2].texto)){
      const t=todas[i+2].texto.split(/admiss/i)[0].trim();
      if(t.replace(/[^A-Za-zÀ-ÿ]/g,"").length>=4) vFun=t;
    }
    if(vCod && vNome && /\d/.test(vCod))
      registrar(vCod.replace(/\D/g,""), vNome, vFun);
  }

  /* rótulos em linha: "Código: 12  Nome: FULANO" */
  if(!empregados.length){
    for(const l of todas){
      const m = l.texto.match(/c[óo]digo:?\s*(\d{1,8})\b.*?nome:?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\s]{4,60})/i);
      if(m) registrar(m[1], m[2]);
    }
  }
  /* último recurso: linha "código nome" sem valores */
  if(!empregados.length){
    for(const l of todas){
      const c=l.celulas;
      if(c.length<2 || c.some(x=>ehMoeda(x.t))) continue;
      if(!RE_CODIGO.test(c[0].t)) continue;
      if(!/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\s]{4,}$/.test(c[1].t)) continue;
      if(/descri|total|base/i.test(c[1].t)) continue;
      registrar(c[0].t, c[1].t, c[2]?c[2].t:"");
    }
  }

  /* --- rubricas, associadas ao empregado corrente --- */
  const rubricas=new Map();
  let atual=null;
  const chaveEmp = new Map(empregados.map(e=>[e.codigo+"|"+chave(e.nome), e]));

  for(let i=0;i<todas.length;i++){
    const l=todas[i];

    if(ehCabecalhoEmp(l) && todas[i+1]){
      const d=todas[i+1];
      const cCod=l.celulas.find(c=>/c[óo]digo|matr[íi]cula/i.test(c.t));
      const cNome=l.celulas.find(c=>/nome|funcion[áa]rio|empregado/i.test(c.t));
      if(cCod&&cNome){
        const vCod=colunaDe(d,l,cCod), vNome=colunaDe(d,l,cNome);
        if(vCod&&vNome){
          const k=String(vCod.replace(/\D/g,"")).trim()+"|"+chave(vNome);
          if(chaveEmp.has(k)) atual=chaveEmp.get(k);
        }
      }
      continue;
    }

    const c=l.celulas;
    if(c.length<2) continue;
    if(!RE_CODIGO.test(c[0].t)) continue;
    const valores=c.filter(x=>ehMoeda(x.t));
    if(!valores.length) continue;

    /* A descrição vai só até o primeiro valor. No recibo do Domínio as duas vias
       ficam na mesma folha e textos da outra via ("Assinatura do Funcionário")
       caem na mesma altura, à direita das colunas de valor. */
    const iPrimeiroValor = c.findIndex(x=>ehMoeda(x.t));
    const antesDoValor = c.slice(1, iPrimeiroValor<0 ? c.length : iPrimeiroValor);
    const desc = limparDescricao(
      antesDoValor.filter(x=>!/^\d+([,.]\d+)?$/.test(x.t) && !/^\d{1,3}:[0-5]\d(:[0-5]\d)?$/.test(x.t))
        .map(x=>x.t).join(" "));
    if(!desc || desc.replace(/[^A-Za-zÀ-ÿ]/g,"").length<3) continue;
    if(RUB_TOTAL.test(desc)) continue;

    const codigo=Number(c[0].t);
    const k=codigo+"|"+chave(desc);
    if(!rubricas.has(k))
      rubricas.set(k,{codigo, descricao:desc, tipo:classificarRubrica(desc),
                      valores:[], empregados:new Set(), porEmpregado:{}});
    const r=rubricas.get(k);
    const v = moedaParaNumero(valores[valores.length-1].t);
    r.valores.push(v);
    if(atual){
      r.empregados.add(atual.codigo);
      atual.rubricas.add(k);
      r.porEmpregado[atual.codigo] = v;   /* usado quando o usuário pede os valores */
    }
  }

  /* --- decide o que já vem marcado --- */
  const totalEmp = Math.max(empregados.length,1);
  const lista=[...rubricas.values()].map(r=>{
    const distintos=new Set(r.valores.map(v=>Math.round(v*100)));
    const emTodos = r.empregados.size>=totalEmp;
    const variaValor = distintos.size>1;
    let tipo=r.tipo;
    if(tipo==="indefinida") tipo = (!emTodos||variaValor) ? "variavel" : "fixa";
    return {
      codigo:r.codigo, descricao:r.descricao, tipo,
      qtdEmpregados:r.empregados.size, ocorrencias:r.valores.length,
      porEmpregado:r.porEmpregado, variaValor, emTodos,
      marcada: tipo==="variavel",
    };
  }).sort((a,b)=>a.codigo-b.codigo);

  /* o que o Domínio calcula sozinho não entra na planilha nem vira opção;
     fica só registrado para o escritório poder conferir o que ficou de fora */
  const descartadas = lista.filter(r=>r.tipo==="automatica");
  const oferecidas  = lista.filter(r=>r.tipo!=="automatica");

  if(!empregados.length) avisos.push("Não reconheci nenhum empregado — confira o arquivo ou digite os nomes na mão.");
  if(!oferecidas.length) avisos.push("Todas as rubricas do documento são calculadas pelo Domínio — cadastre abaixo a que você precisa lançar.");
  if(!competencia)       avisos.push("Não achei a competência no documento — preencha abaixo.");

  return {
    empresa, cnpj, competencia,
    empregados: empregados.map(e=>({codigo:e.codigo, codigoOriginal:e.codigoOriginal,
                                    nome:e.nome, funcao:e.funcao, marcado:true})),
    rubricas: oferecidas,
    rubricasDescartadas: descartadas,
    avisos,
    paginas: paginas.length,
  };
}

