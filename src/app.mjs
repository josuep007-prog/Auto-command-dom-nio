/* Camada de tela: render, modais e ligacao de eventos.
 *
 * A regra de negocio saiu daqui para nucleo/, que nao toca no DOM e roda igual
 * no navegador e no servidor — e o que garante que os dois leiam um relatorio
 * do mesmo jeito.
 *
 * A ponte para globalThis abaixo e transitoria e proposital: esta camada ainda
 * chama tudo por nome solto, como quando era um <script> unico. Ela permitiu
 * mover o nucleo sem reescrever a tela junto, e sai quando esta camada tambem
 * for modularizada. De quebra, deixa o nucleo alcancavel pelo console do
 * navegador, que e como os testes de regra o exercitam.
 */
import * as nucleo from "./nucleo/index.mjs";
Object.assign(globalThis, nucleo);

/* O acervo e opcional por desenho: todo metodo de API devolve null quando o
   servidor nao responde, e a tela segue como antes de ele existir. Nao ha um
   unico `await` deste modulo em caminho critico de geracao do .txt. */
import * as API from "./api.mjs";
globalThis.API = API;

/* empresa que o CNPJ do documento encontrou no cadastro, se houver */
let empresaDoCadastro = null;
/* nome e hash do arquivo lido — o hash identifica a origem no acervo, ja que o
   PDF em si nunca e guardado */
let origemDoDocumento = null;

/* ##################### leitura de contracheque ##################### */
/* Extrai empregados e rubricas de um recibo de pagamento (PDF ou texto).
   O resultado nunca vai direto para a planilha: passa pelo menu de
   parâmetros, onde o usuário confere, corrige e escolhe o que entra. */

/* ##################### Relação Geral dos Líquidos ##################### */
/* Relatório do Domínio que lista código, nome e líquido de cada pessoa,
   separados por grupo (Contribuintes, Empregados, Estagiários) e com o
   total da empresa no rodapé. É a melhor origem para montar o modelo:
   já vem com o código do cadastro, que o recibo não traz. */

/* ##################### leitura de recibos de RPA ##################### */
/* O recibo do Domínio é um formulário: cada bloco começa em "RECIBO DE
   PAGAMENTO A AUTÔNOMO" e traz nome, CPF, nº do recibo, data e valor líquido.
   O código do contribuinte não aparece no papel — fica para o escritório. */

/* ##################### menu de parâmetros do documento lido ##################### */
let contraDados = null;
let contraTipo = "lancamentos";

const $cp = id => document.getElementById(id);
const listaAtual = () => contraTipo==="rpa" ? contraDados.autonomos : contraDados.empregados;

/* último dia do mês da competência — é a data de pagamento que o escritório usa */
function ultimoDiaDaCompetencia(comp){
  try{
    const a = competenciaAAAAMM(comp);
    const ano = Number(a.slice(0,4)), mes = Number(a.slice(4,6));
    const dia = new Date(ano, mes, 0).getDate();
    return `${String(dia).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`;
  }catch(e){ return ""; }
}

let dataEditadaAMao = false;

function sugerirDataPagamento(forcar){
  if(!forcar && dataEditadaAMao) return;
  const d = ultimoDiaDaCompetencia($cp("cpComp").value);
  if(d) $cp("cpData").value = d;
}

/* máscaras: o usuário digita só números */
function mascararData(inp){
  let v = inp.value.replace(/\D/g,"").slice(0,8);
  if(v.length>4)      v = v.slice(0,2)+"/"+v.slice(2,4)+"/"+v.slice(4);
  else if(v.length>2) v = v.slice(0,2)+"/"+v.slice(2);
  inp.value = v;
}
function mascararCompetencia(inp){
  let v = inp.value.replace(/\D/g,"").slice(0,6);
  if(v.length>2) v = v.slice(0,2)+"/"+v.slice(2);
  inp.value = v;
}

function abrirMenuContracheque(dados, origem, tipo){
  contraDados = dados;
  contraTipo = tipo || "lancamentos";
  const rpa = contraTipo==="rpa";

  $cp("cpTitulo").textContent = rpa
    ? "Confira antes de montar a planilha de RPA"
    : "Confira antes de montar a planilha de Lançamentos";
  $cp("cpOrigem").textContent = origem
    ? `${origem} · ${dados.paginas} página${dados.paginas===1?"":"s"} lida${dados.paginas===1?"":"s"}`
    : "";

  $cp("cpEmpresa").value = dados.empresa || "";
  $cp("cpCodigo").value  = "";
  $cp("cpComp").value    = dados.competencia || "";
  $cp("cpTipo").value    = "11";
  dataEditadaAMao = false;
  $cp("cpData").value    = dados.dataPagamento || ultimoDiaDaCompetencia(dados.competencia||"") || "";
  const descDoc = (dados.autonomos||[]).map(a=>(a.descricao||"").trim()).filter(Boolean);
  $cp("cpDesc").value    = descDoc[0] || "AUTONOMO";
  $cp("cpTotal").value   = "";

  $cp("campoTipo").hidden   = rpa;
  $cp("campoData").hidden   = !rpa;
  $cp("campoDesc").hidden   = !rpa;
  $cp("secRubricas").hidden = rpa;
  $cp("cpTextoValores").textContent =
    "Trazer os valores do documento — sem isso a planilha sai em branco, para o cliente preencher.";
  $cp("cpBuscaRub").value = "";
  $cp("cpBuscaPes").value = "";
  $cp("cpTrazerValores").checked = false;
  $cp("cpPlanoSimples").checked = false;
  $cp("cpPlanoBox").hidden = true;
  $cp("cpPlanoCnpj").value = "";
  $cp("cpPlanoErro").textContent = "";
  (dados.rubricas||[]).forEach(r=>{ r.planoSaude = false; });
  $cp("cpTituloPessoas").textContent = rpa
    ? "Autônomos que viram linha" : "Empregados que viram linha";
  const jaTemCodigo = listaAtual().some(p=>!vazio(p.codigo));
  $cp("cpNotaPessoas").textContent = jaTemCodigo
    ? "Os códigos vieram do documento — confira contra o cadastro do Domínio."
    : "O código não vem neste documento — digite o do cadastro no Domínio.";

  $cp("cpAvisos").innerHTML = dados.avisos.length
    ? `<div class="msg warn"><strong>Confira antes de gerar</strong><ul>`+
      dados.avisos.map(a=>`<li>${escapar(a)}</li>`).join("")+`</ul></div>`
    : "";

  if(dados.calculo && !rpa){
    const t = tiposProcesso().find(x=>chave(x.nome)===chave(dados.calculo));
    if(t) $cp("cpTipo").value = t.codigo;
  }
  nomeDoTipo();

  renderDescartadas();
  if(!rpa) renderListaRubricas();
  renderListaPessoas();

  /* guarda a folha lida para o cruzamento com o Portal do Empregado */
  ultimaListaPessoas = listaAtual().map(p=>({codigo:p.codigo, nome:p.nome}));
  $cp("cpPortalXlsx").hidden = rpa;
  empresaDoCadastro = null;
  /* so aparece se o acervo respondeu: sem servidor, o botao nem existe para o
     usuario, em vez de existir e falhar */
  $cp("cpAcervo").hidden = true;
  atualizarPrazosModal();

  $cp("modalContra").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(()=>$cp("cpCodigo").focus(), 60);

  /* O gancho do acervo: o CNPJ ja veio do PDF, entao a empresa se identifica
     sozinha e traz codigo no Dominio, tipo de processo e plano de saude.
     Roda depois de abrir o modal, sem await: se o servidor estiver fora, a
     tela ja esta pronta para digitacao manual e nada disso chega ao usuario. */
  preencherPeloCadastro(dados.cnpj);
}

/* Completa o que veio do cadastro, sem passar por cima do que o documento
   trouxe nem do que o usuario ja digitou. */
async function preencherPeloCadastro(cnpj){
  if(!cnpj) return;
  const empresa = await API.empresaPorCnpj(cnpj);
  if(!empresa) return;
  /* o usuario pode ter comecado a digitar enquanto a consulta ia e voltava */
  const vazioAinda = id => !$cp(id).value.trim();

  empresaDoCadastro = empresa;
  if(vazioAinda("cpEmpresa")) $cp("cpEmpresa").value = empresa.razaoSocial;
  if(vazioAinda("cpCodigo"))  $cp("cpCodigo").value  = empresa.codigoDominio;

  if(contraTipo==="rpa"){
    if(vazioAinda("cpDesc") && empresa.descricaoServicoPadrao)
      $cp("cpDesc").value = empresa.descricaoServicoPadrao;
  }else{
    $cp("cpTipo").value = empresa.tipoProcessoPadrao || "11";
    nomeDoTipo();
    if(empresa.planoCnpj && empresa.planoRubricas.length){
      $cp("cpPlanoSimples").checked = true;
      $cp("cpPlanoCnpj").value = formatarCnpj(empresa.planoCnpj);
      const doPlano = new Set(empresa.planoRubricas.map(String));
      (contraDados.rubricas||[]).forEach(r=>{
        r.planoSaude = doPlano.has(String(r.codigo));
        if(r.planoSaude) r.marcada = true;
      });
      $cp("cpPlanoBox").hidden = false;
      renderListaRubricas();
      renderRubricasPlano();
    }
  }
  atualizarContagens();
  marcarOrigemCadastro(empresa);
  /* com empresa cadastrada e arquivo identificado, da para gravar no acervo */
  $cp("cpAcervo").hidden = !origemDoDocumento;
}

/* ##################### gravar no acervo #####################
   Monta, a partir do que os parsers produziram, a forma que o servidor espera.
   Grava o que foi LIDO do relatorio — nao o que o usuario marcou para a
   planilha: o acervo e registro do documento, nao da escolha de geracao. */
function paraOAcervo(){
  const comum = {
    cnpj: contraDados.cnpj || (empresaDoCadastro && empresaDoCadastro.cnpj),
    empresaId: empresaDoCadastro ? empresaDoCadastro.id : undefined,
    competencia: $cp("cpComp").value.trim(),
    arquivoNome: origemDoDocumento.nome,
    arquivoHash: origemDoDocumento.hash,
    paginas: contraDados.paginas,
  };

  if(contraTipo==="rpa"){
    const gente = contraDados.autonomos || [];
    return {...comum, tipoDocumento:"rpa",
      pessoas: gente.map(a=>({codigo:a.codigo, nome:a.nome, cpf:a.cpf, grupo:"contribuintes"})),
      recibos: gente.filter(a=>a.valor!=null).map(a=>({
        pessoaCodigo: a.codigo || a.nome, numero: a.numeroRecibo,
        dataPagamento: seguro(()=>dataAAAAMMDD(a.data)) || null,
        descricao: a.descricao, valor: a.valor,
      })),
    };
  }

  /* A Relacao Geral dos Liquidos traz liquido e nao traz rubrica; o
     contracheque traz rubrica por empregado. Os dois viram a mesma forma. */
  const pessoas = (contraDados.empregados||[]).map(e=>({
    codigo: e.codigo, nome: e.nome, funcao: e.funcao,
    grupo: "empregados", liquido: e.liquido,
  }));
  const lancamentos = [];
  /* inclusive as descartadas: o Dominio calcula sozinho, mas elas ESTAO no
     documento, e o acervo registra o documento */
  const todas = (contraDados.rubricas||[]).concat(contraDados.rubricasDescartadas||[]);
  for(const r of todas){
    for(const [codigoPessoa, valor] of Object.entries(r.porEmpregado||{})){
      lancamentos.push({pessoaCodigo: codigoPessoa, rubricaCodigo: r.codigo,
                        rubricaDescricao: r.descricao, rubricaTipo: r.tipo, valor});
    }
  }
  return {...comum,
    tipoDocumento: contraDados.tipoOrigem === "liquidos" ? "liquidos" : "contracheque",
    pessoas, lancamentos};
}

async function gravarNoAcervo(){
  if(!contraDados || !origemDoDocumento) return;
  const botao = $cp("cpAcervo");
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = "gravando…";
  try{
    const r = await API.importarParaAcervo(paraOAcervo());
    if(!r.ok){ $cp("cpErro").textContent = r.erro; return; }
    $cp("cpErro").textContent = "";
    botao.textContent = r.repetido ? "já estava no acervo ✓" : "gravado no acervo ✓";
    if(r.avisos && r.avisos.length)
      flash("warn", "Gravado com ressalvas", r.avisos.join(" · "));
  }finally{
    botao.disabled = false;
    setTimeout(()=>{ botao.textContent = rotulo; }, 2400);
  }
}

/* Deixa visivel o que nao foi digitado por ninguem — quem confere precisa saber
   o que veio do cadastro para saber o que conferir. */
function marcarOrigemCadastro(empresa){
  const alvo = $cp("cpOrigem");
  const jaTem = alvo.querySelector(".selo-cadastro");
  if(jaTem) jaTem.remove();
  const selo = document.createElement("span");
  selo.className = "selo selo-var selo-cadastro";
  selo.style.marginLeft = "8px";
  selo.textContent = "preenchido pelo cadastro";
  selo.title = `${empresa.razaoSocial} — codigo ${empresa.codigoDominio}`;
  alvo.appendChild(selo);
}

function fecharMenuContracheque(){
  $cp("modalContra").hidden = true;
  document.body.style.overflow = "";
}

/* prazos do eSocial e aviso de pagamento fora da competência, ao vivo no modal */
function atualizarPrazosModal(){
  const alvo = $cp("cpPrazos");
  if(!alvo) return;
  const comp = $cp("cpComp").value.trim();
  let html = painelPrazos(comp);
  if(!$cp("campoData").hidden){
    const av = avisoCompetenciaPagamento(comp, $cp("cpData").value.trim());
    if(av) html += `<div class="msg warn"><strong>Pagamento fora da competência de apuração</strong>`+
      `${escapar(av)}</div>`;
  }
  alvo.innerHTML = html;
}

const SELO = {
  variavel:   ['selo-var',  'variável'],
  fixa:       ['selo-fix',  'fixa'],
  automatica: ['selo-auto', 'o Domínio calcula'],
  indefinida: ['selo-neu',  'a conferir'],
};

function renderListaRubricas(){
  const alvo = $cp("cpRubricas");
  alvo.innerHTML = contraDados.rubricas.map((r,i)=>{
    const [cls,txt] = SELO[r.tipo] || SELO.indefinida;
    const quantos = r.qtdEmpregados
      ? `${r.qtdEmpregados} empregado${r.qtdEmpregados===1?"":"s"}`
      : `${r.ocorrencias} ocorrência${r.ocorrencias===1?"":"s"}`;
    return `<label class="item${r.marcada?" marcado":""}" data-busca="${escapar(chave(r.codigo+" "+r.descricao))}">
      <input type="checkbox" data-rub="${i}"${r.marcada?" checked":""}>
      <span class="item-cod">${r.codigo}</span>
      <span class="item-nome">${escapar(r.descricao)}</span>
      <span class="selo ${cls}">${txt}</span>
      <span class="item-meta">${quantos}</span>
    </label>`;
  }).join("") || `<p class="item-vazio">Nenhuma rubrica reconhecida — adicione abaixo.</p>`;

  alvo.querySelectorAll("[data-rub]").forEach(cb=>{
    cb.addEventListener("change",()=>{
      const r = contraDados.rubricas[Number(cb.dataset.rub)];
      r.marcada = cb.checked;
      if(!cb.checked) r.planoSaude = false;   /* saiu da planilha, sai do plano também */
      cb.closest(".item").classList.toggle("marcado", cb.checked);
      atualizarContagens();
      renderRubricasPlano();
    });
  });
  filtrarRubricas();
  atualizarContagens();
}

/* o que o Domínio calcula não vira opção — fica só listado, para conferir */
/* ---- plano de saúde simplificado: só titular, operadora única ----
   Marcando aqui, a aba PlanoSaude do modelo já sai com a linha de declaração
   (rubrica + CNPJ) pronta. Como o gerador emite o registro 25 do titular sozinho
   quando não há rateio, o cliente só precisa digitar o valor. */
const RUB_PLANO = /copartic|plano de sa[úu]de|assist[êe]ncia m[ée]dica|assist[êe]ncia odontol|odontol[óo]gic|conv[êe]nio m[ée]dico/i;

function mascararCnpj(inp){
  const d = soDigitos(inp.value).slice(0,14);
  let s = d;
  if(d.length>2)  s = d.slice(0,2)+"."+d.slice(2);
  if(d.length>5)  s = d.slice(0,2)+"."+d.slice(2,5)+"."+d.slice(5);
  if(d.length>8)  s = d.slice(0,2)+"."+d.slice(2,5)+"."+d.slice(5,8)+"/"+d.slice(8);
  if(d.length>12) s = d.slice(0,2)+"."+d.slice(2,5)+"."+d.slice(5,8)+"/"+d.slice(8,12)+"-"+d.slice(12);
  inp.value = s;
}

function renderRubricasPlano(){
  const alvo = $cp("cpPlanoRubricas");
  if(!alvo || !contraDados) return;
  const marcadas = contraDados.rubricas.filter(r=>r.marcada);
  if(!marcadas.length){
    alvo.innerHTML = `<p class="plano-vazio">Marque primeiro as rubricas que viram coluna, ali em cima.</p>`;
    return;
  }
  alvo.innerHTML = marcadas.map(r=>{
    const i = contraDados.rubricas.indexOf(r);
    return `<label class="item${r.planoSaude?" marcado":""}">
      <input type="checkbox" data-plano="${i}"${r.planoSaude?" checked":""}>
      <span class="item-cod">${r.codigo}</span>
      <span class="item-nome">${escapar(r.descricao)}</span>
    </label>`;
  }).join("");
  alvo.querySelectorAll("[data-plano]").forEach(cb=>{
    cb.addEventListener("change",()=>{
      contraDados.rubricas[Number(cb.dataset.plano)].planoSaude = cb.checked;
      cb.closest(".item").classList.toggle("marcado", cb.checked);
      $cp("cpPlanoErro").textContent = "";
    });
  });
}

