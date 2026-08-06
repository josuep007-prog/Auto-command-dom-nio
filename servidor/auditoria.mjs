/* Registro de quem fez o que.
 *
 * Cobre LEITURA, nao so escrita: o acervo guarda folha de varios clientes, e
 * "quem consultou a folha de qual empresa" e parte do controle de acesso, nao
 * um extra. Por isso `leu` e uma acao de primeira classe aqui.
 *
 * O par antes/depois guarda o estado, nao a intencao: quando um codigo de
 * empresa sair errado e o .txt for importado torto no Dominio, o que responde
 * "o que mudou, quando e por quem" e esta tabela.
 */
import { agora } from "./banco.mjs";

const ACOES = new Set(["leu", "criou", "alterou", "removeu", "importou", "entrou", "saiu"]);

export function registrar(db, { usuarioId = null, acao, entidade, entidadeId = null,
                                antes = null, depois = null }) {
  if (!ACOES.has(acao)) throw new Error(`acao de auditoria desconhecida: ${acao}`);
  db.prepare(`INSERT INTO auditoria
      (quando, usuario_id, acao, entidade, entidade_id, antes, depois)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(agora(), usuarioId, acao, entidade, entidadeId,
         antes === null ? null : JSON.stringify(antes),
         depois === null ? null : JSON.stringify(depois));
}

/** Historico de uma entidade, do mais recente para o mais antigo. */
export function historico(db, entidade, entidadeId, limite = 50) {
  return db.prepare(`SELECT a.*, u.nome AS usuario_nome
       FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id
      WHERE a.entidade = ? AND a.entidade_id = ?
      ORDER BY a.id DESC LIMIT ?`)
    .all(entidade, entidadeId, limite)
    .map((l) => ({ ...l,
      antes: l.antes ? JSON.parse(l.antes) : null,
      depois: l.depois ? JSON.parse(l.depois) : null }));
}
