import { chave, ehExemplo, formatarCpf, moeda, seguro, soDigitos, vazio } from "./texto.mjs";
import { alfa, centavos, competenciaAAAAMM, dataAAAAMMDD, num, numeroAleatorioRPA, paraNumero } from "./numeros.mjs";
import { cpfValido } from "./documentos.mjs";
import { avisoCompetenciaPagamento } from "./calendario.mjs";
import { acharAba, acharLinhaCabecalho, lerAba, lerComplementos } from "./planilha.mjs";

export const MODULOS = {

rpa: {
  rotulo: "RPA",
  nomeArquivoSaida: "rpa_importacao.txt",
  dropTitulo: "Arraste a planilha de RPA, ou clique para escolher",
  dropHint: "Abas <em>Parametros</em> e <em>Contribuintes</em> · várias planilhas geram em lote",
  abaValores: "Contribuintes",
  campos: [
    {nome:"Código da empresa",     ini:1,   tam:7,   curto:"empresa"},
    {nome:"Código do contribuinte",ini:8,   tam:10,  curto:"contrib."},
    {nome:"Competência",           ini:18,  tam:6,   curto:"compet"},
    {nome:"Descrição da atividade",ini:24,  tam:100, curto:"descrição da atividade"},
    {nome:"Nº do RPA",             ini:124, tam:6,   curto:"nº RPA"},
    {nome:"Data de pagamento",     ini:130, tam:8,   curto:"data pg."},
    {nome:"Valor líquido",         ini:138, tam:11,  curto:"valor líq.", principal:true},
  ],
  abaEntidade: "contribuinte",
  colunaEntidade: "autônomo",

  parseDePara(wb){
    const abaP=acharAba(wb,"parametro");
    if(!abaP) throw new Error("a planilha de RPA precisa ter a aba 'Parametros'");

    let empresa=null, empresaNome=null, competencia=null, dataPagto=null,
        totalEsperado=null, descricaoPadrao=null;
    for(const l of lerAba(wb,abaP)){
      const rot=String(l[0]||"").toLowerCase(), val=l[1];
      if(val===""||val===undefined||val===null) continue;
      if(rot.includes("empresa") && rot.includes("código"))            empresa=val;
      else if(rot.includes("empresa") && !rot.includes("nome do arq")) empresaNome=val;
      else if(rot.includes("compet"))                                  competencia=val;
      else if(rot.includes("data") && rot.includes("pagamento"))       dataPagto=val;
      else if(rot.includes("total") && rot.includes("esperado"))       totalEsperado=val;
      else if(rot.includes("descri"))                                  descricaoPadrao=val;
    }
    if(empresa===null)     throw new Error("preencha o código da empresa na aba Parametros");
    if(competencia===null) throw new Error("preencha a competência na aba Parametros");
    if(dataPagto===null)   throw new Error("preencha a data de pagamento do lote na aba Parametros");
    return {empresa,empresaNome,competencia,dataPagto,
            descricaoPadrao: String(descricaoPadrao==null?"AUTONOMO":descricaoPadrao).trim() || "AUTONOMO",
            totalEsperado: totalEsperado===null?null:seguro(()=>paraNumero(totalEsperado))};
  },

  parseItensPlanilha(dp, wb){
    const abaC = acharAba(wb,"contribuinte");
    if(!abaC) throw new Error("não encontrei a aba 'Contribuintes' na planilha carregada");
    const linhas = lerAba(wb, abaC);
    const h = acharLinhaCabecalho(linhas,["nome"]);
    if(h<0) throw new Error("não encontrei o cabeçalho da aba Contribuintes (esperava uma coluna 'Nome')");
    const headerRow = linhas[h].map(c=>String(c).toLowerCase());
    const colNome  = headerRow.findIndex(c=>c.includes("nome"));
    const colCod   = headerRow.findIndex(c=>c.includes("código")||c.includes("codigo"));
    const colDesc  = headerRow.findIndex(c=>c.includes("descri")||c.includes("serviço")||c.includes("servico"));
    const colValor = headerRow.findIndex(c=>c.includes("valor"));
    const colCpf   = headerRow.findIndex(c=>c.replace(/[^a-z]/g,"")==="cpf");
    if(colCod<0)   throw new Error("não encontrei a coluna de CÓDIGO na aba Contribuintes");
    if(colValor<0) throw new Error("não encontrei a coluna VALOR na aba Contribuintes");

    const itens=[], ignoradas=[], incompletos=[], duplicados=[],
          cpfRuins=[], cpfRepetidos=[], nomesRepetidos=[];
    const porCodigo=new Map(), porNome=new Map(), porCpf=new Map();

    for(let i=h+1;i<linhas.length;i++){
      const nome=linhas[i][colNome];
      if(!nome||ehExemplo(nome)) continue;
      const val=linhas[i][colValor];
      if(vazio(val)) continue;
      const cod=linhas[i][colCod];
      if(vazio(cod)){
        incompletos.push(`${nome} — falta o código do contribuinte nessa linha`);
        continue;
      }
      const nomeLimpo=String(nome).trim();

      if(porCodigo.has(String(cod)))
        duplicados.push(`${nomeLimpo} e ${porCodigo.get(String(cod))} usam o mesmo código (${cod})`);
      else porCodigo.set(String(cod), nomeLimpo);

      const kNome=chave(nomeLimpo);
      if(porNome.has(kNome) && porNome.get(kNome)!==String(cod))
        nomesRepetidos.push(`${nomeLimpo} — aparece com os códigos ${porNome.get(kNome)} e ${cod}`);
      else porNome.set(kNome, String(cod));

      let cpf=null;
      if(colCpf>=0 && !vazio(linhas[i][colCpf])){
        cpf = soDigitos(linhas[i][colCpf]).padStart(11,"0");
        if(!cpfValido(cpf)) cpfRuins.push(`${nomeLimpo} — CPF ${formatarCpf(cpf)} não passa na validação`);
        else if(porCpf.has(cpf)) cpfRepetidos.push(`${nomeLimpo} e ${porCpf.get(cpf)} têm o mesmo CPF (${formatarCpf(cpf)})`);
        else porCpf.set(cpf, nomeLimpo);
      }

      const descricao = String((colDesc>=0 ? linhas[i][colDesc] : "")||"").trim();
      try{
        itens.push({nome:nomeLimpo, codigo:cod, descricao, cpf,
                    valor:paraNumero(val), valorBruto:val, linhaPlanilha:i+1});
      }
      catch(e){ ignoradas.push(`${nomeLimpo} — valor inválido: "${val}"`); }
    }

    const avisos=[];
    if(incompletos.length)    avisos.push({titulo:"Valor preenchido sem código cadastrado — corrija a linha na aba Contribuintes", lista:incompletos});
    if(duplicados.length)     avisos.push({titulo:"Mesmo código usado em mais de uma linha — confira se é duplicidade", lista:duplicados});
    if(nomesRepetidos.length) avisos.push({titulo:"Mesmo nome com códigos diferentes — pode ser cadastro duplicado no Domínio", lista:nomesRepetidos});
    if(cpfRuins.length)       avisos.push({titulo:"CPF inválido no cadastro — corrija antes de transmitir", lista:cpfRuins});
    if(cpfRepetidos.length)   avisos.push({titulo:"Mesmo CPF em mais de um contribuinte", lista:cpfRepetidos});
    return {itens, ignoradas, avisos};
  },

  gerar(dp, itens){
    const comp=competenciaAAAAMM(dp.competencia), dataFmt=dataAAAAMMDD(dp.dataPagto);
    const linhas=[], comErro=[], avisosExtra=[];
    const usados=new Set();

    const padrao = String(dp.descricaoPadrao||"").trim();
    const semDescricao=[], usaramPadrao=[];
    for(const it of itens){
      const descricao = it.descricao || padrao;
      if(!descricao) semDescricao.push(it.nome);
      else if(!it.descricao) usaramPadrao.push(it.nome);
      try{
        /* o nº do RPA é sempre sorteado pelo programa, sem repetir dentro do lote */
        const n = numeroAleatorioRPA(usados, 6);
        const texto =
          num(dp.empresa,7)+num(it.codigo,10)+comp+
          alfa(descricao,100)+num(n,6)+dataFmt+centavos(it.valor,11);
        linhas.push({
          nome: it.nome, valor: it.valor, rotulo: `RPA ${String(n).padStart(6,"0")}`,
          codigo: it.codigo, cpf: it.cpf, detalhe: descricao,
          linhaPlanilha: it.linhaPlanilha, texto, campos: MODULOS.rpa.campos,
        });
      }catch(e){ comErro.push(`${it.nome} — ${e.message}`); }
    }

    const avisoPg = avisoCompetenciaPagamento(dp.competencia, dp.dataPagto);
    if(avisoPg) avisosExtra.push({
      titulo:"Pagamento em competência diferente da apuração", lista:[avisoPg]});
    if(semDescricao.length) avisosExtra.push({titulo:"Sem descrição do serviço — o campo da atividade vai em branco no arquivo", lista:semDescricao});
    if(usaramPadrao.length) avisosExtra.push({
      titulo:`Sem descrição na planilha — usei a padrão "${padrao}"`, lista:usaramPadrao});

    return {
      linhas, comErro, semCadastro:[], pendentes:[], avisosExtra,
      resumoExtra: linhas.length ? `Numeração dos RPA<b>sorteada</b>` : "",
    };
  },
},

lancamentos: {
  rotulo: "Lançamentos",
  nomeArquivoSaida: "lancamentos_importacao.txt",
  dropTitulo: "Arraste a planilha de Lançamentos, ou clique para escolher",
  dropHint: "Abas <em>Parametros</em> e <em>Empregados</em> · rubrica no cabeçalho, como <em>Nome (código)</em> · várias planilhas geram em lote",
  abaValores: "Empregados",
  campos: [
    {nome:"Fixo \"10\"",           ini:1,  tam:2,  curto:"tp"},
    {nome:"Código do empregado",   ini:3,  tam:10, curto:"empregado"},
    {nome:"Competência",           ini:13, tam:6,  curto:"compet"},
    {nome:"Código da rubrica",     ini:19, tam:9,  curto:"rubrica"},
    {nome:"Tipo do processo",      ini:28, tam:2,  curto:"pr"},
    {nome:"Valor",                 ini:30, tam:9,  curto:"valor", principal:true},
    {nome:"Código da empresa",     ini:39, tam:10, curto:"empresa"},
  ],
  /* registros complementares ainda suportados (leiaute Domínio) */
  /* plano de saúde: o 20 fixa a operadora, os 25 abaixo dele detalham quem pagou o quê */
  camposPlanoOperadora: [
    {nome:"Fixo \"20\"",                       ini:1,  tam:2,  curto:"tp"},
    {nome:"CNPJ da operadora",                ini:3,  tam:14, curto:"CNPJ operadora"},
  ],
  camposPlanoBenef: [
    {nome:"Fixo \"25\"",                       ini:1,  tam:2,  curto:"tp"},
    {nome:"Beneficiário: T titular, D dependente", ini:3, tam:1, curto:"T/D"},
    {nome:"Código do empregado ou dependente",ini:4,  tam:10, curto:"código"},
    {nome:"Valor individualizado do plano",   ini:14, tam:9,  curto:"valor", principal:true},
  ],
  camposPensao: [
    {nome:"Fixo \"30\"",                       ini:1,  tam:2,  curto:"tp"},
    {nome:"Código do dependente",             ini:3,  tam:10, curto:"dependente"},
    {nome:"Valor individualizado da pensão",  ini:13, tam:9,  curto:"valor", principal:true},
  ],
  camposServico: [
    {nome:"Fixo \"40\"",                       ini:1,  tam:2,  curto:"tp"},
    {nome:"Código do serviço",                ini:3,  tam:10, curto:"serviço"},
    {nome:"Código da rubrica",                ini:13, tam:9,  curto:"rubrica"},
    {nome:"Valor da rubrica para o serviço",  ini:22, tam:9,  curto:"valor", principal:true},
  ],
  abaEntidade: "empregado",
  colunaEntidade: "empregado",

  parseDePara(wb){
    const abaP=acharAba(wb,"parametro");
    if(!abaP) throw new Error("a planilha de Lançamentos precisa ter a aba 'Parametros'");

    let empresa=null, empresaNome=null, competencia=null, tipoProcesso=null, totalEsperado=null;
    let planoCnpj=null, planoRubricas=null;
    for(const l of lerAba(wb,abaP)){
      const rot=String(l[0]||"").toLowerCase(), val=l[1];
      if(vazio(val)) continue;
      /* plano de saúde primeiro: nenhum destes rótulos colide com os de baixo */
      if(rot.includes("plano") && rot.includes("cnpj"))           planoCnpj=val;
      else if(rot.includes("plano") && rot.includes("rubrica"))   planoRubricas=val;
      else if(rot.includes("empresa") && rot.includes("código"))  empresa=val;
      else if(rot.includes("empresa"))                            empresaNome=val;
      else if(rot.includes("compet"))                             competencia=val;
      else if(rot.includes("total") && rot.includes("esperado"))  totalEsperado=val;
      else if(rot.includes("tipo") && rot.includes("processo") && !rot.startsWith(" "))
        tipoProcesso=val;
    }
    if(empresa===null)      throw new Error("preencha o código da empresa na aba Parametros");
    if(competencia===null)  throw new Error("preencha a competência na aba Parametros");
    if(tipoProcesso===null) tipoProcesso=11;

    /* modelo simplificado: a declaração do plano vem daqui, não de uma aba à parte */
    const pRubs = planoRubricas==null ? [] : String(planoRubricas).split(/\D+/).filter(Boolean);
    const planoSaude = (planoCnpj!=null || pRubs.length)
      ? {cnpj: soDigitos(planoCnpj), cnpjBruto: planoCnpj, rubricas: pRubs} : null;

    return {empresa,empresaNome,competencia,tipoProcesso,planoSaude,
            totalEsperado: totalEsperado===null?null:seguro(()=>paraNumero(totalEsperado))};
  },

  parseItensPlanilha(dp, wb){
    const abaE = acharAba(wb,"empregado");
    if(!abaE) throw new Error("não encontrei a aba 'Empregados' na planilha carregada");
    const linhas = lerAba(wb, abaE);
    const h = acharLinhaCabecalho(linhas,["nome"]);
    if(h<0) throw new Error("não encontrei o cabeçalho da aba Empregados (esperava uma coluna 'Nome')");
    const headerRow = linhas[h];
    const headerLower = headerRow.map(c=>String(c).toLowerCase());
    const colNome = headerLower.findIndex(c=>c.includes("nome"));
    const colCod  = headerLower.findIndex(c=>c.includes("código")||c.includes("codigo"));
    if(colCod<0) throw new Error("não encontrei a coluna de CÓDIGO na aba Empregados");

    const colunas=[], colunasIgnoradas=[], rubricasDuplicadas=[];
    const vistasRubricas=new Map();
    for(let c=0;c<headerRow.length;c++){
      if(c===colNome||c===colCod) continue;
      const titulo=headerRow[c];
      if(vazio(titulo)) continue;
      const m = String(titulo).trim().match(/^(.*?)\s*\((\d+)\)\s*$/);
      if(m){
        const codigo=Number(m[2]), exibicao=m[1].trim();
        if(vistasRubricas.has(codigo))
          rubricasDuplicadas.push(`"${exibicao}" e "${vistasRubricas.get(codigo)}" usam o mesmo código de rubrica (${codigo})`);
        else vistasRubricas.set(codigo, exibicao);
        colunas.push({idx:c, rubrica:{exibicao, codigo}});
      }
      else colunasIgnoradas.push(String(titulo));
    }
    if(!colunas.length) throw new Error("nenhuma coluna com o formato 'Nome da rubrica (código)' encontrada no cabeçalho da aba Empregados");

    const itens=[], ignoradas=[], incompletos=[], duplicados=[], nomesRepetidos=[];
    const porCodigo=new Map(), porNome=new Map();
    for(let i=h+1;i<linhas.length;i++){
      const nome=linhas[i][colNome];
      if(!nome||ehExemplo(nome)) continue;
      const temValor = colunas.some(col=>!vazio(linhas[i][col.idx]));
      if(!temValor) continue;
      const cod=linhas[i][colCod];
      if(vazio(cod)){
        incompletos.push(`${nome} — falta o código do empregado nessa linha`);
        continue;
      }
      const nomeLimpo=String(nome).trim();
      if(porCodigo.has(String(cod)))
        duplicados.push(`${nomeLimpo} e ${porCodigo.get(String(cod))} usam o mesmo código (${cod})`);
      else porCodigo.set(String(cod), nomeLimpo);

      const kNome=chave(nomeLimpo);
      if(porNome.has(kNome) && porNome.get(kNome)!==String(cod))
        nomesRepetidos.push(`${nomeLimpo} — aparece com os códigos ${porNome.get(kNome)} e ${cod}`);
      else porNome.set(kNome, String(cod));

      for(const col of colunas){
        const val=linhas[i][col.idx];
        if(vazio(val)) continue;
        try{ itens.push({nome:nomeLimpo, codigo:cod, valor:paraNumero(val), valorBruto:val,
                         rubrica:col.rubrica, linhaPlanilha:i+1}); }
        catch(e){ ignoradas.push(`${nomeLimpo} — ${col.rubrica.exibicao} — valor inválido: "${val}"`); }
      }
    }
    const avisos=[];
    const complementos = lerComplementos(wb);
    if(colunasIgnoradas.length)   avisos.push({titulo:"Colunas sem código no cabeçalho — use o formato 'Nome da rubrica (código)'", lista:colunasIgnoradas});
    if(rubricasDuplicadas.length) avisos.push({titulo:"Código de rubrica repetido em duas colunas", lista:rubricasDuplicadas});
    if(incompletos.length)        avisos.push({titulo:"Valor preenchido sem código cadastrado — corrija a linha na aba Empregados", lista:incompletos});
    if(duplicados.length)         avisos.push({titulo:"Mesmo código usado em mais de uma linha — confira se é duplicidade", lista:duplicados});
    if(nomesRepetidos.length)     avisos.push({titulo:"Mesmo nome com códigos diferentes — pode ser cadastro duplicado no Domínio", lista:nomesRepetidos});
    return {itens, ignoradas, avisos, complementos};
  },

  gerar(dp, itens, parsed){
    const comp=competenciaAAAAMM(dp.competencia);
    const linhas=[], comErro=[], avisosExtra=[];
    const M = MODULOS.lancamentos;
    const compl = (parsed && parsed.complementos) || {pensoes:[], servicos:[], planoSaude:[]};

    /* ---- plano de saúde / coparticipação ----
       A aba PlanoSaude declara quais rubricas são de plano e de qual operadora, e
       opcionalmente rateia o valor entre titular e dependentes. O conversor oficial da
       Thomson Reuters (Fonte.awk, solução 6887) emite, para cada empregado x rubrica de
       plano, a sequência 10 (total) > 20 (operadora) > 25 (um por beneficiário) — os
       complementares vêm logo abaixo do seu registro 10, não soltos no fim do arquivo. */
    const planoPorRubrica = new Map();   /* rubrica -> CNPJ (ou "" se veio inválido) */
    const rateioPor = new Map();         /* "rubrica|empregado" -> linhas de rateio */
    const avisosPlano = [];

    /* modelo simplificado: a declaração veio da aba Parametros e não há aba PlanoSaude.
       Sem rateio, cada empregado leva o valor da coluna como titular — automático. */
    if(dp.planoSaude){
      const cn = soDigitos(dp.planoSaude.cnpj);
      if(cn.length!==14)
        avisosPlano.push(`o CNPJ da operadora informado na aba Parametros precisa ter 14 `+
          `dígitos, veio "${String(dp.planoSaude.cnpjBruto||"").trim()||"(em branco)"}"`);
      if(!dp.planoSaude.rubricas.length)
        avisosPlano.push(`a aba Parametros traz o CNPJ da operadora mas não diz quais `+
          `rubricas são de plano de saúde`);
      dp.planoSaude.rubricas.forEach(r=>{
        const k = soDigitos(r);
        if(k) planoPorRubrica.set(k, cn.length===14 ? cn : "");
      });
    }

    for(const ps of (compl.planoSaude||[])){
      const rub = soDigitos(ps.rubrica);
      if(!rub){
        avisosPlano.push(`linha ${ps.linhaPlanilha} da aba PlanoSaude — sem o código da rubrica`);
        continue;
      }
      if(!planoPorRubrica.has(rub)){
        const cnpj = soDigitos(ps.cnpj);
        if(cnpj.length!==14)
          avisosPlano.push(`rubrica ${rub} — o CNPJ da operadora precisa ter 14 dígitos, `+
            `veio "${String(ps.cnpj||"").trim()||"(em branco)"}"`);
        planoPorRubrica.set(rub, cnpj.length===14 ? cnpj : "");
      }
      /* linha de rateio: só conta quando traz empregado e valor */
      if(!vazio(ps.empregado) && !vazio(ps.valor)){
        const k = rub+"|"+soDigitos(ps.empregado);
        if(!rateioPor.has(k)) rateioPor.set(k, []);
        rateioPor.get(k).push(ps);
      }
    }

    const cnpjBonito = c => `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;

    for(const it of itens){
      const rotulo = it.rubrica.exibicao;
      const ehPlano = planoPorRubrica.has(soDigitos(it.rubrica.codigo));
      try{
        /* rubrica comum: um registro 10 e pronto */
        if(!ehPlano){
          linhas.push({
            nome: it.nome, valor: it.valor, rotulo,
            codigo: it.codigo, detalhe: `rubrica ${it.rubrica.codigo}`,
            rubricaCodigo: it.rubrica.codigo, linhaPlanilha: it.linhaPlanilha,
            texto: "10"+num(it.codigo,10)+comp+num(it.rubrica.codigo,9)+
                   num(dp.tipoProcesso,2)+centavos(it.valor,9)+num(dp.empresa,10),
            campos: M.campos,
          });
          continue;
        }

        const cnpj = planoPorRubrica.get(soDigitos(it.rubrica.codigo));
        if(!cnpj)
          throw new Error("esta rubrica está declarada como plano de saúde, mas o CNPJ "+
                          "da operadora está inválido — confira o CNPJ e gere de novo");

        /* sem linha de rateio, o titular leva o valor inteiro — é o caso comum e não
           obriga ninguém a preencher nada além da linha de declaração */
        const rateio = rateioPor.get(soDigitos(it.rubrica.codigo)+"|"+soDigitos(it.codigo)) || [];
        const benefs = rateio.length
          ? rateio.map(r=>{
              const dep = soDigitos(r.dependente);
              return {tipo: dep ? "D" : "T", codigo: dep || it.codigo,
                      valor: paraNumero(r.valor), linhaPlanilha: r.linhaPlanilha};
            })
          : [{tipo:"T", codigo: it.codigo, valor: it.valor, linhaPlanilha: it.linhaPlanilha}];
        /* o conversor oficial emite o titular antes dos dependentes, qualquer que seja
           a ordem em que as linhas foram digitadas na planilha */
        benefs.sort((a,b)=> (a.tipo==="T"?0:1) - (b.tipo==="T"?0:1));

        const total = Math.round(benefs.reduce((s,b)=>s+b.valor,0)*100)/100;
        if(rateio.length && Math.abs(total - it.valor) >= 0.005)
          avisosPlano.push(`${it.nome} — ${rotulo}: a aba Empregados traz R$ ${moeda(it.valor)} e `+
            `o rateio soma R$ ${moeda(total)}, diferença de R$ ${moeda(Math.abs(total-it.valor))}. `+
            `Gravei a soma do rateio.`);

        /* 10: o total do plano para este empregado nesta rubrica */
        linhas.push({
          nome: it.nome, valor: total, rotulo,
          codigo: it.codigo, detalhe: `rubrica ${it.rubrica.codigo} · plano de saúde`,
          rubricaCodigo: it.rubrica.codigo, linhaPlanilha: it.linhaPlanilha,
          texto: "10"+num(it.codigo,10)+comp+num(it.rubrica.codigo,9)+
                 num(dp.tipoProcesso,2)+centavos(total,9)+num(dp.empresa,10),
          campos: M.campos,
        });
        /* 20: a operadora */
        linhas.push({
          nome: it.nome, valor: 0, rotulo, vinculadoA: rotulo, complementar: true,
          codigo: cnpj, detalhe: `operadora ${cnpjBonito(cnpj)}`,
          linhaPlanilha: it.linhaPlanilha,
          texto: "20"+num(cnpj,14),
          campos: M.camposPlanoOperadora,
        });
        /* 25: um por beneficiário */
        for(const b of benefs){
          linhas.push({
            nome: it.nome, valor: b.valor, rotulo, vinculadoA: rotulo, complementar: true,
            codigo: b.codigo, linhaPlanilha: b.linhaPlanilha,
            detalhe: b.tipo==="T" ? "titular" : `dependente ${soDigitos(b.codigo)}`,
            texto: "25"+b.tipo+num(b.codigo,10)+centavos(b.valor,9),
            campos: M.camposPlanoBenef,
          });
        }
      }catch(e){ comErro.push(`${it.nome} — ${rotulo} — ${e.message}`); }
    }
    if(avisosPlano.length)
      avisosExtra.push({titulo:"Plano de saúde — confira", lista:avisosPlano});

    /* pensão alimentícia: registro 30, um por dependente */
    for(const p of compl.pensoes){
      try{
        linhas.push({
          nome: `Dependente ${soDigitos(p.dependente)}`, valor: paraNumero(p.valor),
          rotulo: "Pensão alimentícia", secao: "Pensão alimentícia", codigo: p.dependente,
          detalhe: `dependente ${soDigitos(p.dependente)}`, linhaPlanilha: p.linhaPlanilha,
          texto: "30"+num(p.dependente,10)+centavos(paraNumero(p.valor),9),
          campos: M.camposPensao,
        });
      }catch(e){ comErro.push(`pensão alimentícia, dependente ${p.dependente} — ${e.message}`); }
    }

    /* lançamento por serviço: registro 40 */
    for(const sv of compl.servicos){
      try{
        linhas.push({
          nome: `Serviço ${soDigitos(sv.servico)}`, valor: paraNumero(sv.valor),
          rotulo: "Lançamento por serviço", secao: "Lançamento por serviço", codigo: sv.servico,
          detalhe: `serviço ${soDigitos(sv.servico)} · rubrica ${soDigitos(sv.rubrica)}`,
          linhaPlanilha: sv.linhaPlanilha,
          texto: "40"+num(sv.servico,10)+num(sv.rubrica,9)+centavos(paraNumero(sv.valor),9),
          campos: M.camposServico,
        });
      }catch(e){ comErro.push(`lançamento por serviço ${sv.servico} — ${e.message}`); }
    }

    const extras = [];
    const conta = (t,rot) => { const q=linhas.filter(l=>l.texto.startsWith(t)).length;
                               if(q) extras.push(`${q} ${rot}`); };
    conta("20","de operadora de plano de saúde"); conta("25","de beneficiário de plano de saúde");
    conta("30","de pensão"); conta("40","por serviço");
    if(extras.length) avisosExtra.push({
      titulo:"Registros complementares gerados junto com os lançamentos", lista:extras});

    const rubricasUsadas=[...new Set(linhas.filter(l=>!l.complementar).map(l=>l.rotulo))];
    return {
      linhas, comErro, semCadastro:[], pendentes:[], avisosExtra,
      resumoExtra: `Rubricas neste lote<b>${rubricasUsadas.length}</b>`,
    };
  },
},

};

