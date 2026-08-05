import { chave } from "./texto.mjs";
import { competenciaAAAAMM } from "./numeros.mjs";

/* variação a partir daqui ganha destaque na lista */
export const CMP_PCT_ALERTA = 20;     /* % */
export const CMP_VAL_ALERTA = 500;    /* R$ */

export const GRUPO_ROTULO = {contribuintes:"contribuinte", empregados:"empregado",
                      estagiarios:"estagiário"};

/* o código do cadastro é a chave confiável; "0012" e "12" são a mesma pessoa */
export const codigoChave = c => String(c==null?"":c).replace(/\D/g,"").replace(/^0+(?=\d)/,"");

export function indicePessoas(rel){
  const porCodigo = new Map();
  const repetidos = [];
  ["contribuintes","empregados","estagiarios"].forEach(g=>{
    (rel.grupos[g]||[]).forEach(p=>{
      const k = codigoChave(p.codigo);
      if(!k) return;
      if(porCodigo.has(k)){ repetidos.push(`${p.nome} — código ${p.codigo}`); return; }
      porCodigo.set(k, {codigo:p.codigo, nome:p.nome, valor:p.valor, grupo:g});
    });
  });
  return {porCodigo, repetidos};
}

export function compararFolhas(relAntes, relDepois){
  const A = indicePessoas(relAntes), B = indicePessoas(relDepois);
  const avisos = [];
  if(A.repetidos.length) avisos.push(`Código repetido no relatório anterior — considerei só a primeira linha: ${A.repetidos.join("; ")}`);
  if(B.repetidos.length) avisos.push(`Código repetido no relatório atual — considerei só a primeira linha: ${B.repetidos.join("; ")}`);

  const pares = [], sairam = [], entraram = [];
  const usadosB = new Set();

  A.porCodigo.forEach((pa,k)=>{
    if(B.porCodigo.has(k)){ usadosB.add(k); pares.push([pa, B.porCodigo.get(k)]); }
    else sairam.push(pa);
  });
  B.porCodigo.forEach((pb,k)=>{ if(!usadosB.has(k)) entraram.push(pb); });

  /* quem trocou de código entre os dois meses (recadastro) apareceria como uma
     saída e uma entrada; o nome reaproxima os dois e vira uma variação só */
  const porNomeEntrou = new Map();
  entraram.forEach(p=>{
    const k = chave(p.nome);
    if(porNomeEntrou.has(k)) porNomeEntrou.set(k, null);  /* nome ambíguo: não casa */
    else porNomeEntrou.set(k, p);
  });
  const sairamFinal = [], recodificados = [];
  for(const pa of sairam){
    const par = porNomeEntrou.get(chave(pa.nome));
    if(par){
      pares.push([pa, par]);
      recodificados.push(`${pa.nome} — código ${pa.codigo} virou ${par.codigo}`);
      porNomeEntrou.set(chave(pa.nome), null);
      continue;
    }
    sairamFinal.push(pa);
  }
  const entraramFinal = entraram.filter(p=>porNomeEntrou.get(chave(p.nome))===p);
  if(recodificados.length)
    avisos.push(`Mesmo nome com código diferente nos dois meses — tratei como a mesma pessoa: ${recodificados.join("; ")}`);

  const mudaram = [], iguais = [];
  for(const [pa,pb] of pares){
    const dif = Math.round((pb.valor - pa.valor)*100)/100;
    const pct = pa.valor ? (dif/Math.abs(pa.valor))*100 : (dif?Infinity:0);
    const item = {codigo:pb.codigo, nome:pb.nome, grupo:pb.grupo,
                  antes:pa.valor, depois:pb.valor, dif, pct,
                  alerta: Math.abs(dif)>=CMP_VAL_ALERTA || Math.abs(pct)>=CMP_PCT_ALERTA};
    if(Math.abs(dif) < 0.005) iguais.push(item); else mudaram.push(item);
  }
  mudaram.sort((x,y)=>Math.abs(y.dif)-Math.abs(x.dif));
  sairamFinal.sort((x,y)=>y.valor-x.valor);
  entraramFinal.sort((x,y)=>y.valor-x.valor);

  const soma = l => l.reduce((s,p)=>s+(p.valor||p.depois||0),0);
  const totalAntes  = [...A.porCodigo.values()].reduce((s,p)=>s+p.valor,0);
  const totalDepois = [...B.porCodigo.values()].reduce((s,p)=>s+p.valor,0);

  return {
    antes:{competencia:relAntes.competencia, empresa:relAntes.empresa,
           pessoas:A.porCodigo.size, total:totalAntes},
    depois:{competencia:relDepois.competencia, empresa:relDepois.empresa,
            pessoas:B.porCodigo.size, total:totalDepois},
    entraram:entraramFinal, sairam:sairamFinal, mudaram, iguais,
    somaEntraram:soma(entraramFinal), somaSairam:soma(sairamFinal),
    difTotal: Math.round((totalDepois-totalAntes)*100)/100,
    avisos,
  };
}

/* ordena os dois relatórios pela competência — o mais antigo é a base */
export function ordenarPorCompetencia(a, b){
  const n = rel => { try{ return Number(competenciaAAAAMM(rel.competencia)); }catch(e){ return null; } };
  const na = n(a), nb = n(b);
  if(na!==null && nb!==null && nb<na) return [b,a];
  return [a,b];
}

