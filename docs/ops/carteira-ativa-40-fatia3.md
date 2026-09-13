# Carteira ativa de 40 — quem entra, o que acontece com o resto

Desenho da **Fatia 3** da Fila Única: o teto de 40 deixa de ser visual e vira
regra. Este documento responde três perguntas do dono (13/09/2026):

1. Quem devem ser os 40 leads de um corretor?
2. Como tratar todo o resto da base?
3. Como tratar quem está em fase avançada e sendo trabalhado?

Tudo abaixo está ancorado em medição no banco de produção de **13/09/2026**,
pelas ferramentas do CRM MCP. Onde o número é incerto, está dito.

## 1. O quadro medido

### 1.1 A base inteira (58.153 leads)

| Status                                     |  Leads |     % |
| ------------------------------------------ | -----: | ----: |
| `aguardando_atendimento`                   | 37.715 | 64,9% |
| `aguardando_corretor` (estoque sem dono)   |  8.425 | 14,5% |
| `em_atendimento`                           |  8.009 | 13,8% |
| `perdido`                                  |  2.457 |  4,2% |
| `aguardando_retorno`                       |    699 |  1,2% |
| `qualificacao_corretor` + `qualificado`    |    476 |  0,8% |
| `analise_credito`                          |    137 |  0,2% |
| `contrato_fechado` + `pos_venda`           |    114 |  0,2% |
| `agendado`+`visita_realizada`+`proposta`   |    103 |  0,2% |
| `novo`                                     |     18 |     — |

A soma fecha exata em 58.153. Temperatura: **frio 43.656 (75%)**, morno 9.374,
quente 5.057.

**Dono:** 55.696 leads não-perdidos, dos quais **39.966 (71,8%) não têm
corretor**. Só 15.730 têm dono.

### 1.2 A camada trabalhável (9.424 leads)

Os oito status em que existe trabalho de corretor (`em_atendimento`,
`aguardando_retorno`, `qualificacao_corretor`, `qualificado`, `agendado`,
`visita_realizada`, `proposta_enviada`, `analise_credito`), com dono:

| Corte pelo relógio de movimento | Leads |     % |
| ------------------------------- | ----: | ----: |
| Total                           | 9.424 |  100% |
| Parados 7+ dias                 | 8.662 | 91,9% |
| Parados 30+ dias                | 6.147 | 65,2% |
| **Com movimento nos últimos 7d**|**762**|**8,1%** |

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

| Faixa | Quem                                                                                     | Vagas hoje |
| ----- | ---------------------------------------------------------------------------------------- | ---------: |
| **A** | **Fundo do funil**: `agendado`, `visita_realizada`, `proposta_enviada`, `analise_credito` | o que precisar (mediana 4) |
| **B** | **Conversa viva**: respondeu nos últimos 7 dias, ou follow-up combinado com data          | até 14 |
| **C** | **Novos do SLA**: chegaram há ≤72 h e ainda não levaram 3 tentativas                      | até 12 |
| **D** | **Resgate escolhido**: o corretor puxa da Reserva quem ele quer trabalhar                 | até 8 |

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
pergunta só: *"ainda quer comprar?"*. Só quem **responde** vira candidato a
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

| Gatilho                                    | Destino |
| ------------------------------------------ | ------- |
| 3 tentativas sem resposta em 7 dias        | Reserva |
| 2 dias sem próximo passo definido          | Reserva |
| Excedente do teto de 40                    | Reserva — o mais frio devolve primeiro |
| 30 dias sem movimento, qualquer etapa      | Reserva |

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

| Sem movimento | O que acontece |
| ------------- | -------------- |
| **D+3**  | Topo da Fila Única do corretor, com o dinheiro em jogo no card |
| **D+5**  | Entra na linha do gestor (`fila_equipe_v1` já mostra "fundo do funil parado") |
| **D+10** | O **gestor é obrigado a dar um desfecho**: cobrar junto, colocar um par em co-atendimento com split definido, ou marcar perdido com motivo |
| **D+15** | Sobe para a superintendência como pendência nominal |

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

`capacidade_leads_ativos_por_corretor` já existe em `gestao_config` (default
40) e é lida por `gestao_performance_corretores_janela`. Um `UPDATE` muda a
regra para toda a casa sem rastro. **O log de execução da devolução tem de
carimbar a config usada** — mesma exigência já feita ao motor de Higiene.

### 5.5 🟡 "40" é um chute calibrado, não uma constante física

A conta de §2.1 sustenta a ordem de grandeza, não o dígito. A régua de revisão
é uma só: *o corretor consegue dar um toque de qualidade em cada lead da
carteira a cada 48 h?* Se o p50 de tempo entre toques passar de 48 h com a
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

## Leitura relacionada

- `docs/ops/fila-unica-fatia1.md` — a Fila Única e o teto de 40 visual que
  este documento transforma em regra.
- `docs/ops/higiene-diagnostico-2026-09.md` — as medições de julho/setembro, a
  importação de 26/07 e as esteiras que reenchem o denominador.
- `src/features/fila-unica/funil-derive.ts` — `PASSAGENS`, as metas de
  conversão da casa citadas em §2.2.
