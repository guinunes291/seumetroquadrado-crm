# Auditoria de Qualidade de Dados — CRM Seu Metro Quadrado

**Data:** 2026-06-30 · **Alvo:** CRM de produção (Supabase `rldnprwjlomjmjvinxuh`, Lovable Cloud).
**Escopo:** qualidade e organização da **base de dados** (complementa as auditorias de
arquitetura/UX em [`../`](../)). Espelho `smq-operacional` (`lwebydmveyqyzfgmbqfk`) **fora de
escopo** nesta rodada.

> **Status desta rodada**
> - **FASE 1 — Mapa do schema:** ✅ concluída (abaixo), derivada de `types.ts` + 90 migrations.
> - **FASE 2 — Auditoria com números reais:** ⏳ **pendente de acesso de leitura ao banco.** As
>   consultas estão prontas em [`queries-auditoria.sql`](./queries-auditoria.sql) (100% `SELECT`).
>   Assim que o acesso do Supabase MCP for liberado (ou rodando o `.sql` no SQL Editor), preencho
>   as contagens e o relatório priorizado.
> - **FASE 4 — Migrations propostas:** serão escritas em
>   [`migrations-propostas/`](./migrations-propostas/) **como arquivos, sem aplicar no banco.**

---

## FASE 1 — Mapa de dados (1 página)

### Entidades centrais e relações

```
profiles (corretor)──< leads >──── projetos ──< unidades ──< historico_precos
   │  user_roles         │  │                       
   │  equipes ──< metas  │  └─< agendamentos ──< analises_credito
   │                     │  ├─< interacoes          
   │                     │  ├─< tarefas             
   │                     │  ├─< documentacoes       
   │                     │  ├─< lead_status_transitions / lead_eventos / distribution_log
   │                     │  ├─< copiloto_eventos (handoff agente WhatsApp)
   │                     │  └─< vendas ──< comissoes
   fila_distribuicao (roleta) · oferta_ativa* · copa_* · alertas · push_* · stg_* (import histórico)
```

- **Fonte da verdade por entidade:** lead → `leads`; corretor → `profiles` (+ papéis em
  `user_roles`); empreendimento → `projetos` (unidades em `unidades`, preços em `historico_precos`);
  venda → `vendas`; comissão → `comissoes`; agenda → `agendamentos`; histórico → `interacoes`.
- **FKs `lead_id` são enforced** (Postgres barra órfão) em `agendamentos, interacoes, tarefas,
  vendas, comissoes, documentacoes, analises_credito, distribution_log, lead_eventos,
  lead_status_transitions, copiloto_eventos, oferta_ativa_leads`.
- **Colunas SEM FK (risco de órfão real):** `leads.corretor_id`, `leads.corretor_anterior_id`,
  `vendas.corretor_id`, `comissoes.beneficiario_id`, e os `corretor_id` de `agendamentos/
  interacoes/tarefas` — todas referenciam `profiles.id` só por convenção.

### A tabela `leads` (núcleo, ~60 colunas)

| Grupo | Colunas | Observação |
|---|---|---|
| Identidade | `id`, `nome` (NOT NULL), `telefone` (NOT NULL, **texto livre**), `email`, `cpf` | **sem `UNIQUE`** em telefone; **não há `telefone_normalizado`** |
| Funil CRM | `status` (enum `lead_status`), `temperatura` (enum) | enum barra valor inválido |
| Funil agente WA | `estado` (enum `lead_estado`: EM_QUALIFICACAO…ENCERRADO_OPTOUT) | máquina paralela ao `status` |
| Texto-livre paralelo | `etapa`, `fase`, `desfecho`, `motivo_perda_categoria` | **sem domínio** → inconsistência possível |
| MCMV | `faixa_mcmv` (**texto livre**), `renda_estimada` (num), `renda_informada` (texto), `tem_fgts`, `usa_fgts`, `fgts_valor`, `tipo_renda` | faixa deveria ser F1–F4; renda dupla (num + texto) |
| Atribuição | `corretor_id`, `corretor_anterior_id`, `corretores_que_tentaram[]`, `data_distribuicao` | sem FK |
| Empreendimento | `projeto_id` (FK), `projeto_nome`, `construtora`, `visita_empreendimento` | `projeto_nome`/`construtora` **denormalizados** |
| Origem/UTM | `origem` (enum `lead_origem`), `campanha`, `utm_*` | enum |
| LGPD | `consentimento_lgpd` (bool nulo), `opt_out` (bool) | consentimento opcional hoje |
| Soft-delete | `deleted_at`, `na_lixeira`, `data_movido_lixeira` | exclusão é reversível (✓) |
| Tempo | `created_at`, `updated_at`, `ultima_interacao`, `ultimo_contato`, `proximo_followup` | base de "leads parados" |
| Dedup/busca | `legacy_id` (UNIQUE), `search_text` | único `UNIQUE` de negócio |