function alternarPlanoSimples(){
  const ligado = $cp("cpPlanoSimples").checked;
  $cp("cpPlanoBox").hidden = !ligado;
  $cp("cpPlanoErro").textContent = "";
  if(!ligado) return;
  /* primeira vez: já chuta pelas descrições, o usuário corrige se precisar */
  if(!contraDados.rubricas.some(r=>r.planoSaude))
    contraDados.rubricas.forEach(r=>{ if(r.marcada && RUB_PLANO.test(r.descricao)) r.planoSaude = true; });
  renderRubricasPlano();
}

function renderDescartadas(){
  const desc = (contraDados && contraDados.rubricasDescartadas) || [];
  const bloco = $cp("cpDescartadas");
  if(contraTipo==="rpa" || !desc.length){ bloco.hidden = true; return; }
  bloco.hidden = false;
  bloco.open = false;
  $cp("cpDescartadasN").textContent =
    `${desc.length} rubrica${desc.length===1?"":"s"} que o Domínio calcula ${desc.length===1?"ficou":"ficaram"} de fora`;
  $cp("cpDescartadasLista").innerHTML =
    desc.map(r=>`<b>${r.codigo}</b> ${escapar(r.descricao)}`).join(" · ");
}

function renderListaPessoas(){
  const alvo = $cp("cpEmpregados");
  const rpa = contraTipo==="rpa";
  const lista = listaAtual();

  alvo.innerHTML = lista.map((p,i)=>{
    const cod = `<input class="item-cod-input${p.marcado&&vazio(p.codigo)?" faltando":""}" `+
      `data-cod="${i}" inputmode="numeric" value="${escapar(p.codigo||"")}" `+
      `placeholder="código" aria-label="Código de ${escapar(p.nome)}">`;
    if(rpa){
      const cpfRuim = p.cpfValido===false;
      return `<div class="item${p.marcado?" marcado":""}" data-busca="${escapar(chave((p.codigo||"")+" "+p.nome))}">
        <input type="checkbox" data-pes="${i}"${p.marcado?" checked":""} aria-label="Incluir ${escapar(p.nome)}">
        ${cod}
        <span class="item-nome">${escapar(p.nome)}</span>
        ${p.cpf?`<span class="selo ${cpfRuim?"selo-auto":"selo-fix"}">${escapar(p.cpf)}${cpfRuim?" ?":""}</span>`:""}
        <span class="item-meta">${p.numeroRecibo?"recibo "+escapar(p.numeroRecibo)+" · ":""}${p.valor!==null&&p.valor!==undefined?"R$ "+moeda(p.valor):"sem valor"}</span>
      </div>`;
    }
    return `<div class="item${p.marcado?" marcado":""}" data-busca="${escapar(chave((p.codigo||"")+" "+p.nome+" "+(p.funcao||"")))}">
      <input type="checkbox" data-pes="${i}"${p.marcado?" checked":""} aria-label="Incluir ${escapar(p.nome)}">
      ${cod}
      <span class="item-nome">${escapar(p.nome)}</span>
      <span class="item-meta">${escapar(p.funcao||"")}</span>
    </div>`;
  }).join("") || `<p class="item-vazio">Ninguém reconhecido — a planilha sai com as linhas em branco.</p>`;

  alvo.querySelectorAll("[data-pes]").forEach(cb=>{
    cb.addEventListener("change",()=>{
      lista[Number(cb.dataset.pes)].marcado = cb.checked;
      cb.closest(".item").classList.toggle("marcado", cb.checked);
      renderMarcasCodigo();
      atualizarContagens();
    });
  });

  /* código digitado direto na lista — é o que vai para a coluna Código */
  alvo.querySelectorAll("[data-cod]").forEach(inp=>{
    inp.addEventListener("input",()=>{
      const p = lista[Number(inp.dataset.cod)];
      const limpo = inp.value.replace(/\D/g,"").slice(0,10);
      if(inp.value!==limpo) inp.value = limpo;
      p.codigo = limpo;
      inp.classList.toggle("faltando", p.marcado && !limpo);
      atualizarContagens();
    });
  });

  /* clicar na linha marca e desmarca, sem atrapalhar os campos */
  alvo.querySelectorAll(".item").forEach(el=>{
    el.addEventListener("click",e=>{
      if(e.target.tagName==="INPUT") return;
      const cb = el.querySelector('input[type="checkbox"]');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event("change"));
    });
  });

  filtrarPessoas();
  atualizarContagens();
}

function renderMarcasCodigo(){
  const lista = listaAtual();
  $cp("cpEmpregados").querySelectorAll("[data-cod]").forEach(inp=>{
    const p = lista[Number(inp.dataset.cod)];
    inp.classList.toggle("faltando", p.marcado && vazio(p.codigo));
  });
}

function filtrarLista(idBusca, idLista, idNada){
  const q = chave($cp(idBusca).value);
  const itens = $cp(idLista).querySelectorAll(".item");
  let vis = 0;
  itens.forEach(el=>{
    const mostra = !q || (el.dataset.busca||"").includes(q);
    el.hidden = !mostra;
    if(mostra) vis++;
  });
  $cp(idNada).hidden = !(q && itens.length && vis===0);
}
const filtrarRubricas = () => filtrarLista("cpBuscaRub","cpRubricas","cpNadaRub");
const filtrarPessoas  = () => filtrarLista("cpBuscaPes","cpEmpregados","cpNadaPes");

function atualizarContagens(){
  if(!contraDados) return;
  const rpa = contraTipo==="rpa";
  const lista = listaAtual();
  const e = lista.filter(x=>x.marcado).length;
  $cp("cpEmpCount").textContent = `${e} de ${lista.length}`;

  const semCod = lista.filter(x=>x.marcado && vazio(x.codigo)).length;
  const faltando = semCod ? ` · ${semCod} sem código` : "";

  if(rpa){
    const soma = lista.filter(x=>x.marcado).reduce((s,x)=>s+(x.valor||0),0);
    $cp("cpResumo").textContent =
      `A planilha sai com ${e} contribuinte${e===1?"":"s"}` +
      ($cp("cpTrazerValores").checked ? ` · soma R$ ${moeda(soma)}` : " e a coluna de valor em branco") +
      faltando;
    return;
  }
  const r = contraDados.rubricas.filter(x=>x.marcada).length;
  $cp("cpRubCount").textContent = `${r} de ${contraDados.rubricas.length}`;
  let soma = "";
  if($cp("cpTrazerValores").checked){
    const marcados = new Set(lista.filter(x=>x.marcado).map(x=>x.codigoOriginal));
    let t=0;
    contraDados.rubricas.filter(x=>x.marcada).forEach(x=>{
      Object.keys(x.porEmpregado||{}).forEach(k=>{ if(marcados.has(k)) t += x.porEmpregado[k]; });
    });
    if(t) soma = ` · soma R$ ${moeda(t)}`;
  }
  $cp("cpResumo").textContent =
    `A planilha sai com ${e} linha${e===1?"":"s"} de empregado e ${r} coluna${r===1?"":"s"} de rubrica${soma}${faltando}.`;
}

function alternarValoresRpa(){
  if(!contraDados) return;
  if($cp("cpTrazerValores").checked){
    let soma = 0;
    if(contraTipo==="rpa"){
      soma = contraDados.autonomos.filter(a=>a.marcado).reduce((s,a)=>s+(a.valor||0),0);
    }else{
      const marcados = new Set(contraDados.empregados.filter(e=>e.marcado).map(e=>e.codigoOriginal));
      contraDados.rubricas.filter(r=>r.marcada).forEach(r=>{
        Object.keys(r.porEmpregado||{}).forEach(k=>{ if(marcados.has(k)) soma += r.porEmpregado[k]; });
      });
    }
    if(soma) $cp("cpTotal").value = moeda(soma);
  }
  atualizarContagens();
}

function adicionarRubricaManual(){
  const cod = $cp("cpNovoCod").value.trim();
  const desc = $cp("cpNovoDesc").value.trim();
  const erro = $cp("cpNovoErro");
  if(!/^\d{1,9}$/.test(cod)){ erro.textContent = "o código da rubrica tem que ser numérico"; return; }
  if(desc.length<2){ erro.textContent = "escreva o nome da rubrica"; return; }
  if(contraDados.rubricas.some(r=>r.codigo===Number(cod))){ erro.textContent = "esse código já está na lista"; return; }
  erro.textContent = "";
  contraDados.rubricas.push({codigo:Number(cod), descricao:desc, tipo:"variavel",
    qtdEmpregados:0, ocorrencias:0, variaValor:false, emTodos:false, marcada:true});
  contraDados.rubricas.sort((a,b)=>a.codigo-b.codigo);
  $cp("cpNovoCod").value=""; $cp("cpNovoDesc").value="";
  renderListaRubricas();
}

/* tudo que o .txt precisa é exigido aqui — a planilha não sai pela metade */
function reprovar(msg, campo){
  $cp("cpErro").textContent = msg;
  if(campo){
    const el = $cp(campo);
    el.classList.add("faltando");
    el.focus();
    setTimeout(()=>el.classList.remove("faltando"), 2600);
  }
  return false;
}

