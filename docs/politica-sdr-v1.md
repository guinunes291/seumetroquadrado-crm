# Política do SDR (pré-venda) v1

Aprovada em 04/09/2026 pelo Guilherme (gestão SMQ) em 24 decisões respondidas
uma a uma, depois do mapeamento completo do CRM (papéis, RLS, máquina de
estados do funil, motor de distribuição v3/v2). Implementada nas migrations
`20260904100000_sdr_papel_enum.sql`, `20260904101000_sdr_fundacao.sql` e
`20260904102000_sdr_motor.sql` (+ `20260904110000_sdr_prioridade_exige_corretor.sql`),
atrás da flag `distribuicao_settings.sdr_ativo` (nasce desligada).

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
   e tem prioridade** na entrega — desde que ele **tenha o papel corretor hoje**
   (migration `20260904110000`): quem virou SDR vindo de corretor continua sendo
   `corretor_id` da carteira antiga e, nesse caso, a visita vai pela roleta
   (`prioridade_recusa = corretor_sem_papel` no contexto do log).
   **Carteira antiga do SDR.** Os leads em que o SDR ainda é `corretor_id`
   (agendados e base de quando era corretor) não entram na base de pré-venda:
   continuam sendo controlados em **Prospecção** (Modo Foco) e **Gestão de
   Carteira** (Base de leads) — os dois cards voltaram a aparecer para o papel
   `sdr` em 04/09/2026 só com essas seções; em 11/09/2026 a Base de leads mudou
   de módulo (regra dos 2 menus, `docs/redesign/modulos-2-menus-2026-09.md`) sem
   ampliar o que o SDR vê. A aba Agenda do hub também lista as visitas legadas no
   nome do SDR.
4. **Funil reutilizado.** Etapas do SDR = as do funil: sem contato
   (aguardando atendimento) → em conversa → aguardando retorno → **qualificado**
   → agendado. **Qualificado exige** renda, tipo de renda, quem decide **e** o
   checkbox "interesse confirmado" (trigger no banco, mensagem clara na UI).
5. **Documentos.** Regra da pasta mantida: 3 documentos recebidos carimbam a
   pasta e movem o lead para Análise de crédito mesmo na base do SDR.
6. **Entrega.** Dois gatilhos: **agendar visita** (roleta ANTES do agendamento,
   agendamento nasce no nome do corretor) ou **entrega manual com motivo**
   (lead cai em Qualificação Corretor). Corretor original ativo e com agenda
   livre recebe **direto, sem roleta**. **Por qualquer caminho** (migration
   `20260904130000`): o trigger `trg_sdr_visita_roleta` em `agendamentos` faz
   toda visita futura em lead de SDR não entregue — ou no nome de um SDR
   (carteira antiga) — passar pela roleta; a visita já nasce no nome do
   corretor vencedor e as confirmações D-1/D-0 ficam com o SDR. Cadastro pelo
   SDR que bate em lead existente (dedup por telefone) sem SDR, em etapa viva
   e sem corretor / do próprio SDR / parado entra na base de pré-venda
   (`criar_lead_dedup` devolve `sdr_pegou`). O SDR também traz lead da própria
   carteira antiga com **Pegar**, sem precisar estar parado.
7. **Roleta nova `agendados-sdr`** com aptidão própria: participante ativo e
   não pausado, perfil ativo, telefone, teto de carteira **próprio**
   (`sdr_teto_leads_ativos`, nasce 0 = sem teto; migration `20260904120000`) e
   **agenda livre no horário** — sem presença do dia, sem cota diária, sem
   percentual trabalhado. O `disjuntor_wip` global (30) não vale aqui: a roleta
   comum v3 nunca o aplicou e a equipe inteira carrega mais de 30 leads ativos,
   o que deixava a fila do SDR toda inapta em 04/09/2026. Rodízio há-mais-tempo-sem-receber; quem já tentou o
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
11. **Avisos ao corretor.** Um WhatsApp por entrega, disparado **pelo banco**
    depois que a visita existe (`_sdr_notificar_corretor` → pg_net → Edge
    Function `notify-lead-transfer` com um **token de uso único** de
    `sdr_avisos_corretor` — nenhuma chave no banco, o Lovable Cloud não a
    expõe): data e hora da visita, **endereço** (obrigatório), renda, tipo
    de renda, FGTS, resumo do cliente e nome do SDR — nunca o telefone do
    cliente. Vale para o card do hub, o modal comum da ficha, a página Agenda,
    o n8n e o reparo. O dossiê do Marcão (webhook `copiloto/handoff`) **não**
    roda na entrega do SDR. Push no CRM continua. Sem mensagem automática ao
    cliente.
