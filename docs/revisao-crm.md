# Revisão Completa do CRM — Seu Metro Quadrado

> Revisão de UX / Produto / Operação com foco em **reduzir cliques, parar de perder
> leads e melhorar a gestão da carteira**. O documento aterrissa no código real do
> sistema (não é UX genérico) e termina com um roadmap por fases.
>
> **Prioridades acordadas:** dia a dia do corretor · gestão & visibilidade · documentação/crédito.
> **Maiores dores:** perda de lead por falta de follow-up · cliques/tempo do corretor.

---

## 0. Já implementado nesta branch (Fase 0 + núcleo da Fase 1)

Esta branch (`claude/realestate-crm-review-bra7vp`) já entrega as correções de maior
impacto/menor risco, com testes, typecheck e build passando:

**Motor anti-perda de follow-up (núcleo da Fase 1 — ataca a DOR nº 1).**
Toda transição de etapa que captura dados agora **cria automaticamente a próxima
tarefa de follow-up** (antes, só gravava uma nota na timeline). Novo módulo puro e
testado `src/lib/follow-up.ts`:
- `agendado` → "Confirmar visita com {nome}" (WhatsApp, ~1 dia antes da visita)
- `visita_realizada` → "Pós-visita: definir próximo passo com {nome}" (+2 dias)
- `analise_credito` → "Cobrar retorno do crédito de {nome}" (+3 dias)
- transições diretas a `em_atendimento` / `aguardando_retorno` (na página do lead) → follow-up +1 dia
- **Dedup:** não duplica se já houver uma tarefa aberta igual para o lead.
- Cobertura: as 3 etapas com modal valem em **toda** a UI (lista, Kanban, Blitz, página do lead),
  pois usam os diálogos compartilhados de etapa; as transições diretas cobrem a página do lead.

**Quick wins de usabilidade (Fase 0):**
- **Resumo IA na página do lead** — o `ResumoIA` (antes só no Modo Blitz) virou componente
  compartilhado (`src/components/resumo-ia.tsx`) e agora aparece no topo da timeline do lead.
- **"+ Tarefa" inline** na aba Tarefas da página do lead — cria tarefa já vinculada ao lead,
  sem ir até a página de Tarefas (economiza ~3 cliques).
- **Telefone/e-mail editáveis** no "Editar dados" do lead (antes eram bloqueados).

**Módulo de Documentação (núcleo da Fase 3).** A tabela `documentacoes` era 100% headless; agora tem **aba Documentação** na página do lead: checklist por perfil (CLT/autônomo/empresário/aposentado + flags casado/FGTS/IR), status por documento (pendente/recebido/aprovado/reprovado), link do arquivo (Drive etc.), barra de progresso e botões **"Enviar checklist"** / **"Cobrar pendência"** via WhatsApp. Núcleo puro e testado em `src/lib/documentacao.ts`; UI em `src/components/documentacao-tab.tsx`. **Upload nativo incluído:** bucket **privado** no Supabase Storage + signed URLs (migration `20260628181500_documentacao_storage.sql`) — cada documento aceita anexo de arquivo **ou** link externo (Drive).

Arquivos: `src/lib/follow-up.ts` (+ `tests/follow-up.test.ts`), `src/components/resumo-ia.tsx`,
`src/components/lead-stage/{appointment-stage,visit-feedback,credit-analysis}-dialog.tsx`,
`src/routes/_authenticated/leads.$leadId.tsx`, `src/routes/_authenticated/blitz.tsx`.

O restante do roadmap (Fases 2–7) está descrito abaixo.

---

## Mapa técnico (base de tudo)

- **Stack:** TanStack Start (React 19, SSR) + TanStack Router (file-based) · TypeScript · Tailwind v4 + Radix/shadcn · React Query · Recharts · Supabase (Postgres + Auth + RLS + Realtime) · Lovable AI Gateway (Gemini) · web-push · webhook n8n (handoff copiloto).
- **Papéis:** `admin`, `gestor`, `corretor` (`user_roles`), RLS por `corretor_id`.
- **Navegação atual:** sidebar com 4 seções e ~28 itens (`src/components/app-sidebar.tsx`): Operação, Performance, Negócios, Gestão.
- **Enums de lead** (`src/lib/leads.ts`): status (`novo, aguardando_atendimento, aguardando_retorno, em_atendimento, qualificado, agendado, visita_realizada, proposta_enviada, analise_credito, contrato_fechado, pos_venda, perdido`); temperatura (`quente/morno/frio`); origem (facebook, site, indicacao, whatsapp, telefone, plantao, chatbot…).

