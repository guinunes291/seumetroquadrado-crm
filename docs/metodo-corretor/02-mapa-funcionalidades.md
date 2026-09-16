# DOCUMENTO 2 — Mapa de todas as funcionalidades

Inventário completo do CRM SMQ em 16/09/2026. Para cada funcionalidade: **para que
existe · quando usar · o que registrar · erro comum · indicador afetado · próxima ação
automática**.

Papéis usados abaixo: `corretor`, `sdr`, `gestor`, `admin`, `superintendente`.
`OPERACAO` = corretor + gestão.

---

## Módulo 1 — CENTRAL DE COMANDO (`/fila`) ⭐ a porta de entrada

> *"Uma lista só, na ordem em que o dinheiro está em risco."*

### 1.1 Fila Única — `/fila`

| Campo | Conteúdo |
| --- | --- |
| **Para que existe** | Responder "o que eu faço agora?" sem o corretor precisar escolher. |
| **Problema comercial** | Paralisia por excesso de opção — 48 mil leads na base e nenhuma ordem. |
| **Quando usar** | É a primeira tela do dia e a tela de retorno entre cada atendimento. |
| **Frequência** | Contínua. O corretor **vive** nela. |
| **O que registrar** | O desfecho de cada card (§1.2). |
| **Erro mais comum** | Abrir a Base de leads e escolher cliente pelo nome. Isso descarta o motor de priorização inteiro. |
| **Como aumenta venda** | Garante que o fundo do funil (39,1% de conversão) seja tocado antes de lead frio. |
| **Depende de** | `atendimento_inbox_v4`, `followup_fila_v1`, `leads_sem_acao`, `fila_funil_v1`. |
| **Indicadores afetados** | Todos. É a fonte do dia. |
| **Próxima ação automática** | Sim — cada desfecho cria a próxima tarefa com data. |

**Composição da tela:** placar (anel "N de 65", vencidos, vencem hoje, sem próximo
passo, dinheiro em jogo) · funil das 8 etapas com conversão atual → meta · 7 grupos de
cards · painel de vazamentos (3 etapas com mais parados) · coluna lateral com agenda do
dia · tabela de equipe (para gestão).

**Ordem dos baldes e a regra de dedup** — um lead entra em **um** balde, o mais urgente:

| Ordem | Balde | Critério de entrada | Ordem interna |
| :---: | --- | --- | --- |
| 1 | `fundo` | status ∈ {agendado, visita_realizada, proposta_enviada, analise_credito} | mais dias sem movimento primeiro (sem data = mais negligenciado) |
| 2 | `sla` | status ∈ {novo, aguardando_atendimento} | quem chegou primeiro |
| 3 | `responder` | última interação é de **entrada** | Score |
| 4 | `followup` | toque da régua vencido ou de hoje | mais vencido → prazo mais cedo → chegou antes |
| 5 | `sem_acao` | sem tarefa, sem agendamento futuro, sem follow-up aberto | Score |
| 6 | `esfriando` | quente/morno sem contato há 3+ dias | Score |
| 7 | `docs` | documento pendente/reprovado, fora do fundo | Score |

**Teto:** 65 cards (`TETO_PADRAO`, espelho de
`gestao_config.capacidade_leads_ativos_por_corretor`). O excedente é contado e exibido,
nunca escondido.

### 1.2 Desfecho de um toque ⭐⭐ a peça mais importante do CRM

Botão **[Registrar]** em cada card. Abre *"o que aconteceu?"* com 3 a 5 respostas
prontas, **por situação**:

| Situação do card | Respostas oferecidas |
| --- | --- |
| Análise de crédito | aprovado · aguardando Caixa · reprovado · não atendeu · perdeu |
| Agendado | foi · no-show · remarcou · desistiu |
| Visita realizada | quer proposta · objeção · não atendeu · perdeu |
| Chegou agora | qualificar · não atendeu · WhatsApp enviado · sem perfil |
| Respondeu | enviei simulação · agendei visita · objeção |
| Pasta travada | (específicas de documento) |
| Genérico | avançar · pediu retorno · objeção · não atendeu · perdeu |

