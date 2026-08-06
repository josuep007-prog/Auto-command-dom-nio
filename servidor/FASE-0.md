# Fase 0 — prova de viabilidade

Antes de escrever o servidor, é preciso saber se ele **pode existir** na máquina
do escritório. São três perguntas que nenhuma suposição resolve, e uma delas
decide o projeto inteiro.

Leva cerca de meia hora. Você não precisa saber programar para fazer.

| # | Pergunta | Se falhar |
| --- | --- | --- |
| 1 | O Node roda sem privilégio de administrador? | tenta-se outra pasta; se a política bloquear mesmo, o caminho é nuvem |
| 2 | O banco embutido funciona? | improvável falhar; se falhar, troca-se a peça |
| 3 | **Outro computador do escritório alcança esta máquina?** | **é a que decide** — sem ela não há cadastro compartilhado |

A pergunta 3 é o motivo desta fase. Se o Firewall barrar e não houver como
liberar, só a sua própria máquina acessaria o acervo — e aí o servidor local não
entrega o que se quer dele. Melhor descobrir agora do que depois do servidor
pronto.

## Passo 1 — baixar o Node em versão portátil

Em <https://nodejs.org/en/download> escolha **Windows / x64** e o formato
**`.zip`** (não o `.msi`, que é instalador e pede administrador). Pegue uma
versão **22 ou mais nova**.

Descompacte numa pasta sua — por exemplo `C:\Users\SEU_USUARIO\node`. Não
precisa de permissão especial para isso.

Abra o **Prompt de Comando** e teste:

```
cd C:\Users\SEU_USUARIO\node
node -v
```

Tem que aparecer algo como `v22.22.0`.

> Se aparecer erro de política ou "este aplicativo foi bloqueado", pare aqui e
> me avise: é o caso em que a empresa bloqueia executável em pasta de usuário, e
> muda o plano.

## Passo 2 — pegar este projeto e rodar o teste

Copie a pasta do projeto para a máquina (pen drive, pasta de rede, o que for
mais fácil). Depois, no mesmo Prompt de Comando:

```
cd CAMINHO\DA\PASTA\DO\PROJETO
C:\Users\SEU_USUARIO\node\node.exe servidor\teste-viabilidade.mjs
```

Não precisa de `npm install`. O teste não usa nenhuma biblioteca externa — de
propósito, porque o servidor de verdade também não vai usar.

Você deve ver algo assim:

```
  Node v22.22.0 em win32 x64
  maquina: PC-JOSUE

  [ok]   banco embutido (node:sqlite) grava e le nesta maquina
  [ok]   a pasta atual aceita escrita
  [ok]   escutando na porta 8080

  Abra no navegador DESTA maquina:
      http://localhost:8080

  E agora o teste que decide — abra DE OUTRO COMPUTADOR do escritorio:
      http://PC-JOSUE:8080
      http://192.168.0.50:8080     (Ethernet)
```

**Deixe essa janela aberta.** Fechá-la desliga o servidor.

## Passo 3 — o teste que decide

Primeiro, no navegador **desta** máquina, abra `http://localhost:8080`. Deve
aparecer uma página dizendo que chegou. Isso prova que o servidor subiu.

Agora o que importa: vá até **outro computador do escritório** e abra ali o
endereço com o nome da máquina, por exemplo `http://PC-JOSUE:8080`.

- **Se a página abrir:** pronto, a Fase 0 passou. A própria página avisa que
  houve acesso de outra máquina, e o terminal registra de onde veio.
- **Se não abrir:** tente também pelo número (`http://192.168.0.50:8080`). Se o
  nome falhar e o número funcionar, é só resolução de nome — contornável. Se os
  dois falharem, é o Firewall.

O Windows pode mostrar uma janela perguntando se quer permitir o acesso. Se ela
aparecer e você conseguir aceitar, ótimo — é o que precisa. Se pedir senha de
administrador, anote isso: é a informação que decide.

## Como me contar o resultado

Copie o que apareceu no terminal e me diga qual dos casos ocorreu:

1. **Tudo funcionou**, inclusive de outra máquina → sigo para a Fase 2 e escrevo
   o servidor.
2. **Funcionou só na própria máquina** → o Firewall barra. Aí decidimos entre
   pedir liberação à TI ou voltar para nuvem.
3. **O Node nem rodou** → a política bloqueia executável em pasta de usuário, e o
   servidor local está fora.

Nenhum dos três é fracasso. O objetivo da fase é justamente descobrir isso em
meia hora, e não depois de semanas de trabalho.

## Para encerrar

No terminal, `Ctrl+C`. O teste não deixa nada instalado nem configurado — só o
`node.exe` que você descompactou, que pode apagar se quiser.
