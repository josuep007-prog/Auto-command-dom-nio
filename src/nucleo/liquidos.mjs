import { moeda, semAc } from "./texto.mjs";
import { ehMoeda, moedaParaNumero } from "./leitura.mjs";

export const RE_SECAO = /^(contribuintes|autonomos|empregados|estagiarios|dirigentes|socios|diretores)$/i;

export function ehRelacaoLiquidos(paginas){
  const t = semAc([].concat(...paginas).slice(0,30).map(l=>l.texto).join(" ")).toLowerCase();
  return /rela[çc]?[aã]?o geral dos liquidos|relacao geral dos liquidos/.test(t)
      || (/total da empresa/.test(t) && /nome do empregado/.test(t));
}

export function grupoDaSecao(txt){
  const t = semAc(txt).toLowerCase();
  if(/contribuinte|autonomo/.test(t)) return "contribuintes";
  if(/estagiario/.test(t))            return "estagiarios";
  if(/empregado/.test(t))             return "empregados";
  return "outros";
}

export function analisarRelacaoLiquidos(paginas){
  const todas = [].concat(...paginas);
  const avisos = [];
  let empresa="", cnpj="", competencia="", calculo="", emissao="", totalEmpresa=null;

  /* cabeçalho: rótulo numa célula, valor na seguinte */
  for(const l of todas){
    const c = l.celulas;
    for(let i=0;i<c.length-1;i++){
      const t = semAc(c[i].t).toLowerCase().replace(/\s+/g,"");
      const v = c[i+1].t.trim();
      if(!v) continue;
      if(t.startsWith("empresa:")      && !empresa)     empresa = v;
      else if(t.startsWith("cnpj:")    && !cnpj)        cnpj = v;
      else if(t.startsWith("calculo:") && !calculo)     calculo = v;
      else if(t.startsWith("competencia:") && !competencia) competencia = v;
      else if(t.startsWith("emissao:") && !emissao)     emissao = v;
    }
  }

  const grupos = {contribuintes:[], empregados:[], estagiarios:[], outros:[]};
  let secao = "outros";

  for(const l of todas){
    const c = l.celulas;
    if(!c.length) continue;

    /* rodapé com o total da empresa */
    if(/total da empresa/i.test(semAc(l.texto))){
      const m = c.filter(x=>ehMoeda(x.t));
      if(m.length) totalEmpresa = moedaParaNumero(m[m.length-1].t);
      continue;
    }
    /* cabeçalho de grupo */
    if(c.length<=2 && RE_SECAO.test(semAc(c[0].t).trim())){
      secao = grupoDaSecao(c[0].t);
      continue;
    }
    /* linha de pessoa: código, nome, (identidade), valor */
    if(!/^\d{1,10}$/.test(c[0].t)) continue;
    const valores = c.filter(x=>ehMoeda(x.t));
    if(!valores.length) continue;
    const nome = c.slice(1)
      .filter(x=>!ehMoeda(x.t) && !/^\d+$/.test(x.t))
      .map(x=>x.t).join(" ").replace(/\s+/g," ").trim();
    if(nome.replace(/[^A-Za-zÀ-ÿ]/g,"").length < 4) continue;

    grupos[secao].push({
      codigo: c[0].t,
      nome,
      valor: moedaParaNumero(valores[valores.length-1].t),
      cpf: "",
      cpfValido: null,
      descricao: "",
      numeroRecibo: "",
      marcado: true,
    });
  }

  const total = grupos.contribuintes.length + grupos.empregados.length +
                grupos.estagiarios.length + grupos.outros.length;
  if(!total) avisos.push("Não reconheci nenhuma linha de pessoa neste relatório.");
  if(grupos.outros.length)
    avisos.push(`${grupos.outros.length} linha(s) apareceram antes de qualquer cabeçalho de grupo e entraram como contribuintes.`);
  grupos.contribuintes = grupos.contribuintes.concat(grupos.outros);
  grupos.outros = [];

  if(totalEmpresa!==null){
    const soma = [].concat(grupos.contribuintes, grupos.empregados, grupos.estagiarios)
      .reduce((s,p)=>s+p.valor,0);
    if(Math.abs(soma-totalEmpresa) > 0.005)
      avisos.push(`A soma das linhas (R$ ${moeda(soma)}) não bate com o total do relatório (R$ ${moeda(totalEmpresa)}) — pode ter linha que não consegui ler.`);
  }

  return {empresa, cnpj, competencia, calculo, emissao, totalEmpresa,
          grupos, avisos, paginas:paginas.length};
}

