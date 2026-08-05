import { sanitizarNomeArquivo } from "./texto.mjs";
import { competenciaAAAAMM } from "./numeros.mjs";

export function paraBytesLatin1(txt){
  const bytes=new Uint8Array(txt.length);
  for(let i=0;i<txt.length;i++){
    const cp=txt.charCodeAt(i);
    bytes[i]= cp<256 ? cp : 63;
  }
  return bytes;
}

export const CRC_TABLE=(()=>{
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    t[n]=c>>>0;
  }
  return t;
})();
export function crc32(bytes){
  let crc=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++) crc=CRC_TABLE[(crc^bytes[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}
export function concatUint8(arrays){
  let total=0; for(const a of arrays) total+=a.length;
  const out=new Uint8Array(total); let pos=0;
  for(const a of arrays){ out.set(a,pos); pos+=a.length; }
  return out;
}
export function construirZip(arquivos){
  const u16=v=>new Uint8Array([v&0xFF,(v>>>8)&0xFF]);
  const u32=v=>new Uint8Array([v&0xFF,(v>>>8)&0xFF,(v>>>16)&0xFF,(v>>>24)&0xFF]);
  const d=new Date();
  const horaDos=((d.getHours()<<11)|(d.getMinutes()<<5)|(Math.floor(d.getSeconds()/2)))&0xFFFF;
  const dataDos=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  const partes=[], central=[];
  let offset=0;
  for(const {nome, bytes} of arquivos){
    const nomeBytes=new TextEncoder().encode(nome);
    const crc=crc32(bytes);
    const localOffset=offset;
    const local=concatUint8([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(horaDos), u16(dataDos),
      u32(crc), u32(bytes.length), u32(bytes.length),
      u16(nomeBytes.length), u16(0), nomeBytes, bytes,
    ]);
    partes.push(local); offset+=local.length;
    central.push(concatUint8([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(horaDos), u16(dataDos),
      u32(crc), u32(bytes.length), u32(bytes.length),
      u16(nomeBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(localOffset), nomeBytes,
    ]));
  }
  const centralStart=offset;
  const centralBlob=concatUint8(central);
  partes.push(centralBlob); offset+=centralBlob.length;
  const fim=concatUint8([
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(centralBlob.length), u32(centralStart), u16(0),
  ]);
  partes.push(fim);
  return concatUint8(partes);
}

export const csvCampo = v => {
  const s=String(v==null?"":v);
  return /[;"\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
};
export function csvDe(cabecalho, linhas){
  return [cabecalho, ...linhas].map(l=>l.map(csvCampo).join(";")).join("\r\n")+"\r\n";
}

export function nomeArquivoSaida(modulo, dp){
  const prefixo = modulo==="rpa" ? "RPA" : "Lancamentos";
  if(!dp) return `${prefixo}.txt`;
  const nomeBase = sanitizarNomeArquivo(dp.empresaNome || ("empresa"+dp.empresa));
  let comp = "";
  try{ comp = "_"+competenciaAAAAMM(dp.competencia); }catch(e){}
  return `${prefixo}_${nomeBase}${comp}.txt`;
}

