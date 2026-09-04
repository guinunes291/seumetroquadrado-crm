# Política do SDR (pré-venda) v1

Aprovada em 04/09/2026 pelo Guilherme (gestão SMQ) em 24 decisões respondidas
uma a uma, depois do mapeamento completo do CRM (papéis, RLS, máquina de
estados do funil, motor de distribuição v3/v2). Implementada nas migrations
`20260904100000_sdr_papel_enum.sql`, `20260904101000_sdr_fundacao.sql` e
`20260904102000_sdr_motor.sql`, atrás da flag `distribuicao_settings.sdr_ativo`
(nasce desligada).

## 1. A regra em 1 página

1. **Papel novo `sdr`, exclusivo.** SDR nunca acumula com corretor e, por isso,
   nunca é apto em roleta alguma (a elegibilidade exige o papel corretor). Só o
   **admin** gerencia SDRs: convida, vê o hub de qualquer SDR, aloca espelhos.
2. **Carteira própria.** `leads.sdr_id` é o dono de pré-venda. A base entra por
   **importação** (planilha), **estoque sem dono**, **devolvidos por posse** e
   **perdidos reciclados** (30 dias após a perda; nunca "já possui imóvel",
   "comprou concorrente", "sem perfil" ou opt-out). Vários SDRs: rodízio simples.
   Lead **quente** de campanha continua indo direto ao corretor pela roleta de
   zona — a política v1 de distribuição não muda.
3. **Reaquecer lead parado de corretor.** Lead de corretor **sem registro há 7
   dias**, abaixo de Análise de crédito e sem visita futura aparece na aba
   Reaquecer. Ao pegar, o SDR vira dono de pré-venda; **o corretor mantém a posse
   e tem prioridade** na entrega.
4. **Funil reutilizado.** Etapas do SDR = as do funil: sem contato
   (aguardando atendimento) → em conversa → aguardando retorno → **qualificado**
   → agendado. **Qualificado exige** renda, tipo de renda, quem decide **e** o
   checkbox "interesse confirmado" (trigger no banco, mensagem clara na UI).
5. **Documentos.** Regra da pasta mantida: 3 documentos recebidos carimbam a
   pasta e movem o lead para Análise de crédito mesmo na base do SDR.
6. **Entrega.** Dois gatilhos: **agendar visita** (roleta ANTES do agendamento,
   agendamento nasce no nome do corretor) ou **entrega manual com motivo**
   (lead cai em Qualificação Corretor). Corretor original ativo e com agenda
   livre recebe **direto, sem roleta**.
7. **Roleta nova `agendados-sdr`** com aptidão própria: participante ativo e
   não pausado, perfil ativo, telefone, teto de carteira (`disjuntor_wip`) e
   **agenda livre no horário** — sem presença do dia, sem cota diária, sem
   percentual trabalhado. Rodízio há-mais-tempo-sem-receber; quem já tentou o
   lead é pulado se sobrar alguém.
8. **Espelho = mesmo registro.** Nada de cópia. Depois da entrega o SDR
   continua vendo e editando (`sdr_id`) e o corretor é o dono comercial
   (`corretor_id`). O admin pode **adicionar** um corretor extra
   (`lead_acessos`) ou **substituir** o dono — sempre com motivo, logado.
9. **Quem atende.** O SDR confirma a visita (tarefas D-1 e D-0 ficam com ele);
   o corretor atende da visita em diante.
10. **Devolução ao SDR.** No-show (trigger na validação da visita) ou corretor
    sem registro há 7 dias (cron): corretor perde o lead, tarefas abertas dele
    cancelam, espelhos caem, SDR ganha tarefa de reaquecer. Admin também devolve
    na hora, com motivo.
11. **Avisos ao corretor.** Push (trigger), WhatsApp via Z-API
    (`notify-lead-transfer` com `contexto: "sdr"` — vale para qualquer origem,
    nunca leva o telefone do cliente) e handoff n8n. Sem mensagem automática ao
    cliente.
12. **Métricas e comissão.** Raio-X do SDR (contatos, qualificados,
    agendamentos, comparecimento, entregues, devolvidos, vendas) contra metas
    em `distribuicao_settings`; fatia de comissão do SDR
    (`sdr_comissao_percentual`, nasce 0) gerada na aprovação da venda como
    `comissoes.tipo = 'sdr'`.
13. **Rollout.** Flag + piloto com um SDR. Migração de perdidos e estoque para
    a base do SDR só acontece com a flag ligada (crons), nunca no deploy.

## 2. Chaves de configuração (`distribuicao_settings`)

| Chave                          | Default | O que faz                                                      |
| ------------------------------ | ------- | -------------------------------------------------------------- |
| `sdr_ativo`                    | false   | Liga o modelo inteiro. Rollback = false.                       |
| `sdr_reaquecer_dias`           | 7       | Dias sem registro para o lead de corretor entrar no Reaquecer. |
| `sdr_devolucao_dias`           | 7       | Dias sem registro do corretor até o lead voltar ao SDR.        |
| `sdr_perdidos_dias`            | 30      | Dias após a perda para reciclar o perdido na base do SDR.      |
| `sdr_comissao_percentual`      | 0       | % do VGV para o SDR na aprovação da venda (0 = sem linha).     |
| `sdr_meta_contatos_dia`        | 40      | Meta do Raio-X.                                                |
| `sdr_meta_agendamentos_semana` | 8       | Meta do Raio-X.                                                |
| `sdr_meta_comparecimento_pct`  | 60      | Meta do Raio-X.                                                |

