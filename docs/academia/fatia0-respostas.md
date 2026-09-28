# Academia SMQ · Fatia 0 · Respostas às decisões

**Data e hora (Brasília):** 2026-09-28 14:33 -03
**Branch:** `claude/admiring-cerf-l8ndy9`
**Como foi coletado:** perguntas de múltipla escolha respondidas pelo Guilherme nesta sessão, em 3 rodadas.

## Decisão já tomada (fora das rodadas)

**Sheldon Barbosa: somente gestor. Não é aluno da Academia.**

## Rodada 1

### 1. [Apto] O CRM já tem um "Apto" que trava a roleta v2 (`onboarding_concluido_em`). Como fica o "Apto" da Academia?

**Escolhido: Nome diferente na Academia (Recomendado).**
Coexistem; o nível da Academia ganha outro nome (ex.: Habilitado) para não confundir com o Apto da roleta.

### 2. [Gestor vê] Na Academia, o gestor vê:

**Escolhido: Só a própria equipe (Recomendado).**
Igual ao resto do CRM; admin e superintendente veem tudo.

### 3. [Alunos] Além dos corretores, quem pode ser aluno?

**Escolhido: todos os papéis — corretor, SDR, superintendente e gestor.**

Observação sobre como esta resposta foi obtida: na primeira passada foram marcadas as quatro opções ao mesmo tempo, incluindo "Só corretores", que é excludente das demais. A pergunta foi refeita como escolha única e a resposta final foi "Todos: corretor, SDR, super, gestor".

Exceção que continua valendo: Sheldon Barbosa é gestor e **não** é aluno da Academia. Ou seja, ser gestor habilita a ser aluno, mas não obriga — a Academia precisa suportar exceção individual.

### 4. [Parado] Lead "parado" no indicador de carteira parada:

**Escolhido: 7 dias no topo, 30 no fundo (Recomendado).**
Régua da Carteira Ativa, a mesma da devolução.

## Rodada 2

### 5. [1º contato] Tempo até o primeiro contato:

**Escolhido: Úteis, sem contato conta como pior (Recomendado).**
Minutos úteis 08:00 a 19:00 (régua do SLA); lead nunca contatado entra como o pior tempo, senão quem não liga fica com mediana boa.

### 6. [Pós-visita] Depois da visita, "avançou" significa:

**Escolhido: Análise ou pasta (Recomendado).**
Chegou a análise de crédito, montou pasta ou tem análise registrada. (`proposta_enviada` é status legado, no mesmo degrau da visita.)

### 7. [Perda] Quais motivos contam como "perda por perfil/renda"?

**Escolhidos (3 de 4):**

- Renda — `credito_renda`, `estourou_teto`
- Sem perfil — `sem_perfil`
- Score/negativado — `credito_score`

**Não escolhido:** Já tem imóvel (`ja_possui_imovel`) — fica fora de "perda por perfil/renda".

### 8. [Pasta dev.] A devolução de pasta (pendência do correspondente ou da Caixa) é registrada em algum lugar?

**Escolhido: Sim, fora do CRM.**

Texto livre do Guilherme, na íntegra:

> Anexamos a aprovação no sistema, reprovação ainda não temos onde fazer o registro.

Leitura para a implementação: hoje só a **aprovação** tem registro (anexo no sistema). A **reprovação / devolução de pasta não tem onde ser registrada**. Ou seja, na prática a regra de devolução de pasta não tem fonte de dados utilizável nesta fatia — tratar como desativada até existir o registro da reprovação.

## Rodada 3

### 9. [Mediana] A mediana do time usada na comparação é:

**Escolhido: Empresa, sem o próprio (Recomendado).**
Todos com amostra mínima, exceto o avaliado.

### 10. [Onboarding] O onboarding de 6 passos ("Como usar o CRM") e o Manual do CRM:

**Escolhido: Ficam separados (Recomendado).**
A Academia só linka para eles por enquanto.

