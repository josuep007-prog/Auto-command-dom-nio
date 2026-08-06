/* Erro de dado informado pelo usuario — distinto de falha do programa.
 *
 * A camada HTTP usa essa diferenca para responder 400 (o usuario corrige) em
 * vez de 500 (o programa quebrou), e a tela usa `campo` para destacar onde
 * corrigir, do mesmo jeito que reprovar() ja faz no menu de parametros.
 */
export class ErroDeDados extends Error {
  constructor(mensagem, campo) {
    super(mensagem);
    this.name = "ErroDeDados";
    this.campo = campo;
  }
}

export const recusar = (mensagem, campo) => {
  throw new ErroDeDados(mensagem, campo);
};
