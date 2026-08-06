/* Sobe o app num servidor efemero e devolve um cliente que guarda o cookie de
   sessao — assim os testes exercitam a rota de verdade, com cabecalho e cookie,
   e nao a funcao por baixo dela. */
import { createServer } from "node:http";
import { abrir } from "../banco.mjs";
import { criarApp } from "../rotas.mjs";
import { limparTentativas } from "../autenticacao.mjs";

export async function subirApp(config = {}) {
  limparTentativas();                       // um teste nao herda bloqueio do outro
  const db = abrir(":memory:");
  const conf = { horasDeSessao: 12, publico: "src", ...config };
  const servidor = createServer(criarApp(db, conf));
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  let cookie = null;
  async function pedir(metodo, caminho, corpo) {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: {
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const texto = await r.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo nao-JSON */ }
    return { status: r.status, corpo: json, texto, cabecalhos: r.headers };
  }

  return {
    db, base,
    get: (c) => pedir("GET", c),
    post: (c, b) => pedir("POST", c, b ?? {}),
    put: (c, b) => pedir("PUT", c, b ?? {}),
    delete: (c) => pedir("DELETE", c),
    esquecerCookie: () => { cookie = null; },
    async criarAdministrador(dados = {}) {
      const r = await pedir("POST", "/api/usuarios",
        { login: "chefe", nome: "Chefe", senha: "senha-bem-longa", ...dados });
      await pedir("POST", "/api/sessao",
        { login: dados.login ?? "chefe", senha: dados.senha ?? "senha-bem-longa" });
      return r.corpo;
    },
    fechar: () => new Promise((ok) => servidor.close(() => { db.close(); ok(); })),
  };
}

/* CNPJs com digito verificador correto */
export const ACME = "11222333000181";
export const OUTRA = "44556677000186";
