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
