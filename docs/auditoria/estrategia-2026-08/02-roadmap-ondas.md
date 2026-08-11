# 02 · Roadmap — 5 ondas + trilha contínua

> **Status (2026-08-09):** Onda 0 entregue integralmente (0.1–0.7) + A.1.
> Da Onda A, na execução descobriu-se que boa parte já havia sido entregue
> pela revisão de julho: A.4 (os 5 bugs do §3.4 já estavam corrigidos; sobrou
> e foi fechado o resíduo de invalidação de chips no TransferSlaBadge), A.2
> (o descarte em lote com motivo já existia — `bulkDescartar` + dialog) e A.5
> (a `leads_filtered_v3` já ordena por prioridade+score por padrão; o
> `created_at DESC` sobrevive só como último desempate). O item 2.11 da Onda B
> foi antecipado e entregue junto: `leads_filtered_v4` com filtro "parado há
> X dias" paramétrico e validação estrita de `_contato` (fim do `ELSE true`).
> Restam da Onda A: A.2 campanha de triagem (aguarda D6), A.3 dedup de
> telefone em produção (P-11) e A.6 régua única de "esfriando" (após A.2).
>
> **Onda B em andamento:** 2.1 ✅ (bloco admin → Configurações; hub vira
> "Operação"), 2.2 ✅ + 2.3 ✅ (fusões Funil+Gargalos e Time+Leads por
> Corretor) — **métrica M3 fechada: 12 → 5 abas**. 2.11 ✅ (antecipado).
> 2.4 ✅ (hub Dinheiro em `/financeiro`: fechamento + comissões + aprovação,
> badge aponta para a tela que aprova — tarefa #15). 2.5 ✅ (6ª fila
> "Confirmar visita" via `atendimento_inbox_v4`, botão [Confirmar] in-line —
> tarefa #5b). 2.6 ✅ (8ª exceção "documentação travada" no Painel do Dia,
> limiar em `gestao_config.documentacao_travada_dias` — tarefa #14).
> 2.7 **PR (a) ✅**: Atender ganhou os 3 modos (Prioridade/Volume/Consulta)
> via `?modo=` — Volume é o Blitz extraído (`volume-view.tsx`; /blitz segue
> viva montando o mesmo componente), Consulta lê a MESMA query de /leads
> (cadeia v4→v3→v2→v1 extraída para `leads-query.ts`, fonte única) com
> busca, filtros essenciais e peek. **PR (b) ✅**: a Consulta ganhou o
> conjunto COMPLETO de filtros num drawer (etapa, temperatura, origem,
> contato, parado, período com intervalo custom, corretor e lixeira para a
> gestão); o vocabulário de período (`rangeDoPeriodo`) e os recortes
> transitórios v1/v2 (`recortesClientSide`) viraram módulos compartilhados —
> /leads e Consulta leem as mesmas funções. **PR (c) ✅**: porta única no
> menu — o botão "Leads" saiu do nível primário (Atender absorve o badge
> somado e "Base de leads"/Oferta Ativa como subitens; Captação foi para
> Operação) e /blitz virou redirect para `/atendimento?modo=volume` (mesmo
> componente, perda zero). Débito consciente registrado: /leads segue ROTA
> VIVA (kanban, ações em massa, importação, modo foco) fora do menu
> primário; o redirect total só quando a Consulta absorver esses fluxos —
> ações em massa dependem de A.2 (triagem). **2.7 fechado na forma segura.**
> **2.10 ✅** — comparação lado a lado: no Funil, corretor filtrado mostra o
> TIME como referência ao lado (coorte compara taxas de passagem com marca
> "⚠ abaixo"; snapshot compara com a média por corretor — time ÷ perfis
> ativos, aproximação declarada) — tarefa #10; em Relatórios, todo tile de
> resultado e produção carrega o valor ABSOLUTO do período anterior junto
> do delta (o `prev` da RPC dashboard_kpis já trazia tudo; era só expor) —
> tarefa #11. **Onda B completa** (exceto o débito consciente do 2.7c).
>
> **Onda C iniciada — 7a ✅** (2026-08-09): tabela `mensagens` (migration
> `20260809150000`: idempotência por provider_message_id, RLS espelhando o
> acesso ao lead, realtime) + `POST /api/public/webhooks/whatsapp` com
> `x-webhook-secret` e contrato normalizado provider-agnóstico (eventos
> mensagem/status); a entrada é ecoada como interacao e acende a fila
> Responder de Atender sem mudar RPC. Contrato n8n documentado em
> `docs/fase7-mensageria.md`. Ativação: migration via Lovable + env
> `WHATSAPP_WEBHOOK_SECRET` + montar o fluxo n8n. **7b ✅** (2026-08-10):
> Central `/mensagens` (menu "Mensagens" sob Atender) — lista de conversas,
> thread por lead e realtime; o envio simulado registra a saída e abre o
> wa.me (o CRM passa a enxergar a conversa antes de qualquer provedor —
> métrica O1).
>
> **3.1 ✅ na forma segura** (2026-08-11, pedido do dono — D4 decidida):
> aprovação/reprovação da análise de crédito no fluxo SEM mexer no enum de
> lead_status. A tabela órfã `analises_credito` virou o registro de cada
> análise (migration `20260810120000`: CHECK NOT VALID, RLS pela régua do
> lead, trigger, índice); o modal de análise grava nela; card
> Aprovar/Reprovar (com motivo) no peek e na página do lead, com o próximo
> passo embutido (aprovada → venda; reprovada → nova análise ou perda);
> `dashboard_kpis.pipeline` ganhou `analise_aprovada/reprovada` (aditivo) e
> o card de Análise do Pipeline responde "quantos liberados". A promoção a
> etapas próprias do funil (o 3.1 integral, risco alto) fica opcional para
> depois, com estes dados já populados.
>
> **O que resta aguarda decisão ou acesso:** 7c provedor (D1) · A.2
> triagem (D6) → A.6 régua única · A.3 dedup em produção (P-11) · Onda D
> restante (staging D7, promoção do crédito a etapas do funil,
> 3.2/3.3/3.5/3.6, limpeza medida das RPCs órfãs após os 7 dias de
> pg_stat_statements) · Onda E (IA, após A/C) · 2.8/2.9 (menores, do plano
> ux-ia original) e o redirect total de /leads (débito do 2.7c).

> Sequenciado por **dependência e valor**, não por eixo — os 4 eixos sobem juntos dentro de cada onda. Este roadmap **absorve** as Ondas 2 e 3 da auditoria `ux-ia-2026-08/06-plano.md` (elas são a Onda B e parte da D daqui), não as substitui.
>
> Esforço: **P** = horas–1 dia · **M** = 2–5 dias · **G** = 1–3 semanas. Eixo entre colchetes: [G]estão · [D]esenvolvimento · [C]ontrole · [O]peração. KPIs em `03-metricas.md`.

---

## Onda 0 — Rede de proteção (semanas 1–2)

_"O seguro mais barato do sistema."_ Tudo aqui é P ou M, sem migração de risco, e destrava as ondas seguintes.

| #   | Item                                                                                                                                                                                                     | Eixo | Esf. | Risco  | KPI     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ------ | ------- |
| 0.1 | **Error tracking** (Sentry ou similar) no frontend + edge functions — hoje `console.error` em Workers é efêmero                                                                                          | C    | P    | nenhum | C1      |
| 0.2 | **Ligar `pg_stat_statements`** e iniciar o relógio de 7 dias das ~30 RPCs órfãs (item 3.4 do plano vigente, pré-requisito de qualquer limpeza)                                                           | C    | P    | nenhum | M4      |
| 0.3 | **Documentar backup/restore**: PITR do Supabase, RTO/RPO alvo, roteiro de restore testado 1×                                                                                                             | C    | P    | nenhum | C2      |
| 0.4 | **Contas de teste/bot fora da roleta** (`docs-bot`, "Edson teste junior", duplicatas) — hoje elegíveis na distribuição real                                                                              | O    | P    | baixo  | higiene |
| 0.5 | **Fechar a Onda 1 vigente**: item 1.8, etapa in-line no card de Atender (`features/atendimento/queue-section.tsx` + `lead-stage-menu.tsx`)                                                               | O    | M    | médio  | M1      |
| 0.6 | **Unificar `match-ia`/`resumo-ia`/`mensagem-ia` sob a governança do SamiQ** (prompt/modelo versionados no banco, quota, redação de PII) — é replicar padrão que já existe em `src/lib/samiq-governance*` | D    | M    | baixo  | C3      |
| 0.7 | **P-3**: migrar o Zap para header `x-webhook-secret` e remover a aceitação de `?secret=` no `lead-intake`                                                                                                | C    | P    | baixo  | —       |

**Quick wins da semana 1:** 0.1, 0.2, 0.3, 0.4 + o item A.1 da onda seguinte (chips dinâmicos, classificado P0 na revisão de leads).

---

## Onda A — Verdade dos números (semanas 2–5)

_Pré-requisito de toda gestão e de toda IA._ Base: plano em 3 ondas de `revisao-pagina-leads.md` §7, elevado aqui a prioridade estratégica.

| #   | Item                                                                                                                                                                                 | Eixo | Esf. | Risco | KPI                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ---- | ----- | ---------------------- |
| A.1 | **Chips dinâmicos** para os status fora de `LEAD_STATUS_ORDER` — os 45.660 leads invisíveis passam a aparecer e a soma dos chips fecha com o total                                   | G    | P    | baixo | G1                     |
| A.2 | **Disciplina de "perdido"**: descarte em lote com motivo + visão "sem contato 30d+" + sugestão no card; campanha de triagem dos 45,6 mil (depende da decisão D6)                     | G/O  | M    | médio | G2                     |
| A.3 | **P-11**: mesclar duplicatas de telefone em produção e **ativar os índices únicos** (`uq_leads_projeto_telefone_ativo`); conferir `vw_leads_telefone_duplicado` antes                | C    | M    | médio | 0 duplicatas           |
| A.4 | **Escopo unificado + bugs de cache** do §3.4 da revisão de leads (gestor vê órfãos; lista, contagens e SLA respondem a mesma pergunta; invalidações corrigidas)                      | D    | M    | médio | coerência              |
| A.5 | **Score no servidor**: `scoreLead` (já existe em `src/lib/priority.ts`) vira coluna ordenável e critério de fila — fim do `created_at DESC` no miolo de 4,7 mil leads em atendimento | O    | M    | médio | O2                     |
| A.6 | **Régua única de "esfriando"** (hoje 4 divergentes) + recalibrar `recalcular_temperatura_leads` — **depois** de A.2 limpar a base, senão a régua nova nasce torta                    | O    | M    | médio | distribuição plausível |

---

## Onda B — Terminar o que já está especificado (semanas 4–9, intercala com A)

É a **Onda 2 da auditoria `ux-ia-2026-08` adotada integralmente** — arquivos, riscos e ordem já validados no `06-plano.md`. Sem redesenho aqui; só execução, na sequência de lá:

1. 2.1 bloco admin sai de Operação para Configurações (12 → 7 abas)
2. 2.2 + 2.3 fusões Funil+Gargalos e Leads-por-Corretor em Time (7 → 5 abas)
3. 2.4 rota `/financeiro` ("Dinheiro") absorve fechamento + comissões + aprovação (tarefa #15: 5 → 2 cliques)
4. 2.5 sexta fila **"Confirmar visita"** em Atender (RPC `atendimento_inbox_v4`) — tarefa #5b: ⛔ → 2
5. 2.6 oitava exceção **"documentação travada"** no Painel do Dia — tarefa #14: ⛔ → 2
6. 2.11 filtro "parado há X dias" com `leads_filtered_v4`, **corrigindo o `ELSE true`** perigoso
7. 2.7 **Atender em 3 modos** (Prioridade/Volume/Consulta), `/leads` e `/blitz` viram redirect — a maior mudança do plano, **em 3 PRs**
8. 2.10 **comparação lado a lado** em Funil e Relatórios (tarefas #10 e #11, hoje impossíveis)

KPIs: M1 (cliques ≤2 e 0 tarefas inexistentes), M2, M3 (12 → 5 abas).

---

## Onda C — Mensageria 2 vias (semanas 6–12)

_O maior destravamento operacional do estudo: hoje o CRM não vê nenhuma conversa._ Segue o desenho pronto de `fase7-mensageria.md`. C.1/C.2 rodam em paralelo com a Onda B (superfícies diferentes); C.3 espera a decisão D1.

| #   | Item                                                                                                                                                                          | Eixo | Esf. | Risco                                          | Dependência                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---------------------------------------------- | ------------------------------------- |
| C.1 | **Fase 7a**: migration `mensagens` (idempotência por `provider_message_id`, RLS espelhando `leads`) + webhook de entrada + fluxos n8n plugáveis                               | D    | M    | baixo                                          | nenhuma — **não depende do provedor** |
| C.2 | **Fase 7b**: Central de Mensagens `/mensagens` em **modo simulado** (inbox unificada, thread por lead, responder inline, template) — valida a UX antes de gastar com provedor | O    | G    | médio                                          | C.1                                   |
| C.3 | **Decisão D1 + Fase 7c**: ligar provedor, templates aprovados, janela de 24h, opt-out LGPD, automações por etapa                                                              | O    | G    | alto (externo: aprovação Meta, custo/conversa) | D1, C.2                               |
| C.4 | **P-7 resolvido por absorção**: notificações ao corretor passam pela fila da mensageria — retry de graça                                                                      | C    | M    | baixo                                          | C.3                                   |

KPI: O1 — % de conversas visíveis no CRM: 0% → >80%.

---

## Onda D — Estrutural e controle profundo (meses 3–5)

| #   | Item                                                                                                                                                                                                                                                                                                                                                                       | Eixo | Esf. | Risco |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ----- |
| D.1 | **Crédito em 3 estados** (Em Análise / Aprovada / Reprovada) — item 3.1 do plano vigente, [DECIDIDO], janela própria (decisão D4). Muda `LEAD_STATUS_ORDER`, transições, modais, kanban + migração dos leads em `analise_credito`. Maior valor de gestão em MCMV                                                                                                           | G    | G    | alto  |
| D.2 | Depois (nunca junto com D.1): 3.2 `novo`+`aguardando_corretor` no funil (decisão D5, corte documentado na série) · 3.3 home por papel · 3.5 `leads_search_v2` no ⌘K · 3.6 remover papel `superintendente`                                                                                                                                                                  | G    | M    | médio |
| D.3 | **Staging + pipeline de migrations**: 2º projeto Supabase (decisão D7), tirar o project id hardcoded de `vite.config.ts`, CI aplica migrations, rollback documentado. O incidente P0-1 (logout global por deploy desacoplado) é o argumento                                                                                                                                | C    | G    | médio |
| D.4 | **Audit trigger nas tabelas sensíveis que faltam**: `user_roles`, `profiles`, `metas`, `roleta_participantes`, config de distribuição                                                                                                                                                                                                                                      | C    | M    | baixo |
| D.5 | **Limpeza medida** (só após 0.2 medir 7+ dias): remover RPCs órfãs confirmadas · P-8 estruturas legadas (`na_lixeira`×`deleted_at`, `fila_distribuicao`×`roletas`, `documentacoes`×`documentacao_versoes`) · P-4 elegibilidade única para os motores de distribuição (extrair função comum, **sem tocar o core das roletas**) · P-5 commitar `copa_ranking()` vivo no repo | D    | G    | médio |

---

## Onda E — IA que decide com dados limpos (meses 4–6+)

Só entra depois da Onda A (base limpa) e da C (conversas visíveis) — senão aprende lixo. Reordena os P1 do `roadmap.md` sob essa condição, tudo sob a governança unificada em 0.6 e mantendo o princípio da casa: **"IA sugere, humano decide"**.

| Item                                             | O que muda com as fundações prontas                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Score de lead v2**                             | Ganha o sinal mais preditivo que existe: a conversa real (resposta, tempo de resposta, teor)                                                    |
| **Follow-up automático** por estágio/temperatura | O motor anti-perda ganha braço de envio pela mensageria (templates aprovados, janela 24h)                                                       |
| **Pré-análise MCMV automática**                  | O simulador APROVE 2026 (`src/lib/aprove2026.ts`, `orcamento.ts`) já existe — vira feature de esteira: renda/FGTS → faixa/elegibilidade no card |
| **Auditoria de atendimento por IA**              | Passa a existir matéria-prima: as threads da Central de Mensagens                                                                               |
| **Distribuição por afinidade**                   | Complementa (não substitui) a roleta v3, com histórico limpo de conversão por perfil                                                            |

Esforço G · risco médio · KPIs: O2, G2 e custo de IA dentro do orçamento D8.

---

## Trilha contínua (~20% do tempo, sem onda própria)

- Regenerar `types.ts` do Supabase e derreter os ~212 escapes rumo ao budget (D1: <150 em 90 dias)
- Fatiar arquivos >500 linhas **quando tocados** (`leads.index.tsx` 2.085, `ranking.tsx` 1.821…) — sem reescrita big-bang (D2: sem novos)
- Consolidar formatação BRL em 1 fonte canônica (hoje 4)
- Padrão único de guard de papel (`RequireRole` em todas as rotas restritas)
- P-6: resolver o dual-lockfile (confirmar com a plataforma Lovable qual é o canônico)
- P-10: smoke autenticado (Playwright com sessão de teste)

---

## Relação entre as ondas

```
Onda 0 (proteção)
  ├─ 0.2 ──────────────── mede 7 dias ──────────────► D.5 (limpeza)
  ├─ 0.6 ──────────────────────────────────────────► Onda E (IA governada)
Onda A (verdade) ────────────────────────────────────► Onda E (dados limpos)
  └─ A.2 antes de A.6 (régua nova só com base limpa)
Onda B (especificado) — paralela a A; 2.7 por último, em 3 PRs
Onda C (mensageria)
  ├─ C.1/C.2 não dependem de provedor (paralelas a B)
  └─ D1 (decisão) ──► C.3 ──► C.4 ─────────────────► Onda E (follow-up automático)
Onda D — D.1 em janela própria (D4); D.2 nunca junto com D.1; D.3 antes de
         qualquer migração de risco alto subsequente
```
