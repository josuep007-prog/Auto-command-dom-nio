export const RE_MOEDA   = /^-?\d{1,3}(?:\.\d{3})*,\d{2}-?$/;
export const RE_CODIGO  = /^\d{1,6}$/;
export const RE_CNPJ    = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;

/* --- PDF: reconstrói linhas a partir das coordenadas dos fragmentos --- */
export function agruparLinhas(itens){
  const linhas=[];
  for(const it of itens){
    if(!it.str || !it.str.trim()) continue;
    const y = it.transform[5], x = it.transform[4];
    const larg = it.width || (String(it.str).length*4);
    let alvo = linhas.find(l=>Math.abs(l.y-y)<=2.5);
    if(!alvo){ alvo={y, pedacos:[]}; linhas.push(alvo); }
    alvo.pedacos.push({x, fim:x+larg, t:it.str});
  }
  return linhas
    .sort((a,b)=>b.y-a.y)
    .map(l=>{
      l.pedacos.sort((a,b)=>a.x-b.x);
      const celulas=[];
      for(const p of l.pedacos){
        const ult=celulas[celulas.length-1];
        /* fragmentos quase colados são a mesma palavra quebrada pelo PDF */
        if(ult && p.x-ult.fim < 4){ ult.t+=p.t; ult.fim=p.fim; }
        else celulas.push({x:p.x, fim:p.fim, t:p.t});
      }
      const cels=celulas.map(c=>({x:c.x, t:c.t.trim()})).filter(c=>c.t);
      return {celulas:cels, texto:cels.map(c=>c.t).join(" ").replace(/\s+/g," ").trim()};
    })
    .filter(l=>l.texto);
}

export async function linhasDoPdf(buffer){
  if(typeof pdfjsLib==="undefined") throw new Error("o leitor de PDF não carregou nesta página");
  const doc = await pdfjsLib.getDocument({data:buffer, isEvalSupported:false}).promise;
  const paginas=[];
  for(let p=1;p<=doc.numPages;p++){
    const pag = await doc.getPage(p);
    const tc = await pag.getTextContent();
    paginas.push(agruparLinhas(tc.items));
  }
  try{ await doc.destroy(); }catch(e){}
  return paginas;
}

/* --- texto colado: as colunas viram células por espaçamento --- */
export function linhasDoTexto(txt){
  return txt.split(/\r?\n/).map(l=>{
    const cels = l.split(/\s{2,}|\t+/).map(t=>t.trim()).filter(Boolean)
      .map((t,i)=>({x:i*100, t}));
    return {celulas:cels, texto:cels.map(c=>c.t).join(" ").replace(/\s+/g," ").trim()};
  }).filter(l=>l.texto);
}

export const ehMoeda = t => RE_MOEDA.test(t);
/* tira número de documento e pontuação solta que o recibo deixa na descrição */
export const limparDescricao = d => String(d)
  .replace(/\s*N[ºo°]?\.?\s*\d{4,}\s*$/i,"")
  .replace(/\s*N[ºo°]\.?\s*$/i,"")
  .replace(/[\s|.\-_,;:]+$/,"")
  .replace(/\s+/g," ").trim().slice(0,60);
export const moedaParaNumero = t => Number(String(t).replace(/\./g,"").replace(",",".").replace(/-$/,"")) * (/-$/.test(t)?-1:1);

/* --- classificação de rubrica --- */
