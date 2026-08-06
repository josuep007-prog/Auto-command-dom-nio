# Prompt para o Claude Cowork executar a Fase 0

Cole o bloco abaixo no Claude Cowork **rodando na máquina do escritório** que
seria a hospedeira. Ele foi escrito para um agente que tem acesso ao sistema de
arquivos e ao terminal dessa máquina.

Há um passo que nenhum agente consegue fazer sozinho: alguém precisa ir até
**outro computador** e abrir um endereço no navegador. O prompt para nesse ponto
e pede isso a você.

---

```
Preciso que você execute uma prova de viabilidade nesta máquina Windows. O
objetivo é descobrir se ela pode hospedar um servidor Node acessível pelos
outros computadores do escritório. Não é para deixar nada instalado nem
configurado — é um teste.

REGRAS IMPORTANTES, esta é uma máquina de trabalho corporativa:

- NÃO altere nenhuma configuração do sistema.
- NÃO desative nem reconfigure o Firewall do Windows, nem tente contorná-lo
  por linha de comando (netsh, políticas, etc). Se ele bloquear, isso É o
  resultado do teste — relate, não force.
- NÃO instale nada com privilégio de administrador. Se algo pedir elevação,
  pare e me avise.
- Trabalhe apenas dentro de uma pasta do meu usuário.
- Ao final, me diga exatamente o que apagar para não deixar resíduo.

O QUE FAZER:

1. Verifique se já existe Node.js nesta máquina (`node -v`). Preciso da versão
   22 ou mais nova. Se não existir ou for antiga, baixe a versão PORTÁTIL:
   consulte https://nodejs.org/dist/index.json, escolha a versão LTS mais
   recente que seja 22 ou superior, e baixe o arquivo
   node-vSUA_VERSAO-win-x64.zip de https://nodejs.org/dist/. Descompacte numa
   pasta dentro do meu perfil de usuário. NÃO use o instalador .msi — ele pede
   administrador.

   Se o Windows bloquear a execução do node.exe por política (AppLocker,
   SmartScreen, "este aplicativo foi bloqueado"), pare aqui e me relate: essa
   informação sozinha já decide o projeto.

2. Procure nesta máquina uma pasta do projeto chamado "Auto-command-dom-nio"
   (pode estar em Documentos, Downloads, ou numa pasta de rede). Se encontrar,
   use o arquivo `servidor/teste-viabilidade.mjs` dela.

   Se não encontrar, tente clonar de
   https://github.com/josuep007-prog/auto-command-dom-nio (branch
   claude/oi-g4zkdl). Se não houver git ou acesso, me avise — eu trago o
   arquivo de outro jeito. Não recrie o arquivo por conta própria; quero
   exatamente o que foi testado.

3. Rode o teste, a partir da pasta do projeto:

       CAMINHO\DO\NODE\node.exe servidor\teste-viabilidade.mjs

   Ele não precisa de `npm install`. Deixe rodando em segundo plano e me
   mostre a saída inicial dele — ela diz o nome desta máquina, os endereços de
   rede e se o banco embutido funcionou.

   Se a porta 8080 estiver ocupada, rode com PORTA=8081.

4. Confirme que funciona localmente: acesse http://localhost:8080 (por curl ou
   navegador) e confirme que a página responde.

5. PARE AQUI e me peça para ir até outro computador do escritório e abrir o
   endereço com o nome desta máquina (o teste imprime qual é). Me diga
   exatamente qual endereço devo digitar lá.

6. Depois que eu disser que tentei, leia a saída do servidor. Cada acesso fica
   registrado com o endereço de origem, e a própria página distingue acesso
   local de acesso vindo de outra máquina. Me diga qual dos casos ocorreu:

   (a) houve acesso de outra máquina  -> a Fase 0 PASSOU
   (b) só houve acesso local          -> o Firewall está barrando
   (c) o Node nem rodou               -> política bloqueia executável

   Se aparecer uma janela do Windows perguntando se quer permitir o acesso do
   Node à rede, me avise: se der para aceitar sem senha de administrador, isso
   também é resultado relevante.

7. Encerre o servidor e me diga o que apagar.

NO FINAL, me entregue um resumo com:
- versão do Node e se precisou baixar
- se o banco embutido (node:sqlite) funcionou
- nome da máquina e endereços de rede
- qual dos casos (a), (b) ou (c) ocorreu
- a saída literal do terminal
```

---

## O que fazer com o resultado

Traga o resumo de volta para a sessão do projeto. Cada caso leva a um caminho
diferente, e nenhum deles é fracasso — o objetivo da fase é justamente saber
disso em meia hora, e não depois do servidor pronto:

- **(a) passou** — sigo com a Fase 2: contas de usuário, servidor HTTP e a tela
  de cadastro de empresas.
- **(b) Firewall barra** — decidimos entre pedir liberação à TI (é uma regra de
  entrada para uma porta, na rede privada) ou voltar o plano para nuvem.
- **(c) Node bloqueado** — servidor local está fora, e o caminho é nuvem.