---

## Entregável 1 — Diagnóstico geral

### O que já está muito bom (manter e potencializar)
- **Botão "próxima ação" inteligente** (`PROXIMA_ACAO` em `leads.ts`) — a linha já sugere o próximo passo comercial.
- **"Iniciar WhatsApp" em 1 clique** na listagem (registra interação + avança status + abre o WhatsApp).
- **Visões salvas + segmentos prontos** (Quentes, Com follow-up, Sem contato 5+ dias, Criados hoje).
- **Badge "X dias parado"** na listagem; **SLA por origem** (Facebook 5min, padrão 30min); **temperatura automática** por cron.
- **Modo Blitz** com atalhos de teclado (← → L W A) e fila priorizada por SLA.
- **Meu Dia** com 4 colunas de ação; **Distribuição roleta** + redistribuição de parados; **push** (visitas 48/24/10h, parados 5d).
- **Match IA** e **Resumo IA** já existem — a fundação de IA está pronta.

### Principais problemas (ranqueados pela dor)
- **🔴 P1 — Perda de lead por ausência de follow-up estrutural.** Nenhuma transição criava a próxima tarefa; os alertas de "parado" são reativos. *(Endereçado pelo motor anti-perda — seção 0.)*
- **🔴 P2 — Fricção de cliques / informação espalhada.** Dashboard → agir num lead = 3+ cliques; página do lead sem "próxima melhor ação" explícita; registrar contato e marcar próximo follow-up são ações separadas; empreendimento de interesse sem link no lead. *(Parcialmente endereçado: Resumo IA + "+Tarefa" + telefone/e-mail editáveis.)*
- **🟠 P3 — Documentação inexistente na UI.** A tabela `documentacoes` existe, mas **não há tela**: sem checklist por perfil (CLT/autônomo/FGTS), upload, status, "cobrar pendência" ou "enviar checklist".
- **🟠 P4 — Visão do gestor fragmentada.** Para responder "quais corretores têm leads parados?" o gestor pula por 6–8 telas. Falta painel único de saúde do corretor, leads-parados-por-corretor, compliance de SLA, aderência (preenchimento) e KPI por equipe.
- **🟡 P5 — Sprawl de navegação.** 28 itens com sobreposições (5 visões de lead; 4 superfícies de ranking; 2 telas de "o que fazer agora").
- **🟡 P6 — Empreendimento sem munição comercial.** Faltam renda mínima, diferenciais, argumentos de venda, perfil ideal; `status_preco`/`zona_smq` existem no banco mas não aparecem.
- **🟡 P7 — WhatsApp é só link manual.** Sem API (sem captura de mensagens recebidas, histórico real ou envio automatizado).

### Telas mais críticas
1. Página do lead (`leads.$leadId.tsx`) · 2. Meu Dia / Dashboard · 3. Documentação (a construir) · 4. Painel do Gestor (a construir).

---

## Entregável 2 — Revisão página por página

> Formato: **Problema · Melhorar · Ações rápidas · Automação · Impacto.**

**2.1 Dashboard (`dashboard.tsx`)** — Para o corretor é "relatório", não central de ação; funil mostra contagem sem % de conversão. Melhorar: topo vira **fila acionável** (top 5 por score, com WhatsApp/Ligar/Adiar inline); funil com % entre etapas. Impacto: alto.

**2.2 Meu Dia (`meu-painel.tsx`)** — Bom conceito; lead duplica entre "Quentes" e "SLA estourando"; linhas não mostram a próxima ação; tarefas cortam em 10. Melhorar: **fila única priorizada por score** com filtro; deduplicar; coluna "Sem próxima ação" (guardrail anti-perda). Impacto: alto.

**2.3 Listagem de Leads (`leads.index.tsx`)** — Já forte. Faltam: ordenação por **score**, chip de temperatura clicável e "+ Follow-up" rápido na linha; campo de objeção. Impacto: médio-alto.

