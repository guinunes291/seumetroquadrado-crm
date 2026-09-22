# Carteira ativa — quem entra, o que acontece com o resto

> **Teto: 65 desde 13/09/2026** (era 40 quando este documento foi escrito). O
> raciocínio das seções abaixo continua valendo; o que mudou está no §10. O
> nome do arquivo fica como está para não quebrar os links já citados no
> código e nos commits.

Desenho da **Fatia 3** da Fila Única: o teto de 40 deixa de ser visual e vira
regra. Este documento responde três perguntas do dono (13/09/2026):

1. Quem devem ser os 40 leads de um corretor?
2. Como tratar todo o resto da base?
3. Como tratar quem está em fase avançada e sendo trabalhado?

Tudo abaixo está ancorado em medição no banco de produção de **13/09/2026**,
pelas ferramentas do CRM MCP. Onde o número é incerto, está dito.

## 1. O quadro medido

### 1.1 A base inteira (58.153 leads)

| Status                                   |  Leads |     % |
| ---------------------------------------- | -----: | ----: |
| `aguardando_atendimento`                 | 37.715 | 64,9% |
| `aguardando_corretor` (estoque sem dono) |  8.425 | 14,5% |
| `em_atendimento`                         |  8.009 | 13,8% |
| `perdido`                                |  2.457 |  4,2% |
| `aguardando_retorno`                     |    699 |  1,2% |
| `qualificacao_corretor` + `qualificado`  |    476 |  0,8% |
| `analise_credito`                        |    137 |  0,2% |
| `contrato_fechado` + `pos_venda`         |    114 |  0,2% |
| `agendado`+`visita_realizada`+`proposta` |    103 |  0,2% |
| `novo`                                   |     18 |     — |

A soma fecha exata em 58.153. Temperatura: **frio 43.656 (75%)**, morno 9.374,
quente 5.057.

**Dono:** 55.696 leads não-perdidos, dos quais **39.966 (71,8%) não têm
corretor**. Só 15.730 têm dono.

### 1.2 A camada trabalhável (9.424 leads)

Os oito status em que existe trabalho de corretor (`em_atendimento`,
`aguardando_retorno`, `qualificacao_corretor`, `qualificado`, `agendado`,
`visita_realizada`, `proposta_enviada`, `analise_credito`), com dono:

| Corte pelo relógio de movimento  |   Leads |        % |
| -------------------------------- | ------: | -------: |
| Total                            |   9.424 |     100% |
| Parados 7+ dias                  |   8.662 |    91,9% |
| Parados 30+ dias                 |   6.147 |    65,2% |
| **Com movimento nos últimos 7d** | **762** | **8,1%** |

**762 é o número que decide tudo neste documento.** É a casa inteira — 49
corretores ativos — tocando 762 leads em uma semana. Dá **~16 leads por
corretor por semana**.

### 1.3 O fundo do funil da casa inteira: 240 leads

`agendado` + `visita_realizada` + `proposta_enviada` + `analise_credito`,
somando **todos os corretores**: 240.

| Corretor        | No fundo |
| --------------- | -------: |
| graziele gomes  |   **53** |
| Jefferson Luiz  |       39 |
| Leticia Brandão |       23 |
| Leticia Castro  |       17 |
| Andrew          |       13 |
| demais 33       |    1 a 9 |

Média 6,3 · mediana ~4. **O fundo do funil inteiro da SMQ cabe seis vezes
dentro de uma única carteira de 40.**

E está parado: os mais antigos têm 71 a 80 dias sem movimento — JOSIVANA
BASILIO (`analise_credito`, quente, 80 d, Juliana Alonso), Manu Pimentel
(`agendado`, 79 d, Jessica Sobral), Vitor Gouveia (`analise_credito`, 75 d,
graziele).

### 1.4 A concentração

| Corretor        | Carteira nominal | Em status de trabalho | Parados 30+ d |
| --------------- | ---------------: | --------------------: | ------------: |
| graziele gomes  |            1.566 |                 1.029 |           689 |
| Leticia Castro  |            1.521 |                 1.095 |       **933** |
| Jefferson Luiz  |            1.373 |                   909 |           527 |
| Leticia Brandão |            1.149 |                   553 |           305 |
| Leonardo vrena  |            1.127 |                   714 |           425 |

Cinco corretores com mais de mil leads no nome. Leticia Castro tem 85% da
carteira de trabalho parada há mais de 30 dias.

### 1.5 Entrada

2.307 leads novos entre 01/08 e 13/09 (44 dias) = **~52 leads/dia**. Dos 49
corretores ativos, **14 estão com `presente = true`**; 38 têm ao menos um lead
em status de trabalho.

### 1.6 Limites honestos desta medição

- `dias_parado` cai para `updated_at` quando não há interação nem contato. As
  escritas em massa de 02/08 e 17/08 mexeram em `updated_at`, então a coorte
  da importação de julho aparece com 26–41 dias em vez de ~49. **O número real
  de parados é pior que o medido**, nunca melhor.
- `parados 90+ dias` devolve 0 porque a interação mais antiga da camada
  trabalhável é de 17/06 (87 dias). É teto do relógio, não saúde.
- A ferramenta de KPIs devolveu **0** para agendamentos, tarefas e vendas no
  período 01/08–13/09, com 114 `contrato_fechado`/`pos_venda` na base
  histórica. Não use esse zero como linha de base sem antes conferir se é
  ausência de registro ou falha de medição.

## 2. Resposta 1 — quem são os 40

### 2.1 Por que 40, e não 80 ou 200

O teto não sai de opinião: sai da **cadência**. Um lead em processo precisa de
um toque a cada 48 h para não esfriar (é a régua de follow-up da casa).

```
40 leads ÷ cadência de 48 h = 20 toques por dia
20 toques × 12–15 min (ligar + mensagem + registrar) = 4 a 5 horas
```