### Enums já existentes (domínio garantido pelo banco)

- `lead_status`: novo, aguardando_atendimento, aguardando_retorno, em_atendimento, **qualificado*,
  proposta_enviada*, pos_venda*** (legados fora do funil), agendado, visita_realizada,
  analise_credito, contrato_fechado, perdido.
- `lead_origem`: facebook, google_sheets, site, indicacao, captacao_corretor, whatsapp, telefone,
  plantao, agendamento_self_service, chatbot, importacao, outro.
- `lead_estado` (agente WA), `lead_temperatura` (quente/morno/frio), `app_role`
  (admin/gestor/corretor/superintendente), além de enums de agendamento/interação/tarefa/template/unidade.

### Achados estruturais (a quantificar na FASE 2)

1. **Telefone sem `UNIQUE` nem coluna normalizada** → dedupe só aplicacional (`buscar_lead_duplicado`).
2. **Três representações de funil** na mesma linha (`status` × `estado` × `etapa/fase`) → risco de
   divergência e de relatório ambíguo.
3. **`faixa_mcmv` e outros campos texto-livre** sem `CHECK` → inconsistência de valores.
4. **`projeto_nome`/`construtora` denormalizados** → podem ficar dessincronizados de `projetos`.
5. **Órfãos possíveis** nas colunas `corretor_*`/`beneficiario_id` sem FK.
6. **LGPD:** `consentimento_lgpd` é opcional; falta medir opt-out respeitado e PII exposta.

### Ferramentas que já existem (serão reusadas, não reinventadas)

- **RPCs:** `detectar_duplicatas_leads`, `buscar_lead_duplicado`, `mesclar_leads` (merge
  golden-record + religa FKs), `marcar_lead_perdido`, `restaurar_registro` (desarquiva).
- **Validação/normalização:** `src/lib/validators.ts`, `src/lib/external-supabase.server.ts`
  (`normalizePhoneSMQ`/`toE164`), enums em `src/lib/leads.ts`.
- **Telas:** `duplicatas.tsx`, `lixeira.tsx`.

---

## FASE 2 — Auditoria de qualidade (⏳ aguardando execução)

Consultas prontas em [`queries-auditoria.sql`](./queries-auditoria.sql), organizadas em 9 blocos:
0) volumetria · 1) duplicatas (telefone/e-mail, global e por projeto) · 2) obrigatórios vazios ·
3) status/estado inconsistentes · 4) órfãos · 5) normalização (telefone/nome/e-mail/faixa/renda/CPF) ·
6) leads parados · 7) enriquecimento determinístico · 8) LGPD · 9) saúde do schema (índices/RLS/FKs).

> Preencher a tabela abaixo com os números reais ao rodar o `.sql`.

| # | Problema | Contagem | Severidade |
|---|---|---|---|
| — | _(a preencher na execução)_ | — | — |

---

## FASE 3 — Relatório priorizado (⏳ após FASE 2)

Achados ordenados por impacto × risco, com contagem e exemplos.

## FASE 4 — Migrations propostas (⏳ arquivos, sem aplicar)

Sequência (detalhe e rollback em [`migrations-propostas/`](./migrations-propostas/) e no runbook):
`telefone_normalizado` + backfill → normalização reversível → dedupe (reusa `mesclar_leads`) →
índices → `UNIQUE` parcial `(projeto_id, telefone_normalizado)` → constraints de domínio
(`CHECK faixa_mcmv`, `NOT NULL`). Tudo **depois** de limpar, para não travar a migration.
