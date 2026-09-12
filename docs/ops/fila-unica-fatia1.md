# Fila Única — Fatia 1 (leitura + ações que já existem)

Tela `/fila`, seção "Fila Única" da Central de Comando: uma lista só, ordenada,
no lugar de seis filas e sete widgets. O corretor não escolhe a fila; a fila
escolhe por ele. Esta fatia **não escreve nada novo**: WhatsApp, ligar,
registrar contato, Sami, mudar etapa e confirmar visita são os mesmos caminhos
de `/atendimento`. Não move lead, não marca perdido, não limita carteira.

Origem: pedido do dono em 12/09/2026 ("uma única página de operação essencial
para pararmos de perder clientes ao longo do processo"), depois do diagnóstico
medido no banco no mesmo dia. Mockup aprovado antes do código:
https://claude.ai/code/artifact/8ae2448b-90d8-438a-997c-53cc7a7ff45d

## O que entrou

| Arquivo                                       | Assunto                                                                  | Reversível sozinho |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| `src/features/fila-unica/derive.ts`           | lógica PURA: funde as fontes, deduplica, ordena por balde, corta no teto | sim                |
| `src/features/fila-unica/use-fila-unica.ts`   | hook: inbox v4 (30/fila) + régua + leads_sem_acao + extras por id        | sim                |
| `src/features/fila-unica/fila-card.tsx`       | card: projeto de interesse, motivo, próximo passo, Resumo da Sami, ações | sim                |
| `src/features/fila-unica/fila-unica-page.tsx` | página: placar, grupos, diálogos de Atender reaproveitados               | sim                |
| `src/routes/_authenticated/fila.tsx`          | rota `/fila` (SDR vai para `/sdr`, como a Hoje)                          | sim                |
| `src/features/nav/sistemas.ts`                | seção "Fila Única" na Central de Comando (a Hoje continua a home)        | sim                |
| `tests/fila-unica-derive.test.ts`             | 19 casos da lógica pura                                                  | —                  |
| `tests/fila-card.test.tsx`                    | 4 casos do card (projeto, próximo passo, Resumo, callbacks)              | —                  |

Zero migration. Zero RPC nova. Zero mudança nas telas existentes.

## Decisões que valem revisão

**A ordem é por balde, e o fundo do funil vem antes de qualquer lead frio.**
Medido em 12/09/2026: 124 dos 134 leads em análise de crédito estavam parados
há 5+ dias, numa etapa que converte 39% para venda; a passagem "em atendimento
→ agendado" estava em 7% na safra de 30 dias, contra meta de 70%. Ordem:

1. `sla` — lead novo na mesa (a inbox conta a carteira inteira; estourado, o
   lead vai para o próximo da roleta). Dentro: quem chegou primeiro.
2. `fundo` — agendado, visita realizada, proposta e análise de crédito, de
   qualquer fonte. Dentro: mais dias sem movimento primeiro (o score empata,
   porque a temperatura é derivada da etapa).
3. `responder` — o cliente falou por último.
4. `followup` — toque da régua vencido ou de hoje. Dentro: mais vencido primeiro
   (a mesma ordem do hub Follow-Up).
5. `sem_acao` — sem tarefa, agendamento ou follow-up aberto.
6. `esfriando` — quente/morno sem contato há 3+ dias.
7. `docs` — pasta travada fora do fundo.

Dentro dos demais baldes vale o Score de prioridade (`lib/priority.ts`), o
mesmo das filas de Atender.

**Um lead, um balde.** A inbox e a régua podem trazer a mesma pessoa; a fila
deduplica e fica com o balde mais urgente. Empate fica com a inbox, cujas
contagens vêm do banco.

**Fonte única com o Follow-Up.** Com `followup_fila_v1` disponível, a fila
"followups" da inbox é ignorada, exatamente como `aplicarFilaRegua` faz em
Atender. Sem a RPC (banco antigo), a fila da inbox volta a valer.

**Cache e teto da inbox.** A inbox é pedida com 30 cards por fila (o teto da
RPC) sob a chave `["atendimento:inbox", "fila-unica", userId]` — chave própria,
porque o payload não é o de `/atendimento` (15 por fila), mas sob o mesmo
prefixo, para toda invalidação alcançar as duas telas. A régua usa o prefixo
`["followup:fila"]`. O que a inbox conta numa fila mas não manda como card é
somado em `resumo.ocultosInbox` e mostrado no cabeçalho ("+ N nas filas de
Atender além dos cards carregados"): a fila nunca apresenta os cards recebidos
como se fossem a carteira inteira.

**A precedência vale para qualquer fonte.** A régua (`followup_fila_v1`) devolve
TODO lead ativo sem toque agendado, com `proximo_followup` nulo e
`minutos_vencido` 0. Isso não é "vence hoje": é lead sem próximo passo, e entra
no balde `sem_acao`. Da mesma forma, `respondeu` na régua manda o lead para
"responder", e lead em `novo`/`aguardando_atendimento` vindo de qualquer fonte
vai para o SLA — o corte por fila da inbox não pode rebaixar um lead para o
balde errado.

**Enriquecimento por id.** `leads_sem_acao` devolve 7 colunas (sem `created_at`,
projeto nem corretor) e nenhuma fonte traz `ultimo_contato`. O hook lê esses
campos em `leads` num único `.in(ids)` (RLS da carteira aplica). Com isso o
relógio "dias sem movimento" é o da Higiene (`GREATEST(ultima_interacao,
ultimo_contato)`, senão `created_at`), o card mostra o projeto de interesse de
qualquer fonte e os modais de etapa recebem o `corretor_id` real. A lógica pura
nunca inventa data: sem data conhecida, `diasParado` é `null` e o lead é
tratado como o mais negligenciado do fundo do funil.

**Falha de leitura nunca vira fila vazia.** Erro em qualquer fonte propaga para
`QueryErrorState`. A única degradação silenciosa é `leads_sem_acao` ausente
(banco antigo): a fila fica de pé sem o balde "sem próximo passo".

**O teto de 40 é visual.** A tela mostra os 40 primeiros dos candidatos
recebidos e diz quantos ficaram de fora — e, separadamente, quantos a inbox
contou sem mandar card. A "carteira ativa" como regra de banco (o lead
excedente vai para a pré-venda) é a Fatia 3.

**Projeto e Resumo no card.** Pedido do dono: o projeto de interesse aparece
como chip sempre que existir (todas as fontes o trazem), e o botão Resumo abre,
sem sair da fila, o Resumo da Sami (gerado sob demanda, cacheado por lead) com
renda, FGTS, entrada e origem, mais a porta do histórico completo (peek).

**Ligar usa o click-to-call.** `useLigarLead` (Sonax com fallback `tel:`),
como a fila do Follow-Up faz — não o `tel:` puro do card de Atender.

## Medir ANTES de aplicar

Não há migration; o "antes" é o comportamento das telas donas, que não muda.
Para a comparação da Fatia 2, registrar hoje:

```sql
-- Quantos leads vivos da carteira dos corretores não têm próximo passo
SELECT count(*) FROM public.leads l
 WHERE l.deleted_at IS NULL AND l.na_lixeira = false AND l.corretor_id IS NOT NULL
   AND l.status NOT IN ('contrato_fechado','pos_venda','perdido')
   AND NOT EXISTS (SELECT 1 FROM public.tarefas t WHERE t.lead_id = l.id AND t.status IN ('pendente','em_andamento'))
   AND NOT EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.lead_id = l.id AND a.data_inicio >= now() AND a.status NOT IN ('cancelado','realizado','nao_compareceu'))
   AND (l.proximo_followup IS NULL OR l.proximo_followup <= now());

-- Fundo do funil parado (5+ dias sem movimento)
SELECT status, count(*) FROM public.leads
 WHERE deleted_at IS NULL AND na_lixeira = false
   AND status IN ('agendado','visita_realizada','proposta_enviada','analise_credito')
   AND COALESCE(GREATEST(ultima_interacao, ultimo_contato), created_at) < now() - interval '5 days'
 GROUP BY 1;
```

## Provar DEPOIS de aplicar

A tela é leitura. O que tem de bater: o placar "Fundo do funil parado" de um
corretor = os leads dele nas quatro etapas do fundo que aparecem em qualquer
fila da inbox, na régua ou em `leads_sem_acao`. E `/atendimento` continua
mostrando exatamente o que mostrava — nenhum arquivo dela foi tocado.

## Rollback

Sem deploy não há como desligar (não há flag: a tela não escreve nada e não
tem custo além das três RPCs que a home e Atender já pagam). Reverter =
reverter o commit: some a rota, a seção do menu e a pasta da feature; nada no
banco muda.

## Testes

```bash
npm run test -- tests/fila-unica-derive.test.ts tests/fila-card.test.tsx tests/sistemas.test.ts
```

## Leitura relacionada

- `docs/ops/higiene-diagnostico-2026-09.md` — as medições que sustentam a ordem
  dos baldes (fundo do funil parado, escrita em lote).
- `docs/auditoria/ux-ia-2026-08/05-nova-ia.md` — as seis filas de Atender e a
  home por papel, que esta tela absorve.
- `docs/samiq/2026-09-05-decisoes-copiloto.md` — o registro por proposta da
  Sami, que a Fatia 2 vai usar como desfecho por voz.

## O que NÃO entrou (fatias seguintes)

- **Fatia 2 — desfecho de um toque.** Depois de Ligar/WhatsApp, "o que
  aconteceu?" com 3 a 5 respostas que gravam interação + próximo passo com
  data + etapa (via `transicionar_lead`) numa transação. É o que faz o relógio
  "parado há X dias" dizer a verdade. Reusa `samiq_propostas` para o desfecho
  ditado.
- **Fatia 3 — carteira ativa limitada e devolução.** Tabela própria (não coluna
  em `leads`), teto em `gestao_config`, três tentativas sem resposta devolvem à
  pré-venda, dois dias sem próximo passo idem. Visão do gestor por corretor.
- **Comissão em risco.** A ordem "R$ em risco × dias além do prazo" exige valor
  por lead (tabela do projeto × % de comissão). Sem esse número, a ordem desta
  fatia é por balde e dias parado — já melhor que seis filas, mas não fala em
  reais.
- **Push nos vencidos e no SLA.** A infraestrutura de push existe; nada a
  dispara para o que importa. Fica para a Fatia 2, com o desfecho.