Quatro a cinco horas é a jornada útil de contato de um corretor. **40 é o
máximo que cabe numa cadência de 48 horas.** Com 60 leads a cadência cai para
72 h e a taxa de resposta cai junto; com 20, o corretor fica ocioso.

Hoje a casa trabalha ~16 leads por corretor por semana. **O teto de 40 não é
uma restrição: é uma meta de expansão de 2,5×.** Ninguém vai perder lead por
causa do teto — vão perder o depósito que fingia ser carteira.

### 2.2 A composição: um teto só, e o fundo enche primeiro

São **40 vagas, no total**. Não existe "40 + o fundo à parte": um número só,
preenchido nesta ordem de precedência.

| Faixa | Quem                                                                                      |                 Vagas hoje |
| ----- | ----------------------------------------------------------------------------------------- | -------------------------: |
| **A** | **Fundo do funil**: `agendado`, `visita_realizada`, `proposta_enviada`, `analise_credito` | o que precisar (mediana 4) |
| **B** | **Conversa viva**: respondeu nos últimos 7 dias, ou follow-up combinado com data          |                     até 14 |
| **C** | **Novos do SLA**: chegaram há ≤72 h e ainda não levaram 3 tentativas                      |                     até 12 |
| **D** | **Resgate escolhido**: o corretor puxa da Reserva quem ele quer trabalhar                 |                      até 8 |

Com a mediana de 4 no fundo, sobram 36 vagas para B+C+D — cabe folgado nos
14+12+8 = 34 acima, com 2 de folga. As vagas de B, C e D são **tetos, não
cotas**: ninguém é obrigado a encher D se B está cheia.

**Por que o fundo tem precedência absoluta:** a passagem `analise_credito` →
venda é a mais saudável do funil (meta da casa 30%, coorte mede 39%) e cada
lead ali vale ~R$ 250 mil de VGV pelo preço de tabela. Um lead em análise
parado há 80 dias vale mais que 200 leads frios novos.

**Por que a faixa D existe:** sem ela, o teto vira gaiola. O corretor que
lembra de um cliente de abril tem de poder buscá-lo. É também o antídoto
contra o incentivo de esconder lead do CRM (ver §5.1).

### 2.3 O caso graziele: a exceção que valida a regra

graziele tem **53 leads só no fundo do funil** — mais que o teto inteiro.
Pela regra: sua carteira já está estourada só com fundo, e ela **não recebe
nenhum lead novo** até baixar disso.

Isso não é punição — é o diagnóstico correto. Ela tem 53 negócios avançados,
vários parados há mais de 70 dias. Mandar lead novo para ela hoje é o bug,
não a regra. A ação é o gestor sentar com ela e desovar o fundo, um a um.

### 2.4 O que NÃO entra nos 40, nunca

- Lead em `aguardando_corretor` ou `aguardando_atendimento` que nunca
  respondeu nada. Isso é estoque, não cliente (§3.1).
- Lead frio de importação. São 75% da base, e a temperatura frio é o padrão
  de quem nunca conversou.
- Lead `perdido` reciclado. Volta pela Reserva, não pela carteira (§3.3).

## 3. Resposta 2 — o resto da base são três populações, não uma

O erro a evitar é tratar 55 mil leads como "a base". São três coisas
diferentes, com donos, réguas e ferramentas diferentes.

### 3.1 Estoque bruto sem dono — 46.140 leads

`aguardando_atendimento` (37.715) + `aguardando_corretor` (8.425). Destes,
12.714 são a importação de 26/07 que nunca foi tocada por ninguém.

**Regra: não é carteira de ninguém e não vai para corretor.** Vai para a
pré-venda — bot, SDR e o reativador de leads — trabalhado em lote com uma
pergunta só: _"ainda quer comprar?"_. Só quem **responde** vira candidato a
uma vaga de faixa B ou D na carteira de alguém.

