# Auditoria Forense — CRM Seu Metro Quadrado · Relatório Executivo

**Data:** 2026-06-24 · **Escopo:** auditoria forense completa (arquitetura, código, dados,
UX, segurança, performance, automação, produto) com foco em preparar a plataforma para
**1.000 corretores, milhões de leads e dezenas de milhares de vendas/ano**.

> Relatório técnico detalhado (com localização de cada achado, causa, impacto, severidade,
> solução ideal/rápida e esforço): [`relatorio-tecnico.md`](./relatorio-tecnico.md).
> Plano de execução: [`roadmap.md`](./roadmap.md).

---

## 1. Veredito geral

O CRM é **funcional e surpreendentemente completo** para o estágio (TanStack Start/React 19 +
Supabase; ~32k linhas, 90 migrations, ~30 telas, distribuição automática, gamificação, push,
IA de match). A engenharia tem boas práticas presentes em pontos críticos — distribuição de
leads com `FOR UPDATE SKIP LOCKED`, autenticação de API com comparação *timing-safe*, RLS
habilitado na maioria das tabelas, soft-delete e auditoria de distribuição.

**Porém, não está pronto para escalar para 1.000 corretores sem corrigir um conjunto pequeno,
mas grave, de riscos** — sobretudo de **vazamento de dados (LGPD)**, **duplicação de leads** e
**confiabilidade operacional (falhas silenciosas e reprodutibilidade do banco)**. Nenhum deles
é um reescrever-tudo; são correções cirúrgicas de alto retorno.

Um ponto importante de honestidade: a varredura automática inicial levantou vários "P0" que,
ao serem verificados no código atual, se revelaram **falsos positivos ou já corrigidos**. Eles
estão documentados como tal no relatório técnico (seção "Falsos positivos") para não desperdiçar
esforço de engenharia. Auditoria séria também é separar o ruído do sinal.

---

## 2. Top 10 riscos (priorizados por impacto × probabilidade)

| # | Risco | Severidade | Tipo |
|---|-------|-----------|------|
| 1 | **API pública vaza PII de todos os leads** (CPF, renda, telefone, e-mail) com 1 chave estática, sem escopo por projeto e sem rate limit | P0 | Segurança / LGPD |
| 2 | **Leads duplicados** no intake do Facebook/Zapier: sem idempotência → retries criam leads repetidos, inflando métricas, cota e comissão | P0 | Dados / Financeiro |
| 3 | **Falha silenciosa de notificação**: lead distribuído mas corretor nunca avisado (intake retorna `ok:true` mesmo com WhatsApp falhando) | P0 | Operacional / Perda de venda |
| 4 | **Migrations não reproduzíveis** (`CREATE TABLE comissoes` duplicado): `db reset` falha → recuperação de desastre e ambientes novos quebrados | P0 | DevOps / DR |
| 5 | **Sem CI/CD nem testes de integração**: deploys sem rede de segurança; só testes unitários de `src/lib` | P1 | Qualidade / Escala |
| 6 | **Custo de IA sem teto**: o match por IA envia até 200 empreendimentos ao LLM por chamada, sem cache nem limite por usuário | P1 | Financeiro |
| 7 | **push-dispatch autenticado por chave pública** (anon key), sem rate limit (raio de dano limitado) | P1 | Segurança |
| 8 | **Guard de autenticação só no cliente** (`ssr:false`): RLS protege os dados, mas a UI é acessível com token forjado (info-disclosure) | P2 | Segurança |
| 9 | **Custo crescente de queries client-side** (agregações de ranking/dashboard no navegador) à medida que o volume de leads cresce | P1 | Performance / Escala |
| 10 | **Lacunas de produto para operação imobiliária**: WhatsApp é só link `wa.me`; comissões/contratos/propostas/pré-análise ainda incompletos | P1 | Produto |

---

## 3. O que já foi corrigido nesta auditoria (entregue no código)

Implementamos as correções **P0 verificadas e seguras** (sem necessidade de replay de banco):

1. **API pública sem PII** — os endpoints `/api/public/leads` e `/api/public/leads/:id` deixaram
   de retornar `cpf, renda_informada, entrada_disponivel, observacoes`. Adicionado **rate limit**
   por chave/IP (60 req/min, configurável).
2. **Intake idempotente** — `lead-intake` agora deduplica por telefone+projeto (reusando a mesma
   RPC do webhook), normaliza o telefone e devolve o lead existente em vez de duplicar.
3. **Fim da falha silenciosa** — se a notificação WhatsApp do corretor falhar, é criado um
   **alerta in-app** para que o lead não fique órfão.
4. **Registro de WhatsApp confiável** — a interação passa a ser gravada **antes** de abrir o
   WhatsApp, evitando histórico perdido em falha de rede.

Cobertura de testes adicionada (allowlist de campos da API, rate limit, contrato de dedup).

---

## 4. O que ainda precisa de decisão/infra (não auto-aplicado)

Itens P0/P1 que exigem validação com banco ou mudança de infraestrutura e foram **documentados
com solução proposta** no relatório técnico, para execução acompanhada:

- Tornar as migrations reproduzíveis (consolidar o `comissoes` duplicado; validar com `db reset`).
- Endurecer RLS por projeto na redistribuição de leads.
- Mover o guard de autenticação para o servidor.
- CI/CD com lint + testes + *secret scanning*; tirar `.env` do versionamento.
- Teto/cache para o custo de IA.

---

## 5. Resumo do roadmap

- **30 dias (Estancar o sangramento):** fechar os P0 restantes (migrations, RLS por projeto,
  CI/CD básico), teto de IA, índices compostos faltantes.
- **90 dias (Confiabilidade & escala):** mover agregações pesadas para o servidor/views,
  auditoria de mutações sensíveis, WhatsApp oficial (gateway), testes de integração.
- **6 meses (Produto):** comissões/contratos/propostas completos, pré-análise MCMV, carteira
  ativa, agendamento público.
- **12 meses (Diferenciação):** IA de priorização/score de lead e corretor, BI, app mobile,
  multi-tenant para escalar a operação.

Detalhamento completo em [`roadmap.md`](./roadmap.md).
