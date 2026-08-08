# Estratégia 2026-08 — O Próximo Nível · Sumário executivo

> Estudo estratégico: qual é o próximo nível para elevar o CRM a outro patamar em **gestão, desenvolvimento, controle e operação**.
>
> Método: consolidação de todo o diagnóstico já escrito (28 documentos em `docs/`, com destaque para `ux-ia-2026-08/`, `2026-07-19-pendencias.md`, `revisao-pagina-leads.md` e `fase7-mensageria.md`) cruzada com leitura direta do código (273 migrations, ~95 tabelas, 265 funções de banco, ~439 arquivos em `src/`, CI e testes). Este estudo **não substitui** nenhum plano vigente — ele os ordena.
>
> Números de produção citados vêm de `docs/revisao-pagina-leads.md` (26/07/2026, via MCP).

---

## A tese em um parágrafo

O CRM venceu a fase de construção. As funcionalidades são maduras (distribuição v3 "nenhum lead some", financeiro com ledger append-only e conciliação OFX, gamificação completa, vitrine pública, SamiQ com governança de IA exemplar), a UX está acima da média do mercado (⌘K, mobile-first, PWA, design system próprio) e a qualidade de engenharia é rara em CRM próprio (808 testes unitários + 278 testes contra Postgres real + smoke do artefato de produção). O próximo nível **não é construir mais tela**. É fazer três fundações existirem: **(1) o sistema dizer a verdade** — hoje 83% da base é invisível nos chips e só 7 de 55.060 leads foram marcados perdidos, o que invalida funil, conversão, score e qualquer IA; **(2) o sistema enxergar a conversa** — o WhatsApp, onde a venda acontece, é um link `wa.me` que o CRM não vê; **(3) a operação ter rede de proteção** — zero error tracking, zero staging, deploy de banco manual sem rollback, backup por fé no PITR. Gestão, desenvolvimento, controle e operação sobem juntos quando essas três fundações existem — e só então a IA (score, follow-up automático, pré-análise MCMV) aprende com dados que prestam.

---

## Os 5 números que definem o momento

| #   | Número                                                                      | O que significa                                                                                         | Fonte                                       |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | **83% da base invisível** (45.660 de 55.060 leads fora dos chips de status) | Para o gestor, a conta nunca fecha; todo relatório parte de uma amostra distorcida                      | `revisao-pagina-leads.md` §2                |
| 2   | **7 leads "perdidos" em 55.060**                                            | Ninguém marca perda; o funil incha para sempre e a conversão por etapa não significa nada               | `revisao-pagina-leads.md` §2                |
| 3   | **0% das conversas dentro do CRM**                                          | WhatsApp é só `wa.me`; a matéria-prima da venda (e de qualquer IA de atendimento) não existe no sistema | `fase7-mensageria.md`                       |
| 4   | **0 ferramentas de error tracking**                                         | Erro em produção é `console.error` efêmero em Cloudflare Workers; a operação descobre por anedota       | `src/server.ts`, ausência de Sentry/similar |
| 5   | **55% das RPCs sem consumidor** (135 de 244 na contagem da auditoria)       | Superfície de manutenção e risco que ninguém usa — e que não pode ser apagada sem medir                 | `ux-ia-2026-08/00-sumario-executivo.md`     |

---

## As 5 apostas do próximo nível

Em ordem de dependência (o detalhe está em `02-roadmap-ondas.md`):

1. **Onda 0 — Rede de proteção** (semanas 1–2): error tracking, `pg_stat_statements` ligado (inicia o relógio de 7 dias das RPCs órfãs), backup documentado e testado, contas de teste fora da roleta, IA unificada sob a governança do SamiQ. Tudo barato, nada arriscado, destrava o resto.
2. **Onda A — Verdade dos números** (semanas 2–5): chips que enxergam 100% da base, disciplina de "perdido" com descarte em lote + motivo, dedup de telefone ativado, `scoreLead` no servidor no lugar de `created_at`, régua única de "esfriando". **Pré-requisito de toda gestão e de toda IA.**
3. **Onda B — Terminar o que já está especificado** (semanas 4–9): a Onda 2 da auditoria `ux-ia-2026-08` inteira, na ordem do `06-plano.md` — inclusive as tarefas que hoje **não têm caminho no sistema** (confirmar visita, pastas travadas, comparação lado a lado).
4. **Onda C — Mensageria 2 vias** (semanas 6–12): a Fase 7 desenhada em `fase7-mensageria.md`, começando pelo que **não depende do provedor** (migration `mensagens` + Central em modo simulado) e ligando o provedor só depois da decisão D1.
5. **Ondas D e E — Estrutural e IA** (meses 3–6+): crédito em 3 estados, staging + pipeline de migrations, limpeza medida do legado; e então a IA que o roadmap já previa (score v2, follow-up automático, pré-análise MCMV) — agora com base limpa e conversas visíveis.

---

## O que só o dono pode decidir

Oito decisões bloqueiam partes do plano (detalhe e recomendação em `04-decisoes.md`):

| #   | Decisão                                                               | Bloqueia                 |
| --- | --------------------------------------------------------------------- | ------------------------ |
| D1  | Provedor de WhatsApp (Meta Cloud API × BSP × Z-API)                   | Onda C fase 7c           |
| D2  | Escopo de leitura/escrita de `metas` (P-1, hoje `USING true`)         | migration de RLS         |
| D3  | Comissão com `beneficiario_id` NULL (P-2)                             | financeiro               |
| D4  | Janela para crédito em 3 estados (item 3.1, já decidido "sim")        | Onda D                   |
| D5  | `novo` + `aguardando_corretor` entram no funil (muda série histórica) | Onda D                   |
| D6  | Critério de triagem dos 45,6 mil leads fora do funil                  | Onda A                   |
| D7  | Custo de um projeto Supabase de staging                               | Onda D                   |
| D8  | Orçamento de IA por papel (teto mensal)                               | Onda 0 item 0.6 e Onda E |

---

## Estrutura deste estudo

| Arquivo                     | Conteúdo                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `00-sumario-executivo.md`   | Este arquivo                                                                               |
| `01-diagnostico-4-eixos.md` | Estado atual × gap em Gestão, Desenvolvimento, Controle e Operação, com fonte de cada item |
| `02-roadmap-ondas.md`       | O roadmap: 5 ondas + trilha contínua, dependências, esforço, risco, KPI                    |
| `03-metricas.md`            | M1–M5 (mantidas) + 9 métricas novas por eixo, com baseline e forma de medição              |
| `04-decisoes.md`            | As 8 decisões do dono, com opções, recomendação e o que destravam                          |
| `05-o-que-nao-fazer.md`     | Lista explícita de não-fazer — herdada da auditoria vigente e ampliada                     |