### 11. [Card aula] Onde vai o card "Sua próxima aula" (atrás de flag)?

**Escolhido: `/inicio` (Recomendado).**
Onde o corretor cai depois do login.

### 12. [Rotas] O CRM não tem `/admin`. O painel de gestão da Academia fica em:

**Escolhido: `/academia/gestao` (Recomendado).**
E `/academia/conteudo` só para admin.

## Fatia 1 · decisões

**Data e hora (Brasília):** 2026-09-28 15:05 -03

### 1. [Permissão] Modelo de acesso da Academia

**Escolhido: Gestor lê a equipe, escrita por função (Recomendado).**
Gestor só lê a própria equipe, pela regra da casa (`pode_acessar_corretor`); toda escrita passa por RPC que confere permissão; conteúdo, gabarito, regras e config só admin.

Como isso virou código: `academia_eh_gestor` foi removida e no lugar entraram `academia_eh_admin()` e `academia_pode_gerir(_pessoa)`. A segunda tem o "nunca sou eu mesmo" embutido — é o que impede o gestor-aluno de aprovar a própria prática, fazer override do próprio nível ou se atribuir módulo. Nenhuma tabela `academia_*` tem policy de INSERT, UPDATE ou DELETE para as tabelas pessoais.

### 2. [Nomes] Nível da Academia e fase 0

**Escolhido: "Habilitado" e "Integração" (Recomendado).**
Não colidem com o Apto da roleta (`onboarding_concluido_em`) nem com a tela de onboarding de 6 passos.

Alcance do rename: o valor `apto` do enum `academia_nivel` virou `habilitado` **na mesma posição** (há comparações com `>` e `>=`), a coluna `apto_override` virou `habilitado_override`, a função `academia_definir_apto` virou `academia_definir_habilitado`, a coluna `apto` da view virou `habilitado`. A fase 0 passou a se chamar "Integração", e a palavra `onboarding` saiu do CHECK de `academia_encontros.tipo` e de `academia_atribuicoes.origem`, virando `integracao` nos dois. O título do módulo O01 acompanhou ("Integração: pronto para atender").

### 3. [Fora do escopo] Ana Caroline, contas de teste e docs-bot

**Escolhido: Tarefa separada, não mexer agora (Recomendado).**
Ana Caroline Pereira bloqueada com 402 leads vivos e 12 participações ativas em roleta; cinco contas de teste com e-mail descartável e `status_conta = 'ativa'`; `docs-bot` com papel `gestor`. Nada foi tocado nesta fatia. Segue registrado na seção 4 de `fatia0-fechamento.md` e pede prompt próprio.

## Fatia 2 · decisões

**Data e hora (Brasília):** 2026-09-28 17:15 -03

### 1. [Menu] Onde a Academia entra na navegação

**Escolhido: módulo próprio "Academia" (Recomendado).**
Card no `/inicio`, item na lateral e entrada na busca (Cmd+K), reaproveitando a cor de "Docs & Projetos" (`cor: "projetos"`), porque a paleta é fechada em 10 tons por decisão de design.

Como isso virou código: `Sistema` ganhou o campo opcional `flag?: string` e `PapelCtx` ganhou `flagsLigadas?: Set<string>`. Sistema com flag só aparece se a chave estiver no conjunto, e o conjunto só recebe `academia_menu` se a flag estiver ligada E a pessoa for participante ativa (ou admin, para pré-visualizar). A Academia vive em `SISTEMA_ACADEMIA`, fora do array `SISTEMAS`, para não quebrar as duas asserções que percorrem o registro inteiro; a navegação consome `SISTEMAS_NAV`. Ver a seção 3 de `fatia2-telas-corretor.md`.

### 2. [Celular] Barra inferior

**Escolhido: não mexer agora (Recomendado).**
A `bottom-nav` ficou idêntica à de hoje. No celular o corretor entra pelo card "Sua próxima aula" no `/inicio` e pelo card do módulo no hub.