function gerarModeloDoContracheque(){
  $cp("cpErro").textContent = "";
  $cp("cpEmpregados").querySelectorAll(".item").forEach(el=>el.classList.remove("sem-codigo"));
  const rpa = contraTipo==="rpa";

  const codigo = $cp("cpCodigo").value.trim();
  const comp   = $cp("cpComp").value.trim();

  if(!codigo)                    return reprovar("informe o código da empresa no Domínio","cpCodigo");
  if(!/^\d{1,10}$/.test(codigo)) return reprovar("o código da empresa é só número","cpCodigo");
  if(!comp)                      return reprovar("informe a competência","cpComp");
  try{ competenciaAAAAMM(comp); }
  catch(e){ return reprovar("competência inválida — digite MM/AAAA","cpComp"); }

  let total = null;
  if($cp("cpTotal").value.trim()){
    try{ total = paraNumero($cp("cpTotal").value); }
    catch(e){ return reprovar("total esperado inválido","cpTotal"); }
  }

  const marcados = listaAtual().filter(p=>p.marcado);
  if(!marcados.length)
    return reprovar(rpa ? "marque pelo menos um contribuinte" : "marque pelo menos um empregado");

  /* sem código não dá para montar o registro */
  const semCodigo = marcados.filter(p=>vazio(p.codigo));
  if(semCodigo.length){
    const lista = listaAtual();
    $cp("cpEmpregados").querySelectorAll(".item").forEach((el,i)=>{
      if(lista[i] && lista[i].marcado && vazio(lista[i].codigo)) el.classList.add("sem-codigo");
    });
    const primeiro = $cp("cpEmpregados").querySelector(".item.sem-codigo [data-cod]");
    if(primeiro){
      primeiro.focus();
      if(primeiro.scrollIntoView) primeiro.scrollIntoView({block:"center"});
    }
    return reprovar(`${semCodigo.length} ${semCodigo.length===1?"pessoa está":"pessoas estão"} sem código — preencha na lista abaixo`);
  }

  const trazer = $cp("cpTrazerValores").checked;
  let dados, modulo;

  if(rpa){
    const dataPg = $cp("cpData").value.trim();
    if(!dataPg) return reprovar("informe a data de pagamento","cpData");
    try{ dataAAAAMMDD(dataPg); }
    catch(e){ return reprovar("data de pagamento inválida — digite DDMMAAAA","cpData"); }
    const desc = $cp("cpDesc").value.trim().slice(0,100);
    if(!desc) return reprovar("informe a descrição do serviço","cpDesc");

    modulo = "rpa";
    dados = {
      empresa: $cp("cpEmpresa").value.trim(), codigo, competencia: comp,
      dataPagamento: dataPg, totalEsperado: total, descricaoPadrao: desc,
      contribuintes: marcados.map(a=>({
        nome: a.nome, codigo: a.codigo, cpf: a.cpf, descricao: desc,
        valor: trazer ? a.valor : null,
      })),
    };
  }else{
    const tipo = $cp("cpTipo").value.trim();
    if(!tipo)                  return reprovar("informe o tipo do processo","cpTipo");
    if(!/^\d{1,2}$/.test(tipo)) return reprovar("o tipo do processo é um número de até 2 dígitos","cpTipo");

    const rubricas = contraDados.rubricas.filter(r=>r.marcada);
    if(!rubricas.length) return reprovar("marque pelo menos uma rubrica");

    /* plano de saúde simplificado: só titular, uma operadora */
    let planoSaude = null;
    if($cp("cpPlanoSimples").checked){
      const rubPlano = rubricas.filter(r=>r.planoSaude).map(r=>r.codigo);
      const cnpjDig  = soDigitos($cp("cpPlanoCnpj").value);
      if(!rubPlano.length){
        $cp("cpPlanoErro").textContent = "marque qual rubrica é de plano de saúde";
        return reprovar("marque qual rubrica é de plano de saúde");
      }
      if(cnpjDig.length!==14){
        $cp("cpPlanoErro").textContent = "o CNPJ da operadora tem 14 dígitos";
        return reprovar("informe o CNPJ da operadora do plano de saúde","cpPlanoCnpj");
      }
      if(!cnpjValido(cnpjDig)){
        $cp("cpPlanoErro").textContent = "confira o CNPJ — os dígitos verificadores não fecham";
        return reprovar("CNPJ da operadora inválido — confira os dígitos","cpPlanoCnpj");
      }
      planoSaude = {cnpj: formatarCnpj(cnpjDig), rubricas: rubPlano};
    }

    modulo = "lancamentos";
    dados = {
      empresa: $cp("cpEmpresa").value.trim(), codigo, competencia: comp,
      tipoProcesso: tipo, totalEsperado: total,
      trazerValores: trazer, rubricas, empregados: marcados, planoSaude,
    };
  }

  if(moduloAtivo!==modulo) trocarModulo(modulo);
  const m = planilhaModelo(modulo, dados);
  baixarBytes(construirZip(XL.montar(m.abas, m.cor)), m.nome,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  fecharMenuContracheque();
  const quem = rpa ? "contribuinte" : "empregado";
  document.getElementById("avisos").innerHTML =
    `<div class="msg ok"><strong>Modelo montado a partir do ${rpa?"recibo de RPA":"contracheque"}</strong>`+
    `${marcados.length} ${quem}${marcados.length===1?"":"s"}`+
    (rpa?"":` e ${dados.rubricas.length} rubrica${dados.rubricas.length===1?"":"s"}`)+
    ` — arquivo <code>${escapar(m.nome)}</code>. `+
    (rpa?"Preencha a coluna Código antes de gerar o arquivo do Domínio."
        :"Confira os códigos antes de mandar para o cliente.")+`</div>`;
}

/* ##################### entrada do documento ##################### */
async function lerContracheque(file){
  const cartao = document.getElementById("cardContra");
  cartao.classList.add("lendo");
  document.getElementById("fileContra").textContent = "lendo "+file.name+"…";
  /* o pdf.js roda na thread principal: deixa a tela repintar antes de travar */
  await new Promise(r=>setTimeout(r,30));

  try{
    let paginas;
    if(/\.pdf$/i.test(file.name)){
      const bytes = await file.arrayBuffer();
      /* identifica o arquivo sem guardar o arquivo: e o hash que evita gravar
         o mesmo relatorio duas vezes no acervo */
      origemDoDocumento = { nome: file.name, hash: await API.hashDoArquivo(bytes) };
      const buf = new Uint8Array(bytes);
      paginas = await linhasDoPdf(buf);
      const totalLinhas = paginas.reduce((s,p)=>s+p.length,0);
      if(!totalLinhas)
        throw new Error("esse PDF não tem texto — parece digitalizado. Exporte o documento de novo em PDF de texto, ou use o botão de colar.");
    }else{
      const texto = await file.text();
      origemDoDocumento = { nome: file.name,
        hash: await API.hashDoArquivo(new TextEncoder().encode(texto)) };
      paginas = [ linhasDoTexto(texto) ];
    }
    interpretarDocumento(paginas, file.name);
    document.getElementById("fileContra").textContent = file.name;
  }catch(e){
    erro("não consegui ler o documento: "+e.message);
    document.getElementById("fileContra").textContent = "";
  }finally{
    cartao.classList.remove("lendo");
  }
}

function interpretarDocumento(paginas, origem){
  const tipo = detectarTipoDocumento(paginas) || moduloAtivo;

  if(tipo==="liquidos") return interpretarRelacaoLiquidos(paginas, origem);

  if(tipo==="rpa"){
    const dados = analisarRecibosRpa(paginas);
    if(!dados.autonomos.length)
      return erro("reconheci um recibo de RPA, mas não consegui extrair nenhum contribuinte dele.");
    abrirMenuContracheque(dados, origem, "rpa");
  }else{
    const dados = analisarContracheque(paginas);
    abrirMenuContracheque(dados, origem, "lancamentos");
  }
}

/* A Relação Geral dos Líquidos serve aos dois módulos: o grupo Contribuintes
   alimenta o RPA e o grupo Empregados alimenta Lançamentos. */
function interpretarRelacaoLiquidos(paginas, origem){
  const rel = analisarRelacaoLiquidos(paginas);
  const contrib = rel.grupos.contribuintes;
  const empreg  = rel.grupos.empregados.concat(rel.grupos.estagiarios);
  if(!contrib.length && !empreg.length)
    return erro("reconheci a Relação Geral dos Líquidos, mas não consegui ler nenhuma linha de pessoa.");

  let modo;
  if(moduloAtivo==="rpa" && contrib.length)              modo="rpa";
  else if(moduloAtivo==="lancamentos" && empreg.length)  modo="lancamentos";
  else                                                   modo = contrib.length ? "rpa" : "lancamentos";

  const avisos = rel.avisos.slice();
  if(modo==="rpa" && empreg.length)
    avisos.push(`O relatório também traz ${empreg.length} empregado(s) — abra a aba Lançamentos e leia o arquivo de novo para usá-los.`);
  if(modo==="lancamentos" && contrib.length)
    avisos.push(`O relatório também traz ${contrib.length} contribuinte(s) — abra a aba RPA e leia o arquivo de novo para usá-los.`);

  const base = {
    empresa: rel.empresa, cnpj: rel.cnpj, competencia: rel.competencia,
    calculo: rel.calculo, totalEmpresa: rel.totalEmpresa, paginas: rel.paginas,
    /* o acervo distingue os relatorios: este traz liquido e nao traz rubrica */
    tipoOrigem: "liquidos",
  };

  if(modo==="rpa"){
    abrirMenuContracheque(Object.assign({}, base, {
      dataPagamento: "", autonomos: contrib, avisos,
    }), origem, "rpa");
  }else{
    abrirMenuContracheque(Object.assign({}, base, {
      /* o liquido vem so deste relatorio — o contracheque nao o traz por pessoa */
      empregados: empreg.map(p=>({codigo:p.codigo, nome:p.nome, funcao:"",
                                  liquido:p.valor, marcado:true})),
      rubricas: [],
      avisos: avisos.concat(["Este relatório não traz rubricas — cadastre abaixo as que você vai lançar."]),
    }), origem, "lancamentos");
  }
}

async function lerContrachequeTexto(){
  const txt = document.getElementById("cpColado").value;
  if(txt.trim().length<20){ erro("cole o texto do documento antes de ler"); return; }
  try{
    /* o texto colado tambem precisa de origem: sem ela o acervo nao teria como
       reconhecer o mesmo conteudo lido duas vezes */
    origemDoDocumento = { nome: "texto colado",
      hash: await API.hashDoArquivo(new TextEncoder().encode(txt)) };
    interpretarDocumento([ linhasDoTexto(txt) ], "texto colado");
  }
  catch(e){ erro("não consegui interpretar o texto: "+e.message); }
}

/* ##################### conferência mês a mês ##################### */
/* Compara duas Relações Gerais dos Líquidos e mostra o que mudou de um mês
   para o outro: quem entrou, quem saiu e quem teve o líquido alterado. Não
   gera arquivo nenhum — é só a conferência de fechamento do departamento
   pessoal, que hoje se faz olhando os dois relatórios lado a lado. */

const cmpDelta = (v, comSinal) => {
  const s = v>0 ? "cmp-mais" : (v<0 ? "cmp-menos" : "");
  const sinal = comSinal && v>0 ? "+" : (v<0 ? "−" : "");
  return `<span class="${s}">${sinal}R$ ${moeda(Math.abs(v))}</span>`;
};
const cmpPct = p => {
  if(!Number.isFinite(p)) return '<span class="pill pill-neutro">novo valor</span>';
  const s = p>0 ? "cmp-mais" : (p<0 ? "cmp-menos" : "");
  return `<span class="${s}">${p>0?"+":(p<0?"−":"")}${Math.abs(p).toFixed(1).replace(".",",")}%</span>`;
};
const cmpPessoa = p =>
  `<span class="cmp-nome">${escapar(p.nome)}</span>`+
  `<span class="cmp-grupo">${escapar(GRUPO_ROTULO[p.grupo]||p.grupo)}</span>`;

function tabelaCmp(titulo, colunas, corpo){
  if(!corpo) return `<h4>${escapar(titulo)}</h4><p class="cmp-vazio">Ninguém nesta situação.</p>`;
  return `<h4>${escapar(titulo)}</h4><table class="tabela-lote cmp-tab"><thead><tr>`+
    colunas.map(c=>`<th${c.num?' class="num"':""}>${escapar(c.t)}</th>`).join("")+
    `</tr></thead><tbody>${corpo}</tbody></table>`;
}

let cmpUltimo = null;

function abrirComparacao(cmp, origem){
  cmpUltimo = cmp;
  const $ = id => document.getElementById(id);
  const compA = competenciaExibicao(cmp.antes.competencia) || "competência não lida";
  const compB = competenciaExibicao(cmp.depois.competencia) || "competência não lida";

  $("cmpTitulo").textContent = "Conferência mês a mês";
  $("cmpOrigem").textContent =
    `${cmp.depois.empresa || cmp.antes.empresa || "empresa não lida"} · ${compA} → ${compB}`+
    (origem ? ` · ${origem}` : "");

  let html = "";
  if(cmp.avisos.length)
    html += `<div class="msg warn"><strong>Confira estes pontos</strong><ul>`+
      cmp.avisos.map(a=>`<li>${escapar(a)}</li>`).join("")+`</ul></div>`;
  if(!cmp.antes.competencia || !cmp.depois.competencia || compA===compB)
    html += `<div class="msg warn"><strong>Competências iguais ou não reconhecidas</strong>`+
      `Confira se os dois arquivos são mesmo de meses diferentes — comparei na ordem `+
      `em que consegui ler.</div>`;

  html += `<div class="tot">
      <div>Pessoas<b>${cmp.antes.pessoas} <span class="cmp-seta">→</span> ${cmp.depois.pessoas}</b></div>
      <div>Total líquido<b>R$ ${moeda(cmp.depois.total)}</b></div>
      <div>Variação no total<b>${cmpDelta(cmp.difTotal, true)}</b></div>
      <div>Entraram / saíram<b>${cmp.entraram.length} <span class="cmp-seta">/</span> ${cmp.sairam.length}</b></div>
    </div>`;

  html += tabelaCmp(`Entraram em ${compB} — ${cmp.entraram.length} pessoa(s), R$ ${moeda(cmp.somaEntraram)}`,
    [{t:"Código"},{t:"Nome"},{t:"Líquido",num:true}],
    cmp.entraram.map(p=>`<tr>
      <td class="cmp-cod">${escapar(String(p.codigo))}</td>
      <td>${cmpPessoa(p)}</td>
      <td class="num">R$ ${moeda(p.valor)}</td></tr>`).join(""));

  /* quem saiu costuma ser rescisão — e rescisão não vai no S-1200 */
  if(cmp.sairam.length)
    html += `<div class="msg info"><strong>Quem saiu vai por outro evento no eSocial</strong>
      Havendo rescisão no mês, o <b>S-1200</b> não processa para esse colaborador: a
      remuneração vai no <b>S-2299</b> (empregado) ou <b>S-2399</b> (contribuinte e
      estagiário), e o cálculo fica em <code>Processos &gt; Rescisões &gt; Individual</code>.
      Confira uma a uma antes de concluir — afastamento, licença e férias também podem tirar
      a pessoa da Relação de Líquidos sem ser desligamento.</div>`;

  html += tabelaCmp(`Saíram depois de ${compA} — ${cmp.sairam.length} pessoa(s), R$ ${moeda(cmp.somaSairam)}`,
    [{t:"Código"},{t:"Nome"},{t:`Líquido em ${compA}`,num:true},{t:"Se for rescisão"}],
    cmp.sairam.map(p=>`<tr>
      <td class="cmp-cod">${escapar(String(p.codigo))}</td>
      <td>${cmpPessoa(p)}</td>
      <td class="num">R$ ${moeda(p.valor)}</td>
      <td><span class="pill pill-neutro">${p.grupo==="empregados"?"S-2299":"S-2399"}</span></td></tr>`).join(""));

  html += tabelaCmp(`Líquido alterado — ${cmp.mudaram.length} pessoa(s)`,
    [{t:"Código"},{t:"Nome"},{t:compA,num:true},{t:compB,num:true},
     {t:"Diferença",num:true},{t:"%",num:true},{t:""}],
    cmp.mudaram.map(p=>`<tr>
      <td class="cmp-cod">${escapar(String(p.codigo))}</td>
      <td>${cmpPessoa(p)}</td>
      <td class="num">R$ ${moeda(p.antes)}</td>
      <td class="num">R$ ${moeda(p.depois)}</td>
      <td class="num">${cmpDelta(p.dif, true)}</td>
      <td class="num">${cmpPct(p.pct)}</td>
      <td>${p.alerta?'<span class="pill pill-erro">conferir</span>':""}</td></tr>`).join(""));

  html += `<h4>Sem alteração</h4><p class="cmp-vazio">`+
    `${cmp.iguais.length} pessoa(s) receberam exatamente o mesmo líquido nos dois meses.</p>`;

  document.getElementById("cmpCorpo").innerHTML = html;
  const alertas = cmp.mudaram.filter(p=>p.alerta).length;
  document.getElementById("cmpResumo").textContent =
    `${cmp.mudaram.length} com o líquido alterado`+
    (alertas ? ` · ${alertas} acima de ${CMP_PCT_ALERTA}% ou R$ ${moeda(CMP_VAL_ALERTA)}` : "");

  document.getElementById("modalComparar").hidden = false;
  document.body.style.overflow = "hidden";
}

function fecharComparacao(){
  document.getElementById("modalComparar").hidden = true;
  document.body.style.overflow = "";
}

function csvComparacao(cmp){
  const compA = competenciaExibicao(cmp.antes.competencia);
  const compB = competenciaExibicao(cmp.depois.competencia);
  const cab = ["Situação","Código","Nome","Grupo",`Líquido ${compA}`,`Líquido ${compB}`,
               "Diferença","Variação %"];
  const linhas = [];
  cmp.entraram.forEach(p=>linhas.push(["Entrou", p.codigo, p.nome,
    GRUPO_ROTULO[p.grupo]||p.grupo, "", moeda(p.valor), moeda(p.valor), ""]));
  cmp.sairam.forEach(p=>linhas.push([`Saiu — se rescisão, ${p.grupo==="empregados"?"S-2299":"S-2399"}`, p.codigo, p.nome,
    GRUPO_ROTULO[p.grupo]||p.grupo, moeda(p.valor), "", moeda(-p.valor), ""]));
  cmp.mudaram.forEach(p=>linhas.push([p.alerta?"Alterado (conferir)":"Alterado",
    p.codigo, p.nome, GRUPO_ROTULO[p.grupo]||p.grupo,
    moeda(p.antes), moeda(p.depois), moeda(p.dif),
    Number.isFinite(p.pct) ? p.pct.toFixed(1).replace(".",",") : ""]));
  cmp.iguais.forEach(p=>linhas.push(["Sem alteração", p.codigo, p.nome,
    GRUPO_ROTULO[p.grupo]||p.grupo, moeda(p.antes), moeda(p.depois), moeda(0), "0,0"]));
  linhas.push([]);
  /* o .csv sai em Latin-1 como o resto do programa: nada de seta "→" aqui, que vira "?" */
  linhas.push(["TOTAL", "", `${cmp.antes.pessoas} para ${cmp.depois.pessoas} pessoas`, "",
    moeda(cmp.antes.total), moeda(cmp.depois.total), moeda(cmp.difTotal), ""]);
  return csvDe(cab, linhas);
}

function baixarCsvComparacao(){
  if(!cmpUltimo) return;
  const nome = `Conferencia_${sanitizarNomeArquivo(cmpUltimo.depois.empresa||"empresa")}`+
    `_${sanitizarNomeArquivo(competenciaExibicao(cmpUltimo.antes.competencia))}`+
    `_x_${sanitizarNomeArquivo(competenciaExibicao(cmpUltimo.depois.competencia))}.csv`;
  baixarBytes(paraBytesLatin1(csvComparacao(cmpUltimo)), nome, "text/csv");
}

async function lerParaComparar(arquivos){
  const cartao = document.getElementById("cardComparar");
  cartao.classList.add("lendo");
  await new Promise(r=>setTimeout(r,30));

  try{
    if(arquivos.length!==2)
      throw new Error(`a conferência compara dois relatórios — chegaram ${arquivos.length}`);
    const lidos = [];
    for(const f of arquivos){
      const paginas = await linhasDoPdf(new Uint8Array(await f.arrayBuffer()));
      if(!paginas.reduce((s,p)=>s+p.length,0))
        throw new Error(`"${f.name}" não tem texto — parece digitalizado. Exporte de novo em PDF de texto.`);
      if(!ehRelacaoLiquidos(paginas))
        throw new Error(`"${f.name}" não parece uma Relação Geral dos Líquidos — a conferência só compara esse relatório.`);
      lidos.push({rel: analisarRelacaoLiquidos(paginas), nome: f.name});
    }
    const [a,b] = ordenarPorCompetencia(lidos[0].rel, lidos[1].rel);
    const nomeA = lidos.find(x=>x.rel===a).nome, nomeB = lidos.find(x=>x.rel===b).nome;
    const cmp = compararFolhas(a, b);
    if(!cmp.antes.pessoas && !cmp.depois.pessoas)
      throw new Error("não consegui ler nenhuma linha de pessoa nos dois relatórios");
    abrirComparacao(cmp, `${nomeA} × ${nomeB}`);
  }catch(e){
    erro("não deu para comparar: "+e.message);
  }finally{
    cartao.classList.remove("lendo");
  }
}

/* ##################### tipos de processo ##################### */
/* A lista fica salva neste computador. Vem só com o 11, que é o padrão do
   próprio gerador — os outros o escritório cadastra conforme a sua Domínio. */
/* códigos do campo 5 (Tipo do Processo) conforme a Central de Soluções,
   artigo "Como importar lançamentos de Arquivo Texto - TXT?" (codigo=3373) */
const TIPOS_PADRAO = [
  {codigo:"11", nome:"Mensal"},
  {codigo:"41", nome:"Adiantamento"},
  {codigo:"42", nome:"Complementar"},
  {codigo:"51", nome:"Adiantamento 13º"},
  {codigo:"52", nome:"13º Salário"},
  {codigo:"70", nome:"Participação de Lucros"},
];

function tiposProcesso(){
  try{
    const s = localStorage.getItem("dominio_tipos_processo");
    if(s){
      const l = JSON.parse(s);
      if(Array.isArray(l)) return l.filter(t=>t && t.codigo);
    }
  }catch(e){}
  return TIPOS_PADRAO.slice();
}

function salvarTiposProcesso(lista){
  try{ localStorage.setItem("dominio_tipos_processo", JSON.stringify(lista)); }catch(e){}
}

function nomeDoTipo(){
  const v = $cp("cpTipo").value.trim();
  const alvo = $cp("cpTipoNome");
  if(!v){ alvo.textContent=""; alvo.classList.remove("desconhecido"); return; }
  const t = tiposProcesso().find(x=>String(x.codigo)===v);
  alvo.textContent = t ? t.nome : "tipo não cadastrado";
  alvo.classList.toggle("desconhecido", !t);
}

function renderTiposProcesso(){
  const lista = tiposProcesso();
  const corpo = $cp("cpTipoLista");
  corpo.innerHTML = lista.length
    ? lista.map(t=>`<tr data-tipo="${escapar(t.codigo)}">`+
        `<td class="ajuda-cod">${escapar(t.codigo)}</td>`+
        `<td>${escapar(t.nome||"")}</td></tr>`).join("")
    : `<tr><td colspan="2" class="ajuda-vazio">nenhum tipo cadastrado ainda</td></tr>`;

  corpo.querySelectorAll("[data-tipo]").forEach(tr=>{
    tr.addEventListener("click",()=>{
      $cp("cpTipo").value = tr.dataset.tipo;
      nomeDoTipo();
    });
  });
  $cp("cpTipoTexto").value = lista.map(t=>`${t.codigo} = ${t.nome||""}`).join("\n");
  nomeDoTipo();
}

function salvarListaDeTipos(){
  const linhas = $cp("cpTipoTexto").value.split(/\r?\n/);
  const lista = [];
  for(const l of linhas){
    const m = l.match(/^\s*(\d{1,2})\s*[=\-:]\s*(.*)$/);
    if(m) lista.push({codigo:m[1], nome:m[2].trim()});
  }
  salvarTiposProcesso(lista);
  $cp("cpTipoEditor").hidden = true;
  renderTiposProcesso();
}
/* ##################### calendário: feriados e dias úteis #####################
   Aqui só entram os feriados NACIONAIS de lei federal. Feriado estadual,
   municipal e ponto facultativo (Carnaval, Corpus Christi) mudam de cidade para
   cidade — ficam de fora da conta de dia útil e viram aviso na tela, para
   ninguém confiar num prazo que o calendário local desmente.
   No Domínio esses ficam em Arquivo > Outros > Feriados, e os móveis precisam
   ser recadastrados todo ano. */

/* ##################### prazos do eSocial #####################
   Só entra aqui prazo que está escrito na Central de Soluções do Domínio.
   Nada de prazo deduzido: o que não está documentado aparece como
   dependência ("depois que o S-1200 validar"), não como data. */

function painelPrazos(comp){
  const p = prazosDaCompetencia(comp);
  if(!p) return "";
  const itens = [];

  if(p.mes===13){
    itens.push({t:"13º — encargos", atencao:true, d:
      `INSS só no 13º integral, em guia exclusiva da competência <b>13/${p.ano}</b>. `+
      `IRRF só no integral, em tributação exclusiva, no DARF junto com a folha de `+
      `<b>12/${p.ano}</b>. FGTS é recolhido junto do adiantamento e do integral.`});
    itens.push({t:"13º — eSocial", d:
      `Vai junto da folha mensal, no <b>S-1200</b>. Empresa sem movimento ou só com `+
      `pró-labore não envia 13º nem ao eSocial nem à DCTFWeb.`});
  }else{
    const l = p.s1200.limite, b = p.s1200.base;
    itens.push({t:"S-1200 Remuneração", atencao:p.s1200.postergado, d:
      `Até <b>${dataBR(l)}</b>, ${DIA_SEMANA[l.getDay()]}.`+
      (p.s1200.postergado
        ? ` O dia 15 caiu em ${escapar(motivoNaoUtil(b)||"dia não útil")} — corre para o próximo dia útil.`
        : "")});
    itens.push({t:"S-1210 Pagamentos", d:
      `Só processa depois que o S-1200 — ou o S-2299, para quem foi demitido no mês — `+
      `já estiver validado. É um evento por colaborador.`});
    itens.push({t:"S-1299 Fechamento", d:
      `Fecha a competência e atualiza a DCTFWeb. Depois disso, corrigir exige `+
      `reabrir com o <b>S-1298</b>.`});
  }

  return `<div class="prazos"><div class="prazos-cap">Prazos do eSocial — competência `+
    `${escapar(competenciaExibicao(comp))}</div>`+
    itens.map(i=>`<div class="prazo${i.atencao?" atencao":""}">`+
      `<span class="prazo-t">${i.t}</span><span class="prazo-d">${i.d}</span></div>`).join("")+
    `<p class="prazos-nota">A conta considera sábado, domingo e feriado <b>nacional</b>. `+
    `Feriado estadual, municipal e ponto facultativo (Carnaval, Corpus Christi) não entram — `+
    `confira o calendário da cidade da empresa.</p></div>`;
}

/* Pagamento em mês diferente do da apuração: na hora de retificar, a reabertura
   (S-1298) precisa alcançar as duas competências, não só a de apuração. */
/* ##################### roteiro pós-geração #####################
   Caminhos de menu conforme a Central de Soluções do Domínio. */
function painelProximosPassos(modulo, dp){
  const comp = dp ? competenciaExibicao(dp.competencia) : "";
  const passos = [
    `Importe o .txt em <code>Utilitários &gt; Importação &gt; de Arquivo Texto</code>.`,
    `Calcule a folha em <code>Processos &gt; Cálculo</code>`+
      (comp?`, competência <b>${escapar(comp)}</b>`:"")+
      `. Use <b>[Empresas...]</b> para rodar várias empresas de uma vez.`,
    `Confira o resultado em <code>Relatórios &gt; Folha &gt; Extrato</code> antes de emitir qualquer coisa.`,
    `Emita os recibos em <code>Relatórios &gt; Recibos &gt; Folha</code>. `+
      `Para publicar no Portal do Empregado é <b>obrigatório</b> marcar `+
      `<b>“Gerar relatório com quebra por empregado”</b> — sem isso o sistema não deixa enviar.`,
    `Envie o <b>S-1200</b> em <code>Relatórios &gt; e-Social &gt; Eventos Periódicos</code>, `+
      `depois o <b>S-1210</b>, e acompanhe no <code>Painel de Pendências</code>.`,
    `Feche a competência com o <b>S-1299</b> — é ele que atualiza a DCTFWeb.`,
  ];
  if(modulo==="rpa")
    passos.splice(3, 1,
      `Emita os recibos de RPA em <code>Relatórios &gt; Recibos</code>. O valor lançado `+
      `é o líquido: o Domínio calcula INSS, IRRF e ISS a partir dele.`);

  return `<div class="passos">
      <h3>Depois de importar</h3>
      <p class="passos-sub">Roteiro do módulo Folha, na ordem que evita retrabalho.</p>
      <ol>${passos.map(p=>`<li>${p}</li>`).join("")}</ol>
      ${dp ? painelPrazos(dp.competencia) : ""}
      <p class="passos-fonte">Caminhos de menu conforme a Central de Soluções do Domínio
        (suporte.dominioatendimento.com). O sistema muda com frequência — se a tela não
        bater com o descrito, confirme no artigo antes de agir.</p>
    </div>`;
}

/* ##################### agenda: feriados e data meta ##################### */
function agRenderPrazos(){
  const v = document.getElementById("agComp").value.trim();
  const alvo = document.getElementById("agPrazos");
  if(!v){ alvo.innerHTML = `<p class="cmp-vazio">Digite a competência para ver os prazos.</p>`; return; }
  const html = painelPrazos(v);
  alvo.innerHTML = html || `<p class="cmp-vazio">Competência inválida — use MM/AAAA (ou 13/AAAA para o 13º).</p>`;
}

function agRenderDataMeta(){
  const alvo = document.getElementById("agDlRes");
  const mv   = document.getElementById("agDlMes").value.trim();
  const dia  = Number(document.getElementById("agDlDia").value);
  const meta = Number(document.getElementById("agDlMeta").value);
  const post = document.getElementById("agDlPost").value === "1";
  let aaaamm;
  try{ aaaamm = competenciaAAAAMM(mv); }catch(e){
    alvo.innerHTML = `<p class="cmp-vazio">Informe o mês de vencimento em MM/AAAA.</p>`; return; }
  const ano = Number(aaaamm.slice(0,4)), mes = Number(aaaamm.slice(4,6));
  if(mes<1||mes>12){ alvo.innerHTML = `<p class="cmp-vazio">Mês de vencimento inválido.</p>`; return; }
  const ultimo = new Date(ano, mes, 0).getDate();
  if(!(dia>=1 && dia<=31)){ alvo.innerHTML = `<p class="cmp-vazio">Dia da Data Legal inválido.</p>`; return; }
  if(!(meta<=0)){ alvo.innerHTML = `<p class="cmp-vazio">A Data Meta é sempre zero ou negativa — dias <b>antes</b> da Data Legal.</p>`; return; }

  const diaReal = Math.min(dia, ultimo);
  const original = new Date(ano, mes-1, diaReal);
  const legal = post ? proximoDiaUtil(original) : original;
  const mudou = chaveDia(legal)!==chaveDia(original);
  const dataMeta = somaDias(legal, meta);
  const metaUtil = ehDiaUtil(dataMeta);

  const linhas = [
    ["Data Legal", `<b>${dataBR(legal)}</b> — ${DIA_SEMANA[legal.getDay()]}`+
      (dia>ultimo ? ` <span class="ag-facult">dia ${dia} não existe neste mês; usei o último</span>` : "")],
    ["Data Meta", `<b>${dataBR(dataMeta)}</b> — ${DIA_SEMANA[dataMeta.getDay()]}`+
      (metaUtil ? "" : ` <span class="ag-facult">cai em ${escapar(motivoNaoUtil(dataMeta)||"dia não útil")}</span>`)],
    ["Competência −1", competenciaExibicao(`${mes===1?12:mes-1}/${mes===1?ano-1:ano}`)],
    ["Competência 0",  competenciaExibicao(`${mes}/${ano}`)],
    ["Competência +1", competenciaExibicao(`${mes===12?1:mes+1}/${mes===12?ano+1:ano}`)],
  ];

  alvo.innerHTML = `<div class="ag-res"><table class="ag-tab"><tbody>`+
    linhas.map(([a,b])=>`<tr><td>${a}</td><td>${b}</td></tr>`).join("")+
    `</tbody></table></div>`+
    (mudou
      ? `<div class="msg warn"><strong>A Data Legal foi postergada</strong>`+
        `O dia ${diaReal} caiu em ${escapar(motivoNaoUtil(original)||"dia não útil")}. `+
        `Atenção: a Data Meta passa a contar a partir da data <b>já postergada</b> `+
        `(${dataBR(legal)}), não da original (${dataBR(original)}).</div>`
      : "");
}

function agRenderFeriados(){
  const ano = Number(document.getElementById("agAno").value);
  const alvo = document.getElementById("agFeriados");
  if(!(ano>=1900 && ano<=2200)){ alvo.innerHTML = `<p class="cmp-vazio">Informe um ano entre 1900 e 2200.</p>`; return; }
  const lista = feriadosNacionais(ano);
  alvo.innerHTML = `<div class="ag-res"><table class="ag-tab"><thead><tr>`+
    `<th>Data</th><th>Dia</th><th>Feriado</th><th>Tipo</th><th>Vale como</th>`+
    `</tr></thead><tbody>`+
    lista.map(f=>{
      const fds = f.data.getDay()===0 || f.data.getDay()===6;
      return `<tr class="${fds?"fim-semana":""}">`+
        `<td class="num">${dataBR(f.data)}</td>`+
        `<td>${DIA_SEMANA[f.data.getDay()]}</td>`+
        `<td>${escapar(f.nome)}</td>`+
        `<td>${f.movel?"móvel":"fixo"}</td>`+
        `<td>${f.legal?'<span class="ag-legal">feriado nacional</span>'
                      :'<span class="ag-facult">ponto facultativo</span>'}</td></tr>`;
    }).join("")+`</tbody></table></div>`+
    `<p class="prazos-nota">Só o que é <b>feriado nacional</b> entra na conta de dia útil deste `+
    `programa. No Domínio, cadastre em <code>Arquivo &gt; Outros &gt; Feriados</code>: os `+
    `<b>móveis</b> precisam ser recadastrados todo ano, e não se deve alterar feriado já `+
    `cadastrado, porque isso mexe em cálculo retroativo.</p>`;
  document.getElementById("agResumo").textContent =
    `${lista.filter(f=>f.legal).length} feriados nacionais em ${ano} · `+
    `${lista.filter(f=>!f.legal).length} pontos facultativos`;
}

function baixarCsvFeriados(){
  const ano = Number(document.getElementById("agAno").value);
  if(!(ano>=1900 && ano<=2200)) return;
  const linhas = feriadosNacionais(ano).map(f=>[
    dataBR(f.data), DIA_SEMANA[f.data.getDay()], f.nome,
    f.movel?"Móvel":"Fixo", f.legal?"Feriado nacional":"Ponto facultativo",
    f.legal?"Federal":"", "Para todos os cálculos e vencimentos",
  ]);
  const csv = csvDe(["Data","Dia da semana","Descrição","Tipo do Feriado",
                     "Situação","Nível","Considerar"], linhas);
  baixarBytes(paraBytesLatin1(csv), `Feriados_nacionais_${ano}.csv`, "text/csv");
}

function abrirAgenda(){
  const hoje = new Date();
  const cAg = document.getElementById("agComp");
  if(!cAg.value){
    const m = hoje.getMonth()===0 ? 12 : hoje.getMonth();
    const a = hoje.getMonth()===0 ? hoje.getFullYear()-1 : hoje.getFullYear();
    cAg.value = `${String(m).padStart(2,"0")}/${a}`;
  }
  const dl = document.getElementById("agDlMes");
  if(!dl.value) dl.value = `${String(hoje.getMonth()+1).padStart(2,"0")}/${hoje.getFullYear()}`;
  const an = document.getElementById("agAno");
  if(!an.value) an.value = hoje.getFullYear();
  agRenderPrazos(); agRenderDataMeta(); agRenderFeriados();
  document.getElementById("modalAgenda").hidden = false;
  document.body.style.overflow = "hidden";
}
function fecharAgenda(){
  document.getElementById("modalAgenda").hidden = true;
  document.body.style.overflow = "";
}

/* ##################### Portal do Empregado #####################
   Cruza a planilha que o Onvio Gestão exporta em
   Relatório > Documentos do Portal do Empregado com a folha lida aqui.
   O leiaute desse export muda conforme a versão e os filtros aplicados, então as
   colunas são ESCOLHIDAS NA TELA, não adivinhadas às cegas: o programa chuta pelo
   texto do cabeçalho e deixa você corrigir antes de conferir. E não interpreta o
   conteúdo das células — mostra os valores que encontrou e conta cada um. */

let peEstado = null;            /* {cab, dados, origem} da planilha lida */
let peResultado = null;         /* linhas prontas para o CSV */
let ultimaListaPessoas = null;  /* pessoas da última folha lida aqui */

/* o Onvio grava esse texto literal quando o colaborador ainda não criou a conta */
const PE_NAO_REGISTRADO = /n[ãa]o\s+registrad/i;

async function lerPortalEmpregado(file){
  const cartao = document.getElementById("cardPortal");
  cartao.classList.add("lendo");
  await new Promise(r=>setTimeout(r,30));
  try{
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()),
                         {type:"array", cellDates:true});
    let linhas = null;
    for(const nome of wb.SheetNames){
      const l = lerAba(wb, nome);
      if(l && l.some(r=>r.filter(c=>!vazio(c)).length>=2)){ linhas = l; break; }
    }
    if(!linhas) throw new Error("nenhuma aba com dados");
    const h = linhas.findIndex(r=>r.filter(c=>!vazio(c)).length>=2);
    const cab = linhas[h].map((c,i)=>String(c==null?"":c).trim() || `Coluna ${i+1}`);
    const dados = linhas.slice(h+1).filter(r=>r.some(c=>!vazio(c)));
    if(!dados.length) throw new Error("achei o cabeçalho, mas nenhuma linha de dados abaixo dele");
    peEstado = {cab, dados, origem:file.name};
    abrirPortal();
  }catch(e){
    erro("não consegui ler a planilha do Portal do Empregado: "+e.message);
  }finally{
    cartao.classList.remove("lendo");
  }
}

