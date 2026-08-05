export const vazio = v => v===""||v===undefined||v===null;
export const seguro = fn => { try{ return fn(); }catch(e){ return null; } };
export const soDigitos = v => String(v==null?"":v).replace(/\D/g,"");

export function chave(n){
  return String(n||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .trim().toUpperCase().replace(/\s+/g," ");
}
export const ehExemplo = n => /exemplo/i.test(String(n||""));
export const escapar = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const moeda = n => Number(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

/* abas complementares: cada linha vira um registro 11, 12, 30 ou 40 */

export const formatarCnpj = c => {
  const d = soDigitos(c);
  if(d.length!==14) return String(c||"");
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
};
export const formatarCpf = c => {
  const d=soDigitos(c).padStart(11,"0");
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};
export function sanitizarNomeArquivo(s){
  const limpo=String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  return limpo || "empresa";
}
export const semAcento = s => String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");

/* compara sem acento: o recibo escreve AUTÔNOMO, LÍQUIDO, ESPECIFICAÇÃO */
export const semAc = s => String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
