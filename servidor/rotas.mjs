/* As rotas da API e a montagem do tratador de requisicoes.
 *
 * `criarApp` devolve um tratador puro, sem escutar porta nenhuma — e o que
 * permite testar as rotas sem subir rede.
 */
import { criarRoteador, lerCookies, lerCorpoJson, responderJson, responderErro,
         servirArquivo, cabecalhosDeSeguranca } from "./http.mjs";
import { COOKIE, entrar, sair, usuarioDaSessao } from "./autenticacao.mjs";
import { historico } from "./auditoria.mjs";
import { recusar } from "./erros.mjs";
import * as empresas from "./repositorio/empresas.mjs";
import * as usuarios from "./repositorio/usuarios.mjs";
import * as acervo from "./repositorio/acervo.mjs";

const origemDe = (req) =>
  (req.socket.remoteAddress || "?").replace(/^::ffff:/, "");

export function criarApp(db, config) {
  const r = criarRoteador();

  /* ---- estado do servidor, sem sessao: e o que a tela consulta para saber se
     o acervo esta no ar e se ainda falta criar a primeira conta ---- */
  r.get("/api/saude", (ctx) => {
    responderJson(ctx.res, 200, {
      acervo: "no ar",
      precisaConfigurar: usuarios.contar(db) === 0,
      usuario: ctx.usuario ? { nome: ctx.usuario.nome, papel: ctx.usuario.papel } : null,
    });
  });

  /* ---- sessao ---- */
  r.post("/api/sessao", async (ctx) => {
    const corpo = await lerCorpoJson(ctx.req);
    const { sessao, usuario } = entrar(db, {
      login: corpo.login, senha: corpo.senha,
      origem: origemDe(ctx.req), horasDeSessao: config.horasDeSessao,
    });
    responderJson(ctx.res, 200, { usuario }, {
      /* httpOnly: o JavaScript da pagina nao le o cookie, entao script injetado
         nao rouba a sessao. SameSite=Strict corta requisicao vinda de outro site.
         Sem Secure: em rede local o acesso e http, e Secure impediria o envio. */
      "set-cookie": `${COOKIE}=${sessao.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.horasDeSessao * 3600}`,
    });
  });

  r.delete("/api/sessao", (ctx) => {
    if (ctx.sessaoId) sair(db, ctx.sessaoId);
    responderJson(ctx.res, 200, { ok: true }, {
      "set-cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
    });
  });

  /* ---- contas ---- */
  r.post("/api/usuarios", async (ctx) => {
    const primeira = usuarios.contar(db) === 0;
    /* A primeira conta pode ser criada sem sessao — nao haveria como entrar de
       outro jeito. A partir da segunda, so administrador. A janela fecha
       sozinha no instante em que a primeira conta existe. */
    if (!primeira && ctx.usuario?.papel !== "administrador")
      recusar("so administrador cria conta");
    const corpo = await lerCorpoJson(ctx.req);
    const criado = usuarios.criar(db,
      { ...corpo, papel: primeira ? "administrador" : (corpo.papel || "operador") },
      { usuarioId: ctx.usuario?.id ?? null });
    responderJson(ctx.res, 201, criado);
  });

  r.get("/api/usuarios", (ctx) => {
    exigirAdministrador(ctx);
    responderJson(ctx.res, 200, usuarios.listar(db));
  });

  /* ---- empresas ---- */
  r.get("/api/empresas", (ctx) => {
    exigirSessao(ctx);
    const u = new URL(ctx.req.url, "http://local");
    responderJson(ctx.res, 200, empresas.listar(db, {
      busca: u.searchParams.get("busca") || "",
      incluirInativas: u.searchParams.get("inativas") === "1",
    }));
  });

  /* O gancho principal: o CNPJ que o parser tirou do PDF identifica a empresa */
  r.get("/api/empresas/cnpj/:cnpj", (ctx) => {
    exigirSessao(ctx);
    const achada = empresas.porCnpj(db, ctx.params.cnpj, { usuarioId: ctx.usuario.id });
    if (!achada) { responderJson(ctx.res, 404, { erro: "empresa nao cadastrada" }); return; }
    responderJson(ctx.res, 200, achada);
  });

  r.get("/api/empresas/:id", (ctx) => {
    exigirSessao(ctx);
    const e = empresas.porId(db, Number(ctx.params.id));
    if (!e) { responderJson(ctx.res, 404, { erro: "empresa nao encontrada" }); return; }
    responderJson(ctx.res, 200, e);
  });

  r.get("/api/empresas/:id/historico", (ctx) => {
    exigirSessao(ctx);
    responderJson(ctx.res, 200, historico(db, "empresa", Number(ctx.params.id)));
  });

  r.post("/api/empresas", async (ctx) => {
    exigirSessao(ctx);
    const corpo = await lerCorpoJson(ctx.req);
    responderJson(ctx.res, 201, empresas.criar(db, corpo, { usuarioId: ctx.usuario.id }));
  });

  r.put("/api/empresas/:id", async (ctx) => {
    exigirSessao(ctx);
    const corpo = await lerCorpoJson(ctx.req);
    responderJson(ctx.res, 200,
      empresas.atualizar(db, Number(ctx.params.id), corpo, { usuarioId: ctx.usuario.id }));
  });

  /* ---- acervo ---- */
  r.post("/api/acervo/importar", async (ctx) => {
    exigirSessao(ctx);
    const corpo = await lerCorpoJson(ctx.req);
    responderJson(ctx.res, 201, acervo.importar(db, corpo, { usuarioId: ctx.usuario.id }));
  });

  r.get("/api/acervo/empresas/:id/competencias", (ctx) => {
    exigirSessao(ctx);
    responderJson(ctx.res, 200, acervo.competenciasDaEmpresa(db, Number(ctx.params.id)));
  });

  r.get("/api/acervo/importacoes/:id", (ctx) => {
    exigirSessao(ctx);
    responderJson(ctx.res, 200, acervo.detalheDaImportacao(db, Number(ctx.params.id)));
  });

  /* ---- o tratador ---- */
  return async function tratar(req, res) {
    for (const [k, v] of Object.entries(cabecalhosDeSeguranca())) res.setHeader(k, v);

    const caminho = new URL(req.url, "http://local").pathname;
    try {
      const sessaoId = lerCookies(req)[COOKIE] || null;
      const usuario = usuarioDaSessao(db, sessaoId);
      const alvo = r.achar(req.method, caminho);

      if (alvo) {
        await alvo.executar({ req, res, params: alvo.params, usuario, sessaoId });
        return;
      }
      if (caminho.startsWith("/api/")) {
        responderJson(res, 404, { erro: "rota nao encontrada" });
        return;
      }
      if (req.method === "GET" && servirArquivo(res, config.publico, caminho)) return;

      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("nao encontrado");
    } catch (e) {
      responderErro(res, e);
    }
  };
}

function exigirSessao(ctx) {
  if (!ctx.usuario) {
    const e = new Error("e preciso entrar");
    e.name = "ErroDeDados";
    e.status = 401;
    throw e;
  }
}

function exigirAdministrador(ctx) {
  exigirSessao(ctx);
  if (ctx.usuario.papel !== "administrador") {
    const e = new Error("acao restrita a administrador");
    e.name = "ErroDeDados";
    e.status = 403;
    throw e;
  }
}
