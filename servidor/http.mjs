/* Roteador pequeno sobre node:http, e o servico de arquivos estaticos.
 *
 * Nao ha framework aqui de proposito: sao pouco mais de dez rotas, e o servidor
 * precisa rodar sem `npm install` numa maquina onde nao se pode instalar nada.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { ErroDeDados } from "./erros.mjs";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/* Corpo de requisicao tem teto: sem isso, um cliente pode ocupar a memoria do
   servidor mandando um JSON infinito. */
const LIMITE_CORPO = 8 * 1024 * 1024;

export function lerCookies(req) {
  const bruto = req.headers.cookie || "";
  const saida = {};
  for (const parte of bruto.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0) saida[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return saida;
}

export function lerCorpoJson(req) {
  return new Promise((ok, falhar) => {
    let total = 0;
    const partes = [];
    req.on("data", (p) => {
      total += p.length;
      if (total > LIMITE_CORPO) {
        falhar(new ErroDeDados("corpo da requisicao grande demais"));
        req.destroy();
        return;
      }
      partes.push(p);
    });
    req.on("end", () => {
      const texto = Buffer.concat(partes).toString("utf8");
      if (!texto.trim()) return ok({});
      try { ok(JSON.parse(texto)); }
      catch { falhar(new ErroDeDados("corpo nao e JSON valido")); }
    });
    req.on("error", falhar);
  });
}

export function responderJson(res, status, corpo, cabecalhos = {}) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(texto),
    ...cabecalhos,
  });
  res.end(texto);
}

/* ---- roteador ---- */

export function criarRoteador() {
  const rotas = [];

  const registrar = (metodo, padrao, executar) => {
    /* :nome vira parametro; o resto e literal */
    const nomes = [];
    const regexp = new RegExp("^" + padrao.replace(/:[A-Za-z_]\w*/g, (m) => {
      nomes.push(m.slice(1));
      return "([^/]+)";
    }) + "$");
    rotas.push({ metodo, regexp, nomes, executar });
  };

  return {
    get: (p, f) => registrar("GET", p, f),
    post: (p, f) => registrar("POST", p, f),
    put: (p, f) => registrar("PUT", p, f),
    delete: (p, f) => registrar("DELETE", p, f),

    achar(metodo, caminho) {
      for (const r of rotas) {
        if (r.metodo !== metodo) continue;
        const m = caminho.match(r.regexp);
        if (!m) continue;
        const params = {};
        r.nomes.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
        return { executar: r.executar, params };
      }
      return null;
    },
  };
}

/* ---- arquivos estaticos ---- */

export function servirArquivo(res, raiz, caminhoPedido) {
  /* Trava de travessia: normaliza e confere que o resultado continua dentro da
     raiz. Sem isto, /../../ leria qualquer arquivo da maquina. */
  const limpo = normalize(decodeURIComponent(caminhoPedido)).replace(/^(\.\.[/\\])+/, "");
  const alvo = resolve(join(raiz, limpo === "/" || limpo === sep ? "index.html" : limpo));
  if (alvo !== resolve(raiz) && !alvo.startsWith(resolve(raiz) + sep)) {
    res.writeHead(403).end("fora do diretorio servido");
    return true;
  }
  if (!existsSync(alvo) || !statSync(alvo).isFile()) return false;

  res.writeHead(200, {
    "content-type": TIPOS[extname(alvo).toLowerCase()] || "application/octet-stream",
    /* o programa muda com frequencia durante o desenvolvimento; cache agressivo
       faria o escritorio rodar versao velha sem perceber */
    "cache-control": "no-cache",
  });
  createReadStream(alvo).pipe(res);
  return true;
}

/* ---- cabecalhos de seguranca ---- */

export function cabecalhosDeSeguranca() {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "x-frame-options": "DENY",
  };
}

/* ---- tratamento de erro ---- */

export function responderErro(res, e) {
  if (e instanceof ErroDeDados || e.name === "ErroDeDados") {
    responderJson(res, e.status || 400, { erro: e.message, campo: e.campo ?? null });
    return;
  }
  /* falha do programa nao vaza detalhe para o cliente, mas aparece no log de
     quem cuida do servidor */
  console.error("  [erro]", e);
  responderJson(res, 500, { erro: "erro interno do servidor" });
}