**2.4 Página do Lead (`leads.$leadId.tsx`)** — *a mais importante.* Já recebeu Resumo IA, "+Tarefa" e telefone/e-mail editáveis (seção 0), aba **Documentação**, **empreendimento recomendado** embutido (Match), **simulador de pré-qualificação APROVE 2026** (teto de imóvel real + "esse imóvel cabe?"), **objeções em chips** (`leads.objecoes`, sugestões da biblioteca `objecoes`) e **sugestão de mensagem por IA** no WhatsApp (histórico + objeção + objetivo → rascunho editável). Próximo passo: faixa **"Próxima melhor ação"** (frase + botão) e o redesenho em 3 colunas. Meta: entender tudo em <10s. Impacto: muito alto.

**2.5 Kanban (`kanban.tsx`)** — Adicionar badge "X dias na etapa" + ⚠️ de gargalo; contagem/valor por coluna; filtros por corretor/empreendimento/origem. Impacto: médio.

**2.6 Modo Blitz (`blitz.tsx`)** — Cachear Resumo IA; tecla "pular e lembrar depois" (cria tarefa); resumo ao fim da fila. Impacto: médio.

**2.7 Tarefas (`tarefas.tsx`)** — Quick-add e snooze ótimos; falta tarefa recorrente e "motivo de não conclusão"; ao concluir, oferecer "criar próximo follow-up". Impacto: alto.

**2.8 Agendamentos (`agendamentos.tsx`)** — Falta fluxo de **confirmação** ("Confirmar com cliente" via WhatsApp), tratamento de **no-show → próxima ação** e **pós-visita automático**. Impacto: alto.

**2.9 Documentação (a construir — hoje headless)** — Aba **Documentação** no lead + tela de pendências: checklist por perfil (CLT/autônomo/informal/FGTS/IR), status por documento, upload (Storage), botões "Enviar checklist" / "Cobrar pendência" / "Encaminhar para análise"; alertas de pendência/ilegível/vencido. Impacto: alto.

**2.10 Empreendimentos (`projetos.*`)** — ✅ aba **Comercial** com renda mínima, perfil ideal, diferenciais (chips) e argumentos de venda (bullets), editável por gestor/admin (`migration 20260629140000`); `status_preco`/`zona_smq` agora aparecem na ficha. Próximo: badge de preço (vigente/a confirmar/vencido), botão "Sugerir para lead" e cruzar `renda_minima`/`perfil_ideal` no Match. Impacto: médio.

**2.11 Gestão (`distribuicao/corretores/leads-por-corretor/equipes`)** — Inteligência fragmentada. Novo **Painel do Gestor**: saúde do corretor (última atividade, funil por corretor, idade do lead mais velho, ligações/WA por dia), **leads parados por corretor** (com nome + redistribuir), **SLA compliance**, **aderência/qualidade de cadastro**, KPI por equipe. Impacto: alto.

---

## Entregável 3 — Nova arquitetura de navegação

✅ **Feito** (`app-sidebar.tsx`): sidebar reorganizada por **intenção** (Início · Trabalhar · Negócios · Desempenho · Gestão), com **subgrupos recolhíveis** para reduzir os ~28 itens de topo sem remover nenhuma rota. Visões de lead (Kanban/Blitz/Landing) viram subitens de **Leads**; Copa/Conquistas viram subitens de **Ranking & Copa**; Equipes/Leads por Corretor viram subitens de **Corretores & Equipes**; Duplicatas/Lixeira viram **Qualidade de dados**. Também corrigido o realce de rota (antes `/leads` acendia em `/leads-landing`).

```
INÍCIO     • Dashboard • Meu Dia
TRABALHAR  • Leads (▸ Kanban · Modo Blitz · Leads Landing) • Tarefas • Agenda & Visitas
NEGÓCIOS   • Empreendimentos • Match IA • Oferta Ativa • Comissões • Links Úteis • Carteira (em breve) • Scripts (em breve)
DESEMPENHO • Metas • Ranking & Copa (▸ Copa SMQ · Conquistas)
GESTÃO     • Painel do Gestor • Distribuição • Corretores & Equipes (▸ Equipes · Leads por Corretor) • Templates • Qualidade de dados (▸ Duplicatas · Lixeira) • Integrações/Config (em breve)
```