**Ação imediata e inegociável: estrangular `distribuir-estoque-plantao`.**
Esse job move `aguardando_corretor` → `aguardando_atendimento` a 30 leads a
cada 10 minutos — **4.320 por dia**. Enquanto ele roda, qualquer teto de
carteira é ficção: a esteira reenche o denominador mais rápido do que
qualquer time esvazia. A vazão tem de virar função do consumo ("libera N
quando o time tiver vaga"), não do relógio.

### 3.2 Carteira nominal parada — 6.147 leads

Leads com dono, em status de trabalho, parados há 30+ dias. São 65% da camada
trabalhável.

**Regra: devolver à Reserva.** Não é tirar cliente de corretor — é tirar o
nome do corretor de um cadáver, para que uma régua que funciona possa tentar.
Leticia Castro tem 933 leads assim: a carteira "dela" é um cemitério com a
lápide no nome dela.

Gatilhos de devolução automática (Fatia 3):

| Gatilho                               | Destino                                |
| ------------------------------------- | -------------------------------------- |
| 3 tentativas sem resposta em 7 dias   | Reserva                                |
| 2 dias sem próximo passo definido     | Reserva                                |
| Excedente do teto de 40               | Reserva — o mais frio devolve primeiro |
| 30 dias sem movimento, qualquer etapa | Reserva                                |

**Exceção única: nada do fundo do funil devolve por robô** (§4).

### 3.3 Perdidos — 2.457 leads

Régua de reciclagem própria. O job `sdr-alimentar-perdidos` já recicla 100/dia
— mas hoje devolve `perdido` → `aguardando_atendimento`, ou seja, reenche o
estoque. **Deve devolver para a Reserva de pré-venda**, com marcação de
"reciclado", para não contaminar a medição de leads novos.

### 3.4 A Reserva precisa ser um lugar com nome

Lead fora dos 40 não pode "sumir". A Reserva é uma tela: o corretor vê quem
saiu da carteira dele, busca por nome e telefone, e **puxa de volta para uma
vaga livre da faixa D com um toque**. Sem isso o corretor trata a devolução
como perda e passa a esconder lead do sistema.

## 4. Resposta 3 — fase avançada: blindada, mas com relógio

### 4.1 A blindagem

Lead em `agendado`, `visita_realizada`, `proposta_enviada` ou
`analise_credito`:

- **Nunca** entra na roleta.
- **Nunca** é devolvido por robô — nem por inatividade, nem por excedente.
- **Nunca** é o "excedente" que sai quando a carteira estoura. Se estourou, o
  corretor para de receber; o fundo fica.
- Troca de dono **só por decisão de gestor**, registrada, e com o split de
  comissão escrito **antes** da troca.

Por quê: são 240 leads na casa inteira. É a parte mais barata de proteger e a
mais cara de perder. E a relação corretor↔cliente no fundo do funil é o ativo
que sustenta os 39% de conversão — trocar o dono de um cliente em análise de
crédito destrói exatamente o que faz a etapa converter.

### 4.2 O relógio — proteção vem com obrigação

Blindado não é esquecido. Fase avançada parada é o pior ativo da casa: hoje há
leads quentes em análise de crédito parados há 80 dias. A proteção vem com
uma escada de escalada que **tira "deixar quieto" do cardápio**:

| Sem movimento | O que acontece                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **D+3**       | Topo da Fila Única do corretor, com o dinheiro em jogo no card                                                                             |
| **D+5**       | Entra na linha do gestor (`fila_equipe_v1` já mostra "fundo do funil parado")                                                              |
| **D+10**      | O **gestor é obrigado a dar um desfecho**: cobrar junto, colocar um par em co-atendimento com split definido, ou marcar perdido com motivo |
| **D+15**      | Sobe para a superintendência como pendência nominal                                                                                        |

A escada é do **gestor**, não do robô. O robô mostra e cobra; a decisão de
mexer num negócio avançado é humana e fica registrada.

### 4.3 O co-atendimento é a saída para o corretor afogado

graziele com 53 no fundo não precisa perder clientes — precisa de braço. O
co-atendimento (segundo corretor entra com split escrito) resolve sem quebrar
a relação com o cliente e sem criar a sensação de que o CRM tira lead de quem
trabalha. Sem uma regra de split publicada antes, essa porta não abre: o
corretor prefere segurar e perder.

## 5. Os riscos desta política

### 5.1 🔴 O teto cria incentivo para esconder lead do CRM

É o risco número um de qualquer limite de carteira. Se devolver custa
comissão, o corretor para de registrar e o CRM vira ficção — e aí o teto
piorou a operação em vez de melhorar. Mitigações, todas obrigatórias:

- Fundo do funil isento de devolução automática (§4.1).
- **Comissão segue quem fez o atendimento efetivo**, não quem é dono hoje.
  Regra escrita e publicada antes de ligar o teto.
- Faixa D: o corretor puxa de volta quem ele quiser da Reserva.
- Auditoria: venda registrada sem histórico de interação no CRM vira
  sinalização para o gestor.

### 5.2 🔴 A esteira reenche mais rápido do que o time esvazia

`distribuir-estoque-plantao` a 4.320/dia (§3.1). Ligar o teto sem estrangular
a esteira é enxugar gelo — e o gestor vai olhar o número parado e não
entender por que ele não cai.

### 5.3 🟡 O teto pune quem mais produziu

Quem tem 53 no fundo é quem mais avançou negócio. "Não recebe lead novo"
precisa chegar como ajuda (co-atendimento, mutirão de desova do fundo), não
como bronca. Se chegar como punição, o time aprende a não avançar lead.

### 5.4 🟡 A segurança inteira depende de uma linha de config

`capacidade_leads_ativos_por_corretor` já existe em `gestao_config` (default 40) e é lida por `gestao_performance_corretores_janela`. Um `UPDATE` muda a
regra para toda a casa sem rastro. **O log de execução da devolução tem de
carimbar a config usada** — mesma exigência já feita ao motor de Higiene.

### 5.5 🟡 "40" é um chute calibrado, não uma constante física

A conta de §2.1 sustenta a ordem de grandeza, não o dígito. A régua de revisão
é uma só: _o corretor consegue dar um toque de qualidade em cada lead da
carteira a cada 48 h?_ Se o p50 de tempo entre toques passar de 48 h com a
carteira cheia, o teto está alto. Se a carteira viver com folga e a taxa de
resposta não cair, dá para subir. Medir antes de mexer.

## 6. O que medir ANTES de ligar

```sql
-- Distribuição da carteira ativa por corretor (o "antes" do teto)
SELECT p.nome, count(*) AS carteira_viva,
       count(*) FILTER (WHERE l.status IN ('agendado','visita_realizada',
                                           'proposta_enviada','analise_credito')) AS fundo,
       count(*) FILTER (WHERE COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato),
                                       l.created_at) >= now() - interval '7 days') AS tocados_7d
  FROM public.leads l JOIN public.profiles p ON p.id = l.corretor_id
 WHERE l.deleted_at IS NULL AND l.na_lixeira = false
   AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
 GROUP BY p.nome ORDER BY carteira_viva DESC;

-- Quantos leads a devolução tiraria hoje, por gatilho
SELECT count(*) FILTER (WHERE mov < now() - interval '30 days') AS por_inatividade,
       count(*) FILTER (WHERE proximo_followup IS NULL
                          AND mov < now() - interval '2 days')  AS por_sem_proximo_passo
  FROM (SELECT proximo_followup,
               COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at) AS mov
          FROM public.leads
         WHERE deleted_at IS NULL AND na_lixeira = false AND corretor_id IS NOT NULL
           AND status IN ('em_atendimento','aguardando_retorno','qualificacao_corretor',
                          'qualificado')) s;

-- Vazão da esteira nos dois sentidos (§5.2)
SELECT date_trunc('day', created_at) AS dia, tipo, count(*)
  FROM public.lead_eventos
 WHERE created_at > now() - interval '7 days'
 GROUP BY 1,2 ORDER BY 1 DESC, 3 DESC;
```

## 7. Ordem de implantação sugerida

1. **Estrangular `distribuir-estoque-plantao`** (§3.1). Sem isso, nada
   segura. É uma linha de cron e não precisa de tela.
2. **Publicar a regra de comissão e split** (§5.1). Antes de qualquer teto.
3. **Tela da Reserva** (§3.4), com a faixa D funcionando.
4. **Teto de 40 em modo sombra**: calcula, mostra ao gestor quem estouraria e
   o que devolveria — sem devolver nada. Uma semana.
5. **Ligar a devolução** pelos gatilhos de §3.2, com o fundo isento.
6. **Escada de escalada do fundo** (§4.2) no painel do gestor.

## 8. Onde os 40 moram, e o que acontece com os outros módulos

### 8.1 A página dos 40 já existe: `/fila`

A Fila Única **já é** a página da carteira ativa. O anel do cockpit já diz
"N de 40" (`FilaCockpit`), a Central de Comando já é a porta de todo papel
(decisão de 12/09), `/hoje` já redireciona para lá e a barra do polegar já
tem o slot "Fila". O teto já está desenhado na tela — só é visual.

**A Fatia 3 não cria a página dos 40. Ela torna verdadeiro o número que a
página já mostra.** O que muda em `/fila`:

- O anel passa a ler a tabela de carteira ativa, não a contagem de candidatos
  recebidos.
- O painel "Como a fila se mantém finita" deixa de dizer que a devolução
  automática é a próxima fatia e passa a mostrar as devoluções reais da semana.
- A tabela do gestor (`fila_equipe_v1`) já tem a coluna "carteira ativa contra
  o teto de 40": vira medição, não estimativa.

### 8.2 A única página nova: a Reserva

Lead fora dos 40 não pode sumir (§3.4). **Recomendação: `/reserva` como a
segunda seção da Central de Comando.**

Por que ali e não em outro lugar:

- **Não como aba da Fila Única.** A tese da Fila é "uma lista só, na ordem em
  que o dinheiro está em risco", com desfecho de um toque. A Reserva é busca e
  resgate — outro verbo. Uma aba quebraria a página que acabou de ser
  simplificada.
- **Não como filtro da Base de leads (`/leads`).** A Base é a lista completa
  com filtros: serve para "achar qualquer um". A Reserva responde outra
  pergunta: _"o que saiu de mim, por qual gatilho, e o que eu quero de volta"_.
  É um estado com regra, não um recorte de busca.
- **Sim na Central de Comando.** O módulo tem hoje **uma** seção só e a regra
  dos 2 menus permite até seis. Fila Única e Reserva são o par conceitual
  exato: o que eu trabalho agora / o que está guardado esperando vaga.

Alternativa mais barata, se o custo pesar: aba "Reserva" dentro de `/leads`.
Entrega 80% do valor por 30% do trabalho, mas mistura consulta com estado —
e é a porta para o corretor não achar e concluir que perdeu o cliente.

### 8.3 Módulo a módulo

O teto não adiciona telas: ele **redefine o que as telas existentes têm
direito de mostrar**. Hoje toda tela que diz "meus leads" mostra 1.566 para a
graziele.

| Módulo                                        | O que acontece                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Central de Comando** (`/fila`)              | Vira o dono do teto. Ganha a seção Reserva. De 1 para 2 seções.                                                                                                                                                                                                          |
| **Prospecção** (`/prospeccao`)                | **O mais afetado** — ver §8.4.                                                                                                                                                                                                                                           |
| **Gestão de Carteira** → Base (`/leads`)      | Intacta: é o lugar certo para ver tudo. Ganha filtro "ativa / reserva".                                                                                                                                                                                                  |
| **Gestão de Carteira** → Kanban (`/pipeline`) | Passa a abrir **só a carteira ativa** por padrão. Com 1.095 leads em `em_atendimento`, a coluna é ilegível hoje; com 40 cards o quadro funciona pela primeira vez. Toggle para "tudo".                                                                                   |
| **Gestão de Carteira** → Agenda e Tarefas     | Não mudam. São compromissos, não carteira. Ganham garantia: como o fundo nunca sai por robô, não existe tarefa órfã de lead que deixou de ser seu.                                                                                                                       |
| **Atender** (`/atendimento`)                  | **Candidato a aposentadoria** — ver §8.5.                                                                                                                                                                                                                                |
| **Follow-Up** (`/follow-up`)                  | A régua só roda para a carteira ativa. Muda a semântica de "esgotados 13/13": hoje significa parar, passa a significar **devolver à Reserva**. A "Cobertura do time" fica honesta — hoje mede cobertura sobre uma base impossível.                                       |
| **Modo Visita** (`/modo-visita`)              | Nada. Visita é fundo do funil, sempre blindado.                                                                                                                                                                                                                          |
| **Pré-venda SDR** (`/sdr`)                    | **O que mais cresce** — ver §8.6.                                                                                                                                                                                                                                        |
| **BI** → Higiene do Funil                     | Finalmente mede algo. Hoje são 32.627 parados sobre 55.435 vivos no mesmo balde, e por isso o número nunca cai. Passa a ser duas perguntas: higiene da carteira ativa (meta ~0) e saúde da Reserva (outra régua).                                                        |
| **BI** → Meu Raio-X                           | "Minha carteira agora" passa a ser 40, não 1.566. O gráfico vira legível.                                                                                                                                                                                                |
| **BI** → Painel do Gestor / Ranking           | `capacidade_pct` = carga ÷ 40 hoje devolve **3.915%** para a graziele. Passa a ser comparável entre corretores.                                                                                                                                                          |
| **Metas / Copa / Conquistas**                 | ⚠️ Auditar: se alguma métrica premia volume de leads na carteira, ela passa a brigar com a regra. Incentivo e política têm de apontar para o mesmo lado.                                                                                                                 |
| **Financeiro**                                | Sem mudança de tela. Pode precisar de campo para o split do co-atendimento (§4.3).                                                                                                                                                                                       |
| **Docs & Projetos**                           | Nada.                                                                                                                                                                                                                                                                    |
| **Configurações**                             | Ganha tela para o teto e os gatilhos. `capacidade_leads_ativos_por_corretor` já existe em `gestao_config` — hoje sem interface.                                                                                                                                          |
| **Distribuição** (`/distribuicao`)            | Muda de "roleta por limite diário" para **"roleta por vaga livre"**. Hoje os 49 corretores têm `limite_diario_leads = 50`: podem receber 50 por dia mas só conseguem trabalhar 40 no total. Os dois números brigam; o limite diário vira secundário ao teto de carteira. |

### 8.4 Prospecção: o módulo que precisa de decisão do dono

O Modo Foco hoje monta um lote de **até 200 leads** de
`aguardando_atendimento` / `aguardando_retorno` / `qualificacao_corretor` da
carteira do corretor. É literalmente o comportamento que o teto de 40 proíbe.

Não é para matar a ferramenta — é boa e o trabalho um-a-um é o certo. Muda o
**material** que ela consome: em vez de puxar 200 leads frios da carteira
nominal, o Modo Foco passa a trabalhar a **Reserva** em lote, e quem responde
sobe para a Fila Única ocupando uma vaga.

Ou seja, o Modo Foco deixa de ser ferramenta de carteira e vira **a
ferramenta de pré-venda do corretor** — o que o SDR faz, em self-service.
O badge do card (`nav_pendencias.atendimento`, que hoje conta
`aguardando_atendimento`) passa a contar a Reserva dele.

É a decisão que precisa ser sua, porque hoje Prospecção e Fila Única disputam
a mesma pergunta ("quem eu trabalho agora?") com respostas diferentes.

### 8.5 Atender: aposentar junto

As seis filas de `/atendimento` (novos, responder, followups, esfriando,
confirmar visita, docs) são exatamente os baldes que a Fila Única absorveu.
A tela já saiu da sidebar na reorganização de 11/09 — sobrevive no ⌘K e na
barra mobile.

Com o teto ligado, ela vira um segundo lugar que mostra a mesma carteira com
regra diferente, e as duas **vão divergir** — a Fila respeitando o teto, o
Atender não. Dois números para a mesma pergunta é como se perde a confiança na
tela nova.

**Recomendação: `/atendimento` redireciona para `/fila`**, como `/hoje` já faz.
Mesma fatia, uma linha de rota.

### 8.6 SDR: o módulo que herda 46 mil leads

Os 46.140 leads de estoque bruto (§3.1) viram trabalho da pré-venda. O módulo
já tem a forma certa — "Minha base", "Reaquecer (parados)", "Entregues",
"Visitas & confirmações". A Reserva do time inteiro é exatamente isso.

A mudança de regra: **a entrega pela roleta passa a respeitar vaga.** Hoje o
SDR entrega e pronto. Passa a entregar só para corretor com slot livre — e é
isso que faz o teto se sustentar sem que ninguém fique sem lead.

### 8.7 O saldo

- **1 página nova**: `/reserva`
- **1 página aposentada**: `/atendimento` → `/fila`
- **1 módulo repropositado**: Prospecção (carteira → pré-venda do corretor)
- **1 módulo que cresce**: SDR
- **3 telas que ficam honestas**: Higiene do Funil, Meu Raio-X, Painel do Gestor
- **1 regra que muda**: Distribuição (limite diário → vaga livre)
- **Todo o resto**: intacto

A regra dos 2 menus continua valendo: nenhum módulo novo, e a Central de
Comando vai de uma para duas seções.

## 9. O que foi construído (13/09/2026) — modo sombra

Entrou a Fatia 3 em **modo sombra**: o banco passa a saber quem são os 40 e
por que cada um dos outros ficou de fora. **Nada é devolvido automaticamente**
— a devolução é a fatia seguinte (§7 passo 5).

### 9.1 Banco

| Objeto                                                        | O que faz                                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `gestao_config.carteira_ativa`                                | Caps de faixa e gatilhos. O **teto** continua em `capacidade_leads_ativos_por_corretor` — uma chave só para o mesmo número |
| `_carteira_classificar(corretor)`                             | A regra ÚNICA: faixa, ordem, caps, teto e o motivo de quem ficou fora                                                      |
| `carteira_ativa_v1(corretor?)`                                | Quem ocupa vaga, na precedência das faixas                                                                                 |
| `carteira_reserva_v1(corretor?, busca?, limit, offset)`       | O complemento exato, com motivo, busca e paginação                                                                         |
| `carteira_vagas_v1(corretor)`                                 | Vagas livres (teto − ocupadas)                                                                                             |
| `carteira_vagas_entrada_v1(corretor)`                         | Quantos leads NOVOS cabem agora — ver §9.3                                                                                 |
| `carteira_resgates` + `carteira_resgatar` / `carteira_soltar` | A faixa B na mão do corretor                                                                                               |
| `carteira_sombra_v1()`                                        | A linha do gestor: quem estouraria e o que sairia                                                                          |
| `distribuir_estoque_roleta`                                   | O lote de cada corretor passa a respeitar a vaga de entrada                                                                |

### 9.2 Telas

- **`/reserva`** (novo), segunda seção da Central de Comando.
- **Fila Única**: o anel "N de 40" deixa de contar os candidatos carregados e
  passa a mostrar a carteira ativa do banco. Estourado, o texto diz a verdade
  (_"você não recebe lead novo até desovar"_), não "entram conforme saem".
- **`/atendimento`**: só o modo **Prioridade** foi aposentado (redireciona para
  `/fila`) — ver §9.5.

### 9.3 🔴 Correção de desenho: vaga de ENTRADA ≠ vaga global

O §3.1 dizia "lote = min(lote, vagas livres)". Escrito assim, a regra
**fabricaria Reserva**: um lead distribuído nasce em `aguardando_atendimento`,
ou seja, na faixa SLA, que tem cap próprio de 12. Um corretor com a carteira
vazia tem 40 vagas globais — despejar 40 leads novos jogaria 28 na Reserva no
mesmo instante, com "faixa cheia (sla)". O CRM teria criado o problema que a
regra existe para resolver.

O limite correto é o **menor entre a vaga global e a vaga da faixa de
entrada**, e é o que `carteira_vagas_entrada_v1` calcula. Travado em
`tests/db/distribuicao-por-vaga.test.ts`.

### 9.4 🔴 Correção de desenho: o fundo nunca é o excedente

O primeiro corte do classificador devolvia à Reserva os leads do fundo que não
coubessem no teto — e, pela ordem "mais parado primeiro", eram os **mais
recentes**: exatamente os recém-agendados. Isso contradiz o §4.1.

Regra final: **todo lead do fundo segue na carteira, mesmo acima do teto**.
Quem estoura para de RECEBER (`carteira_vagas_*` vai a zero); nenhum negócio
avançado sai. Medido no caso real (45 no fundo, teto 40): 45 ativos, 0 na
Reserva, 0 vagas.

### 9.5 Ajuste de escopo: só o modo Prioridade de `/atendimento` saiu

O §8.5 propunha aposentar `/atendimento` inteiro. Ao implementar apareceu o que
aquela análise não tinha visto: a rota hospeda **três** modos, não um.

- **Prioridade** — as seis filas. Aposentado: é o que duplica a Fila Única e
  divergiria no teto. `/atendimento` sem modo válido redireciona para `/fila`.
- **Volume** — um lead por vez sobre a carteira inteira (o antigo Modo Blitz,
  destino do redirect de `/blitz`). **Mantido**: não é fila priorizada e não
  tem equivalente na Fila Única.
- **Consulta** — buscar e filtrar como em Meus Leads. **Mantido**, mesma razão.

Retirar os três teria removido ferramenta sem substituto. O atalho do ⌘K
("Trabalhar carteira") passou a apontar o modo Volume. `queue-section.tsx`
ficou órfã e foi removida; as guardas de contrato da inbox (v4→v3→v2, fonte
única com o hub Follow-Up, botão [Confirmar]) foram reapontadas para a Fila
Única, que é o dono atual dessas regras.

### 9.6 🟡 Bug pré-existente encontrado (NÃO corrigido aqui)

**O botão "escoar estoque" da Central de Distribuição está quebrado** para lead
em `aguardando_corretor` — que é todo o estoque de 8.425 leads medido no §1.1.

Chamada por um admin autenticado, `distribuir_estoque_roleta` estoura em
`status do lead só pode ser alterado por transicionar_lead`:
`_distribuir_lead_v3` só promove o status quando ele era `novo`, e o `UPDATE`
seguinte já encontra `corretor_id` preenchido, o que derruba a exceção
`_atribuicao_inicial` do guard de transição.

**Reproduzido contra a função original** (`20260908195600`), antes de qualquer
mudança desta fatia — não é regressão. O cron (`distribuir-estoque-plantao`)
não é afetado: roda fora do papel `authenticated` e o guard o libera, o que
explica por que a esteira automática flui 4.320/dia enquanto o botão manual
falha. Anotado em `tests/db/distribuicao-por-vaga.test.ts`; a correção precisa
de decisão sobre qual caminho legitimar e fica fora do escopo desta fatia.

### 9.7 Como foi conferido

Postgres 16 real com as **206 migrations aplicadas do zero** (harness sem
Docker): `npm run test:db` → 33 arquivos, 521 testes. Unitários:
`npm run test` → 179 arquivos, 1.770 testes. `npm run lint:ci` e
`npm run typecheck` limpos. As telas não foram fotografadas nesta rodada — a
Reserva usa componentes já responsivos da casa, mas a prova visual a 360 px
fica pendente.

## 10. O teto subiu para 65 (13/09/2026)

Decisão do dono, no mesmo dia. O documento acima foi escrito para 40 e o
raciocínio continua valendo; o que muda é o número e o que ele passa a
significar.

### 10.1 Os caps de faixa sobem junto — senão a mudança é inerte

Subir só o teto quase não apareceria na operação: os caps somavam 34
(conversa 14 + SLA 12 + resgate 8) e travam ANTES do teto. Um corretor com
fundo do funil pequeno — a mediana medida é 4 — pararia em ~38 leads mesmo com
o teto em 65.

| Chave          |  40 |  65 |
| -------------- | --: | --: |
| `cap_conversa` |  14 |  23 |
| `cap_sla`      |  12 |  20 |
| `cap_resgate`  |   8 |  13 |
| **soma**       |  34 |  56 |

Escala por 65/40 = 1,625, preservando a folga relativa para o fundo (a soma
era 85% do teto, agora é 86%).

### 10.2 O que isso custa — a conta de cadência do §2.1 muda

O "40" saía de uma conta, não de opinião: 40 leads ÷ toque a cada 48 h = 20
toques/dia ≈ 4 a 5 horas, a jornada útil de contato de um corretor.

A 65, a mesma jornada de 20 toques/dia estica a cadência para **~78 h (3,25
dias)** entre toques. O teto deixa de ser "o que cabe numa cadência de 48 h" e
passa a ser um limite de responsabilidade mais largo. Quem quiser manter 48 h
com 65 leads precisa de ~33 toques/dia, o que são 6,5 a 8 horas só de contato.

**Na prática isso não aperta ninguém hoje.** Medido em 13/09/2026, a casa
inteira tocou 762 leads em 7 dias — ~16 por corretor. O teto é ceiling, não
cota: a 65 ele apenas devolve menos gente à Reserva. A régua de revisão do
§5.5 continua sendo a mesma pergunta: _o p50 de tempo entre toques na carteira
cheia passou de 48 h?_

### 10.3 Efeito colateral: o estouro vira caso teórico

Com o teto em 65, **nenhum corretor real estoura hoje pelo fundo do funil** — o
maior medido é a graziele, com 53. O exemplo do §2.3 deixa de acontecer na
prática, mas a regra continua valendo e continua testada: as fixtures de banco
passaram de 45 para 70 leads no fundo, porque a regra tem de valer quando
chegar a vez, não só enquanto os números ajudam.

### 10.4 O que mudou no código

- **`20260913140000_carteira_teto_65.sql`**: UPDATE (não INSERT) das duas
  chaves de `gestao_config` — elas já existem em produção, e um
  `ON CONFLICT DO NOTHING` aqui seria a armadilha clássica de "a migration
  rodou e nada mudou". Traz um guard que aborta o deploy se os caps passarem a
  somar mais que o teto (o fundo ficaria sem folga e o corretor pararia de
  receber sem motivo visível).
- **`20260913120000`** teve os _defaults_ em SQL alinhados (65/23/20/13). Ela
  nunca foi para produção, então foi editada no lugar: deixar a rede de
  segurança em 40 significaria que apagar uma linha de config devolveria a
  casa ao teto antigo em silêncio.
- **Uma constante só no front.** O mesmo número vivia como `LIMITE_FILA` na
  Fila Única e `TETO_PADRAO` na carteira. Subir de 40 para 65 deixou claro que
  duas constantes para um número são duas chances de esquecer uma:
  `TETO_PADRAO` passou a ser a definição (em `carteira-ativa/derive`) e
  `LIMITE_FILA` importa dela.
- **Três testes de tela** fixavam "40" no texto esperado e quebraram. Passaram
  a ler a constante e a montar as fixtures relativas a ela (`LIMITE_FILA + 17`
  em vez de `57`), que é o que impede a próxima mudança de teto de quebrá-los
  de novo.

Conferido do zero: 207 migrations aplicadas num Postgres 16 real,
`test:db` 33 arquivos / 521 testes, `test` 179 arquivos / 1.770 testes,
`lint:ci` e `typecheck` limpos.

## 11. Base em formação: a cadência sai dos 65 (22/09/2026)

Decisão do dono, depois da cadência D1/D2/D3 entrar em produção:

> A carteira de 65 do corretor deve ter apenas leads avançados e realmente
> tratados. Os toques de cadência entram numa **base em formação**; vai para a
> base dos 65 apenas o que avançar de fase ou agendar para frente.

Migration `20260925120000_carteira_base_em_formacao` (Drizzle `0008`).

### 11.1 Três estados, não dois

Até aqui um lead com dono era **carteira** (ocupa vaga) ou **Reserva** (fora,
esperando). A cadência criou um terceiro que não é nenhum dos dois:

| Estado       | Quem                                           | Ocupa os 65 | Onde se trabalha          |
| ------------ | ---------------------------------------------- | :---------: | ------------------------- |
| **Carteira** | fundo, resgate, conversa (respondeu ou passo)  |     sim     | Fila Única (`/fila`)      |
| **Formação** | D1/D2/D3 da cadência                           |     não     | Fila do Dia (`/cadencia`) |
| **Reserva**  | o resto — saiu da carteira, pode ser resgatado |     não     | Reserva (`/reserva`)      |

Formação não é Reserva porque o lead **não saiu de ninguém**: está sendo
trabalhado todo dia, com prazo. Aparecer na Reserva convidaria o corretor a
"resgatar" quem ele já está trabalhando.

A invariante de §9 muda de forma e continua de pé: carteira, formação e
Reserva **particionam** os leads vivos — nenhum some, nenhum aparece em duas.

### 11.2 A faixa `sla` deixou de existir

A faixa C (§2.2, "novos do SLA: chegaram há até 72 h") **era** a população que
a cadência passou a governar: lead novo entra em D1 pelo gatilho de
atribuição. Medido no harness antes da mudança:

```
lead novo da roleta:  cadencia_etapa=D1  faixa=sla  ativa=true
```

O lead que ninguém ainda conseguiu falar ocupava uma vaga de quem está em
negociação. A faixa saiu; a precedência ficou `fundo > formação > resgate >
conversa > reserva`.

### 11.3 A porta de entrada é da formação

`carteira_vagas_entrada_v1` passa a ser:

1. **0 se a carteira de 65 está cheia.** O princípio de §2.3 continua: quem
   responde na formação SOBE para os 65, e mandar lead novo para uma carteira
   cheia é garantir que a resposta dele não tenha vaga.
2. Senão, **`cap_formacao` − em formação.**

`cap_formacao` herda o número de `cap_sla` (20) — é a mesma população com
outro nome, e herdar evita um número novo. Se o admin tinha ajustado `cap_sla`,
o ajuste veio junto.

Efeito medido no teste da roleta: um corretor vazio recebe 20 leads e a porta
fecha, como antes. A diferença é o que sobra: antes, **45** vagas nos 65;
agora, **65** — os 20 estão em formação.

### 11.4 🔴 O furo que a regra fechou: a cadência não sabia que o lead avançou

A única saída da cadência para a qualificação era o botão "Cliente respondeu".
Se o corretor agendava a visita **pela ficha**, o status ia para `agendado` e
`cadencia_etapa` continuava em D1. Quando o prazo vencia, `cadencia_vencidos`
tirava o corretor e voltava o status para `aguardando_corretor` — apagando o
agendamento e entregando o cliente a outro. É o oposto de §4.1.

"Avançou" passou a ter uma definição só, a mesma de "tem próximo passo":

| Porta                                                             | Gatilho                  |
| ----------------------------------------------------------------- | ------------------------ |
| status sai da prospecção (`novo`/`aguardando_*` → qualquer outro) | BEFORE UPDATE em `leads` |
| próximo passo escrito no lead (`transicionar_lead`)               | o mesmo                  |
| tarefa com vencimento futuro                                      | AFTER em `tarefas`       |
| agendamento futuro                                                | AFTER em `agendamentos`  |

Três decisões dentro disso:

- **Tarefa automática não conta.** Não é compromisso do corretor com o
  cliente. Um gatilho de follow-up automático existiu até `20260708155905`; se
  voltar, a cadência não pode encerrar em massa. A exceção cobre também o
  espelho `proximo_followup`, que `sync_proximo_followup` preenche a partir de
  tarefas automáticas.
- **Transição, não estado.** `em_atendimento` é estado legítimo em cadência (o
  estoque da Fase 0 entra nele). Mover `novo → em_atendimento` pela ficha é
  avançar. O gatilho olha a transição; a correção retroativa olha o estado.
- **A saída automática não muda status.** O botão muda (`novo →
em_atendimento`) porque o corretor DECLAROU a resposta. Aqui só se sabe que
  há um passo agendado. A primeira versão mudava e a suíte pegou uma interação
  `mudanca_status` que ninguém fez.

A saída grava o **mesmo evento** do botão (`cadencia_etapa`, `de_estado` →
`respondeu`) com `via` (`status`, `tarefa`, `agendamento`, `proximo_passo`).
Sem isso, o painel da cadência subcontaria a resposta por etapa. Perda marcada
pela ficha vai para `encerrado` e não conta como resposta.

### 11.5 Quem mais acusava a formação

A cadência não escreve próximo passo, por desenho. Pela regra geral, todo lead
em cadência está "sem próximo passo" — e três leituras cobravam o corretor:

- `regua_devolucao_candidatos_v1`: lead admitido pela Fase 0, antes do 1º
  toque, era candidato `sem_passo` e ia ao **Bolsão no meio da cadência**
  (reproduzido no harness antes da mudança).
- `fila_equipe_v1`: coluna "sem próximo passo" do gestor.
- `carteira_stats_por_corretor_v1`: "sem passo vivo" e "ativa". Formação
  passou a contar como **prospecção**, que é o que ela é.

`lead_sem_proximo_passo` **não mudou** — é fonte única de três telas, e mudar o
significado dela mudaria as três em silêncio. Quem mudou foram os consumidores.

Na tela, a Fila Única deixou de mostrar lead em formação (exceto quando o
cliente **escreveu** — resposta não se esconde) e ganhou uma linha com a
contagem e o link para a Fila do Dia.

### 11.6 A Fase 0 entra pela porta da formação

A cota de admissão por corretor é o menor entre:

- `lote_estoque_dia` — o ritmo escolhido pelo admin;
- `cap_formacao_estoque` − em formação — **o estoque nunca passa da metade da
  formação** (10 de 20). Estoque e roleta disputam as mesmas vagas, e um lead
  pago que chegou agora vale mais que um parado há 20 dias;
- `carteira_vagas_entrada_v1` — 0 com a carteira de 65 cheia.

É isto que responde à pergunta dos **215 por corretor**
(`docs/ops/cadencia-followup-reativacao.md`): o estoque entra na velocidade em
que a formação se esvazia e nunca empurra os 65. A escolha de devolver parte
dele ao Bolsão continua possível e continua sendo de operação.

### 11.7 Correção dos que já tinham avançado

`cadencia_corrigir_avancados()` roda dentro da migration e fica disponível ao
admin. Tira da formação quem **já** estava avançado (status fora da janela ou
passo vivo que não é tarefa automática) — os leads em risco na próxima
execução de `cadencia_vencidos`. Idempotente. A migration imprime quantos
corrigiu:

```
NOTICE: cadência: N lead(s) já avançados por status e M com passo combinado saíram da formação
```

### 11.8 Como foi conferido

Postgres 16 com as 393 migrations aplicadas do zero: `test:db` 47 arquivos /
685 testes. Suíte nova `tests/db/carteira-formacao.test.ts` (18): cada teste
de saída roda o motor de vencidos DEPOIS, com um lead de controle que **é**
devolvido — sem ele, "não devolveu" poderia ser só "o motor não rodou".
Checagem de mutação: sem os gatilhos, 5 dos 18 quebram.

Oito arquivos antigos mudaram, em dois tipos, e cada mudança diz qual é:

- **(a) a regra mudou** — testes da faixa `sla` e da vaga de entrada por SLA
  foram reescritos para a formação;
- **(b) o fixture mentia** — leads que modelam carteira em conversa ou estoque
  parado nasciam em D1 pelo gatilho de atribuição; saem da cadência no
  fixture, com o porquê escrito, para a suíte continuar medindo o que media.

## Leitura relacionada

- `docs/ops/fila-unica-fatia1.md` — a Fila Única e o teto de 40 visual que
  este documento transforma em regra.
- `docs/ops/higiene-diagnostico-2026-09.md` — as medições de julho/setembro, a
  importação de 26/07 e as esteiras que reenchem o denominador.
- `src/features/fila-unica/funil-derive.ts` — `PASSAGENS`, as metas de
  conversão da casa citadas em §2.2.
