/* Configuracao do servidor.
 *
 * Nada de caminho, porta ou endereco fixo no codigo: mudar de maquina tem de
 * ser parar o servico, copiar a pasta e subir do outro lado. Como o servidor
 * nasce numa estacao de trabalho, essa mudanca vai acontecer.
 *
 * A ordem de precedencia e: variavel de ambiente > config.json ao lado do
 * servidor > padrao. O config.json e opcional e nao entra no git.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");

const PADRAO = {
  porta: 8080,
  /* 0.0.0.0 para as outras maquinas do escritorio alcancarem. Nunca exponha
     esta porta para fora da rede local — nao ha defesa desenhada para isso. */
  endereco: "0.0.0.0",
  banco: "dados/acervo.db",
  /* pasta servida ao navegador: em desenvolvimento e src/, com os modulos
     separados; numa instalacao pode apontar para outra copia */
  publico: "src",
  /* sessao expira em horas */
  horasDeSessao: 12,
};

const NUMEROS = new Set(["porta", "horasDeSessao"]);

export function carregarConfig(env = process.env) {
  const arquivo = resolve(RAIZ, "config.json");
  const doArquivo = existsSync(arquivo)
    ? JSON.parse(readFileSync(arquivo, "utf8"))
    : {};

  const config = { ...PADRAO, ...doArquivo };

  for (const chave of Object.keys(PADRAO)) {
    const doAmbiente = env[`ACERVO_${chave.toUpperCase()}`];
    if (doAmbiente !== undefined && doAmbiente !== "") config[chave] = doAmbiente;
    if (NUMEROS.has(chave)) config[chave] = Number(config[chave]);
  }

  /* caminho relativo e sempre relativo a raiz do projeto, nao ao diretorio de
     onde o comando foi disparado — senao subir por atalho do Windows quebra */
  for (const chave of ["banco", "publico"]) {
    if (!isAbsolute(config[chave])) config[chave] = resolve(RAIZ, config[chave]);
  }

  if (!Number.isInteger(config.porta) || config.porta < 1 || config.porta > 65535) {
    throw new Error(`porta invalida: ${config.porta}`);
  }
  return config;
}