12. **Métricas e comissão.** Raio-X do SDR (contatos, qualificados,
    agendamentos, comparecimento, entregues, devolvidos, vendas) contra metas
    em `distribuicao_settings`; fatia de comissão do SDR
    (`sdr_comissao_percentual`, nasce 0) gerada na aprovação da venda como
    `comissoes.tipo = 'sdr'`.
13. **Rollout.** Flag + piloto com um SDR. Migração de perdidos e estoque para
    a base do SDR só acontece com a flag ligada (crons), nunca no deploy.

## 2. Chaves de configuração (`distribuicao_settings`)

| Chave                          | Default  | O que faz                                                                                        |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `sdr_ativo`                    | false    | Liga o modelo inteiro. Rollback = false.                                                         |
| `sdr_reaquecer_dias`           | 7        | Dias sem registro para o lead de corretor entrar no Reaquecer.                                   |
| `sdr_devolucao_dias`           | 7        | Dias sem registro do corretor até o lead voltar ao SDR.                                          |
| `sdr_perdidos_dias`            | 30       | Dias após a perda para reciclar o perdido na base do SDR.                                        |
| `sdr_comissao_percentual`      | 0        | % do VGV para o SDR na aprovação da venda (0 = sem linha).                                       |
| `sdr_meta_contatos_dia`        | 40       | Meta do Raio-X.                                                                                  |
| `sdr_meta_agendamentos_semana` | 8        | Meta do Raio-X.                                                                                  |
| `sdr_meta_comparecimento_pct`  | 60       | Meta do Raio-X.                                                                                  |
| `sdr_teto_leads_ativos`        | 0        | Teto de leads ativos por corretor na roleta do SDR (0 = sem teto).                               |
| `sdr_aviso_corretor_url`       | URL prod | Edge Function do WhatsApp de entrega ao corretor (vazio = não avisa); o banco manda só um token. |
| `sdr_origem_recente_dias`      | 7        | Dias de contato do corretor para o lead que o SDR puxou voltar a ele no agendamento (§7).        |

Todas editáveis na Central de Distribuição → Política ("Outras chaves").

## 3. Peças no repositório

