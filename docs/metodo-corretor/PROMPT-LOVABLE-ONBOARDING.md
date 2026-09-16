# Prompt para o Lovable — Onboarding do corretor no primeiro acesso

**Como usar:** cole no Lovable. É uma feature nova, majoritariamente frontend + uma RPC
de leitura. Não mexe em dado de cliente.

⚠️ Continua valendo: **um passo por vez**, rollback escrito, **pare se algo não bater**.

---

Preciso de um **onboarding no primeiro acesso do corretor**: uma trilha que mostra o que
cada tela faz, ensina a rotina do dia, apresenta os números reais de conversão da casa e
termina com o corretor sabendo exatamente quanto precisa fazer por dia para 1 venda por
semana.

## O que já existe e deve ser reaproveitado

| Peça | Onde | Como usar |
| --- | --- | --- |
| `profiles.onboarding_concluido_em` | já existe | **é o campo que o onboarding grava.** Hoje é um checkbox que o gestor marca à mão em `tab-corretores.tsx` |
| Diálogo global bloqueante | `MetasDiaGlobal`, montado em `src/routes/_authenticated/route.tsx:126` | **mesmo padrão e mesmo lugar.** Monte o onboarding **antes** dele |
| `popupBloqueante`, `Dialog` shadcn | `src/features/metas-dia/metas-dia-dialog.tsx` | copie a mecânica |
| `fila_funil_v1` | RPC (você acabou de recriar) | alimenta os números do funil no passo 4 |
| `metas_dia_taxas` + `taxasConversao()` | `src/features/metas-dia/metas-dia.ts` | alimenta a meta pessoal no passo 5. **Já cai na taxa do time quando o corretor tem menos de 20 contatos** — é exatamente o caso do corretor novo |
| `contatosNecessarios()` | mesmo arquivo | o cálculo reverso já está pronto |

**Não reimplemente nenhuma dessas contas.** Elas existem, são testadas, e duplicá-las
seria a divergência garantida.

---

## As 5 decisões de desenho — siga-as

**1. Não é tour de tooltips.** O CRM tem ~60 rotas. Coachmark em cada tela é algo que
ninguém termina. São **6 passos**, numa trilha só, no máximo 8 minutos.

**2. Os números vêm do banco, ao vivo.** Nada de número escrito no código. Se a conversão
da casa mudar, o onboarding muda junto. Um número hardcoded vira mentira em duas semanas.

**3. Termina FAZENDO, não lendo.** O último passo não é um botão "Concluir": é o corretor
**registrar um desfecho de verdade** na fila dele. Só então grava `onboarding_concluido_em`.

**4. É reabrível.** Entra no menu como "Como usar o CRM". Quem esquece precisa poder voltar
sem pedir para ninguém.

**5. Só para o papel `corretor`.** Gestão, admin e SDR não veem.

---

## A trilha, passo a passo — use esta copy

Escreva exatamente este conteúdo. A copy foi calibrada com os dados medidos; não
reescreva os números nem "melhore" o texto.

### Passo 1 — Como este CRM funciona

> **Você não escolhe o cliente. A fila escolhe.**
>
> Num CRM comum você abre uma lista e decide quem chamar. Aqui o sistema decide — e
> decide melhor, porque sabe quantos dias cada cliente está parado, em que etapa está,
> quanto dinheiro está em jogo e quem prometeu voltar quando.
>
> Seu trabalho não é escolher. É **executar e registrar**.
>
> **A regra que sustenta tudo — as três portas.** Você só sai da ficha de um cliente por:
> **(a)** desfecho registrado, com próximo passo e data;
> **(b)** agendamento criado — mudar o status não é agendar;
> **(c)** perdido, com um dos 11 motivos.
> **Não existe a porta (d) "fechei a tela".**

### Passo 2 — As 5 telas que importam

O CRM tem dezenas de telas. Você vai viver em cinco.

| Tela | Responde | Quando |
| --- | --- | --- |
| **Fila Única** | "o que eu faço agora?" | é a sua casa. O dia inteiro |
| **Follow-Up** | "quem eu combinei de retomar?" | a régua dos 13 toques |
| **Agenda** | "quais visitas eu tenho?" | de manhã e ao fechar o dia |
| **Ficha do cliente** | "quem é essa pessoa?" | antes de ligar |
| **Projetos em Foco** | "o que eu vendo?" | primeira semana, e sempre que entrar produto novo |

> **As outras telas existem e são úteis** — Reserva, Bolsão, Discador, Modo Visita. Você
> chega nelas quando a fila do dia acabar. **Nunca antes.**

**Requisito:** cada linha da tabela é clicável e abre a tela numa aba nova, para o
corretor ver de verdade sem perder o onboarding.

### Passo 3 — Seu dia

| Horário | Bloco | O quê |
| --- | --- | --- |
| 08:50 | Abrir | Presença → metas do dia → ler o placar da fila |
| 09:00 | O dinheiro na mesa | Fundo do funil parado → chegaram agora → cliente respondeu |
| 10:30 | A régua | Follow-up vencido ou de hoje → sem próximo passo |
| 13:30 | Agendar | Esfriando → pasta travada → **oferecer visita em toda conversa** |
| 15:30 | Anti-ociosidade | Reserva → Modo Foco → Discador → Bolsão |
| 17:30 | Fechar | Os dois zeros: vencidos = 0, sem próximo passo = 0 |

> **A única interrupção permitida:** lead novo com SLA correndo. São **15 minutos úteis**,
> e dois estouros no mesmo dia pausam você no lead quente até amanhã.

### Passo 4 — Os números da casa (AO VIVO, de `fila_funil_v1`)