const peChute = (cab, termos) => {
  for(const t of termos){
    const i = cab.findIndex(c=>chave(c).includes(chave(t)));
    if(i>=0) return i;
  }
  return -1;
};

function abrirPortal(){
  const {cab, dados, origem} = peEstado;
  document.getElementById("peOrigem").textContent =
    `${origem} · ${dados.length} linha${dados.length===1?"":"s"} · ${cab.length} coluna${cab.length===1?"":"s"}`;

  const opts   = sel => cab.map((c,i)=>`<option value="${i}"${i===sel?" selected":""}>${escapar(c)}</option>`).join("");
  const optsOp = sel => `<option value="-1"${sel<0?" selected":""}>— não usar —</option>`+opts(sel);
  const gNome = peChute(cab, ["publicado para","colaborador","empregado","nome"]);
  const gComp = peChute(cab, ["competencia"]);
  const gTipo = peChute(cab, ["tipo de documento","documento","tipo"]);
  const gVis  = peChute(cab, ["visualizado","visualizada","situacao"]);

  document.getElementById("peCorpo").innerHTML = `
    <div class="msg info"><strong>Confira as colunas antes</strong>
      O leiaute desse relatório muda conforme a versão e os filtros do Onvio. Eu chuto pelo
      texto do cabeçalho — corrija o que estiver errado e mande conferir.</div>
    <div class="pe-map">
      <label>Nome do colaborador (“Publicado Para”)<select id="peColNome">${opts(gNome<0?0:gNome)}</select></label>
      <label>Competência<select id="peColComp">${optsOp(gComp)}</select></label>
      <label>Tipo de documento<select id="peColTipo">${optsOp(gTipo)}</select></label>
      <label>Visualizado<select id="peColVis">${optsOp(gVis)}</select></label>
    </div>
    <button type="button" class="rec-tool-btn" id="peConferir">Conferir</button>
    <div id="peSaida"></div>`;
  document.getElementById("peConferir").addEventListener("click", conferirPortal);
  document.getElementById("peResumo").textContent = "";
  document.getElementById("peCsv").hidden = true;
  peResultado = null;
  document.getElementById("modalPortal").hidden = false;
  document.body.style.overflow = "hidden";
}

function conferirPortal(){
  const {cab, dados} = peEstado;
  const cN = Number(document.getElementById("peColNome").value);
  const cC = Number(document.getElementById("peColComp").value);
  const cT = Number(document.getElementById("peColTipo").value);
  const cV = Number(document.getElementById("peColVis").value);
  const txt = (l,i) => i<0 ? "" : String(l[i]==null?"":l[i]).trim();

  const publicados = new Map();     /* chave do nome -> nome como veio */
  const porVis = new Map(), porTipo = new Map(), porComp = new Map();
  let naoRegistrados = 0;

  dados.forEach(l=>{
    const nome = txt(l,cN);
    if(nome){
      if(PE_NAO_REGISTRADO.test(nome)) naoRegistrados++;
      else publicados.set(chave(nome), nome);
    }
    const conta = (c,mapa) => { if(c>=0){ const v=txt(l,c)||"(vazio)"; mapa.set(v,(mapa.get(v)||0)+1); } };
    conta(cV,porVis); conta(cT,porTipo); conta(cC,porComp);
  });

  const pills = mapa => `<div class="pe-vals">`+
    [...mapa.entries()].sort((a,b)=>b[1]-a[1])
      .map(([v,n])=>`<span class="pe-val">${escapar(v)} <b>${n}</b></span>`).join("")+`</div>`;

  let html = `<div class="tot">
      <div>Linhas no relatório<b>${dados.length}</b></div>
      <div>Colaboradores distintos<b>${publicados.size}</b></div>
      <div>Publicado a quem não se registrou<b>${naoRegistrados}</b></div>
    </div>`;

  if(naoRegistrados)
    html += `<div class="msg warn"><strong>${naoRegistrados} documento(s) foram para quem ainda não criou a conta</strong>
      O Onvio grava “Usuário não registrado” no lugar do nome, então o relatório não diz
      <em>quem</em> são. Para reenviar o convite, ajuste o e-mail no cadastro do colaborador
      e grave de novo — <code>Arquivo &gt; Empregados</code>, guia Portal do Empregado — ou
      use <code>Utilitários &gt; Configuração do Portal do Empregado</code> para tratar em grupo.</div>`;

  const linhasCsv = [];
  if(cV>=0) html += `<h4>Coluna “Visualizado” — valores encontrados</h4>${pills(porVis)}`;
  if(cT>=0) html += `<h4>Tipos de documento</h4>${pills(porTipo)}`;
  if(cC>=0) html += `<h4>Competências</h4>${pills(porComp)}`;

  /* cruzamento com a folha que foi lida aqui, quando existe */
  if(ultimaListaPessoas && ultimaListaPessoas.length){
    const faltando = ultimaListaPessoas.filter(p=>p.nome && !publicados.has(chave(p.nome)));
    html += `<h4>Quem está na folha lida aqui e não aparece no relatório — ${faltando.length} pessoa(s)</h4>`;
    if(!faltando.length){
      html += `<p class="cmp-vazio">Todo mundo da folha aparece no relatório do Portal.</p>`;
    }else{
      html += `<table class="tabela-lote cmp-tab"><thead><tr><th>Código</th><th>Nome</th></tr></thead><tbody>`+
        faltando.map(p=>`<tr><td class="cmp-cod">${escapar(String(p.codigo||""))}</td>`+
          `<td>${escapar(p.nome)}</td></tr>`).join("")+`</tbody></table>`;
      faltando.forEach(p=>linhasCsv.push(["Sem documento no Portal", p.codigo||"", p.nome]));
    }
    if(naoRegistrados)
      html += `<div class="msg warn"><strong>Esta lista pode estar inflada</strong>
        Como ${naoRegistrados} linha(s) vieram sem nome (“Usuário não registrado”), quem estiver
        nessa situação aparece aqui como se não tivesse recebido documento. Confira caso a caso.</div>`;
  }else{
    html += `<div class="msg info"><strong>Quer saber quem ficou sem documento?</strong>
      Leia antes um contracheque ou a Relação Geral dos Líquidos no cartão lá em cima —
      aí eu comparo a folha com este relatório e listo quem não aparece.</div>`;
  }

  [...publicados.values()].forEach(n=>linhasCsv.push(["Documento publicado","",n]));
  peResultado = linhasCsv;
  document.getElementById("peSaida").innerHTML = html;
  document.getElementById("peResumo").textContent =
    `${publicados.size} colaborador(es) com documento · ${naoRegistrados} ainda não registrado(s)`;
  document.getElementById("peCsv").hidden = !linhasCsv.length;
}

