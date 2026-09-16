# DOCUMENTO 6 — Cadência ideal de atendimento e follow-up

---

## 1. A régua que já existe no CRM

`src/lib/regua-followup.ts` · configurável em `/follow-up?tab=config` (admin).

**A tese da casa:** *"a operação mediu que o cliente responde por volta da 13ª tentativa
de contato"*. A régua transforma isso em processo: cada lead tem um contador de toques
(**só contato ativo do corretor conta**) e uma cadência **temperatura × etapa**.

### Cadência padrão, em dias entre toques

| Toque | Canal | Quente | Morno | Frio |
| :---: | :---: | :---: | :---: | :---: |
| 1 | WhatsApp | imediato | imediato | imediato |
| 2 | WhatsApp | +1 | +2 | +3 |
| **3** | **📞 Ligação** | +1 | +2 | +4 |
| 4 | WhatsApp | +2 | +3 | +5 |
| 5 | WhatsApp | +2 | +3 | +7 |
| 6 | WhatsApp | +3 | +4 | +7 |
| **7** | **📞 Ligação** | +3 | +5 | +10 |
| 8 | WhatsApp | +4 | +5 | +10 |
| 9 | WhatsApp | +5 | +7 | +14 |
| 10 | WhatsApp | +5 | +7 | +14 |
| **11** | **📞 Ligação** | +7 | +10 | +21 |
| 12 | WhatsApp | +7 | +10 | +21 |
| 13 | WhatsApp | +10 | +14 | +30 |
| | **Ciclo total** | **~50 dias** | **~72 dias** | **~146 dias** |

**Multiplicador por etapa:** `agendado`, `visita_realizada` e `analise_credito` têm
**× 0,5** — o ritmo **dobra** onde o dinheiro está. Um lead morno em análise de crédito
é tocado a cada 1–2 dias, não a cada 2–5.

**Esgotou os 13 sem resposta** → decisão humana na aba "Esgotados (13/13)":
**reativar** ou **descartar com motivo**. Nunca auto-perdido — regra assentada da casa
(a função `arquivar_leads_sem_contato_30d` foi deliberadamente transformada em stub em
17/07/2026).

---

## 2. SLA de primeiro contato

| Tipo de lead | SLA | O que acontece se estourar |
| --- | --- | --- |
| **Quente** (campanha, pago, novo) | **15 minutos úteis** (08h–19h) | Lead repassa ao próximo da fila. O estouro entra na sua mediana valendo **60 minutos**. |
| **2 estouros no mesmo dia** | — | **Pausa automática no quente** até o dia seguinte (volta automática). A base continua. |
| **Base** (frio, reativado, devolvido, estoque) | mesmo dia útil | Rodízio puro, sem SLA duro |
| Fora do horário / fim de semana / feriado | — | O lead espera e **abre o expediente seguinte com prioridade**, com o bot segurando |

**Posse do lead** (política v2, hoje desligada — ver §5):
- **7 dias** sem nenhum registro → volta para a casa como lead de base
- **30 dias** nas etapas avançadas (qualificado, agendado, visita, proposta, análise)
- **Qualquer registro zera a contagem**

---

## 3. A cadência que eu recomendo — e o que mudo

A régua de 13 toques **está certa na tese e errada no começo**. Três ajustes:

### 3.1 🔴 O primeiro dia precisa de mais de um toque

**Problema.** Hoje o toque 1 é imediato e o toque 2 só vem em +1 dia (quente) ou
+2 dias (morno). Mas o lead quente de MCMV decide nas primeiras horas, e a taxa de
contato despenca depois do primeiro dia.

**Proposta — inserir 3 toques no dia 1**, antes do atual toque 2:

| Momento | Canal | Objetivo |
| --- | --- | --- |
| **0 min** | 📞 Ligação | O SLA é de 15 min. Ligação primeiro, sempre. |
| **+2 min** (se não atendeu) | WhatsApp | Áudio curto + identificação + oferta concreta |
| **+45 min** | 📞 Ligação | Outra faixa de horário do mesmo período |
| **+4 h** (turno oposto) | WhatsApp | Quem não atende de manhã atende à tarde |
| **+1 dia** | 📞 Ligação | Aqui começa o atual toque 2 |

**Por quê:** custa 4 tentativas no dia 1 em vez de 1. Numa operação com 48 mil leads em
`aguardando_atendimento` **[MEDIDO]**, a diferença entre 1 e 4 tentativas no dia 1 é a
diferença entre 15% e 40% de contato efetivo. **[HIPÓTESE]** — medir em 4 semanas.

**Implementação:** um toque 0 na régua com gap 0 e canal ligação + ajustar
`gaps.quente[0..1]`. É configuração, não código.

