import { moeda, vazio } from "./texto.mjs";

export function num(v,t){
  if(vazio(v)) v=0;
  const n=Number(v);
  if(!Number.isFinite(n)) throw new Error("código não numérico no cadastro");
  if(n<0) throw new Error("código negativo não é aceito");
  const s=String(Math.trunc(n));
  if(s.length>t) throw new Error(`valor "${s}" excede ${t} posições`);
  return s.padStart(t,"0");
}
export function alfa(v,t){
  let s=(v===null||v===undefined)?"":String(v);
  return s.slice(0,t).padEnd(t," ");
}
/* HH:MM -> o Domínio grava hora como hora mesmo, não como fração decimal.
   01:30 tem que virar os dígitos 0130 no campo — por isso a conta é
   horas + minutos/100 (não minutos/60): ×100 na hora de gravar devolve
   exatamente "0130", que é a hora e o minuto lado a lado, não "1,5 hora".
   O Excel também grava isso como um horário puro (Date cravado em
   30/12/1899) quando a célula tem formato h:mm — mesmo valor, outra forma. */
export const RE_HORA = /^(\d{1,3}):([0-5]\d)$/;
export function horaParaCampo(h,m){ return Number(h) + Number(m)/100; }

export function paraNumero(v){
  if(v instanceof Date){
    /* o SheetJS monta esse Date com Date.UTC — ler com getFullYear/getHours (hora local)
       desalinha o dia e a hora em qualquer fuso a oeste de UTC, Brasil incluído.
       Tem que ler em UTC para bater com o serial gravado pelo Excel. */
    if(v.getUTCFullYear()===1899 && v.getUTCMonth()===11 && v.getUTCDate()===30)
      return horaParaCampo(v.getUTCHours(), v.getUTCMinutes());
    throw new Error(`valor inválido: a célula tem uma data, não um número`);
  }
  if(typeof v==="number"){
    if(!Number.isFinite(v)) throw new Error(`valor inválido: "${v}"`);
    return v;
  }
  const mHora = String(v).trim().match(RE_HORA);
  if(mHora) return horaParaCampo(mHora[1], mHora[2]);

  let s=String(v).trim().replace(/[R$\s\u00A0]/gi,"");
  const negativo = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/^[-(]|\)$/g,"");
  if(s.includes(",")){
    s=s.replace(/\./g,"").replace(",",".");
  }else{
    const pontos=(s.match(/\./g)||[]).length;
    if(pontos>1 || (pontos===1 && /\.\d{3}$/.test(s))) s=s.replace(/\./g,"");
  }
  const n=Number(s);
  if(s===""||isNaN(n)) throw new Error(`valor inválido: "${v}"`);
  return negativo ? -n : n;
}
export function centavos(v,t){
  const n=paraNumero(v);
  if(n<0) throw new Error(`valor negativo (R$ ${moeda(n)}) — o leiaute não tem campo de sinal; use a rubrica de desconto correspondente`);
  const c=String(Math.round(n*100));
  if(c.length>t) throw new Error(`valor R$ ${moeda(n)} excede as ${t} posições do campo`);
  return c.padStart(t,"0");
}
export function dataAAAAMMDD(v){
  if(vazio(v)) throw new Error("data vazia");
  /* o SheetJS monta a data da célula com Date.UTC — ler em hora local desalinha
     o dia em qualquer fuso a oeste de UTC (Brasil incluído). As datas que a própria
     função monta a partir de texto usam o construtor local, e essas lê-se em local mesmo. */
  if(v instanceof Date){
    if(isNaN(v)) throw new Error(`data inválida: "${v}"`);
    return String(v.getUTCFullYear())+String(v.getUTCMonth()+1).padStart(2,"0")+
           String(v.getUTCDate()).padStart(2,"0");
  }
  const s=String(v).trim();
  let d, m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if(m) d=new Date(+m[3],+m[2]-1,+m[1]);
  else{
    m=s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    d = m ? new Date(+m[1],+m[2]-1,+m[3]) : new Date(s);
  }
  if(isNaN(d)) throw new Error(`data inválida: "${v}"`);
  return String(d.getFullYear())+String(d.getMonth()+1).padStart(2,"0")+
         String(d.getDate()).padStart(2,"0");
}
export function numeroAleatorioRPA(usados, digitos){
  const max = Math.pow(10, digitos) - 1;
  const min = Math.floor(max * 0.5);
  let n;
  do{ n = min + Math.floor(Math.random() * (max - min + 1)); }while(usados.has(n));
  usados.add(n);
  return n;
}

export function competenciaAAAAMM(v){
  /* mesma ressalva de dataAAAAMMDD: célula de data do Excel vem em UTC */
  if(v instanceof Date) return String(v.getUTCFullYear())+String(v.getUTCMonth()+1).padStart(2,"0");
  const s=String(v).trim();
  let m=s.match(/^(\d{1,2})[\/\-](\d{4})$/); if(m) return m[2]+m[1].padStart(2,"0");
  m=s.match(/^(\d{4})[\/\-](\d{1,2})$/);     if(m) return m[1]+m[2].padStart(2,"0");
  if(/^\d{6}$/.test(s)) return s;
  throw new Error(`competência inválida: "${v}" (use MM/AAAA)`);
}
export const MESES_PT=["janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro"];
export function competenciaExibicao(v){
  try{
    const aaaamm=competenciaAAAAMM(v);
    const mes=Number(aaaamm.slice(4,6));
    return `${MESES_PT[mes-1]}/${aaaamm.slice(0,4)}`;
  }catch(e){ return String(v||""); }
}
