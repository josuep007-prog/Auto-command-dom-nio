import { moeda, semAcento, vazio } from "./texto.mjs";
import { competenciaAAAAMM, competenciaExibicao, dataAAAAMMDD } from "./numeros.mjs";

export function detectarPlanilhaDesatualizada(wb, modulo){
  const nomes=wb.SheetNames.map(n=>n.toLowerCase());
  if(modulo==="lancamentos" && nomes.some(n=>n.includes("rubrica")))
    return "Essa planilha tem uma aba separada de Rubricas — modelo antigo. No modelo atual, "+
      "o código de cada rubrica fica embutido no cabeçalho da coluna, na aba Empregados "+
      "(formato \"Nome da rubrica (código)\"). Baixe o modelo atualizado e migre os dados.";
  if(nomes.some(n=>n.includes("valores do")))
    return "Essa planilha tem uma aba separada de Valores do Mês — modelo antigo. No modelo "+
      "atual, o valor fica na mesma linha do cadastro. Baixe o modelo atualizado e migre os dados.";
  return null;
}
export function detectarValoresForaDoPadrao(itens, agrupador){
  const grupos=new Map();
  for(const it of itens){
    const k=agrupador?agrupador(it):"_";
    if(!grupos.has(k)) grupos.set(k,[]);
    grupos.get(k).push(it);
  }
  const avisos=[];
  for(const lista of grupos.values()){
    if(lista.length<3) continue;
    const valores=lista.map(i=>i.valor).sort((a,b)=>a-b);
    const meio=Math.floor(valores.length/2);
    const mediana=valores.length%2 ? valores[meio] : (valores[meio-1]+valores[meio])/2;
    if(mediana<=0) continue;
    for(const it of lista){
      if(it.valor>=mediana*3 && (it.valor-mediana)>50){
        const rotulo=it.rubrica ? `${it.nome} — ${it.rubrica.exibicao}` : it.nome;
        avisos.push(`${rotulo} — R$ ${moeda(it.valor)} (mediana do grupo: R$ ${moeda(mediana)})`);
      }
    }
  }
  return avisos;
}
/* valores zerados, negativos e com mais de dois decimais */
export function conferirValores(itens){
  const zerados=[], negativos=[], arredondados=[];
  for(const it of itens){
    const r = it.rubrica ? ` — ${it.rubrica.exibicao}` : "";
    if(it.valor===0) zerados.push(`${it.nome}${r} — linha ${it.linhaPlanilha} da planilha`);
    else if(it.valor<0) negativos.push(`${it.nome}${r} — R$ ${moeda(it.valor)} (linha ${it.linhaPlanilha})`);
    if(Math.abs(it.valor*100 - Math.round(it.valor*100)) > 1e-6)
      arredondados.push(`${it.nome}${r} — ${it.valorBruto} vira R$ ${moeda(Math.round(it.valor*100)/100)}`);
  }
  const avisos=[];
  if(zerados.length)      avisos.push({titulo:"Valor zerado — o registro é gerado com R$ 0,00; apague a linha se não for lançar", lista:zerados});
  if(negativos.length)    avisos.push({titulo:"Valor negativo — o leiaute não tem campo de sinal e essas linhas não serão geradas", lista:negativos});
  if(arredondados.length) avisos.push({titulo:"Mais de duas casas decimais — arredondado para centavos", lista:arredondados});
  return avisos;
}
/* data de pagamento coerente com a competência */
export function conferirDataPagamento(dp){
  if(!dp || vazio(dp.dataPagto)) return [];
  try{
    const comp=competenciaAAAAMM(dp.competencia);
    const dataStr=dataAAAAMMDD(dp.dataPagto);
    const compData=dataStr.slice(0,6);
    const compNum=Number(comp), dataNum=Number(compData);
    const dif=(Math.floor(dataNum/100)-Math.floor(compNum/100))*12+((dataNum%100)-(compNum%100));
    if(dif<0 || dif>1) return [{titulo:"Data de pagamento fora da competência",
      lista:[`Competência ${competenciaExibicao(dp.competencia)}, pagamento em `+
             `${dataStr.slice(6,8)}/${dataStr.slice(4,6)}/${dataStr.slice(0,4)} — confira se é isso mesmo.`]}];
  }catch(e){}
  return [];
}

export function detectarForaLatin1(linhas){
  const problemas=[];
  for(const l of linhas){
    const ruins=[...new Set([...l.texto].filter(ch=>ch.codePointAt(0)>255))];
    if(ruins.length)
      problemas.push(`${l.nome} (${l.rotulo}) — ${ruins.map(c=>`"${c}"`).join(", ")}`);
  }
  return problemas;
}
export function normalizarParaLatin1(linhas){
  let mudou=0;
  for(const l of linhas){
    if([...l.texto].some(ch=>ch.codePointAt(0)>255)){
      const antes=l.texto;
      l.texto=[...semAcento(l.texto)].map(ch=>ch.codePointAt(0)>255?" ":ch).join("");
      if(l.texto!==antes) mudou++;
      if(l.detalhe) l.detalhe=semAcento(l.detalhe);
    }
  }
  return mudou;
}