> ✅ **Fusão concluída:** `/meu-painel` virou **`/hoje`** (home — fila acionável) e `/dashboard` virou **`/relatorios`** (analytics). As rotas antigas redirecionam para não quebrar links/atalhos salvos. Pendente apenas (menor): transformar as visões de lead em *toggles internos* da página de Leads (hoje são subitens recolhíveis).

---

## Entregável 4 — Componentes essenciais

1. **Card de lead ideal** — nome · temperatura · SLA · **Score** · próxima ação (texto+botão) · dias parado · WhatsApp/Ligar inline.
2. **"Próxima melhor ação"** — faixa reutilizável (lead/linha/card); reaproveita `PROXIMA_ACAO` + SLA/temperatura.
3. **Score de prioridade (0–100)** — temperatura + SLA + dias parado + etapa + valor potencial; ordena Hoje/Leads/Blitz.
4. **Botões rápidos padronizados** — WhatsApp, Ligar, Registrar contato (resultado + próximo follow-up num gesto), + Tarefa, Mudar etapa.
5. **Checklist de documentação** por perfil, com progresso e cobrança.
6. **Centro de alertas** unificando `alertas` + push + SLA por prioridade.

---

## Entregável 5 — Redução de cliques

| Ação | Cliques hoje | Novo fluxo | Cliques ideal | Prioridade |
|---|---|---|---|---|
| Registrar ligação + resultado | 3–4 | chips de resultado na linha + próximo follow-up sugerido | 1–2 | P1 |
| WhatsApp (na pág. do lead) | 3–4 | template default por etapa, abre direto | 1–2 | P1 |
| Criar tarefa a partir do lead | 4+ | **"+ Tarefa" inline** (✅ feito) | 1–2 | ✅ |
| Enviar checklist de documentos | ∞ (não existe) | botão "Enviar checklist" | 1 | P1 |
| Registrar objeção | 3 (nota livre) | chips de objeção no cabeçalho | 1 | P2 |
| Marcar lead como quente | 3 | chip de temperatura clicável | 1 | P2 |
| Reativar cliente perdido | 3+ | botão "Reativar" no lead perdido | 1 | P3 |
| Ver histórico resumido | abrir lead (resumo só no Blitz) | **Resumo IA no lead** (✅ feito) | 0 | ✅ |
| Consultar empreendimento do lead | 3+ | card do empreendimento no lead | 0–1 | P2 |
| Garantir próximo follow-up | manual (esquecível) | **tarefa automática por etapa** (✅ feito) | 0 | ✅ |

---

## Entregável 6 — Ferramentas inteligentes (priorizadas)

**Agora:** gerador de follow-up automático (✅) · "Próxima melhor ação" · registro rápido de contato · Resumo IA no lead (✅) · Score de prioridade · checklist de documentos.
**Em breve:** sugestor de mensagem/objeção · simulador renda/parcela · Painel do Gestor · sugestor de produto (Match no lead) · pós-visita automático.
**Depois:** Central de mensagens / WhatsApp API (n8n) · biblioteca de argumentos/objeções · comparador de empreendimentos · radar de fechamento.

---

## Entregável 7 — IA dentro do CRM

Fundação pronta (Lovable AI Gateway + Match IA + Resumo IA). Expandir com governança:

| Aplicação | Onde | Dado | Ação | Aprovação humana |
|---|---|---|---|---|
| Resumo do histórico | Pág. do lead (✅) | `interacoes` | resumo + objeções | auto; pode regenerar |
| Próxima melhor ação | Lead / Hoje | status, SLA, dias parado | sugere ação + cria tarefa | corretor confirma |
| Sugestão de mensagem | Dialog WhatsApp | template + perfil + objeção | rascunho | **sempre revisão** |
| Detectar lead abandonado | Hoje / Gestor | última interação + etapa | tarefa de resgate | limite diário |
| Match de empreendimento | Pág. do lead | perfil + interesse | top 3 produtos | já existe; embutir |
| Auditoria de qualidade | Painel Gestor | campos do lead | aponta inconsistências | sem ação automática |

**Princípio:** IA sugere, humano decide; nada que fale com o cliente sai sem revisão; tudo rastreável em `interacoes`/`audit_log`.

---

## Entregável 8 — Plano de implementação por fases