Mostre as **8 passagens do funil**, cada uma com a taxa atual e a meta da casa, no mesmo
formato do painel da Fila Única. Abaixo, este texto:

> **Sete das oito passagens da SMQ estão na meta ou acima** — primeiro contato,
> qualificação, comparecimento, pasta, fechamento. A casa **fecha bem**: de cada 100
> pessoas que visitam, 45 compram.
>
> **Uma única passagem trava: transformar conversa em visita.**
>
> É por isso que a frase abaixo vale mais que todo o resto do treinamento:
>
> *"Separei duas opções que cabem na sua renda. Você prefere conhecer **sábado de manhã
> ou sábado à tarde**?"*
>
> Duas opções de horário. Nunca "quer visitar?".

**Requisito:** se `fila_funil_v1` falhar, o passo mostra "sem dado no momento" e deixa
avançar. **Nunca invente número de fallback.**

### Passo 5 — Sua meta (AO VIVO, de `metas_dia_taxas`)

Chame `taxasConversao()` e `contatosNecessarios()`. Para corretor novo a função já usa a
taxa do time — mostre isso com todas as letras: *"calculado pela conversão do time, porque
você ainda não tem histórico. Em 4 semanas passa a ser a sua."*

Apresente a cascata, com os números que as funções devolverem:

```
1 VENDA POR SEMANA
      ↑
   análises de crédito
      ↑
   visitas realizadas
      ↑
   agendamentos          ← a sua meta diária vive aqui
      ↑
   conversas
      ↑
   leads trabalhados
```

E, embaixo, a tabela de **onde vem a venda** (estes números são medidos e podem ficar
fixos neste passo, com a data; são de safra de 6 meses, não mudam toda semana):

| Origem do lead | 1 venda a cada |
| --- | ---: |
| **Lead que você mesmo capta** | **6 leads** |
| Indicação / carteira própria | 3 leads |
| Facebook | 413 leads |
| Base importada | 6.550 leads |

> **É a mesma casa, o mesmo produto e o mesmo CRM. Muda só a origem.**
>
> Por isso a meta que decide a sua semana não é quantos leads você tocou. É **quantos
> clientes você trouxe**: indicação, ex-cliente, porta, parceria, sua rede.
> **Dois por dia útil = 1 venda por semana.**

### Passo 6 — Faça agora

> **Abra a Fila Única e registre o desfecho do primeiro card.**
>
> Não escolha. Não pule. Pegue o de cima, ligue ou mande mensagem, e clique em
> **Registrar**. São 3 a 5 respostas prontas, e tem desfazer de 5 segundos.
>
> É o gesto que você vai repetir 20 vezes por dia, todo dia. Faça uma vez agora e o
> onboarding está concluído.

**Requisito:** botão leva para `/fila`. O onboarding fica **pendente** até existir pelo
menos **1 interação registrada pelo corretor** — aí grava `onboarding_concluido_em` e
mostra a confirmação. Detecte isso quando ele voltar ao app, não com polling.

---

## Mecânica

| Item | Como |
| --- | --- |
| **Quando abre** | Primeiro acesso de quem tem papel `corretor` e `onboarding_concluido_em IS NULL` |
| **Onde monta** | `src/routes/_authenticated/route.tsx`, junto do `MetasDiaGlobal`, **antes** dele — não faz sentido pedir meta do dia para quem não sabe o que é a fila |
| **Bloqueante?** | **Não.** Dá para fechar e voltar depois. Um corretor que precisa atender um lead quente às 9h não pode ficar preso num tutorial. Fechado, reabre no próximo acesso até concluir |
| **Progresso** | Guarde o passo atual em `localStorage` (é conveniência por dispositivo). A **conclusão** vai no banco, não no `localStorage` |
| **Reabrir** | Item "Como usar o CRM" no menu, disponível sempre |
| **Gestor** | Em `tab-corretores.tsx`, onde hoje o checkbox é manual, mostre também **como** foi concluído: pelo onboarding ou marcado à mão |

## ⚠️ Antes de ligar: uma checagem obrigatória

`onboarding_concluido_em` é **condição de elegibilidade da roleta** na política de
distribuição v2. Hoje isso não morde porque `modelo_v2_ativo = false`. Mas quero saber o
tamanho antes:

```sql
SELECT count(*) FILTER (WHERE onboarding_concluido_em IS NOT NULL) AS concluido,
       count(*) FILTER (WHERE onboarding_concluido_em IS NULL)     AS pendente
  FROM public.profiles WHERE ativo = true;
```

**Me mostre esse número.** Se a maioria estiver `NULL`, o dia em que a v2 for ligada
esses corretores param de receber lead — e eu preciso decidir isso conscientemente, não
descobrir depois.

**Não altere `onboarding_concluido_em` de ninguém em massa.** Quem já tem, mantém.

---

## Testes

- A trilha não abre para gestor, admin nem SDR.
- Não abre para quem já tem `onboarding_concluido_em`.
- Falha de `fila_funil_v1` ou `metas_dia_taxas` → o passo diz "sem dado" e deixa avançar.
- Passo 6 não conclui sem interação registrada.
- Reabrir pelo menu funciona depois de concluído.
- Funciona em 390px — o corretor vai fazer isso no celular.

## O que me entregar

O que mudou arquivo por arquivo, a contagem da checagem obrigatória, como reverter em um
comando, e **o que você decidiu que eu não pedi**.

**Não invente número em lugar nenhum.** Se o dado não vier, o passo diz que não veio.
Um onboarding que ensina um número errado é pior que nenhum onboarding.