| Peça                                                            | Onde                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Enum `app_role` + 'sdr'                                         | `supabase/migrations/20260904100000_sdr_papel_enum.sql`                |
| Colunas, `lead_acessos`, settings, roleta, RLS                  | `supabase/migrations/20260904101000_sdr_fundacao.sql`                  |
| Motor: entrega, espelho, devolução, crons, comissão             | `supabase/migrations/20260904102000_sdr_motor.sql`                     |
| Prioridade do dono original exige papel corretor                | `supabase/migrations/20260904110000_sdr_prioridade_exige_corretor.sql` |
| Teto de leads ativos próprio da roleta do SDR                   | `supabase/migrations/20260904120000_sdr_teto_proprio.sql`              |
| Visita por qualquer caminho passa pela roleta; dedup            | `supabase/migrations/20260904130000_sdr_visita_roleta.sql`             |
| Aviso ao corretor pelo banco, Marcão fora, endereço obrigatório | `supabase/migrations/20260904140000_sdr_aviso_corretor.sql`            |
| Passagem do discador, corretor de origem, confirmação, painel   | `supabase/migrations/20261014120000_sdr_passagem_discador.sql` (§7)    |
| Suíte de banco                                                  | `tests/db/sdr.test.ts` (29 casos, ponta a ponta)                       |
| Regras puras + testes                                           | `src/lib/sdr.ts`, `tests/sdr.test.ts`                                  |
| Fronteira do cliente (RPCs/tabelas novas)                       | `src/features/sdr/client.ts`                                           |
| Relatório semanal do SDR (folha do sábado)                      | `docs/relatorio-semanal-sdr.md`                                        |
| Hub `/sdr`                                                      | `src/routes/_authenticated/sdr.tsx`, `src/features/sdr/sdr-page.tsx`   |
| Ações na ficha do lead                                          | `src/features/sdr/sdr-lead-card.tsx`, `espelho-lead-card.tsx`          |
| Navegação (hub, cor, bottom-nav, redirect da Hoje)              | `src/features/nav/sistemas.ts`, `cores-modulo.ts`, `styles.css`        |
| Convite / papel                                                 | `crm-invite-dialog.tsx`, `corretores-page.tsx`, `crm-convites`         |
| Importação para a base do SDR                                   | `import-leads-dialog.tsx`, `leads-import.functions.ts`                 |
| WhatsApp ao corretor (contexto sdr)                             | `supabase/functions/notify-lead-transfer/index.ts`                     |

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
| `sdr_reentregar_visitas_pendentes()`                | admin / SDR (SQL)                       | Reparo: visitas que ficaram no nome de um SDR vão à roleta  |
| `sdr_raio_x(sdr, de, ate)`                          | SDR / gestão                            | KPIs + metas                                                |
| `sdr_passar_cliente(payload)`                       | SDR (passagem do discador)              | Dedup + qualificação obrigatória + visita, numa transação   |
| `sdr_registrar_confirmacao(visita, resultado, ...)` | SDR dono / admin                        | Confirmou, remarcar (novo horário) ou não atendeu           |
| `sdr_painel(sdr)`                                   | SDR / admin                             | Colunas depois da passagem + contagem de aptos da roleta    |
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
- Publicar a Edge Function `notify-lead-transfer` (`verify_jwt = false`; ela
  autentica sozinha: token de uso único ou JWT do usuário). Enquanto a versão
  nova não estiver no ar, o token é emitido, o POST sai e a função antiga
  responde 401 — confira em `lead_eventos` (`sdr_aviso_corretor`) e na
  tabela `sdr_avisos_corretor` (`consumido_em` preenchido = função nova
  recebeu).
- Montar o time da roleta `agendados-sdr` na Central de Distribuição → Filas → SDR.
  Desde 05/10/2026 o time passa a ser **semanal e por produção** (3 pontos na
  semana: visita realizada 1, pasta 1,5), com apuração no sábado 08:00 e aviso
  na quarta 18:00 — regra, rollout e rollback em
  [`docs/politica-roleta-sdr-semanal.md`](./politica-roleta-sdr-semanal.md).
- 3C Plus: estudar a integração de discador para o SDR (sem documentação da API
  ainda). Até lá, ligação e WhatsApp pela ficha do lead.
- A suíte `tests/db/dedup-leads.test.ts` já falhava antes desta entrega por causa
  do índice global `leads_telefone_unico_ativo_uidx` (migration 20260902151250) —
  não é efeito do SDR.

## 7. Decisões de 10/10/2026: a passagem do discador

O dono descreveu o dia real do SDR: **ele fica praticamente o dia inteiro no
discador fazendo as bases; no CRM só cria ou puxa o lead quando há agendamento
ou recolha de documentação**. As bases do discador são praticamente as do
CRM. O CRM deixou de ser onde o SDR trabalha a base e passou a ser onde ele
passa o cliente adiante. Migration `20261014120000_sdr_passagem_discador.sql`
(espelho `0075`), testes em `tests/db/sdr-passagem.test.ts` e
`tests/pre-venda-lancamento.test.tsx`.
Em produção desde 10/10/2026: aplicada à mão no banco da Lovable e ainda sem
registro no drizzle, que espera a `0074` (ver `docs/ops/presenca-filiais.md`
§6).