| Fase | O quê | Por quê | Impacto | Dificuldade | Status |
|---|---|---|---|---|---|
| **0** | Telefone/e-mail editáveis · "+Tarefa" no lead · Resumo IA no lead | ganhos imediatos sem mudar modelo | médio-alto | baixa | ✅ feito |
| **1** | Motor anti-perda: tarefa automática por etapa + guardrail | elimina a causa raiz da perda de lead | muito alto | média | ✅ núcleo feito |
| **2** | "Próxima melhor ação" + registro rápido de contato + Score | reduzir cliques (DOR nº 2) | alto | média | ✅ Score de prioridade · guardrail "sem próxima ação" · registrar contato combinado (interação + follow-up num gesto) · Blitz ordenado por score |
| **3** | Módulo de Documentação (checklist/status/cobrança/upload) | destrava crédito/pasta | alto | média-alta | ✅ (upload via Storage — aplicar a migration) |
| **4** | Painel do Gestor (saúde/SLA/aderência/equipe) | accountability da operação | alto | média | ✅ v1 — saúde por corretor (métricas + parados), qualidade do CRM (sem corretor/e-mail/renda), leads parados por corretor |
| **5** | Página do lead reformulada + IA contextual (objeções, empreendimento, simulador) | conversão | alto | média-alta | ✅ pré-qualificação **APROVE 2026** (teto + regra 80/20) no simulador e no Match · **objeções em chips** por lead (`leads.objecoes` — aplicar migration) · **sugestão de mensagem por IA** no WhatsApp (usa histórico + biblioteca de objeções). Resta o redesenho 3-colunas e a faixa "Próxima melhor ação". |
| **6** | Empreendimento comercial + relatórios (ligações/WA/tempo de resposta) + consolidar menu | munição + clareza | médio-alto | média | ✅ **munição comercial** (aba Comercial) · **menu consolidado** (sidebar) · **relatório de atividade** + **tempo médio de 1ª resposta** por corretor no Painel do Gestor · **fusão Dashboard + Meu Dia** em `/hoje` (home) e `/relatorios` (analytics), com redirects das rotas antigas. |
| **7** | WhatsApp API / Central de mensagens (n8n) + radar de fechamento | escala de atendimento | alto | alta | a fazer |

---

## Entregável 9 — Perguntas para calibrar as próximas fases

1. **WhatsApp:** integrar API (Z-API/Meta/Evolution) via o n8n já existente?
2. **Documentação:** upload no Supabase Storage ou Google Drive? Há checklist oficial por perfil (CLT/autônomo/FGTS)?
3. **Tarefas automáticas:** confirmar os prazos por etapa (hoje: confirmar visita 1 dia antes, pós-visita +2 dias, cobrar crédito +3 dias, follow-up direto +1 dia).
4. **Score de prioridade:** pesos de temperatura, SLA, valor potencial e recência?
5. **Onde mais se perde lead** hoje: primeiro contato, pós-visita ou documentação/crédito?
6. **Gestão:** acompanhar primeiro por corretor, equipe, origem ou empreendimento?
7. **Reclamação nº 1** dos corretores sobre o CRM atual?
8. **Metas:** manter mensal ou também diária/semanal?
9. **Empreendimento:** há material de argumentos/objeções por produto para popular os novos campos?
10. **Mobile:** os corretores usam mais no celular?

---

## Arquivos-chave

- Navegação: `src/components/app-sidebar.tsx`
- Lead: `src/routes/_authenticated/leads.index.tsx`, `leads.$leadId.tsx`
- Funil/velocidade: `kanban.tsx`, `blitz.tsx`
- Ação do dia: `dashboard.tsx`, `meu-painel.tsx`, `src/features/dashboard/queries.ts`
- Tarefas/agenda: `tarefas.tsx`, `agendamentos.tsx`
- Transições: `src/components/lead-stage/*.tsx`
- Follow-up automático: `src/lib/follow-up.ts`
- Lógica de lead: `src/lib/leads.ts`, `src/lib/interacoes.ts`, `src/lib/tarefas.ts`
- IA: `src/lib/match-ia.functions.ts`, `src/lib/lead-resumo-ia.functions.ts`, `src/components/resumo-ia.tsx`
- Gestão: `distribuicao.tsx`, `corretores.tsx`, `leads-por-corretor.tsx`, `equipes.tsx`
- Documentação (DB-only): migração `20260616130200_*.sql` (tabela `documentacoes`)