**Cada resposta já carrega o próximo passo com data e, quando cabe, a etapa.**
Confirmar grava, nesta ordem: (1) a interação, (2) a objeção em `leads.objecoes`,
(3) a tarefa do próximo passo, (4) a transição de etapa via `transicionar_lead`.
**Desfazer em 5 s.**

> **Erro mais comum e mais caro de todo o CRM: não usar este botão.** Ver
> [Diagnóstico §5](01-diagnostico.md#5-a-intervenção-de-maior-alavanca).

### 1.3 Ações do card

| Ação | O que faz | Registra? |
| --- | --- | --- |
| **Ligar** | click-to-call 3C Plus, fallback `tel:` | grava em `chamadas` |
| **Zap** | WhatsApp com script da fila | grava a interação |
| **Resumo** | Resumo da Sami + fatos (faixa MCMV, FGTS, decisor, renda, entrada, origem) + últimas 4 interações | não |
| **Registrar** | o desfecho (§1.2) | **sim, tudo** |
| **⋯** | Sami, mudar etapa, registro detalhado | conforme |
| Corpo do card | abre o histórico (peek) | não |

Trava: enquanto o discador está em chamada, o **Ligar** de todos os cards trava (é um
discador por corretor).

### 1.4 Reserva — `/reserva`

O par da Fila Única: **o que é meu e está esperando vaga**. Motivos agrupados:
*Sem próximo passo · Nunca engataram · Parados · Sem vaga hoje*.
Cap de resgate a dedo: **13** (`CAP_RESGATE_PADRAO`).
**Quando usar:** quando a fila do dia acabar (fila anti-ociosidade, [Doc 7](07-matriz-prioridades.md)).

### 1.5 Bolsão — `/bolsao`

**O terceiro nível: leads sem dono nenhum.** Telefone **mascarado** (`(11) •••••0001`) —
discar exige puxar o lead para si. Classificação por frieza (`recente` <7d · `morno`
<30d · `frio` <180d · `esquecido` ≥180d) e por sinal (`nunca tocado` · `tentaram, sem
resposta` · `já houve conversa`).
**Quando usar:** prospecção pura, último nível da fila anti-ociosidade.

---

## Módulo 2 — PROSPECÇÃO (`/prospeccao`)

| Seção | Rota | Papel | Para que serve |
| --- | --- | --- | --- |
| **Modo Foco** | `/prospeccao` | OPERACAO + sdr | Trabalhar o volumão um lead por vez, em lote, sem escolher |
| **Oferta Ativa** | `/oferta-ativa` | OPERACAO | Listas segmentadas para campanha |
| **Discador** | `/discador` | OPERACAO | 3C Plus — disca o Bolsão; quem atende vira "Atendido" (sem posse); **posse só ao avançar de fase** |
| **Distribuição** | `/distribuicao` | admin/gestor | Roleta, zonas, pesos, presença |
| **Captação (Landing)** | `/leads-landing` | admin/gestor | Leads das landing pages |

**Erro comum no Discador:** discar e não tabular. Sem tabulação não existe tentativa
registrada, e a régua não avança o contador de toques.

**Regra de posse do discador (commit #202):** atender não dá posse; **só avançar de fase
dá posse**. Isso protege o Bolsão de ser "reservado" por quem só liga e desliga.

---

## Módulo 3 — GESTÃO DE CARTEIRA (`/leads`)

| Seção | Rota | Para que serve | Erro comum |
| --- | --- | --- | --- |
| **Base de leads** | `/leads` | Lista completa, filtros, ações em massa, importação | **Usar como fila de trabalho** — ela é para buscar, não para priorizar |
| **Kanban** | `/pipeline` | O funil em colunas, com drag-and-drop | Arrastar sem preencher o modal |
| **Agenda** | `/agendamentos` | Compromissos do dia | Marcar visita no WhatsApp e não criar o agendamento |
| **Tarefas** | `/agendamentos?tab=tarefas` | Próximos passos com data | Criar tarefa sem data |
| Ficha do lead | `/leads/$leadId` | Dossiê completo | — |
| Atender (legado) | `/atendimento` | As 6 filas antigas — hoje redireciona para `/fila` | — |
| Mensagens | `/mensagens` | Central de mensagens | — |
| Match | `/match` | Casar lead com produto | — |

### Transições de etapa que **exigem modal** (`STAGE_MODAL`)

`agendado` · `visita_realizada` · `analise_credito` · `contrato_fechado`.
O modal existe para capturar o fato — **é onde o agendamento deveria nascer**.

### A máquina de estados (`transicaoLeadPermitida`)

O banco é a autoridade (`transicao_lead_permitida`); a UI só **oferece** destinos
válidos. Regras que valem a pena saber:

- De `aguardando_atendimento` **não se pula** direto para `agendado` — é preciso passar
  por `em_atendimento`.
- Saída de `contrato_fechado`, `perdido` e `pos_venda` **exige papel de gestão**.
- `perdido` e `pos_venda` podem voltar para `em_atendimento` / `aguardando_retorno` /
  `qualificacao_corretor` (reativação).

### Motivos de perda — 11 categorias obrigatórias

`sem_contato` (sumiu/não responde) · `sumiu_pos_proposta` · `credito_score` ·
`credito_renda` · `estourou_teto` (renda acima do teto MCMV) · `ja_possui_imovel` ·
`preco_parcela` · `comprou_concorrente` · `timing_adiou` · `sem_perfil` · `outro`.

**Por que importa:** é a única fonte de diagnóstico de mídia (quantos `sem_perfil` por
campanha), de produto (`preco_parcela`) e de crédito (`credito_score` vs `credito_renda`).

---

## Módulo 4 — MODO VISITA (`/modo-visita`)

Em campo, no celular, com o cliente na frente: **agenda do dia · rota · briefing do
lead · resultado da visita**. Tem tratamento de **no-show** e reagendamento
(migrations `modo_visita_no_show_e_timeline`, `visita_resultado_e_reagendamento`).

**Quando usar:** sempre que sair para visita. **O que registrar:** o resultado, incluindo
no-show. **Indicador afetado:** comparecimento (meta 65%).

---

## Módulo 5 — FOLLOW-UP (`/follow-up`)

| Aba | Para que serve | Papel |
| --- | --- | --- |
| **Fila do dia** | Quem tocar hoje, com mensagem pronta e contador `Toque N/13` | corretor |
| **Esgotados (13/13)** | Decisão humana: reativar ou descartar | corretor |
| **Curva de resposta** | Em qual toque o cliente responde | corretor |
| **Cobertura do time** | Quem está com a régua em dia | gestão |
| **Config da régua** | Editar gaps, canais, teto, devolução | admin |

**A régua** (detalhe completo no [Doc 6](06-cadencia.md)): 13 toques, gaps por
temperatura, ligação nos toques 3/7/11, multiplicador 0,5 no fundo do funil,
`slaDevolucaoDias: 3`, **`devolucaoAtiva: false`** ⚠️.

**Templates:** um template chamado `"Régua 3 — morno"` veste automaticamente o toque 3.
Sem template, cai no fallback G.P.V.A. (Gancho + Personalização + Valor + Ação) por fase.

**Contagem de toque:** `followup_toques_do_lead` colapsa eventos a menos de 10 minutos
num toque só — discador + registro manual não contam dobrado.

---

## Módulo 6 — PRÉ-VENDA / SDR (`/sdr`)

Papel `sdr` apenas. Abas: **Minha base · Reaquecer (parados) · Entregues · Visitas &
confirmações · Raio-X do SDR**. O SDR esquenta a base, qualifica e agenda; o corretor
recebe o lead **pronto** pela roleta. Política em `docs/politica-sdr-v1.md`.

Job `sdr-alimentar-perdidos` (`0 11 * * *`) recicla até 100 `perdido`/dia para a base
do SDR.

---

## Módulo 7 — DOCUMENTAÇÃO & PROJETOS

| Seção | Rota | Serve para |
| --- | --- | --- |
| Projetos em Foco | `/projetos-foco` | O que a casa quer vender agora |
| Catálogo completo | `/projetos` | Todos os empreendimentos |
| Vitrine (mapa) | `/vitrine` | Mapa Leaflet; há vitrine pública |
| Materiais | `/projetos-materiais` | Books, tabelas, plantas |
| Links úteis | `/links-uteis` | Fora da sidebar, viva no ⌘K |

**Documentação do cliente:** tipos suportados — `documento_identidade`, `cpf`,
`comprovante_residencia`, `comprovante_estado_civil`, `carteira_trabalho`, `holerites`,
`extrato_bancario_6m`, `extrato_fgts`, `autorizacao_fgts`, `decore`, `outro`,
`nao_classificado`. Status: `pendente` · `recebido` · `aprovado` · `reprovado`.
**[MEDIDO]** 1.636 documentos no sistema — **este é o módulo mais bem usado da casa**.
Há ingestão via API (`api-client`), provavelmente pelo WhatsApp/Sami.

`preco_a_partir` do projeto é o que alimenta o **"dinheiro em jogo"** da Fila Única.

---

## Módulo 8 — ASSINATURAS & COMISSÕES (`/financeiro`)

Fechamento de vendas, comissões, aprovações. Venda tem `status_venda`
(`rascunho` · `pendente` · `aprovada` · `rejeitada` · `cancelada`) e flag `distrato`.
**Regra:** só conta para meta o que é `pendente` ou `aprovada` **sem distrato**.
O lead só entra em `contrato_fechado` com **venda aprovada** (guarda por trigger).

---

## Módulo 9 — BI / RELATÓRIOS

| Seção | Rota | Papel | Serve para |
| --- | --- | --- | --- |
| **Meu Raio-X** | `/meu-raio-x` | corretor | KPIs individuais |
| **Desempenho** | `/ranking` | todos | Ranking, pódio, Arena Aurum (modo TV) |
| **Painel do Gestor** | `/painel-gestor` | gestão | Cockpit do dia da operação |
| **Higiene do Funil** | `/higiene-funil` | gestão | Leads parados, motor de higiene |
| **Relatórios** | `/relatorios` | gestão | Relatórios gerais |
| **Inteligência** | `/inteligencia` | gestão | **Coorte real** (a conversão de verdade) |

⚠️ **Lacuna identificada:** o corretor **não vê a Higiene do Funil**. Ele vê os leads
parados só através da Fila Única (balde `fundo` e `sem_acao`), que corta em 65.

---

## Módulo 10 — CONFIGURAÇÕES (`/configuracoes`)

Integrações · Pessoas (`/corretores`, `/equipes`, convites) · Estoque · Preferências.
`gestao_config` guarda: `capacidade_leads_ativos_por_corretor` (65), `regua_followup`,
`carteira_ativa.cap_resgate` (13), configuração de distribuição.

---

## Módulo 11 — GAMIFICAÇÃO E ENGAJAMENTO

| Funcionalidade | Rota | Para que serve |
| --- | --- | --- |
| **Metas do dia** | popup ao entrar | Declarar agendamentos, documentações e vendas da semana |
| **Ranking / Copa** | `/ranking`, `/copa` | Competição saudável, pódio, modo TV 4K |
| **Conquistas** | `/conquistas` | Badges |
| **Blitz** | `/blitz` | Mutirão de atendimento |
| **Sprint** | (feature) | Corrida curta de atividade |

**Metas do dia — mecânica completa:**
- Popup **bloqueante em dia útil**, opcional no fim de semana.
- Pré-preenche com a última resposta, senão com a sugestão do gestor, senão zero.
- A meta semanal de vendas só é herdada se for da **mesma semana**.
- **Checkpoints às 12h, 15h e 17h** comparam realizado × ritmo esperado (jornada 9h–18h)
  e sugerem *"pela sua conversão, isso são ≈ N contatos"*.
- Taxa própria do corretor só é usada com **≥20 contatos** na janela; senão usa a do time.

---

## Módulo 12 — SAMI (copiloto IA)

APIs em `/api/sami/*` (briefing, mensagem, propostas) e edge functions
(`sami-agendar-visita`, `sami-anexar-documento`, `sami-consultar-agenda`).
Gera Resumo do lead sob demanda, aceita **registro por voz** ("ditar"), e propõe pacotes
(interação + objeção + follow-up) que o corretor **confirma**.

**Erro comum:** ditar e não confirmar a proposta da Sami — nada é gravado.

---

## Módulo 13 — INTEGRAÇÕES E ENTRADAS DE LEAD

| Integração | Arquivo | O que faz |
| --- | --- | --- |
| **3C Plus** (discador) | `tcplus-*`, `docs/integracoes/3cplus-discador.md` | Campanha, discagem, webhook de resultado |
| **Sonax** (discador legado) | `sonax-*` | Substituído pelo 3C Plus (#200) |
| **WhatsApp / Sami** | `/api/public/webhooks/whatsapp`, `docs/integracoes/sami-whatsapp.md` | Conversa e reentrada |
| **Landing pages** | `/api/public/webhooks/landing` | Captação |
| **Webhook por token** | `/api/public/webhooks/lead/$token` | Parceiros |
| **lead-intake** | edge function | Normalização de entrada |
| **Google OAuth** | `/api/google/oauth.callback` | Agenda |
| **Push** | `web-push`, `/api/public/hooks/push-dispatch` | Notificações |
| **MCP** | `/mcp`, `/.mcp/*` | Este estudo usou |

**Origens de lead reconhecidas:** `facebook`, `chatbot` (Marquinhos), `impulso_smq`,
`sdr`, `captacao_corretor`, `importacao`, `google_sheets`, `outro`.
**Só as três últimas são "estoque" do Bolsão** — as demais são conquistadas ou pagas.

---

## Módulo 14 — HIGIENE E MANUTENÇÃO

| Funcionalidade | Rota | Serve para |
| --- | --- | --- |
| **Higiene do Funil** | `/higiene-funil` | Fila de ação por fase (P1 análise/visita, P2 agendado, P3 retorno/qualificação) |
| **Duplicatas** | `/duplicatas` | Merge de leads repetidos |
| **Lixeira** | `/lixeira` | Soft delete, recuperação |

**Proteções do motor de higiene:** `escrita_em_lote` (bloco ≥50 leads no mesmo segundo)
e `nunca_tocado`. ⚠️ Risco documentado: a proteção de lote **se desfaz sozinha** conforme
o bloco encolhe (`higiene-diagnostico-2026-09.md` §4.1).

---

## Funcionalidades que existem e estão sendo pouco ou mal usadas

| Funcionalidade | Estado | Por quê importa |
| --- | --- | --- |
| **Desfecho de um toque** | 🔴 praticamente não usado | É a causa-raiz de tudo ([Diag §5](01-diagnostico.md)) |
| **Agendamentos** | 🔴 vazio — leads em `agendado` sem registro | Sem ele não há confirmação D-2/D-1 nem comparecimento |
| **Tarefas** | 🔴 vazio | "Sem próximo passo" marca todo mundo |
| **Motivo de perda** | 🔴 3,6% da base | Sem diagnóstico de mídia/produto/crédito |
| **Devolução automática** | 🔴 desligada (`devolucaoAtiva: false`) | Causa direta dos 5.886 órfãos |
| **Distribuição v2** | 🔴 flag `modelo_v2_ativo` desligada | Teto de 30, SLA 15 min, posse 7/30 dias — tudo parado |
| **Qualificação (renda, FGTS, faixa MCMV)** | 🟠 nula na amostra | Sem match de produto nem simulação |
| **Templates da régua** | 🟠 provável não configurado | Cai no fallback genérico em vez da copy da casa |
| **Reserva e Bolsão** | 🟠 recentes (13–14/09) | A fila anti-ociosidade depende deles |
| **Modo Visita** | 🟠 sem dado de uso | No-show não medido |
| **Higiene do Funil** | 🟠 só gestão | Corretor não enxerga o próprio abandono |
| **Checkpoints de meta** | 🟠 dependem de taxa que não existe | Sem interações, não há taxa própria |