1. **Passagem em uma chamada** (`sdr_passar_cliente`, botão "Passar cliente
   do discador"). Cadastro com dedup (cria na base do SDR ou puxa o
   existente), qualificação e visita numa transação. **Obrigatórios**
   (decisão "a"): renda, tipo de renda, FGTS, quem decide e restrição no CPF;
   na visita, também zona, endereço e data. Faltou campo: `SMQP1` com a lista
   e nada gravado. Sem corretor apto: nada gravado, nem o cadastro. Cliente
   com corretor de "agendado" em diante: `SMQP2` (quem move é a gestão).
   Cliente já passado: `SMQP3`. O "Agendar visita" da ficha abre a mesma
   passagem. Antes disto o agendamento só exigia data, endereço e zona, e
   nenhuma tela gravava tipo de renda nem quem decide.
2. **Só documentação**: o mesmo cadastro, sem visita. O lead fica na base do
   SDR (em atendimento, sem corretor) e a **gestão acompanha com o SDR até o
   agendamento** (resposta do dono). Aparece no painel em "Sem visita marcada".
3. **Restrição no CPF** (`leads.restricao_cpf`: sim, não, não sabe):
   obrigatória na passagem, mas **não bloqueia** o agendamento — o corretor
   fica sabendo antes da visita: a linha "🪪 CPF" entra no WhatsApp de
   entrega (`notify-lead-transfer`, que precisa ser publicada de novo; até lá
   a mensagem sai sem a linha).
4. **Corretor de origem** (decisão "b": "nunca bloquear, porém se o lead teve
   interação recente com corretor e foi reativado com SDR, o lead deve voltar
   ao corretor de origem caso haja agendamento"). O SDR puxa sem bloqueio;
   se o corretor dono teve contato com o cliente (ligação, WhatsApp, e-mail,
   SMS, visita ou reunião) nos últimos `sdr_origem_recente_dias` (7), ele fica
   em `leads.sdr_corretor_origem_id` e **recebe a visita de volta**, mesmo
   fora da roleta, com as guardas da prioridade do corretor original: conta
   ativa, papel corretor, região do cliente e agenda livre no horário —
   falhando uma, roleta (o motivo fica no log: `prioridade_recusa`). Regra no
   log: `sdr_retorno_corretor_origem`. Vale também para a entrega manual com
   motivo (mesmo motor). A marca é usada uma vez: numa devolução posterior o
   lead segue a régua normal. O SDR não escreve a coluna (guarda de posse).
5. **Confirmação com resultado** (`sdr_registrar_confirmacao`): Confirmou (a
   visita fica "confirmado"), Pediu para remarcar (novo horário com o mesmo
   corretor, recusado se ele tem compromisso; D-1/D-0 novas para o SDR) e Não
   atendeu. Remarcar e não atendeu avisam o corretor (sino e push).
6. **Painel** (`sdr_painel`, a porta do hub): A confirmar → Confirmada →
   Realizada → Pasta → Venda (as três últimas na semana da folha, sábado a
   sexta), Reagendar (no-show dos últimos 14 dias sem visita nova), Sem visita
   marcada, o último lead entregue e a **roleta só em número**: a contagem de
   aptos sai do banco, os nomes não (a vez depende da agenda no horário e de
   quem já tentou; o placar da roleta já mostra a cada corretor só a própria
   linha).
7. **Raio-X**: "Contatos hoje" sai para o SDR (ele liga do discador; o CRM
   mostraria zero). O admin segue vendo, com a ressalva. O próximo passo é
   ligar o agente do SDR no 3C Plus ao webhook que já grava as chamadas — antes
   disso, conferir o caminho em que a tabulação muda a etapa e dá posse, feito
   para o corretor.
