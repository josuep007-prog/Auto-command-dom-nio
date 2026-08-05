import { chave, ehExemplo, vazio } from "./texto.mjs";

/* abas complementares: cada linha vira um registro 11, 12, 30 ou 40 */
export function acharAbaPor(wb, teste){
  return wb.SheetNames.find(nome=>teste(chave(nome)));
}
export function lerAbaComplementar(wb, teste, mapa){
  const nomeAba = acharAbaPor(wb, teste);
  if(!nomeAba) return [];
  const linhas = lerAba(wb, nomeAba) || [];
  const chaves = Object.keys(mapa);
  const h = acharLinhaCabecalho(linhas, [mapa[chaves[0]][0]]);
  if(h<0) return [];
  const cab = linhas[h].map(c=>chave(c));
  const col = {};
  for(const k of chaves){
    col[k] = cab.findIndex(c=>mapa[k].some(t=>c.includes(chave(t))));
  }
  const saida = [];
  for(let i=h+1;i<linhas.length;i++){
    const obj = {linhaPlanilha:i+1, aba:nomeAba};
    let temAlgo = false;
    for(const k of chaves){
      const v = col[k]>=0 ? linhas[i][col[k]] : "";
      obj[k] = v;
      if(!vazio(v)) temAlgo = true;
    }
    if(!temAlgo) continue;
    if(ehExemplo(obj[chaves[0]]) || chaves.some(k=>ehExemplo(obj[k]))) continue;
    saida.push(obj);
  }
  return saida;
}
export function lerComplementos(wb){
  return {
    pensoes: lerAbaComplementar(wb,
      c=>c.includes("PENSAO"),
      {dependente:["dependente","código"], valor:["valor"]}),
    servicos: lerAbaComplementar(wb,
      c=>c.includes("SERVIC"),
      {servico:["serviço","servico","código"], rubrica:["rubrica"], valor:["valor"]}),
    /* a busca do cabeçalho usa o primeiro termo da primeira chave: tem de ser "rubrica".
       Uma linha só com rubrica + CNPJ DECLARA a rubrica como plano de saúde; trazendo
       também empregado e valor, ela RATEIA entre titular e dependentes. */
    planoSaude: lerAbaComplementar(wb,
      c=>c.includes("PLANO") || c.includes("SAUDE") || c.includes("COPARTIC"),
      {rubrica:["rubrica"], cnpj:["cnpj","operadora"], empregado:["empregado"],
       dependente:["dependente"], valor:["valor"]}),
  };
}

export const lerAba = (wb,n) => wb.Sheets[n]
  ? XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:""}) : null;
export const acharAba = (wb,t) => wb.SheetNames.find(n=>n.toLowerCase().includes(t.toLowerCase()));
export function acharLinhaCabecalho(linhas,termos){
  for(let i=0;i<Math.min(linhas.length,25);i++){
    if(!linhas[i]) continue;
    const bate = termos.every(t=>linhas[i].some(c=>{
      const s=String(c).toLowerCase();
      return s.length<50 && s.includes(t);
    }));
    if(bate) return i;
  }
  return -1;
}