### 3.2 🟠 Frio com 146 dias de ciclo é longo demais para o estoque atual

Com **47.961 leads frios [MEDIDO]** e teto de carteira de 65, um ciclo de 146 dias
significa que o corretor carrega o mesmo lead frio por 5 meses ocupando vaga.

**Proposta:** encurtar a régua fria para **7 toques em ~45 dias** e, esgotada, mandar
para o **Bolsão** (não para "esgotado com dono"). Lead frio não deve ter dono — é
material de discador e SDR, que é exatamente para o que o Bolsão foi criado.

### 3.3 🟢 O multiplicador 0,5 no fundo do funil está certo — mas falta o protocolo de visita

O multiplicador acelera, mas confirmação de visita não é follow-up genérico: é um
protocolo com script próprio. **Recomendo fixar, independente da régua:**

| Momento | Canal | Mensagem |
| --- | --- | --- |
| **D-2** | WhatsApp | Confirmação + endereço + o que levar (RG, CPF, comprovante de renda) |
| **D-1** | 📞 Ligação | Confirmação por voz — é a que segura o comparecimento |
| **D+0 manhã** | WhatsApp | "Te espero às 10h, estou no local" |
| **D+0, 30 min depois da hora** | 📞 Ligação | Se não apareceu: **registrar no-show** e remarcar na hora |

**[META CASA]** este protocolo rende **60 a 75% de comparecimento**. Sem ele, cai para
30–40%. **[HIPÓTESE]**

---

## 4. Cadência por etapa do funil — o que fazer em cada uma

| Etapa | Ritmo | Canal predominante | Conteúdo do toque |
| --- | --- | --- | --- |
| `aguardando_atendimento` | 4 toques no dia 1, depois a régua | ligação → WhatsApp | Identificação + oferta concreta + pergunta de qualificação |
| `aguardando_retorno` | **a data que o cliente pediu** | o canal que ele usou | Exatamente o que foi combinado |
| `qualificacao_corretor` | mesmo dia, sem falta | ligação | Assumir a conversa que o bot/SDR começou |
| `em_atendimento` | a cada 2–3 dias | WhatsApp + 1 ligação/semana | **Simulação → produto → oferta de visita** |
| `agendado` | protocolo D-2/D-1/D+0 | WhatsApp + ligação | Confirmação |
| `visita_realizada` | **48h** | ligação | Proposta enquanto a visita está fresca |
| `analise_credito` | **semanal, sem falta** | ligação | Status da Caixa + documento que falta |
| `perdido` | reativação em 30/60/90 dias | WhatsApp | Novidade de produto ou mudança de condição |

---

## 5. ⚠️ Três configurações que precisam ser ligadas

Encontradas desligadas na auditoria. **São a causa direta dos 5.886 leads órfãos.**

| Configuração | Estado | O que faz | Recomendação |
| --- | :---: | --- | --- |
| `regua_followup.devolucao_ativa` | 🔴 **false** | Devolve à pré-venda o lead com follow-up vencido há 3 dias | Ligar em **piloto com 3 corretores, 2 semanas** |
| `modelo_v2_ativo` (distribuição v2) | 🔴 **desligada** | Teto de 30 leads ativos · SLA 15 min · posse 7/30 dias · peso por velocidade | Ligar **depois** que o registro estiver acontecendo |
| Templates `"Régua N — temperatura"` | 🟠 provavelmente vazios | Vestem cada toque com a copy da casa | Criar os 13 × 3 templates |

**Ordem importa.** Ligar a devolução automática **antes** de o registro acontecer
devolveria em massa leads que estão sendo trabalhados sem registro — e o time perderia
a confiança no sistema.

> **Sequência correta:** (1) desfecho obrigatório por 2 semanas → (2) medir que as
> interações estão sendo gravadas → (3) ligar a devolução em piloto → (4) ligar a
> distribuição v2.

---

## 6. A cadência de reativação (depois dos 13 toques)

| Quando | Gatilho | Onde |
| --- | --- | --- |
| **Régua esgotada** | 13/13 sem resposta | Aba "Esgotados" → reativar ou descartar com motivo |
| **+30 dias** | Lead perdido por `timing_adiou` ou `preco_parcela` | Oferta Ativa — novidade ou condição nova |
| **+60 dias** | Lead perdido por `credito_score` | Score pode ter limpado |
| **+90 dias** | Lead perdido por `credito_renda` | Renda pode ter mudado |
| **Contínuo** | `perdido` → base do SDR | Job `sdr-alimentar-perdidos`, 100/dia |
| **Contínuo** | Sem dono | Bolsão: discador e SDR |

**Nunca descarte de verdade.** O CRM foi desenhado para isso — não existe delete, existe
Lixeira, Bolsão e reciclagem para o SDR.
