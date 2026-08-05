import { competenciaAAAAMM, competenciaExibicao, dataAAAAMMDD } from "./numeros.mjs";

/* Meeus/Jones/Butcher — domingo de Páscoa no calendário gregoriano */
export function domingoDePascoa(ano){
  const a=ano%19, b=Math.floor(ano/100), c=ano%100;
  const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4), k=c%4;
  const l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const mes=Math.floor((h+l-7*m+114)/31);
  const dia=((h+l-7*m+114)%31)+1;
  return new Date(ano, mes-1, dia);
}

export const soData   = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const somaDias = (d,n) => { const x=soData(d); x.setDate(x.getDate()+n); return x; };
export const chaveDia = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
export const dataBR   = d => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
export const DIA_SEMANA = ["domingo","segunda-feira","terça-feira","quarta-feira",
                    "quinta-feira","sexta-feira","sábado"];

/* 20/11 virou feriado nacional pela Lei 14.759/2024 */
export const FERIADOS_FIXOS = [
  [1,1,"Confraternização Universal"], [4,21,"Tiradentes"], [5,1,"Dia do Trabalho"],
  [9,7,"Independência do Brasil"],    [10,12,"Nossa Senhora Aparecida"],
  [11,2,"Finados"], [11,15,"Proclamação da República"], [11,20,"Consciência Negra"],
  [12,25,"Natal"],
];

export const feriadosCache = new Map();
export function feriadosNacionais(ano){
  if(feriadosCache.has(ano)) return feriadosCache.get(ano);
  const lista = FERIADOS_FIXOS.map(([m,d,nome])=>
    ({data:new Date(ano,m-1,d), nome, movel:false, legal:true}));
  const p = domingoDePascoa(ano);
  lista.push({data:somaDias(p,-48), nome:"Carnaval (segunda)",        movel:true, legal:false});
  lista.push({data:somaDias(p,-47), nome:"Carnaval (terça)",          movel:true, legal:false});
  lista.push({data:somaDias(p,-46), nome:"Quarta-feira de Cinzas",    movel:true, legal:false});
  lista.push({data:somaDias(p,-2),  nome:"Sexta-feira Santa",         movel:true, legal:true});
  lista.push({data:p,               nome:"Domingo de Páscoa",         movel:true, legal:true});
  lista.push({data:somaDias(p,60),  nome:"Corpus Christi",            movel:true, legal:false});
  lista.sort((a,b)=>a.data-b.data);
  feriadosCache.set(ano, lista);
  return lista;
}

export const mapaCache = new Map();
export function mapaFeriados(ano){
  if(mapaCache.has(ano)) return mapaCache.get(ano);
  const m = new Map();
  feriadosNacionais(ano).forEach(f=>{ if(f.legal) m.set(chaveDia(f.data), f.nome); });
  mapaCache.set(ano, m);
  return m;
}

export function ehDiaUtil(d){
  const s = d.getDay();
  if(s===0 || s===6) return false;
  return !mapaFeriados(d.getFullYear()).has(chaveDia(d));
}
export function motivoNaoUtil(d){
  const s = d.getDay();
  if(s===0) return "domingo";
  if(s===6) return "sábado";
  return mapaFeriados(d.getFullYear()).get(chaveDia(d)) || null;
}
/* posterga para o próximo dia útil — é o que o eSocial faz com o dia 15 */
export function proximoDiaUtil(d){
  let x = soData(d);
  for(let n=0; n<40 && !ehDiaUtil(x); n++) x = somaDias(x,1);
  return x;
}

export function prazosDaCompetencia(comp){
  let aaaamm;
  try{ aaaamm = competenciaAAAAMM(comp); }catch(e){ return null; }
  const ano = Number(aaaamm.slice(0,4)), mes = Number(aaaamm.slice(4,6));
  if(!ano || mes<1 || mes>13) return null;
  if(mes===13) return {aaaamm, ano, mes, s1200:null};
  /* mês 1-12 usado como índice 0-based cai no mês SEGUINTE, que é o do prazo */
  const base = new Date(ano, mes, 15);
  const limite = proximoDiaUtil(base);
  return {aaaamm, ano, mes,
          s1200:{base, limite, postergado: chaveDia(limite)!==chaveDia(base)}};
}

export function avisoCompetenciaPagamento(comp, dataPg){
  let a, d;
  try{ a = competenciaAAAAMM(comp); }catch(e){ return null; }
  try{ d = dataAAAAMMDD(dataPg); }catch(e){ return null; }
  const compPg = d.slice(0,6);
  if(compPg === a) return null;
  return `O pagamento cai em ${competenciaExibicao(compPg)}, fora da competência de `+
    `apuração (${competenciaExibicao(a)}). Se precisar retificar depois, a reabertura `+
    `(S-1298) tem de alcançar as duas competências — a de apuração e a de pagamento.`;
}