Todas editáveis na Central de Distribuição → Política ("Outras chaves").

## 3. Peças no repositório

| Peça                                                | Onde                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| Enum `app_role` + 'sdr'                             | `supabase/migrations/20260904100000_sdr_papel_enum.sql`              |
| Colunas, `lead_acessos`, settings, roleta, RLS      | `supabase/migrations/20260904101000_sdr_fundacao.sql`                |
| Motor: entrega, espelho, devolução, crons, comissão | `supabase/migrations/20260904102000_sdr_motor.sql`                   |
| Suíte de banco                                      | `tests/db/sdr.test.ts` (21 casos, ponta a ponta)                     |
| Regras puras + testes                               | `src/lib/sdr.ts`, `tests/sdr.test.ts`                                |
| Fronteira do cliente (RPCs/tabelas novas)           | `src/features/sdr/client.ts`                                         |
| Hub `/sdr`                                          | `src/routes/_authenticated/sdr.tsx`, `src/features/sdr/sdr-page.tsx` |
| Ações na ficha do lead                              | `src/features/sdr/sdr-lead-card.tsx`, `espelho-lead-card.tsx`        |
| Navegação (hub, cor, bottom-nav, redirect da Hoje)  | `src/features/nav/sistemas.ts`, `cores-modulo.ts`, `styles.css`      |
| Convite / papel                                     | `crm-invite-dialog.tsx`, `corretores-page.tsx`, `crm-convites`       |
| Importação para a base do SDR                       | `import-leads-dialog.tsx`, `leads-import.functions.ts`               |
| WhatsApp ao corretor (contexto sdr)                 | `supabase/functions/notify-lead-transfer/index.ts`                   |

## 4. RPCs e crons

| Função                                              | Quem chama                              | O que faz                                                   |
| --------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| `agendar_visita_sdr(...)`                           | SDR dono (UI)                           | Roleta → agendamento no corretor → etapa agendado → tarefas |
| `entregar_lead_sdr(lead, motivo)`                   | SDR dono (UI)                           | Roleta → Qualificação Corretor                              |
| `sdr_leads_reaquecer(limit)`                        | SDR (UI)                                | Lista leads parados de corretor                             |
| `sdr_pegar_lead(lead)`                              | SDR (UI)                                | Vira dono de pré-venda; corretor mantém a posse             |
| `alocar_espelho_lead(lead, corretor, modo, motivo)` | admin (UI)                              | adicionar / substituir                                      |
| `remover_espelho_lead(lead, corretor, motivo)`      | admin (UI)                              | Remove espelho extra                                        |
| `devolver_lead_ao_sdr(lead, motivo)`                | admin (UI)                              | Devolução manual                                            |
| `sdr_raio_x(sdr, de, ate)`                          | SDR / gestão                            | KPIs + metas                                                |
| `devolver_leads_sdr_parados()`                      | cron `sdr-devolver-parados` 09:30 BRT   | Devolução por 7 dias sem registro                           |
| `alimentar_base_sdr_perdidos()`                     | cron `sdr-alimentar-perdidos` 08:00 BRT | Perdidos reciclados                                         |
| `distribuir_estoque_roleta` (redefinida)            | cron `distribuir-estoque-plantao`       | Com a flag ligada delega a `distribuir_estoque_sdr`         |
| `devolver_leads_posse_expirada` (redefinida)        | cron `posse-expirada-diaria`            | Com a flag ligada o devolvido ganha SDR (rodízio)           |
| `processar_distribuicao_automatica` (redefinida)    | cron `distribuicao-auto`                | Nunca rouba lead com `sdr_id`                               |

## 5. Guardas no banco

- `trg_sdr_guarda_posse`: SDR cria lead sempre na própria base; nunca altera
  `corretor_id` / `sdr_id` / `sdr_entregue_em` por UPDATE direto (42501).
- `trg_sdr_guarda_qualificado`: qualificado exige interesse confirmado + renda +
  tipo de renda + decisor quando é o SDR agindo em lead não entregue.
- `pode_acessar_lead` / policies: + dono de pré-venda, + espelho extra, +
  reaquecível (só para o papel sdr, com a flag ligada).
- `pode_atribuir_lead`: SDR passa no WITH CHECK das linhas que acessa (a posse
  fica com o trigger acima).

## 6. Pendências fora do código (donas da gestão)

- Definir `sdr_comissao_percentual` antes do piloto (nasce 0).
- Montar o time da roleta `agendados-sdr` na Central de Distribuição → Filas → SDR.
- 3C Plus: estudar a integração de discador para o SDR (sem documentação da API
  ainda). Até lá, ligação e WhatsApp pela ficha do lead.
- A suíte `tests/db/dedup-leads.test.ts` já falhava antes desta entrega por causa
  do índice global `leads_telefone_unico_ativo_uidx` (migration 20260902151250) —
  não é efeito do SDR.
