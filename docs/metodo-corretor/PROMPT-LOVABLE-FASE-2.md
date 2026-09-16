# Prompt para o Lovable — Fase 2 (SDR e o funil ilegível)

**Como usar:** cole no Lovable, na mesma conversa.

⚠️ É a fase de maior risco da sequência. Continua valendo: **um passo por vez**,
dry-run antes de qualquer `UPDATE` em massa, rollback escrito, **pare se algo não bater**.

---

Fase 3.1 recebida — índice único confirmado, zero colisão, plano sem varredura. Fecha
bem.

**Autorizo a Fase 2, com uma revisão importante do plano.** Duas checagens no código
mudaram o que eu tinha recomendado antes. Leia a revisão antes de executar qualquer coisa.

---

## A revisão: por que "drenar para o Bolsão" estava impreciso

Eu tinha recomendado esvaziar a base do SDR mandando os leads para o Bolsão. Duas coisas
que conferi depois mostram que isso estava errado nos detalhes:

**1. Eles já estão no Bolsão.** `bolsao_v1` filtra por `corretor_id IS NULL` e **não**
exclui quem tem `sdr_id` — só marca `em_triagem_sdr` para o discador não atropelar. Os
42.884 leads já aparecem lá e já são alcançáveis. "Mandar para o Bolsão" não os moveria
para lugar nenhum novo.

**2. Drenar para `aguardando_corretor` os devolveria à esteira.** O pool do
`distribuir_estoque_roleta` é exatamente:

```sql
corretor_id IS NULL AND sdr_id IS NULL AND status = 'aguardando_corretor'
```

Ou seja: limpar `sdr_id` e voltar o status para `aguardando_corretor` os recoloca na
fila da esteira que roda **de 10 em 10 minutos**. Com o teto do SDR aplicado, eles
passariam a ser empurrados para **corretores** — leads de importação que convertem
**0,02%**, entrando em carteiras que já estão em até 727 contra um teto de 65. Pior que
o estado atual.

**A conclusão:** o problema não é onde os leads estão. É a **esteira que os empurra**.

---

# PASSO 1 — Pausar a esteira de plantão

É a ação de maior efeito e menor risco de toda a Fase 2: **um flag, reversível em um
comando, sem mutação de dado**.

```sql
-- ANTES: confirme o estado atual
SELECT jobid, jobname, schedule, active FROM cron.job
 WHERE jobname IN ('distribuir-estoque-plantao', 'distribuicao-automatica-5min', 'sdr-alimentar-perdidos');

-- PAUSAR (só o plantão)
UPDATE cron.job SET active = false WHERE jobname = 'distribuir-estoque-plantao';

-- ROLLBACK
UPDATE cron.job SET active = true  WHERE jobname = 'distribuir-estoque-plantao';
```

## Por que isso é seguro

`distribuir-estoque-plantao` roda `distribuir_estoque_roleta('plantao', 30)`, que só toca
**estoque parado**: `corretor_id IS NULL AND sdr_id IS NULL AND status = 'aguardando_corretor'`.

A distribuição de **lead novo e quente** é outro job e outra função:
`distribuicao-automatica-5min` → `processar_distribuicao_automatica()`, que também chama
`redistribuir_sla_webhook()`. **Pausar o plantão não afeta lead novo, campanha, chatbot,
landing nem o SLA de primeiro contato.** Confirme isso antes de pausar e me diga se
encontrar qualquer acoplamento entre os dois.

## O que a pausa interrompe

4.320 leads/dia sendo empurrados para uma base que ninguém trabalha — o que produziu
+15.038 leads em `aguardando_atendimento` em quatro dias, com apenas 423 leads novos no
mês. Enquanto a esteira roda, todo o resto desta fase é enxugar gelo.

**Pare aqui, me mostre o antes e o depois, e espere.**

---

# PASSO 2 — Teto na base do SDR

```sql
-- ANTES
SELECT chave, valor FROM public.distribuicao_settings WHERE chave = 'sdr_teto_leads_ativos';
-- esperado hoje: 0  (zero = sem teto)
```

Defina **`sdr_teto_leads_ativos = 2000`**.

São 50 dias de trabalho na meta de 40 contatos/dia que a própria casa já configurou em
`sdr_meta_contatos_dia`. A função `alimentar_base_sdr_estoque` já lê esse valor via
`_sdr_setting_int` — é configuração, sem deploy.

Isso impede a base do SDR de voltar a crescer. **Não move nenhum lead.**

---

# PASSO 3 — Parar de reescrever `data_distribuicao`