function baixarCsvPortal(){
  if(!peResultado || !peResultado.length) return;
  const csv = csvDe(["Situação","Código","Nome"], peResultado);
  baixarBytes(paraBytesLatin1(csv), "Conferencia_Portal_do_Empregado.csv", "text/csv");
}

function fecharPortal(){
  document.getElementById("modalPortal").hidden = true;
  document.body.style.overflow = "";
}

/* Lista de trabalho para Utilitários > Configuração do Portal do Empregado:
   aquela tela pede o e-mail de cada colaborador, um por um. */
function planilhaPortalEmpregado(){
  if(!contraDados) return;
  const pessoas = listaAtual().filter(p=>p.marcado && !vazio(p.nome));
  if(!pessoas.length)
    return reprovar("marque pelo menos uma pessoa para montar a lista do Portal");

  const empresa = $cp("cpEmpresa").value.trim();
  const linhas = pessoas.map(p=>[
    N(vazio(p.codigo)?null:Number(soDigitos(p.codigo)), EST.inteiro),
    S(String(p.nome), EST.txt),
    S(p.funcao||"", EST.txt),
    S("", EST.txt),
    S("", EST.txt),
  ]);
  const vazias = Array.from({length:10},()=>
    [N(null,EST.inteiro),S("",EST.txt),S("",EST.txt),S("",EST.txt),S("",EST.txt)]);

  const abaLista = {nome:"Colaboradores", protegida:true, permitirInserir:true, congelar:1,
    larguras:[12,40,28,38,24],
    linhas:[
      [S("Código",EST.cab),S("Nome",EST.cab),S("Função",EST.cab),
       S("E-mail do colaborador",EST.cab),S("Status no Portal",EST.cab)],
      ...linhas, ...vazias,
    ],
    alturas:{0:30}};

  const abaInstr = {nome:"Instrucoes", protegida:true, larguras:[110],
    linhas:[
      [S("Habilitar colaboradores no Portal do Empregado",EST.titulo)],
      [],
      [S("Antes de tudo: o Agente de Comunicação (a bolinha no canto inferior direito do Domínio) precisa estar verde.",EST.nota)],
      [],
      [S("1. A empresa precisa estar habilitada: Controle > Empresas > [Módulos...], guia Onvio, marcar [x] Portal do Empregado, [OK] e [Gravar].",EST.nota)],
      [S("   Atenção: depois de habilitado, NAO e possivel desabilitar para a empresa.",EST.nota)],
      [S("2. Em grupo: Utilitarios > Configuracao do Portal do Empregado, filtro [x] Nao enviado para o Portal, botao [Listar].",EST.nota)],
      [S("3. Preencha o e-mail de cada colaborador na coluna correspondente, [Gravar] e depois [Atualizar] para disparar o convite.",EST.nota)],
      [S("4. O status passa a 'Aguardando Confirmacao' e vira 'Ativo' quando o colaborador se registrar no app Dominio Para Voce.",EST.nota)],
      [S("5. Um a um: Arquivo > Empregados (ou Contribuintes / Estagiarios), guia Portal do Empregado, marcar [x] Utiliza Portal do Empregado, informar o e-mail e [Gravar].",EST.nota)],
      [],
      [S("Esta planilha e so a sua lista de trabalho para preencher aquela tela — o Dominio nao importa este arquivo.",EST.nota)],
      [S("Os e-mails do sistema (boas-vindas e codigo MFA) chegam de digitalbanking@dominio.tr.com.",EST.nota)],
      [S("Quem ja foi desligado nao pode mais ser habilitado no Portal.",EST.nota)],
    ],
    alturas:{0:26}};

  const nome = empresa
    ? `Portal_do_Empregado_${sanitizarNomeArquivo(empresa)}.xlsx`
    : "Portal_do_Empregado.xlsx";
  baixarBytes(construirZip(XL.montar([abaLista, abaInstr], "0E6B7D")), nome,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  $cp("cpErro").textContent = "";
  return true;
}

/* ##################### definição dos módulos ##################### */
let moduloAtivo = "rpa";

/* ##################### utilidades comuns ##################### */
/* ##################### conferências de gravação ##################### */
/* ##################### gerador de planilha modelo ##################### */
function configPlanoSeco(){
  const erro = document.getElementById("mdPlanoErro");
  erro.textContent = "";

  const txtRub  = document.getElementById("mdPlanoRub").value.trim();
  const cnpjDig = soDigitos(document.getElementById("mdPlanoCnpj").value);

  const falhar = (msg, id) => {
    erro.textContent = msg;
    const el = document.getElementById(id);
    if(el){
      el.classList.add("faltando"); el.focus();
      setTimeout(()=>el.classList.remove("faltando"), 2600);
    }
    return false;
  };

  if(!txtRub)              return falhar("informe pelo menos uma rubrica de plano de saúde","mdPlanoRub");
  if(cnpjDig.length!==14)  return falhar("o CNPJ da operadora tem 14 dígitos","mdPlanoCnpj");
  if(!cnpjValido(cnpjDig)) return falhar("confira o CNPJ — os dígitos verificadores não fecham","mdPlanoCnpj");

  const rubricas = [], vistos = new Set();
  for(const linha of txtRub.split(/\r?\n/)){
    const l = linha.trim();
    if(!l) continue;
    let codigo, descricao;
    const m = l.match(/^(.*?)\s*\((\d+)\)\s*$/);
    if(m){ descricao = m[1].trim(); codigo = m[2]; }
    else if(/^\d+$/.test(l)){ codigo = l; descricao = ""; }
    else return falhar(`não entendi "${l}" — use o formato: Nome da rubrica (código)`,"mdPlanoRub");
    if(!descricao) descricao = "Plano de saúde";
    if(vistos.has(codigo)) return falhar(`a rubrica ${codigo} aparece mais de uma vez`,"mdPlanoRub");
    vistos.add(codigo);
    rubricas.push({descricao, codigo:Number(codigo)});
  }
  if(!rubricas.length) return falhar("informe pelo menos uma rubrica de plano de saúde","mdPlanoRub");
  return {cnpj: formatarCnpj(cnpjDig), rubricas};
}

/* O modelo de RPA não tem plano de saúde, então baixa direto. O de Lançamentos
   passa pela pergunta — é uma decisão só, não dois botões concorrentes. */
function pedirModelo(){
  if(moduloAtivo!=="lancamentos") return baixarModelo();
  abrirModeloPlano();
}

const temPlanoMarcado = () =>
  document.querySelector('input[name="mdTemPlano"]:checked').value === "sim";

function alternarOpcaoPlano(){
  const sim = temPlanoMarcado();
  document.getElementById("mdPlanoCampos").hidden = !sim;
  document.getElementById("mdPlanoErro").textContent = "";
  document.querySelectorAll(".opcao").forEach(o=>
    o.classList.toggle("marcada", o.querySelector("input").checked));
  if(sim) setTimeout(()=>document.getElementById("mdPlanoCnpj").focus(), 40);
}

function abrirModeloPlano(){
  document.getElementById("mdPlanoErro").textContent = "";
  document.querySelector('input[name="mdTemPlano"][value="nao"]').checked = true;
  document.getElementById("mdPlanoCampos").hidden = true;
  document.querySelectorAll(".opcao").forEach(o=>
    o.classList.toggle("marcada", o.querySelector("input").checked));
  document.getElementById("modalModeloPlano").hidden = false;
  document.body.style.overflow = "hidden";
}
function fecharModeloPlano(){
  document.getElementById("modalModeloPlano").hidden = true;
  document.body.style.overflow = "";
}

function confirmarModelo(){
  if(!temPlanoMarcado()){ baixarModelo(); fecharModeloPlano(); return; }
  const cfg = configPlanoSeco();
  if(!cfg) return;                       /* inválido — o erro já está na tela */
  baixarModelo({rubricas: cfg.rubricas,
                planoSaude:{cnpj: cfg.cnpj, rubricas: cfg.rubricas.map(r=>r.codigo)}});
  fecharModeloPlano();
}

function baixarModelo(extra){
  const m=planilhaModelo(moduloAtivo, extra);
  const bytes=construirZip(XL.montar(m.abas, m.cor));
  baixarBytes(bytes, m.nome, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const b=document.getElementById("btnModelo");
  const txt=b.textContent; b.textContent="Modelo baixado ✓";
  setTimeout(()=>{b.textContent=txt;},1800);
}

/* ##################### orquestração ##################### */
let dadosDePara=null, txtGerado=null;
let ultimoMod=null, ultimoResultado=null, ultimoIgnoradas=null, ultimoDp=null, recordsAbertos=new Set();
let avisoTransitorio="";
let modoLote=false, arquivosLote=[], ultimoLoteResultados=null;
let geradoEm=null, modoRelatorio=false;

function gerar(){
  geradoEm=new Date();
  return modoLote ? gerarLote() : gerarUnico();
}

function montarResultado(mod, wb, moduloNome){
  const alertaVersao = detectarPlanilhaDesatualizada(wb, moduloNome);
  if(alertaVersao) throw new Error(alertaVersao);
  const dp = mod.parseDePara(wb);
  const parsed = mod.parseItensPlanilha(dp, wb);
  if(!parsed.itens.length)
    throw new Error("não encontrei nenhum registro reconhecível na aba "+mod.abaValores);

  const resultado = mod.gerar(dp, parsed.itens, parsed);

  const foraDoPadrao = detectarValoresForaDoPadrao(parsed.itens,
    moduloNome==="lancamentos" ? it=>it.rubrica.codigo : null);
  const avisosPadrao = foraDoPadrao.length
    ? [{titulo:"Valor bem acima dos demais no mesmo grupo — confira antes de gerar", lista:foraDoPadrao}]
    : [];

  resultado.avisosExtra = [
    ...(parsed.avisos||[]),
    ...conferirValores(parsed.itens),
    ...conferirDataPagamento(dp),
    ...avisosPadrao,
    ...(resultado.avisosExtra||[]),
  ];
  resultado.reconciliacao = reconciliar(dp, resultado.linhas);
  return {dp, parsed, resultado};
}

function reconciliar(dp, linhas){
  const soma = soLancamentos(linhas).reduce((s,l)=>s+l.valor,0);
  if(dp.totalEsperado===null||dp.totalEsperado===undefined) return {soma, esperado:null};
  const dif = Math.round((soma-dp.totalEsperado)*100)/100;
  return {soma, esperado:dp.totalEsperado, diferenca:dif, confere:Math.abs(dif)<0.005};
}

function gerarUnico(){
  limparSaida();
  const mod = MODULOS[moduloAtivo];
  let r;
  try{ r = montarResultado(mod, dadosDePara, moduloAtivo); }
  catch(e){ return erro(e.message); }

  ultimoDp = r.dp;
  recordsAbertos = new Set();
  render(mod, r.resultado, r.parsed.ignoradas);
}

function gerarLote(){
  limparSaida();
  const mod = MODULOS[moduloAtivo];
  const resultados=[];

  for(const item of arquivosLote){
    if(!item.wb){ resultados.push({nome:item.nome, ok:false, mensagem:"não consegui ler o arquivo: "+item.erroLeitura}); continue; }
    let r;
    try{ r = montarResultado(mod, item.wb, moduloAtivo); }
    catch(e){ resultados.push({nome:item.nome, ok:false, mensagem:e.message}); continue; }

    const totalAvisos = (r.resultado.avisosExtra||[]).length + r.resultado.comErro.length;
    const txt = r.resultado.linhas.map(l=>l.texto).join("\r\n")+"\r\n";
    resultados.push({
      nome:item.nome, ok:true, dp:r.dp, resultado:r.resultado, txt,
      ignoradas:r.parsed.ignoradas,
      nomeArq: nomeArquivoSaida(moduloAtivo, r.dp), avisosCount: totalAvisos,
    });
  }

  ultimoLoteResultados = resultados;
  renderLote(resultados);
}

function limparSaida(){
  document.getElementById("avisos").innerHTML="";
  document.getElementById("saida").innerHTML="";
  document.getElementById("btnBaixar").disabled=true;
  const be=document.getElementById("btnRelatorio"); if(be) be.disabled=true;
  txtGerado=null;
}

function erro(msg){
  document.getElementById("avisos").innerHTML=
    `<div class="msg err"><strong>Não deu para gerar</strong>${escapar(msg)}</div>`;
  document.getElementById("status").textContent="";
}
const bloco=(cls,titulo,lista,acao)=>
  `<div class="msg ${cls}"><strong>${escapar(titulo)}</strong><ul>`+
  lista.map(x=>`<li>${escapar(x)}</li>`).join("")+`</ul>${acao||""}</div>`;

/* ##################### render — lote ##################### */
function renderLote(resultados){
  const ok = resultados.filter(r=>r.ok);
  const somaGeral = ok.reduce((s,r)=>s+r.resultado.linhas.reduce((a,l)=>a+l.valor,0),0);
  const regGeral = ok.reduce((s,r)=>s+r.resultado.linhas.length,0);

  let html = `<h2><span class="step">3</span> Lote — ${resultados.length} planilha${resultados.length===1?"":"s"}</h2>
    <table class="tabela-lote"><thead><tr>
      <th>Arquivo</th><th>Empresa</th><th>Competência</th><th class="num">Registros</th>
      <th class="num">Soma</th><th>Conferência</th><th>Avisos</th><th></th>
    </tr></thead><tbody>`;
  resultados.forEach((r,i)=>{
    if(r.ok){
      const soma = r.resultado.linhas.reduce((s,l)=>s+l.valor,0);
      const rec = r.resultado.reconciliacao;
      let conf='<span class="pill pill-neutro">sem total</span>';
      if(rec.esperado!==null)
        conf = rec.confere
          ? '<span class="pill pill-ok">confere</span>'
          : `<span class="pill pill-erro">${rec.diferenca>0?"+":"−"} R$ ${moeda(Math.abs(rec.diferenca))}</span>`;
      html += `<tr>
        <td>${escapar(r.nome)}</td>
        <td>${escapar(r.dp.empresaNome ? String(r.dp.empresaNome) : "código "+String(r.dp.empresa))}</td>
        <td>${escapar(competenciaExibicao(r.dp.competencia))}</td>
        <td class="pos num">${r.resultado.linhas.length}</td>
        <td class="pos num">R$ ${moeda(soma)}</td>
        <td>${conf}</td>
        <td class="pos">${r.avisosCount ? r.avisosCount+" aviso"+(r.avisosCount===1?"":"s") : "—"}</td>
        <td class="acoes">
          <button type="button" class="mini" data-lote-abrir="${i}">Conferir</button>
          <button type="button" class="mini" data-lote-baixar="${i}">.txt</button>
        </td>
      </tr>`;
    }else{
      html += `<tr class="linha-erro">
        <td>${escapar(r.nome)}</td>
        <td colspan="6">${escapar(r.mensagem)}</td>
        <td><span class="status-erro">erro</span></td>
      </tr>`;
    }
  });
  if(ok.length>1){
    html += `<tr class="linha-total">
      <td colspan="3">Total do lote</td>
      <td class="pos num">${regGeral}</td>
      <td class="pos num">R$ ${moeda(somaGeral)}</td>
      <td colspan="3"></td></tr>`;
  }
  html += `</tbody></table>`;
  document.getElementById("saida").innerHTML = html;
  document.getElementById("status").textContent =
    `${ok.length} de ${resultados.length} planilha${resultados.length===1?"":"s"} gerada${ok.length===1?"":"s"}`;
  document.getElementById("btnBaixar").disabled = !ok.length;
  const be=document.getElementById("btnRelatorio"); if(be) be.disabled=!ok.length;

  document.querySelectorAll("[data-lote-baixar]").forEach(b=>{
    b.addEventListener("click",()=>{
      const r=ultimoLoteResultados[Number(b.dataset.loteBaixar)];
      baixarBytes(paraBytesLatin1(r.txt), r.nomeArq, "text/plain");
    });
  });
  document.querySelectorAll("[data-lote-abrir]").forEach(b=>{
    b.addEventListener("click",()=>{
      const r=ultimoLoteResultados[Number(b.dataset.loteAbrir)];
      modoLote=false;
      ultimoDp=r.dp; recordsAbertos=new Set();
      avisoTransitorio=`<div class="msg ok"><strong>Conferindo "${escapar(r.nome)}"</strong>`+
        `As edições valem só para este arquivo. Use "Voltar ao lote" para ver os outros.</div>`;
      document.getElementById("btnVoltarLote").hidden=false;
      atualizarBotaoGerar();
      render(MODULOS[moduloAtivo], r.resultado, r.ignoradas||[]);
    });
  });
}

function voltarAoLote(){
  modoLote=true;
  document.getElementById("btnVoltarLote").hidden=true;
  ultimoLoteResultados.forEach(r=>{
    if(r.ok) r.txt=linhasDoArquivo(r.resultado).map(l=>l.texto).join("\r\n")+"\r\n";
  });
  document.getElementById("avisos").innerHTML="";
  atualizarBotaoGerar();
  renderLote(ultimoLoteResultados);
}

/* ##################### render — conferência ##################### */
/* Algumas rubricas o Domínio recusa na importação porque exigem informação que
   o leiaute não carrega — plano de saúde pede a operadora, por exemplo. Elas
   podem ser tiradas do arquivo aqui e lançadas à mão, sem refazer a planilha. */
function linhasDoArquivo(r){
  if(!r.excluidas || !r.excluidas.size) return r.linhas;
  return r.linhas.filter(l=>
    !r.excluidas.has(l.rotulo) && !(l.vinculadoA && r.excluidas.has(l.vinculadoA)));
}
function linhasDeFora(r){
  if(!r.excluidas || !r.excluidas.size) return [];
  return r.linhas.filter(l=>
    r.excluidas.has(l.rotulo) || (l.vinculadoA && r.excluidas.has(l.vinculadoA)));
}
/* registros 20 e 25 repetem valores já contados no registro 10 — fora da soma */
const soLancamentos = linhas => linhas.filter(l=>!l.complementar);

function resumoPorGrupo(linhas){
  const m=new Map();
  soLancamentos(linhas).forEach(l=>{
    const k=l.rotulo;
    if(!m.has(k)) m.set(k,{n:0,soma:0});
    const g=m.get(k); g.n++; g.soma+=l.valor;
  });
  return [...m.entries()].sort((a,b)=>b[1].soma-a[1].soma);
}

function render(mod, r, ignoradas){
  ultimoMod=mod; ultimoResultado=r; ultimoIgnoradas=ignoradas||[];

  const foraLatin1 = detectarForaLatin1(r.linhas);

  let html = avisoTransitorio;
  avisoTransitorio="";
  if(r.comErro.length) html+=bloco("err","Linhas com erro — não entraram no arquivo",r.comErro);
  if(foraLatin1.length) html+=bloco("err",
    "Caracteres que o arquivo não aceita — viram \"?\" no Domínio", foraLatin1,
    `<button type="button" class="msg-acao" id="btnNormalizar">Tirar os acentos e gerar de novo</button>`);
  (r.avisosExtra||[]).forEach(a=>{ html+=bloco("warn", a.titulo, a.lista); });
  if(ignoradas && ignoradas.length) html+=bloco("warn","Linhas que não viraram registro (confira se alguma deveria ter virado)",ignoradas);
  document.getElementById("avisos").innerHTML=html;

  const btnNorm=document.getElementById("btnNormalizar");
  if(btnNorm) btnNorm.addEventListener("click",()=>{
    const n=normalizarParaLatin1(r.linhas);
    avisoTransitorio=`<div class="msg ok"><strong>Acentos removidos</strong>${n} registro${n===1?"":"s"} ajustado${n===1?"":"s"}. Confira o texto antes de baixar.</div>`;
    render(mod, r, ignoradas);
  });

  if(!r.linhas.length){
    document.getElementById("status").textContent="nenhum registro gerado";
    document.getElementById("saida").innerHTML=""; return;
  }

  if(!r.excluidas) r.excluidas = new Set();
  const noArquivo = linhasDoArquivo(r);
  const total=soLancamentos(noArquivo).reduce((s,l)=>s+l.valor,0);
  const editados=r.linhas.filter(l=>l.editado).length;
  const tamanhos=[...new Set(r.linhas.map(l=>l.texto.length))];
  document.getElementById("status").textContent=
    `${noArquivo.length} registro${noArquivo.length===1?"":"s"} · `+
    (tamanhos.length===1 ? `${tamanhos[0]} caracteres por linha` : `${tamanhos.join(" ou ")} caracteres por linha`);

  txtGerado=noArquivo.map(l=>l.texto).join("\r\n")+"\r\n";
  document.getElementById("btnBaixar").disabled=false;
  {const c=document.getElementById("btnCopiar"); if(c){ c.disabled=false; c.hidden=false; }}
  {const b=document.getElementById("btnRelatorio"); if(b) b.disabled=false;}

  const rec=r.reconciliacao||{soma:total,esperado:null};
  let painelRec="";
  if(rec.esperado!==null && rec.esperado!==undefined){
    painelRec = rec.confere
      ? `<div class="recon recon-ok"><span class="recon-tag">Confere</span>
          <span class="recon-txt">A soma bate com o total esperado de <b>R$ ${moeda(rec.esperado)}</b>.</span></div>`
      : `<div class="recon recon-dif"><span class="recon-tag">Diferença</span>
          <span class="recon-txt">Esperado <b>R$ ${moeda(rec.esperado)}</b>, gerado <b>R$ ${moeda(rec.soma)}</b> —
          ${rec.diferenca>0?"R$ "+moeda(rec.diferenca)+" a mais":"R$ "+moeda(Math.abs(rec.diferenca))+" a menos"}.</span></div>`;
  }

  const grupos=resumoPorGrupo(r.linhas);
  const mostrarResumoGrupo = moduloAtivo==="lancamentos" && grupos.length>1;

  let out=`<h2><span class="step">3</span> Conferência
      <span class="h2-note">passe o mouse num campo para localizá-lo nos caracteres</span></h2>
    <p class="lote-info">Gerando para <b>${escapar(ultimoDp && ultimoDp.empresaNome ? String(ultimoDp.empresaNome) : "empresa código "+String(ultimoDp.empresa))}</b>`+
      ` — <b>${escapar(competenciaExibicao(ultimoDp.competencia))}</b>`+
      (geradoEm?` <span class="carimbo">gerado em ${geradoEm.toLocaleString("pt-BR")}</span>`:"")+`</p>
    ${painelRec}
    <div class="tot">
      <div>Registros<b id="totalRegistros">${soLancamentos(noArquivo).length}</b></div>
      ${noArquivo.length!==soLancamentos(noArquivo).length
        ? `<div>Linhas no arquivo<b>${noArquivo.length}</b></div>` : ""}
      <div>Soma dos valores<b id="totalValores">R$ ${moeda(total)}</b></div>
      ${editados?`<div>Editados<b id="totalEditados">${editados}</b></div>`:""}
      ${r.resumoExtra?`<div>${r.resumoExtra}</div>`:""}
    </div>`;

  if(mostrarResumoGrupo){
    out += `<details class="resumo-grupo" open><summary>Total por rubrica</summary>
      <table class="tabela-resumo"><thead><tr>
        <th class="col-chk">No arquivo</th><th>Rubrica</th>
        <th class="num">Lanç.</th><th class="num">Soma</th></tr></thead><tbody>`+
      grupos.map(([k,g],i)=>{
        const dentro=!r.excluidas.has(k);
        return `<tr class="${dentro?"":"rub-fora"}">`+
          `<td class="col-chk"><input type="checkbox" data-exc="${i}"${dentro?" checked":""} `+
          `aria-label="Incluir ${escapar(k)} no arquivo"></td>`+
          `<td>${escapar(k)}</td><td class="pos num">${g.n}</td>`+
          `<td class="pos num">R$ ${moeda(g.soma)}</td></tr>`;
      }).join("")+
      `</tbody></table>
      <p class="resumo-dica">Desmarque a rubrica que o Domínio recusar — ela sai do .txt
        e vai para uma lista à parte.</p>
      </details>
      <div id="blocoFora"></div>`;
  }

  out += r.linhas.length>3?`
    <div class="rec-toolbar">
      <input id="recFiltro" class="rec-filter" type="search" placeholder="Filtrar por nome, código ou rubrica…" aria-label="Filtrar registros">
      <span class="rec-filtro-count" id="recFiltroCount"></span>
      <select id="recSort" class="rec-sort" aria-label="Ordenar registros">
        <option value="orig">Ordem da planilha</option>
        <option value="nome">Nome (A→Z)</option>
        <option value="maior">Maior valor</option>
        <option value="menor">Menor valor</option>
      </select>
      <button type="button" class="rec-tool-btn" id="recExpandir">Expandir tudo</button>
      <button type="button" class="rec-tool-btn" id="recRecolher">Recolher tudo</button>
    </div>`:"";

  /* o cabeçalho resume o trecho que está logo abaixo dele — os registros do
     bloco final (plano, pensão, serviço) formam seção própria, por tipo */
  const trechos=[];
  let trechoAtual=null;
  r.linhas.forEach((l,i)=>{
    const k = l.secao ? "S|"+l.secao : "N|"+l.nome;
    if(!trechoAtual || trechoAtual.k!==k){
      trechoAtual={k, titulo:l.secao||l.nome, secao:!!l.secao, nome:l.nome, itens:[]};
      trechos.push(trechoAtual);
    }
    trechoAtual.itens.push({l,i});
  });

  trechos.forEach(b=>{
    const lanc  = b.itens.filter(x=>!x.l.complementar);
    const extras= b.itens.length - lanc.length;
    const soma  = lanc.reduce((s,x)=>s+x.l.valor,0);
    const meta  = b.secao
      ? `${b.itens.length} registro${b.itens.length===1?"":"s"}`
      : `${lanc.length} lanç. · <b>R$ ${moeda(soma)}</b>`+
        (extras?` · ${extras} compl.`:"");
    out+=`<div class="rec-grupo-head" data-grupo="${escapar(b.k)}">`+
      `<span class="nome">${escapar(b.titulo)}</span>`+
      `<span class="rec-grupo-meta">${meta}</span></div>`;
    b.itens.forEach(x=>{ out += cartaoRegistro(x.l, x.i, mod, b); });
  });
  out += painelProximosPassos(moduloAtivo, ultimoDp);
  document.getElementById("saida").innerHTML=out;
  ligarEventosConferencia(mod, r);
}

function cartaoRegistro(l, i, mod, grupo){
  const aberto = recordsAbertos.has(i);
  /* dentro de um grupo por pessoa, o nome já está no cabeçalho: o cartão mostra
     a rubrica. Nas seções por tipo de registro é o contrário. */
  const porSecao = grupo ? grupo.secao : !!l.secao;
  const titulo   = porSecao ? l.nome : l.rotulo;
  const direita  = porSecao ? (l.detalhe||"") : (l.detalhe||l.rotulo);
  let regua="", fita="", tabela="";
  (l.campos||mod.campos).forEach((c,ci)=>{
    regua += `<span data-f="${ci}" style="--n:${c.tam}">${c.ini}</span>`;
    fita  += `<span data-f="${ci}" style="--n:${c.tam}" title="${escapar(c.nome)}">`+
             `${escapar(l.texto.substr(c.ini-1,c.tam))}</span>`;
    tabela += `<tr data-f="${ci}">`+
      `<td class="pos">${String(c.ini).padStart(3,"0")}–${String(c.ini+c.tam-1).padStart(3,"0")}</td>`+
      `<td>${escapar(c.nome)}</td>`+
      `<td class="val">${escapar(l.texto.substr(c.ini-1,c.tam))}</td></tr>`;
  });
  const busca=chave([l.nome,l.rotulo,l.codigo,l.detalhe].filter(Boolean).join(" "));
  const chaveGrupo = l.secao ? "S|"+l.secao : "N|"+l.nome;
  return `<div class="rec${aberto?" open":""}" data-rec="${i}" data-busca="${escapar(busca)}" `+
    `data-grupo="${escapar(chaveGrupo)}" data-nome="${escapar(chave(l.nome))}">`+
    `<div class="rec-head">`+
    `<button class="rec-toggle" data-idx="${i}" aria-expanded="${aberto}">`+
      `<span class="rec-titulo">${escapar(titulo)}</span>`+
      (porSecao ? "" : `<span class="rec-nome-sec">${escapar(l.nome)}</span>`)+
      `<span class="chip chip-editado"${l.editado?"":' hidden'}>editado</span></button>`+
    `<span class="rec-valor-wrap">R$ <input class="rec-valor-input" data-idx="${i}" `+
      `inputmode="decimal" aria-label="Valor de ${escapar(l.nome)} — ${escapar(l.rotulo)}" `+
      `value="${escapar(moeda(l.valor))}"></span>`+
    `<span class="rec-n">${escapar(direita)}</span>`+
    `</div>`+
    `<div class="rec-body">`+
      `<div class="fita-reg-wrap">`+
        `<div class="regua">${regua}</div>`+
        `<div class="fita-reg">${fita}</div>`+
      `</div>`+
      `<div class="rec-tab-wrap"><table>`+
      `<thead><tr><th>Posição</th><th>Campo</th><th>Conteúdo gravado</th></tr></thead>`+
      `<tbody>${tabela}</tbody></table></div>`+
    `</div></div>`;
}

function renderBlocoFora(r){
  const alvo = document.getElementById("blocoFora");
  if(!alvo) return;
  const fora = soLancamentos(linhasDeFora(r));
  if(!fora.length){ alvo.innerHTML=""; return; }
  const soma = fora.reduce((s,l)=>s+l.valor,0);
  const porRubrica = resumoPorGrupo(fora);
  alvo.innerHTML =
    `<div class="msg warn bloco-fora"><strong>Fora do arquivo — lance ${fora.length===1?"esta":"estas"} `+
    `${fora.length} linha${fora.length===1?"":"s"} direto no Domínio (R$ ${moeda(soma)})</strong>`+
    porRubrica.map(([k,g])=>
      `<div class="fora-rubrica"><b>${escapar(k)}</b> — ${g.n} lanç., R$ ${moeda(g.soma)}</div>`+
      `<ul>`+fora.filter(l=>l.rotulo===k).map(l=>
        `<li>${escapar(l.nome)} — código ${escapar(String(l.codigo))} — R$ ${moeda(l.valor)}</li>`).join("")+`</ul>`
    ).join("")+
    `<button type="button" class="msg-acao" id="btnForaCsv">Baixar esta lista (.csv)</button></div>`;

  const b = document.getElementById("btnForaCsv");
  if(b) b.addEventListener("click",()=>baixarListaFora(r));
}

function baixarListaFora(r){
  const fora = soLancamentos(linhasDeFora(r));
  if(!fora.length) return;
  const cab=["Empresa","Cód. empresa","Competência","Rubrica","Nome","Código","Valor"];
  const emp = ultimoDp.empresaNome||"";
  const comp = competenciaExibicao(ultimoDp.competencia);
  const linhas = fora.map(l=>[emp, ultimoDp.empresa, comp, l.rotulo, l.nome, l.codigo??"", moeda(l.valor)]);
  linhas.push([]);
  linhas.push(["","","","TOTAL","","", moeda(fora.reduce((s,l)=>s+l.valor,0))]);
  const base = nomeArquivoSaida(moduloAtivo, ultimoDp).replace(/\.txt$/,"");
  baixarBytes(paraBytesLatin1(csvDe(cab,linhas)), `Lancar_manualmente_${base}.csv`, "text/csv");
}

function ligarEventosConferencia(mod, r){
  document.querySelectorAll("[data-exc]").forEach(cb=>{
    cb.addEventListener("change",()=>{
      const grupos = resumoPorGrupo(r.linhas);
      const rotulo = grupos[Number(cb.dataset.exc)][0];
      if(cb.checked) r.excluidas.delete(rotulo); else r.excluidas.add(rotulo);
      cb.closest("tr").classList.toggle("rub-fora", !cb.checked);
      document.querySelectorAll(".rec").forEach(el=>{
        const l = r.linhas[Number(el.dataset.rec)];
        if(l) el.classList.toggle("rec-excluida", r.excluidas.has(l.rotulo));
      });
      renderBlocoFora(r);
      atualizarTotais();
    });
  });
  renderBlocoFora(r);

  document.querySelectorAll(".rec-toggle").forEach(b=>{
    b.addEventListener("click",()=>{
      const i=Number(b.dataset.idx);
      if(recordsAbertos.has(i)) recordsAbertos.delete(i); else recordsAbertos.add(i);
      const aberto=b.closest(".rec").classList.toggle("open");
      b.setAttribute("aria-expanded",aberto?"true":"false");
    });
  });

  document.querySelectorAll(".rec").forEach(rec=>{
    const marcar=f=>rec.querySelectorAll("[data-f]").forEach(el=>
      el.classList.toggle("hl", f!==null && el.dataset.f===f));
    rec.addEventListener("mouseover",e=>{
      const alvo=e.target.closest && e.target.closest("[data-f]");
      if(alvo) marcar(alvo.dataset.f);
    });
    rec.addEventListener("mouseleave",()=>marcar(null));
  });

  document.querySelectorAll(".rec-valor-input").forEach(inp=>{
    inp.addEventListener("click",e=>e.stopPropagation());
    inp.addEventListener("blur",()=>editarValor(Number(inp.dataset.idx), inp.value, inp));
    inp.addEventListener("keydown",e=>{
      if(e.key==="Enter"){ e.preventDefault(); inp.blur(); }
      if(e.key==="Escape"){ inp.value=moeda(ultimoResultado.linhas[Number(inp.dataset.idx)].valor); inp.blur(); }
    });
  });

  const filtro=document.getElementById("recFiltro");
  if(!filtro) return;
  const saida=document.getElementById("saida");
  const cont=document.getElementById("recFiltroCount");
  const recs=[...saida.querySelectorAll(".rec")];
  const grupos=[...saida.querySelectorAll(".rec-grupo-head")];
  const idxDe=rc=>Number(rc.dataset.rec);
  const nomeDe=rc=>rc.dataset.nome||"";
  const grupoDe=rc=>rc.dataset.grupo||"";
  let agrupado=true;

  const aplicarFiltro=()=>{
    const q=chave(filtro.value);
    let vis=0, somaVis=0;
    recs.forEach(rc=>{
      const mostrar=!q||rc.dataset.busca.includes(q);
      rc.style.display=mostrar?"":"none";
      if(mostrar){ vis++; somaVis+=r.linhas[idxDe(rc)].valor; }
    });
    grupos.forEach(g=>{
      if(!agrupado){ g.style.display="none"; return; }
      const k=g.dataset.grupo;
      const temVis=recs.some(rc=>grupoDe(rc)===k && rc.style.display!=="none");
      g.style.display=temVis?"":"none";
    });
    cont.textContent = q ? `${vis} de ${recs.length} · R$ ${moeda(somaVis)}` : "";
  };
  filtro.addEventListener("input",aplicarFiltro);

  const sort=document.getElementById("recSort");
  sort.addEventListener("change",()=>{
    const modo=sort.value;
    agrupado=(modo==="orig");
    saida.classList.toggle("desagrupado", !agrupado);
    const arr=[...recs];
    if(modo==="nome")       arr.sort((a,b)=>nomeDe(a).localeCompare(nomeDe(b))||idxDe(a)-idxDe(b));
    else if(modo==="maior") arr.sort((a,b)=>r.linhas[idxDe(b)].valor-r.linhas[idxDe(a)].valor);
    else if(modo==="menor") arr.sort((a,b)=>r.linhas[idxDe(a)].valor-r.linhas[idxDe(b)].valor);
    else                    arr.sort((a,b)=>idxDe(a)-idxDe(b));

    if(agrupado){
      let prev=null;
      arr.forEach(rc=>{
        const k=grupoDe(rc);
        if(k!==prev){ const g=grupos.find(x=>x.dataset.grupo===k); if(g) saida.appendChild(g); prev=k; }
        saida.appendChild(rc);
      });
    }else{
      grupos.forEach(g=>saida.appendChild(g));
      arr.forEach(rc=>saida.appendChild(rc));
    }
    aplicarFiltro();
  });

  document.getElementById("recExpandir").addEventListener("click",()=>{
    recs.forEach(rc=>{ if(rc.style.display==="none") return;
      rc.classList.add("open");
      rc.querySelector(".rec-toggle").setAttribute("aria-expanded","true");
      recordsAbertos.add(idxDe(rc)); });
  });
  document.getElementById("recRecolher").addEventListener("click",()=>{
    recs.forEach(rc=>{ rc.classList.remove("open");
      rc.querySelector(".rec-toggle").setAttribute("aria-expanded","false"); });
    recordsAbertos.clear();
  });
}

/* edição de valor sem redesenhar a tela inteira */
function editarValor(idx, textoDigitado, input){
  const l = ultimoResultado.linhas[idx];
  const campos = l.campos || ultimoMod.campos;
  const campoValor = campos.find(c=>c.principal) || campos.find(c=>/valor/i.test(c.nome));
  const antes = l.valor;

  try{
    const novoValor = paraNumero(textoDigitado);
    const novoTrecho = centavos(novoValor, campoValor.tam);
    if(Math.round(novoValor*100) !== Math.round(antes*100)) l.editado = true;
    l.texto = l.texto.slice(0, campoValor.ini-1) + novoTrecho + l.texto.slice(campoValor.ini-1+campoValor.tam);
    l.valor = novoValor;
    if(input) input.classList.remove("invalido");
  }catch(e){
    if(input){
      input.value = moeda(antes);
      input.classList.add("invalido");
      setTimeout(()=>input.classList.remove("invalido"), 1600);
    }
    flash("err", "Valor não aplicado", `${l.nome}: ${e.message}`);
    return;
  }

  if(input) input.value = moeda(l.valor);
  atualizarCartao(idx);
  atualizarTotais();
}

function atualizarCartao(idx){
  const l = ultimoResultado.linhas[idx];
  const campos = l.campos || ultimoMod.campos;
  const rec = document.querySelector(`.rec[data-rec="${idx}"]`);
  if(!rec) return;
  const fitas = rec.querySelectorAll(".fita-reg span");
  const celulas = rec.querySelectorAll("tbody td.val");
  campos.forEach((c,ci)=>{
    const trecho = l.texto.substr(c.ini-1,c.tam);
    if(fitas[ci]) fitas[ci].textContent = trecho;
    if(celulas[ci]) celulas[ci].textContent = trecho;
  });
  const chip = rec.querySelector(".chip-editado");
  if(chip) chip.hidden = !l.editado;
}

function atualizarTotais(){
  const linhas = linhasDoArquivo(ultimoResultado);
  const lanc = soLancamentos(linhas);
  const total = lanc.reduce((s,l)=>s+l.valor,0);
  const alvo = document.getElementById("totalValores");
  if(alvo) alvo.textContent = "R$ "+moeda(total);
  const alvoN = document.getElementById("totalRegistros");
  if(alvoN) alvoN.textContent = lanc.length;
  const ed = ultimoResultado.linhas.filter(l=>l.editado).length;
  const alvoEd = document.getElementById("totalEditados");
  if(alvoEd) alvoEd.textContent = ed;

  txtGerado = linhas.map(l=>l.texto).join("\r\n")+"\r\n";
  const bt = document.getElementById("btnBaixar");
  if(bt) bt.disabled = !linhas.length;

  const st = document.getElementById("status");
  if(st){
    const tam=[...new Set(ultimoResultado.linhas.map(l=>l.texto.length))];
    st.textContent = `${lanc.length} registro${lanc.length===1?"":"s"} · `+
      (tam.length===1 ? `${tam[0]} caracteres por linha` : `${tam.join(" ou ")} caracteres por linha`);
  }

  if(ultimoResultado.reconciliacao){
    ultimoResultado.reconciliacao = reconciliar(ultimoDp, linhas);
    const rec = ultimoResultado.reconciliacao;
    const painel = document.querySelector(".recon");
    if(painel && rec.esperado!==null){
      painel.className = "recon "+(rec.confere?"recon-ok":"recon-dif");
      painel.innerHTML = rec.confere
        ? `<span class="recon-tag">Confere</span><span class="recon-txt">A soma bate com o total esperado de <b>R$ ${moeda(rec.esperado)}</b>.</span>`
        : `<span class="recon-tag">Diferença</span><span class="recon-txt">Esperado <b>R$ ${moeda(rec.esperado)}</b>, gerado <b>R$ ${moeda(rec.soma)}</b> — ${rec.diferenca>0?"R$ "+moeda(rec.diferenca)+" a mais":"R$ "+moeda(Math.abs(rec.diferenca))+" a menos"}.</span>`;
    }
  }
}

function flash(cls, titulo, texto){
  const el=document.createElement("div");
  el.className="toast toast-"+cls;
  el.innerHTML=`<strong>${escapar(titulo)}</strong><span>${escapar(texto)}</span>`;
  document.body.appendChild(el);
  setTimeout(()=>{ el.classList.add("saindo"); setTimeout(()=>el.remove(),300); }, 3600);
}

/* ##################### gravação ##################### */
function baixarBytes(bytes, nome, tipo){
  const url=URL.createObjectURL(new Blob([bytes],{type:tipo||"application/octet-stream"}));
  const a=document.createElement("a");
  a.href=url; a.download=nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}

function baixar(){
  if(modoLote) return baixarLote();
  if(!txtGerado) return;
  baixarBytes(paraBytesLatin1(txtGerado), nomeArquivoSaida(moduloAtivo, ultimoDp), "text/plain");
}

function baixarLote(){
  const arquivos=(ultimoLoteResultados||[]).filter(r=>r.ok)
    .map(r=>({nome:r.nomeArq, bytes:paraBytesLatin1(r.txt)}));
  if(!arquivos.length) return;
  arquivos.push({nome:"conferencia_lote.csv", bytes:paraBytesLatin1(csvLote())});
  baixarBytes(construirZip(arquivos),
    (moduloAtivo==="rpa"?"RPA":"Lancamentos")+"_lote.zip", "application/zip");
}

/* ##################### relatório de conferência ##################### */
function csvConferencia(dp, resultado, origem){
  const cab=["Arquivo de origem","Empresa","Cód. empresa","Competência","Nome",
             "Código","Detalhe","Identificador","Linha da planilha","Valor","Editado","No arquivo","Registro gravado"];
  const comp=competenciaExibicao(dp.competencia);
  const emp=dp.empresaNome||"";
  const exc=resultado.excluidas||new Set();
  const fora1=l=>exc.has(l.rotulo)||(l.vinculadoA&&exc.has(l.vinculadoA));
  const linhas=resultado.linhas.map(l=>[
    origem||"", emp, dp.empresa, comp, l.nome, l.codigo??"", l.detalhe||"", l.rotulo,
    l.linhaPlanilha??"", l.complementar?"":moeda(l.valor), l.editado?"sim":"",
    fora1(l)?"não":"sim", l.texto,
  ]);
  const incluidas=linhasDoArquivo(resultado);
  const soma=soLancamentos(incluidas).reduce((s,l)=>s+l.valor,0);
  linhas.push([]);
  linhas.push(["","","","","TOTAL NO ARQUIVO","","","",soLancamentos(incluidas).length, moeda(soma),"","",""]);
  const fora=linhasDeFora(resultado);
  if(fora.length)
    linhas.push(["","","","","FORA DO ARQUIVO","","","",soLancamentos(fora).length,
                 moeda(soLancamentos(fora).reduce((s,l)=>s+l.valor,0)),"","lançar à mão",""]);
  if(resultado.reconciliacao && resultado.reconciliacao.esperado!==null){
    const rc=resultado.reconciliacao;
    linhas.push(["","","","","TOTAL ESPERADO","","","","", moeda(rc.esperado),"",""]);
    linhas.push(["","","","","DIFERENÇA","","","","", moeda(rc.diferenca), rc.confere?"confere":"conferir",""]);
  }
  return csvDe(cab, linhas);
}

function csvLote(){
  const cab=["Arquivo de origem","Empresa","Cód. empresa","Competência","Nome",
             "Código","Detalhe","Identificador","Linha da planilha","Valor","Editado","Registro gravado"];
  const linhas=[];
  let somaGeral=0;
  (ultimoLoteResultados||[]).filter(r=>r.ok).forEach(r=>{
    const comp=competenciaExibicao(r.dp.competencia);
    r.resultado.linhas.forEach(l=>{
      somaGeral+=l.valor;
      linhas.push([r.nome, r.dp.empresaNome||"", r.dp.empresa, comp, l.nome, l.codigo??"",
                   l.detalhe||"", l.rotulo, l.linhaPlanilha??"", moeda(l.valor), l.editado?"sim":"", l.texto]);
    });
  });
  const qtd = linhas.length;
  linhas.push([]);
  linhas.push(["","","","","TOTAL DO LOTE","","","", qtd, moeda(somaGeral),"",""]);
  return csvDe(cab, linhas);
}

function baixarRelatorio(){
  if(modoLote){
    if(!ultimoLoteResultados) return;
    baixarBytes(paraBytesLatin1(csvLote()),
      `Conferencia_${moduloAtivo==="rpa"?"RPA":"Lancamentos"}_lote.csv`, "text/csv");
  }else{
    if(!ultimoResultado||!ultimoDp) return;
    const base=nomeArquivoSaida(moduloAtivo, ultimoDp).replace(/\.txt$/,"");
    baixarBytes(paraBytesLatin1(csvConferencia(ultimoDp, ultimoResultado, "")),
      `Conferencia_${base}.csv`, "text/csv");
  }
  const b=document.getElementById("btnRelatorio");
  const t=b.textContent; b.textContent="Relatório baixado ✓";
  setTimeout(()=>{b.textContent=t;},1600);
}

/* ##################### troca de módulo ##################### */
function renderLeiaute(campos){
  const alvo=document.getElementById("leiaute");
  if(!alvo) return;
  const tam=campos.reduce((s,c)=>Math.max(s,c.ini+c.tam-1),0);
  alvo.innerHTML = campos.map(c=>
    `<span class="fita-seg" style="--n:${c.tam}" title="${escapar(c.nome)} — posição ${c.ini} a ${c.ini+c.tam-1}">`+
    `<i>${c.ini}</i><u>${escapar(c.curto||c.nome)}</u></span>`).join("");
  document.getElementById("leiauteTam").textContent = `${tam} caracteres por linha`;
}

function trocarModulo(nome){
  moduloAtivo=nome;
  try{ localStorage.setItem("dominio_modulo", nome); }catch(e){}
  const mod=MODULOS[nome];
  if(document.body) document.body.className = "m-"+nome;
  renderLeiaute(mod.campos);
  document.getElementById("tituloTela").textContent = mod.rotulo;
  document.getElementById("leiauteResumo").innerHTML = (nome==="rpa"
    ? "Registro Sefip 13, 148 caracteres."
    : "Registro <em>10</em>, 48 caracteres, mais os complementares <em>20</em>/<em>25</em> "+
      "(plano de saúde), <em>30</em> (pensão) e <em>40</em> (serviço).")+
    " Gravado em Latin-1 com CRLF, como o Domínio espera.";
  document.getElementById("dropTitulo").textContent=mod.dropTitulo;
  document.getElementById("dropHint").innerHTML=mod.dropHint;
  document.getElementById("btnModelo").textContent=`Baixar modelo de ${mod.rotulo}`;
  /* a configuração de plano de saúde só faz sentido no modelo de Lançamentos */
  /* limparPlanilha() saiu daqui de propósito: quem decide descartar é irParaModulo,
     depois de confirmar com o usuário. Trocar de módulo não pode apagar em silêncio. */
}

/* ##################### navegação entre telas ##################### */
function mostrarTela(nome){
  const inicio = nome==="inicio";
  document.getElementById("telaInicio").hidden = !inicio;
  document.getElementById("telaGerar").hidden  = inicio;
  document.getElementById("btnVoltar").hidden  = inicio;
  /* o selo de offline é apresentação: só na tela inicial */
  document.querySelector(".offline").hidden = !inicio;
  if(inicio) document.getElementById("tituloTela").innerHTML =
    'Gerador de importação <em>Domínio</em>';
  else document.getElementById("tituloTela").textContent = MODULOS[moduloAtivo].rotulo;
  window.scrollTo(0,0);
}

/* há trabalho em andamento que seria perdido? */
const temTrabalho = () => !!(dadosDePara || ultimoResultado || (arquivosLote && arquivosLote.length));

function irParaModulo(nome){
  if(nome===moduloAtivo){ mostrarTela("gerar"); return; }
  const trocar = () => { limparPlanilha(); trocarModulo(nome); mostrarTela("gerar"); };
  if(temTrabalho())
    confirmarDescarte(`Você tem trabalho em andamento em ${MODULOS[moduloAtivo].rotulo}. `+
      `Ir para ${MODULOS[nome].rotulo} descarta a planilha carregada e a conferência na tela.`,
      trocar);
  else trocar();
}

const voltarAoInicio = () => mostrarTela("inicio");

/* O balão de ajuda nasce ancorado à esquerda do chip. Ancorar à direita não basta:
   com o chip no meio da tela ele passa a vazar pelo outro lado. Então o certo é
   prender dentro da viewport, medindo na hora de abrir. */
function ajustarAjuda(e){
  const alvo = e.target;
  const rot = alvo && alvo.closest ? alvo.closest(".rot-ajuda") : null;
  if(!rot) return;
  const pop = rot.querySelector(".ajuda-pop");
  if(!pop) return;

  pop.classList.remove("ajuda-pop-dir");
  pop.style.right = "auto";
  pop.style.left = "0px";

  /* se ainda estiver fechado, mede escondido para não piscar na tela */
  const fechado = pop.offsetWidth === 0;
  if(fechado){ pop.style.visibility = "hidden"; pop.style.display = "block"; }
  const larg = pop.offsetWidth;
  const caixa = rot.getBoundingClientRect();
  const margem = 10;

  /* clientWidth, não innerWidth: se o balão já tiver alargado o documento uma vez,
     innerWidth vem inflado e a conta erra para o mesmo lado de novo */
  const largura = document.documentElement.clientWidth;
  let left = 0;
  if(caixa.left + larg > largura - margem)
    left = largura - margem - larg - caixa.left;
  if(caixa.left + left < margem)
    left = margem - caixa.left;
  pop.style.left = Math.round(left) + "px";

  if(fechado){ pop.style.display = ""; pop.style.visibility = ""; }
}

let aoConfirmarDescarte = null;
function confirmarDescarte(msg, aoConfirmar){
  aoConfirmarDescarte = aoConfirmar;
  document.getElementById("cfMsg").textContent = msg;
  document.getElementById("modalConfirmar").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(()=>document.getElementById("cfCancelar").focus(), 60);
}
function fecharConfirmar(){
  document.getElementById("modalConfirmar").hidden = true;
  document.body.style.overflow = "";
  aoConfirmarDescarte = null;
}
function confirmarSim(){
  const fn = aoConfirmarDescarte;
  fecharConfirmar();
  if(fn) fn();
}

function atualizarBotaoGerar(){
  document.getElementById("btnGerar").disabled = modoLote ? arquivosLote.length===0 : !dadosDePara;
  document.getElementById("btnBaixar").textContent = modoLote ? "Baixar tudo (.zip)" : "Baixar .txt";
  const c=document.getElementById("btnCopiar");
  if(c){ c.disabled = modoLote || !txtGerado; c.hidden = modoLote; }
}

function mostrarLimpar(v){
  const b=document.getElementById("btnLimpar");
  if(b) b.hidden=!v;
}

function limparPlanilha(){
  dadosDePara=null; txtGerado=null; ultimoDp=null;
  modoLote=false; arquivosLote=[]; ultimoLoteResultados=null;
  ultimoResultado=null; recordsAbertos=new Set(); geradoEm=null;
  document.getElementById("fileDePara").textContent="";
  document.getElementById("dropDePara").classList.remove("ok");
  document.getElementById("avisos").innerHTML="";
  document.getElementById("saida").innerHTML="";
  document.getElementById("status").textContent="";
  document.getElementById("btnGerar").disabled=true;
  document.getElementById("btnBaixar").disabled=true;
  const br=document.getElementById("btnRelatorio"); if(br) br.disabled=true;
  const bv=document.getElementById("btnVoltarLote"); if(bv) bv.hidden=true;
  const inp=document.getElementById("inDePara"); if(inp) inp.value="";
  mostrarLimpar(false);
  atualizarBotaoGerar();
}

function copiarTexto(){
  if(modoLote||!txtGerado) return;
  const b=document.getElementById("btnCopiar");
  const done=ok=>{ b.textContent=ok?"Copiado ✓":"Copiar falhou"; setTimeout(()=>{b.textContent="Copiar texto";},1600); };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(txtGerado).then(()=>done(true),()=>done(false));
  }else{
    try{
      const ta=document.createElement("textarea"); ta.value=txtGerado;
      ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove(); done(true);
    }catch(e){ done(false); }
  }
}

/* ##################### wiring ##################### */
(function(){
  const drop=document.getElementById("dropDePara"),
        input=document.getElementById("inDePara"),
        alvo=document.getElementById("fileDePara");
  const abrir=()=>input.click();
  let dragDepth=0;
  const overlay=document.getElementById("dragOverlay");
  drop.addEventListener("click",abrir);
  drop.addEventListener("keydown",e=>{
    if(e.key==="Enter"||e.key===" "){e.preventDefault();abrir();}});
  ["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{
    e.preventDefault();drop.classList.add("over");}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{
    e.preventDefault();drop.classList.remove("over");}));
  drop.addEventListener("drop",e=>{
    e.stopPropagation();
    dragDepth=0; if(overlay) overlay.hidden=true;
    if(e.dataTransfer.files.length) processar(e.dataTransfer.files);});
  input.addEventListener("change",e=>{
    if(e.target.files.length) processar(e.target.files);});

  function processar(fileList){
    const todos=[...fileList];
    const docs=todos.filter(f=>/\.(pdf|txt)$/i.test(f.name));
    const arquivos=todos.filter(f=>/\.(xlsx|xlsm|xls)$/i.test(f.name));
    /* dois ou mais PDFs de uma vez só fazem sentido como conferência mês a mês —
       antes disso o segundo arquivo era descartado sem avisar */
    if(!arquivos.length && docs.length>1 && docs.every(f=>/\.pdf$/i.test(f.name))){
      lerParaComparar(docs); return;
    }
    if(!arquivos.length && docs.length){ lerContracheque(docs[0]); return; }
    if(!arquivos.length){
      erro("solte uma planilha .xlsx ou um contracheque .pdf — foi outro tipo de arquivo que chegou aqui");
      return;
    }
    document.getElementById("btnVoltarLote").hidden=true;
    if(arquivos.length===1){
      modoLote=false;
      processarUnico(arquivos[0]);
      return;
    }
    modoLote=true;
    arquivosLote=[];
    dadosDePara=null;
    document.getElementById("status").textContent=`lendo ${arquivos.length} planilhas…`;
    let pendentes=arquivos.length;
    const ordem=new Map(arquivos.map((f,i)=>[f.name,i]));
    arquivos.forEach(file=>{
      const r=new FileReader();
      r.onload=ev=>{
        try{
          const wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array",cellDates:true});
          arquivosLote.push({nome:file.name, wb});
        }catch(err){
          arquivosLote.push({nome:file.name, wb:null, erroLeitura:err.message});
        }
        pendentes--;
        if(pendentes===0){
          arquivosLote.sort((a,b)=>ordem.get(a.nome)-ordem.get(b.nome));
          alvo.textContent = `${arquivosLote.length} planilhas · `+arquivosLote.map(a=>a.nome).join(", ");
          drop.classList.add("ok");
          mostrarLimpar(true);
          atualizarBotaoGerar();
          gerar();
        }
      };
      r.onerror=()=>{ pendentes--; };
      r.readAsArrayBuffer(file);
    });
  }

  function processarUnico(file){
    document.getElementById("status").textContent="lendo a planilha…";
    const r=new FileReader();
    r.onload=ev=>{
      try{
        dadosDePara=XLSX.read(new Uint8Array(ev.target.result),{type:"array",cellDates:true});
        alvo.textContent=file.name;
        drop.classList.add("ok");
        mostrarLimpar(true);
        atualizarBotaoGerar();
        gerar();
      }catch(err){ erro(`não consegui ler "${file.name}": ${err.message}`); }
    };
    r.readAsArrayBuffer(file);
  }

  document.getElementById("btnGerar").addEventListener("click",gerar);
  document.getElementById("btnBaixar").addEventListener("click",baixar);
  document.getElementById("btnCopiar").addEventListener("click",copiarTexto);
  document.getElementById("btnLimpar").addEventListener("click",limparPlanilha);
  document.getElementById("btnModelo").addEventListener("click",pedirModelo);
  document.getElementById("btnRelatorio").addEventListener("click",baixarRelatorio);
  document.getElementById("btnVoltarLote").addEventListener("click",voltarAoLote);
  document.getElementById("blocoRpa").addEventListener("click",()=>irParaModulo("rpa"));
  document.getElementById("blocoLanc").addEventListener("click",()=>irParaModulo("lancamentos"));
  document.getElementById("btnVoltar").addEventListener("click",voltarAoInicio);
  document.addEventListener("mouseover", ajustarAjuda, true);
  document.addEventListener("focusin",   ajustarAjuda, true);
  document.getElementById("cfFechar").addEventListener("click",fecharConfirmar);
  document.getElementById("cfCancelar").addEventListener("click",fecharConfirmar);
  document.getElementById("cfOk").addEventListener("click",confirmarSim);
  document.getElementById("modalConfirmar").addEventListener("mousedown",e=>{
    if(e.target.id==="modalConfirmar") fecharConfirmar();
  });

  /* ---- contracheque ---- */
  const cardContra=document.getElementById("cardContra"),
        inContra=document.getElementById("inContra");
  cardContra.addEventListener("click",()=>inContra.click());
  cardContra.addEventListener("keydown",e=>{
    if(e.key==="Enter"||e.key===" "){ e.preventDefault(); inContra.click(); }});
  inContra.addEventListener("change",e=>{
    if(e.target.files.length) lerContracheque(e.target.files[0]);
    e.target.value="";
  });
  ["dragenter","dragover"].forEach(ev=>cardContra.addEventListener(ev,e=>{
    e.preventDefault(); cardContra.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev=>cardContra.addEventListener(ev,e=>{
    e.preventDefault(); cardContra.classList.remove("over"); }));
  cardContra.addEventListener("drop",e=>{
    e.stopPropagation(); dragDepth=0; if(overlay) overlay.hidden=true;
    const f=[...e.dataTransfer.files].find(x=>/\.(pdf|txt)$/i.test(x.name));
    if(f) lerContracheque(f);
    else erro("o leitor de contracheque aceita .pdf ou .txt");
  });
  document.getElementById("btnColar").addEventListener("click",lerContrachequeTexto);
  document.getElementById("mdPlanoCnpj").addEventListener("input",function(){
    mascararCnpj(this); document.getElementById("mdPlanoErro").textContent="";
  });
  document.getElementById("mdPlanoRub").addEventListener("input",()=>{
    document.getElementById("mdPlanoErro").textContent="";
  });
  document.getElementById("mdPlanoFechar").addEventListener("click",fecharModeloPlano);
  document.getElementById("mdPlanoCancelar").addEventListener("click",fecharModeloPlano);
  document.getElementById("mdPlanoGerar").addEventListener("click",confirmarModelo);
  document.querySelectorAll('input[name="mdTemPlano"]').forEach(rb=>
    rb.addEventListener("change",alternarOpcaoPlano));
  document.getElementById("modalModeloPlano").addEventListener("mousedown",e=>{
    if(e.target.id==="modalModeloPlano") fecharModeloPlano();
  });

  /* ---- conferência mês a mês ---- */
  const cardCmp=document.getElementById("cardComparar"),
        inCmp=document.getElementById("inComparar");
  cardCmp.addEventListener("click",()=>inCmp.click());
  inCmp.addEventListener("change",e=>{
    if(e.target.files.length) lerParaComparar([...e.target.files]);
    e.target.value="";
  });
  ["dragenter","dragover"].forEach(ev=>cardCmp.addEventListener(ev,e=>{
    e.preventDefault(); cardCmp.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev=>cardCmp.addEventListener(ev,e=>{
    e.preventDefault(); cardCmp.classList.remove("over"); }));
  cardCmp.addEventListener("drop",e=>{
    e.stopPropagation(); dragDepth=0; if(overlay) overlay.hidden=true;
    const pdfs=[...e.dataTransfer.files].filter(x=>/\.pdf$/i.test(x.name));
    if(pdfs.length) lerParaComparar(pdfs);
    else erro("a conferência mês a mês compara dois PDF de Relação Geral dos Líquidos");
  });
  document.getElementById("cmpFechar").addEventListener("click",fecharComparacao);
  document.getElementById("cmpFechar2").addEventListener("click",fecharComparacao);
  document.getElementById("cmpCsv").addEventListener("click",baixarCsvComparacao);
  document.getElementById("modalComparar").addEventListener("mousedown",e=>{
    if(e.target.id==="modalComparar") fecharComparacao();
  });

  /* ---- menu de parâmetros ---- */
  document.getElementById("cpFechar").addEventListener("click",fecharMenuContracheque);
  document.getElementById("cpCancelar").addEventListener("click",fecharMenuContracheque);
  document.getElementById("cpGerar").addEventListener("click",gerarModeloDoContracheque);
  document.getElementById("cpAdicionar").addEventListener("click",adicionarRubricaManual);
  document.getElementById("cpTrazerValores").addEventListener("change",alternarValoresRpa);
  document.getElementById("cpPlanoSimples").addEventListener("change",alternarPlanoSimples);
  document.getElementById("cpPlanoCnpj").addEventListener("input",function(){
    mascararCnpj(this); document.getElementById("cpPlanoErro").textContent = "";
  });
  document.getElementById("cpTipo").addEventListener("input",nomeDoTipo);
  document.getElementById("cpBuscaRub").addEventListener("input",filtrarRubricas);
  document.getElementById("cpBuscaPes").addEventListener("input",filtrarPessoas);
  document.getElementById("cpData").addEventListener("input",function(){
    dataEditadaAMao = true; mascararData(this); atualizarPrazosModal();
  });
  document.getElementById("cpComp").addEventListener("input",function(){
    mascararCompetencia(this); sugerirDataPagamento(false); atualizarPrazosModal();
  });
  document.getElementById("cpPortalXlsx").addEventListener("click",planilhaPortalEmpregado);
  document.getElementById("cpAcervo").addEventListener("click",gravarNoAcervo);

  /* ---- Portal do Empregado ---- */
  const cardPe=document.getElementById("cardPortal"),
        inPe=document.getElementById("inPortal");
  cardPe.addEventListener("click",()=>inPe.click());
  inPe.addEventListener("change",e=>{
    if(e.target.files.length) lerPortalEmpregado(e.target.files[0]);
    e.target.value="";
  });
  ["dragenter","dragover"].forEach(ev=>cardPe.addEventListener(ev,e=>{
    e.preventDefault(); cardPe.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev=>cardPe.addEventListener(ev,e=>{
    e.preventDefault(); cardPe.classList.remove("over"); }));
  cardPe.addEventListener("drop",e=>{
    e.stopPropagation(); dragDepth=0; if(overlay) overlay.hidden=true;
    const f=[...e.dataTransfer.files].find(x=>/\.(xlsx|xlsm|xls)$/i.test(x.name));
    if(f) lerPortalEmpregado(f);
    else erro("a conferência do Portal do Empregado lê a planilha que o Onvio exporta (.xlsx)");
  });
  document.getElementById("peFechar").addEventListener("click",fecharPortal);
  document.getElementById("peFechar2").addEventListener("click",fecharPortal);
  document.getElementById("peCsv").addEventListener("click",baixarCsvPortal);
  document.getElementById("modalPortal").addEventListener("mousedown",e=>{
    if(e.target.id==="modalPortal") fecharPortal();
  });

  /* ---- prazos, feriados e data meta ---- */
  document.getElementById("blocoAgenda").addEventListener("click",abrirAgenda);
  document.getElementById("agFechar").addEventListener("click",fecharAgenda);
  document.getElementById("agFechar2").addEventListener("click",fecharAgenda);
  document.getElementById("modalAgenda").addEventListener("mousedown",e=>{
    if(e.target.id==="modalAgenda") fecharAgenda();
  });
  document.getElementById("agComp").addEventListener("input",function(){
    mascararCompetencia(this); agRenderPrazos();
  });
  document.getElementById("agDlMes").addEventListener("input",function(){
    mascararCompetencia(this); agRenderDataMeta();
  });
  ["agDlDia","agDlMeta","agDlPost"].forEach(id=>
    document.getElementById(id).addEventListener("input",agRenderDataMeta));
  document.getElementById("agAno").addEventListener("input",agRenderFeriados);
  document.getElementById("agCsv").addEventListener("click",baixarCsvFeriados);
  document.getElementById("cpTipoEditar").addEventListener("click",()=>{
    const ed=document.getElementById("cpTipoEditor");
    ed.hidden=!ed.hidden;
    if(!ed.hidden) document.getElementById("cpTipoTexto").focus();
  });
  document.getElementById("cpTipoSalvar").addEventListener("click",salvarListaDeTipos);
  renderTiposProcesso();
  document.getElementById("cpNovoDesc").addEventListener("keydown",e=>{
    if(e.key==="Enter"){ e.preventDefault(); adicionarRubricaManual(); }});
  document.getElementById("modalContra").addEventListener("mousedown",e=>{
    if(e.target.id==="modalContra") fecharMenuContracheque();
  });
  document.querySelectorAll("[data-todos],[data-nenhum]").forEach(b=>{
    b.addEventListener("click",()=>{
      if(!contraDados) return;
      const marcar=b.hasAttribute("data-todos");
      const qual=b.dataset.todos||b.dataset.nenhum;
      if(qual==="rub"){
        contraDados.rubricas.forEach(r=>{ r.marcada=marcar; if(!marcar) r.planoSaude=false; });
        renderListaRubricas(); renderRubricasPlano();
      }
      else{ listaAtual().forEach(x=>x.marcado=marcar); renderListaPessoas(); }
    });
  });

  document.addEventListener("keydown",e=>{
    if(!document.getElementById("modalConfirmar").hidden){
      if(e.key==="Escape"){ e.preventDefault(); fecharConfirmar(); }
      return;
    }
    if(!document.getElementById("modalModeloPlano").hidden){
      if(e.key==="Escape"){ e.preventDefault(); fecharModeloPlano(); }
      if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){ e.preventDefault(); confirmarModelo(); }
      return;
    }
    if(!document.getElementById("modalAgenda").hidden){
      if(e.key==="Escape"){ e.preventDefault(); fecharAgenda(); }
      return;
    }
    if(!document.getElementById("modalPortal").hidden){
      if(e.key==="Escape"){ e.preventDefault(); fecharPortal(); }
      return;
    }
    if(!document.getElementById("modalComparar").hidden){
      if(e.key==="Escape"){ e.preventDefault(); fecharComparacao(); }
      return;
    }
    const modalAberto = !document.getElementById("modalContra").hidden;
    if(e.key==="Escape" && modalAberto){ e.preventDefault(); fecharMenuContracheque(); return; }
    if(modalAberto){
      if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){ e.preventDefault(); gerarModeloDoContracheque(); }
      return;
    }
    const digitando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    /* sem modal aberto, Esc volta para os blocos */
    if(e.key==="Escape" && !digitando && !document.getElementById("telaGerar").hidden){
      e.preventDefault(); voltarAoInicio(); return;
    }
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){
      const b=document.getElementById("btnGerar");
      if(b&&!b.disabled){ e.preventDefault(); gerar(); }
    }
    if((e.ctrlKey||e.metaKey)&&(e.key==="s"||e.key==="S")){
      const b=document.getElementById("btnBaixar");
      if(b&&!b.disabled){ e.preventDefault(); baixar(); }
    }
    if(!digitando && e.key==="/" && !e.ctrlKey && !e.metaKey){
      const f=document.getElementById("recFiltro");
      if(f){ e.preventDefault(); f.focus(); f.select(); }
    }
  });

  /* o overlay de "solte para gerar" só faz sentido na tela de geração; na inicial
     cada bloco tem o seu próprio alvo, o que evita a dúvida de para qual módulo iria */
  const naTelaGerar = () => !document.getElementById("telaGerar").hidden;

  window.addEventListener("dragenter",e=>{
    if(!naTelaGerar()) return;
    if(!e.dataTransfer||[...e.dataTransfer.types].indexOf("Files")<0) return;
    e.preventDefault(); dragDepth++; if(overlay) overlay.hidden=false;
  });
  window.addEventListener("dragover",e=>{
    if(!overlay||overlay.hidden) return;
    e.preventDefault(); e.dataTransfer.dropEffect="copy";
  });
  window.addEventListener("dragleave",e=>{
    if(!overlay||overlay.hidden) return;
    dragDepth=Math.max(0,dragDepth-1); if(dragDepth===0) overlay.hidden=true;
  });
  window.addEventListener("drop",e=>{
    dragDepth=0; if(overlay) overlay.hidden=true;
    if(!naTelaGerar()) return;
    if(!e.dataTransfer||!e.dataTransfer.files.length) return;
    e.preventDefault(); processar(e.dataTransfer.files);
  });

  let inicial="rpa";
  try{ const s=localStorage.getItem("dominio_modulo"); if(s==="rpa"||s==="lancamentos") inicial=s; }catch(e){}
  trocarModulo(inicial);   /* deixa a tela de geração pré-configurada… */
  limparPlanilha();        /* …e os botões no estado inicial */
  mostrarTela("inicio");   /* mas quem aparece é a tela de blocos */
})();
