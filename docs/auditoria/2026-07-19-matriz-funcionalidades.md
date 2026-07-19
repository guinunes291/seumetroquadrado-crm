# Auditoria funcional — Onda 5 (2026-07-19) — Matriz de funcionalidades

Status: ✅ aprovada · ⚠️ aprovada com ressalva · 🔄 pendente de decisão/validação.
"Verificação" = onde a regra foi exercitada DE VERDADE (banco em execução, não mock).

## Funil / máquina de estados

| Funcionalidade | Regra esperada | Resultado | Verificação | Status |
|---|---|---|---|---|
| Transição de etapa (kanban, lista, dossiê, blitz) | Só via RPC `transicionar_lead`; matriz de transições válida; espelho TS = SQL | 338 pares TS×SQL sem divergência; UPDATE direto de status barrado (42501) | `tests/db/contrato-transicoes.test.ts` | ✅ |
| Saída de fechado/perdido/pós-venda | Exige papel de gestão (não só na UI) | Barrado no banco para corretor; gestor reabre (limpa motivo da perda) | idem | ✅ |
| Perda de lead | Motivo obrigatório; categoria canônica com fallback `outro`; redistribuição | Confirmado; `marcar_lead_perdido_v2` cancela follow-ups | idem + `followup-triggers` | ✅ |
| Fechamento | SÓ com venda aprovada (UPDATE e agora INSERT também) | Guard estendido ao INSERT nesta onda | `aprovar-venda` + psql | ✅ |
| Aguardando retorno | Exige follow-up FUTURO | Confirmado (passado rejeitado com mensagem clara) | `contrato-transicoes` | ✅ |
| Histórico de transições | `lead_eventos` + `lead_status_transitions` na MESMA transação; rejeição não deixa rastro | Confirmado (atômico via trigger) | idem | ✅ |

## Leads (criação/edição/dedup)

| Funcionalidade | Regra esperada | Resultado | Verificação | Status |
|---|---|---|---|---|
| Novo lead (formulário) | Dedup por telefone imune a corrida e máscara/DDI; carteira respeitada | Corrigido nesta onda: RPC `criar_lead_dedup` (lock atômico, espelha policy, não vaza carteira alheia) | `dedup-leads` + smoke psql | ✅ |
| Dedup no banco | Constraint p/ leads com E sem projeto; lixeira não bloqueia retornante | Índices corrigidos (chave right-10, lixeira fora); guardados p/ duplicatas históricas | `dedup-leads` (31 casos) | ⚠️ índice só ativa em prod após limpeza (P-11) |
| Edição de lead | Não toca status; RLS de carteira | Confirmado (UPDATE de campos ok, status barrado) | `rls-por-papel` | ✅ |
| INSERT direto malicioso | Não pode nascer fechado; não pode spoofar corretor | Guard novo de INSERT; WITH CHECK `pode_atribuir_lead` | `rls-por-papel` + psql | ✅ |
| Importação | Entra como `novo` | Confirmado por leitura de código | código | ✅ |
| Lixeira/restauração | Restaurar duplicata ativa conflita explicitamente | Comportamento novo assertado | `dedup-leads` | ✅ |
| Mesclar duplicatas | Move interações/tarefas/agendamentos, soft-deleta origem | Confirmado | `dedup-leads` | ✅ |

## Follow-ups

| Funcionalidade | Regra esperada | Resultado | Verificação | Status |
|---|---|---|---|---|
| Espelho `proximo_followup` | = tarefa aberta mais próxima; NULL em lead encerrado | Bug do "follow-up ressuscitado" corrigido | `followup-triggers` (12) | ✅ |
| Motor anti-perda (transição gera follow-up) | Dedup por (lead, tipo, janela); falha NÃO pode ser silenciosa | Telemetria + toast adicionados | `follow-up.test.ts` + código | ✅ |
| Follow-up em massa | Passa pelo dedup canônico | Corrigido (era insert direto) | código + testes unit | ✅ |
| Conclusão/reagendamento | Espelho acompanha; concluída some | Confirmado | `followup-triggers` | ✅ |
| Fechamento cancela follow-ups | Tarefas de contato canceladas; não-contato ficam abertas (semântica deliberada) mas SEM repovoar o espelho | Confirmado pós-correção | idem | ⚠️ tarefas não-contato órfãs em lead morto (deliberado, documentado) |

## Agendamentos / visitas

| Funcionalidade | Regra esperada | Resultado | Verificação | Status |
|---|---|---|---|---|
| Criar agendamento + mover etapa | Compensação: transição falhou → agendamento soft-deletado | Confirmado por leitura (bugs A2/A4 das ondas anteriores seguem fechados) | código + `agendamentos.test.ts` | ✅ |
| RLS | Escopo do lead; spoof de criado_por barrado | Confirmado | `rls-por-papel` | ✅ |
| Jornada agendado→visita | Transições válidas com dados obrigatórios | Confirmado | `jornada-lead-venda` | ✅ |
| Dedup de agendamento (sami) | (lead, data, não-cancelado) único | Confirmado por leitura da edge | código | ✅ |

## Distribuição / roleta