Em `supabase/migrations/20260904102000_sdr_motor.sql`, por volta da **linha 1273**, a
rotina que alimenta a base do SDR faz `data_distribuicao = now()`. Como o primeiro toque
do lead pode ser de meses antes, isso produziu a **mediana negativa** de tempo até o 1º
contato na auditoria — o indicador de SLA é hoje inutilizável.

Migration nova, trocando a atribuição por:

```sql
data_distribuicao = COALESCE(leads.data_distribuicao, now()),
```

Mantenha `timestamp_recebimento = now()` como está — é o carimbo de entrada na base do
SDR, e esse deve mesmo ser reescrito.

**Não mexa em mais nada dessa função.** O `status = 'aguardando_atendimento'` que ela
força foi decisão de política registrada (comentário por volta da linha 1386); o Passo 4
resolve o efeito colateral sem desfazer a política.

---

# PASSO 4 — Separar "base do SDR" de "mesa do corretor" nas leituras

**Zero mutação de dado.** É o passo que faz o funil parar de mentir.

Hoje a etapa `aguardando_atendimento` mistura duas populações opostas:

```sql
-- na base do SDR (não tem corretor, ninguém vai atender hoje)
corretor_id IS NULL AND sdr_id IS NOT NULL AND sdr_entregue_em IS NULL

-- de fato na mesa de um corretor (o SLA do 1º contato está correndo)
corretor_id IS NOT NULL
```

Aplique o recorte em `fila_funil_v1` (a RPC do painel de funil da Fila Única):

- a etapa `aguardando_atendimento` passa a contar **só leads com `corretor_id`**;
- a base do SDR vira **uma linha própria**, fora do funil comercial.

Se `fila_funil_v1` já tiver parâmetro de escopo, **use-o em vez de criar outro**.

**Não crie status novo** e **não toque** em `transicao_lead_permitida` nem no espelho em
`src/lib/leads.ts` — quebraria os testes e o Kanban.

Me mostre a contagem por etapa **antes e depois**. O número que eu espero ver cair é o
`aguardando_atendimento`, de ~48.049 para algo próximo de 4.000.

---

# PASSO 5 — Reduzir a base do SDR para um tamanho trabalhável

**Só execute depois que os Passos 1 e 2 estiverem aplicados e confirmados.** Sem a
esteira pausada, este passo alimenta o loop que acabamos de descrever.

## O estado

| | |
| --- | ---: |
| Vanessa | 42.884 |
| Kauan | 111 |
| Teto novo | 2.000 |
| Excedente a devolver (só Vanessa) | **40.884** |

Kauan está abaixo do teto — **não toque na base dele.**

## Quais 2.000 ficam

Os de maior chance, nesta ordem: **quem já teve conversa registrada primeiro, depois o
menos parado**. Os 40.884 restantes voltam ao estoque sem dono.

## O que o `UPDATE` faz

```sql
SET sdr_id = NULL,
    sdr_entregue_em = NULL,
    sdr_interesse_confirmado = false,
    status = 'aguardando_corretor'
```

**Não mexa em `data_distribuicao` nem em `timestamp_recebimento`** — o Passo 3 corrige o
comportamento daqui para a frente; reescrever o passado inventaria histórico.

Registre cada lote em `lead_eventos` com um `tipo` próprio (ex.: `sdr_base_devolvida`),
agente `manual`, e o motivo no payload.

## Como executar

- **Lotes de 2.000 por dia**, não de uma vez.
- Dry-run com `SELECT count(*)` no mesmo `WHERE` antes de cada lote.
- Depois do primeiro lote, **pare e me mostre** a contagem da base do SDR e a do funil.

Com a esteira pausada, `aguardando_corretor` é um estacionamento honesto: os leads
continuam visíveis no Bolsão (que já os mostra hoje, marcados como `em_triagem_sdr`) e
alcançáveis pelo discador — mas param de ser empurrados para carteira de ninguém.

---

# O que continua proibido

- ❌ Redistribuir os 40.884 para corretores.
- ❌ Ligar `regua_followup.devolucao_ativa` ou `modelo_v2_ativo`.
- ❌ Criar status novo ou mexer na máquina de estados.
- ❌ Pausar `distribuicao-automatica-5min` ou qualquer job que não seja o plantão.

---

# Ordem e o que me entregar

| Passo | Risco | Mutação |
| :-: | --- | --- |
| **1** — pausar a esteira | baixo, reversível em 1 comando | nenhuma |
| **2** — teto do SDR | baixo | nenhuma |
| **3** — `data_distribuicao` | baixo | migration |
| **4** — leitura do funil | baixo | nenhuma |
| **5** — reduzir a base | **médio** | 40.884 linhas, em lotes |

Pare e me mostre o resultado **depois de cada passo**. Ao final de cada um: o que mudou,
os números antes e depois, como reverter em um comando, e **o que você decidiu que eu não
pedi**.
