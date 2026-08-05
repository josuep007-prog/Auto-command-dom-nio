import { chave, semAc } from "./texto.mjs";
import { cpfValido } from "./documentos.mjs";
import { RE_CNPJ, ehMoeda, moedaParaNumero } from "./leitura.mjs";
import { ehRelacaoLiquidos } from "./liquidos.mjs";

export const RE_CPF_FMT = /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/;
export const RE_DATA_BR = /\b(\d{2}\/\d{2}\/\d{4})\b/;
export const BOILERPLATE = /remunera[çc][ãa]o ser[áa] inclu[íi]da|assinatura|declaro ter recebido|conforme discriminativo|discriminativo abaixo/i;

export function detectarTipoDocumento(paginas){
  if(ehRelacaoLiquidos(paginas)) return "liquidos";
  const texto = semAc([].concat(...paginas).slice(0,80).map(l=>l.texto).join(" ")).toLowerCase();
  if(/recibo de pagamento a autonomo|\brpa\b/.test(texto)) return "rpa";
  if(/nome do funcionario|recibo de pagamento de sal|demonstrativo de pagamento/.test(texto))
    return "lancamentos";
  return null;
}

export function analisarRecibosRpa(paginas){
  const todas = [].concat(...paginas);
  const avisos = [];

  const inicios = [];
  todas.forEach((l,i)=>{ if(/recibo de pagamento a autonomo/i.test(semAc(l.texto))) inicios.push(i); });
  if(!inicios.length) return {empresa:"", cnpj:"", competencia:"", dataPagamento:"",
    autonomos:[], avisos:["Não encontrei nenhum recibo de RPA neste arquivo."], paginas:paginas.length};

  let empresa="", cnpj="";
  const autonomos=[], vistos=new Set();

  for(let b=0;b<inicios.length;b++){
    const ini=inicios[b], fim=(b+1<inicios.length)?inicios[b+1]:todas.length;
    const bloco=todas.slice(ini,fim);
    const texto=bloco.map(l=>l.texto).join(" ");

    /* empresa e CNPJ — a linha do CNPJ traz a razão social do outro lado */
    if(!cnpj){
      for(const l of bloco){
        const m=l.texto.match(RE_CNPJ);
        if(!m) continue;
        cnpj=m[0];
        const resto=l.celulas.filter(c=>!RE_CNPJ.test(c.t)).map(c=>c.t).join(" ").trim();
        if(resto.replace(/[^A-Za-zÀ-ÿ]/g,"").length>=4) empresa=resto;
        break;
      }
    }

    /* nome completo: vem na linha logo abaixo do rótulo */
    let nome="";
    for(let i=0;i<bloco.length;i++){
      if(!/nome completo/i.test(semAc(bloco[i].texto))) continue;
      for(let j=i+1;j<Math.min(i+4,bloco.length);j++){
        const t=bloco[j].celulas[0] ? bloco[j].celulas[0].t.trim() : "";
        if(!t || BOILERPLATE.test(bloco[j].texto)) continue;
        if(t.replace(/[^A-Za-zÀ-ÿ]/g,"").length<4) continue;
        nome=t; break;
      }
      if(nome) break;
    }
    if(!nome) continue;

    /* valor líquido: o rótulo e o número ficam na mesma linha */
    let valor=null;
    for(const l of bloco){
      if(!/valor liquido/i.test(semAc(l.texto))) continue;
      const money=l.celulas.filter(c=>ehMoeda(c.t));
      if(money.length){ valor=moedaParaNumero(money[money.length-1].t); break; }
    }
    if(valor===null){
      const m=semAc(texto).match(/importancia de R\$\s*([\d.]+,\d{2})/i);
      if(m) valor=moedaParaNumero(m[1]);
    }

    /* nº do recibo: valor solto logo abaixo do rótulo, na mesma coluna */
    let numeroRecibo="";
    for(let i=0;i<bloco.length;i++){
      const rot=bloco[i].celulas.find(c=>/n[ºo°]?\s*recibo/i.test(semAc(c.t)));
      if(!rot) continue;
      for(let j=i+1;j<Math.min(i+3,bloco.length);j++){
        const c=bloco[j].celulas.find(x=>/^\d{1,8}$/.test(x.t) && Math.abs(x.x-rot.x)<40);
        if(c){ numeroRecibo=c.t; break; }
      }
      if(numeroRecibo) break;
    }

    const mCpf  = texto.match(RE_CPF_FMT);
    const mData = texto.match(RE_DATA_BR);
    const mEsp  = semAc(texto).match(/servicos? de\s+(.+?)\s+a importancia/i);

    const cpf = mCpf ? mCpf[1] : "";
    const k = chave(nome)+"|"+cpf+"|"+numeroRecibo;
    if(vistos.has(k)) continue;
    vistos.add(k);

    autonomos.push({
      nome, cpf,
      codigo: "",            /* preenchido pelo usuário no menu */
      cpfValido: cpf ? cpfValido(cpf) : null,
      valor,
      numeroRecibo,
      data: mData ? mData[1] : "",
      descricao: mEsp ? mEsp[1].trim().replace(/\s+/g," ").slice(0,100) : "",
      marcado: true,
    });
  }

  /* data de pagamento e competência: a mais frequente do lote */
  const contagem=new Map();
  autonomos.forEach(a=>{ if(a.data) contagem.set(a.data,(contagem.get(a.data)||0)+1); });
  let dataPagamento="";
  let maior=0;
  contagem.forEach((n,d)=>{ if(n>maior){ maior=n; dataPagamento=d; } });
  const competencia = dataPagamento ? dataPagamento.slice(3,10).replace("/","/") : "";

  const semValor = autonomos.filter(a=>a.valor===null).length;
  const cpfRuim  = autonomos.filter(a=>a.cpfValido===false).map(a=>`${a.nome} — ${a.cpf}`);
  if(semValor) avisos.push(`${semValor} recibo(s) sem valor líquido reconhecido.`);
  if(cpfRuim.length) avisos.push("CPF que não passa na validação: "+cpfRuim.join("; "));
  if(contagem.size>1) avisos.push("Os recibos têm datas de pagamento diferentes — confirme a data do lote.");
  avisos.push("O código do contribuinte não vem no recibo — preencha na lista abaixo, antes de gerar.");

  return {empresa, cnpj, competencia, dataPagamento, autonomos, avisos, paginas:paginas.length};
}