| Funcionalidade | Regra esperada | Resultado | Verificação | Status |
|---|---|---|---|---|
| Motor canônico v3 | Rodízio menos-recente; presença/cota; FOR UPDATE; exceções em vez de perda | Confirmado, incl. concorrência (1 corretor exato) | `distribuicao-v3` | ✅ |
| Gate de papel | Corretor comum não dispara distribuição | Confirmado (has_role admin/gestor) | idem | ✅ |
| Motor ponderado (campanha) | Não roubar lead; não duplicar log em concorrência | **Corrigido nesta onda** | idem | ✅ |
| Elegibilidade ponderado × canônico | Mesmas regras comerciais | DIVERGEM (ponderado ignora cota/% e pula aguardando) | achado | 🔄 P-4 |
| Fila de exceções | Resolver/reprocessar atribui e some | Confirmado | `distribuicao-v3` | ✅ |
| Transferência | RPC `transferir_leads` renova data_distribuicao, loga; RLS troca o acesso | Confirmado (A perde acesso, B ganha) | `jornada-lead-venda` | ✅ |

## Vendas / comissões

| Funcionalidade | Regra esperada | Resultado | Verificação | Status |
|---|---|---|---|---|
| Registrar venda | 1 venda ativa por lead (uq); pendente sem efeitos | Confirmado | `aprovar-venda` (24) | ✅ |
| Aprovar venda | Atômica: comissões + ledgers + fechamento do lead + eventos; idempotente; concorrência serializada | Confirmado | idem | ✅ |
| Imutabilidade | Venda aprovada e ledgers invioláveis p/ authenticated | Confirmado (0 linhas/erro) | idem | ✅ |
| Rejeição | Exige motivo; sem efeitos | Confirmado | idem | ✅ |
| Cancelamento | Estorno append-only | Confirmado | idem | ✅ |
| Comissão de gerente/superintendente | Beneficiário resolvível | `beneficiario_id NULL` quando hierarquia incompleta | achado | 🔄 P-2 |

## Permissões (RLS)

| Área | Regra | Resultado | Status |
|---|---|---|---|
| Leads/tarefas/agendamentos/interações/vendas/comissões | Carteira: corretor só o seu; gestor a equipe; admin/superintendente tudo | 49 casos sem divergência | ✅ |
| DELETE de leads | Só admin/superintendente | Confirmado | ✅ |
| Lead sem corretor (fila) | Invisível a gestor/corretor via SQL direto (só RPC) | Confirmado — documentado (gestor não enxerga a fila por acesso direto) | ⚠️ (deliberado) |
| `metas` | — | Leitura global; escrita de gestor sem escopo; superintendente sem escrita | 🔄 P-1 |
| API pública | Escopos por cliente, hash timing-safe, auditoria, janela legada fail-closed | Confirmado (33 testes) + rate limit distribuído novo | ✅ |

## Contagens / KPIs / dashboards

| Área | Regra | Resultado | Status |
|---|---|---|---|
| Pipeline (snapshot/contagens por etapa) | Fonte única; soma = total | Ver `tests/db/kpis-consistencia.test.ts` (resultado no doc de testes) | ver testes |
| Telas de decisão | Erro NUNCA vira zero/"tudo em dia" | AsyncBoundary/isError com retry em todas as seções | ✅ |
| Agregações client-side | Truncamento sempre sinalizado | Flags + avisos adicionados | ✅ |
| Gestão (atividade/aderência) | Agregada no servidor (RPC gestao_metricas) | Já existia; fallback sinaliza truncamento | ✅ |

## Integrações / automações

| Área | Regra | Resultado | Status |
|---|---|---|---|
| lead-intake (Facebook/Zapier) | Secret timing-safe; dedup duplo; falha de distribuição → exceções; WhatsApp sem PII | Confirmado + endurecido nesta onda | ✅ (⚠️ P-3 query string) |
| Landing webhook | Idempotency-Key, Turnstile, rate limit no banco, staging | Confirmado (ondas anteriores; contratos testados) | ✅ |
| Push | Outbox com claim atômico, retry/backoff | Confirmado (ondas anteriores) | ✅ |
| notify-lead-transfer | Posse via RLS (JWT do chamador) | Confirmado | ✅ |
| Convites (invite-only) | handle_new_user exige convite válido; papel/equipe do convite | Confirmado (fluxo real exercitado pelo harness) | ✅ |
| Z-API WhatsApp | Best-effort com alerta in-app | Sem retry próprio | ⚠️ P-7 |
| Cron jobs | Registrados (shim valida sintaxe/persistência) | 12+ jobs mapeados em cron.job no replay | ✅ |

## Jornadas ponta a ponta (nível banco)

| Jornada | Cobertura | Status |
|---|---|---|
| 1. Lead → intake → distribuição → atendimento → follow-up → agendamento → visita → análise → venda → aprovação → ledgers → contagens | `tests/db/jornada-lead-venda.test.ts` | ver doc de testes |
| 2. Lead sem resposta → tentativas → perda com categoria → follow-ups cancelados | idem | ver doc de testes |
| 3. Transferência A→B → acesso troca (RLS) → log | idem | ver doc de testes |
| 4. Falha de integração (webhook duplicado/retry) | Idempotência de landing (testes de contrato) + dedup de intake + `consumir_api_rate_limit` | ✅ |
