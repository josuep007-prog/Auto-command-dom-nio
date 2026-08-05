import { soDigitos } from "./texto.mjs";

export function cpfValido(cpf){
  const d=soDigitos(cpf);
  if(d.length!==11 || /^(\d)\1{10}$/.test(d)) return false;
  for(let t=9;t<11;t++){
    let s=0;
    for(let i=0;i<t;i++) s+=Number(d[i])*((t+1)-i);
    let dv=(s*10)%11; if(dv===10) dv=0;
    if(dv!==Number(d[t])) return false;
  }
  return true;
}
export function cnpjValido(cnpj){
  const d = soDigitos(cnpj);
  if(d.length!==14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = pesos => {
    let s = 0;
    for(let i=0;i<pesos.length;i++) s += Number(d[i])*pesos[i];
    const r = s%11;
    return r<2 ? 0 : 11-r;
  };
  return dv([5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[12])
      && dv([6,5,4,3,2,9,8,7,6,5,4,3,2])===Number(d[13]);
}
