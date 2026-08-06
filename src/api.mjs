/* Cliente do acervo.
 *
 * A regra desta camada inteira: NENHUMA falha de rede sobe para a tela. Todo
 * caminho de erro devolve null (ou uma lista vazia), e quem chama trata isso
 * como "nao ha cadastro" — que e exatamente o comportamento de antes do
 * servidor existir.
 *
 * E isso que produz o modo degradado de graca. A maquina hospedeira e uma
 * estacao de trabalho: ela dorme, reinicia e sai da tomada no meio do
 * expediente. Quando isso acontecer num dia 15, o programa tem de continuar
 * gerando o .txt com digitacao manual, sem uma mensagem de erro sequer.
 */

const TEMPO_LIMITE = 4000;

let disponivel = null;      /* null = ainda nao sabemos */
let usuario = null;

export const acervoDisponivel = () => disponivel === true;
export const usuarioAtual = () => usuario;

async function pedir(metodo, caminho, corpo) {
  /* Espera curta de proposito: se o servidor nao respondeu em 4 segundos, a
     pessoa esta esperando a tela, e a tela tem de seguir sem ele. */
  const cancelar = AbortSignal.timeout(TEMPO_LIMITE);
  try {
    const r = await fetch(caminho, {
      method: metodo,
      headers: corpo === undefined ? {} : { "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: "same-origin",
      signal: cancelar,
    });
    disponivel = true;
    const texto = await r.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta nao-JSON */ }
    return { ok: r.ok, status: r.status, dados };
  } catch {
    /* rede fora, servidor fora, DNS, timeout — tudo cai aqui e vira "sem acervo" */
    disponivel = false;
    return { ok: false, status: 0, dados: null };
  }
}

/** Sonda o servidor. Chamada na partida; nunca lanca. */
export async function sondar() {
  const r = await pedir("GET", "/api/saude");
  if (!r.ok) { usuario = null; return null; }
  usuario = r.dados?.usuario ?? null;
  return r.dados;
}

export async function entrar(login, senha) {
  const r = await pedir("POST", "/api/sessao", { login, senha });
  if (r.ok) { usuario = r.dados.usuario; return { ok: true, usuario }; }
  return { ok: false, erro: r.dados?.erro || "nao consegui falar com o acervo" };
}

export async function sair() {
  await pedir("DELETE", "/api/sessao");
  usuario = null;
}

export async function criarPrimeiraConta(dados) {
  const r = await pedir("POST", "/api/usuarios", dados);
  return r.ok ? { ok: true, usuario: r.dados }
              : { ok: false, erro: r.dados?.erro || "nao consegui criar a conta",
                  campo: r.dados?.campo };
}

/** O gancho: devolve a empresa pelo CNPJ lido do PDF, ou null. */
export async function empresaPorCnpj(cnpj) {
  const digitos = String(cnpj || "").replace(/\D/g, "");
  if (digitos.length !== 14) return null;
  const r = await pedir("GET", `/api/empresas/cnpj/${digitos}`);
  return r.ok ? r.dados : null;
}

export async function listarEmpresas(busca = "") {
  const r = await pedir("GET", `/api/empresas?busca=${encodeURIComponent(busca)}`);
  return r.ok && Array.isArray(r.dados) ? r.dados : [];
}

export async function salvarEmpresa(dados) {
  const r = dados.id
    ? await pedir("PUT", `/api/empresas/${dados.id}`, dados)
    : await pedir("POST", "/api/empresas", dados);
  return r.ok ? { ok: true, empresa: r.dados }
              : { ok: false, erro: r.dados?.erro || "nao consegui gravar no acervo",
                  campo: r.dados?.campo };
}

export async function historicoDaEmpresa(id) {
  const r = await pedir("GET", `/api/empresas/${id}/historico`);
  return r.ok && Array.isArray(r.dados) ? r.dados : [];
}

export async function importarParaAcervo(dados) {
  const r = await pedir("POST", "/api/acervo/importar", dados);
  return r.ok ? { ok: true, ...r.dados }
              : { ok: false, erro: r.dados?.erro || "nao consegui gravar no acervo",
                  campo: r.dados?.campo };
}

/** Identifica o arquivo lido sem guardar o arquivo: e o hash que evita
 *  reimportar o mesmo PDF e torna a carga do historico retomavel. */
export async function hashDoArquivo(buffer) {
  const bytes = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
