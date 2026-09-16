# Prompt para o Lovable — corrigir os 3 problemas reais

**Como usar:** cole no chat do Lovable do projeto `seumetroquadrado-crm`.

⚠️ **Este prompt escreve em produção**, num banco com 63 mil leads. Ele é escalonado de
propósito: **FASE 0 é só diagnóstico** e não muda nada. Leia o resultado da Fase 0 e me
mande antes de autorizar as fases seguintes.

**As três causas já foram rastreadas no código** — o prompt nomeia a função e a linha.
Não deixe o Lovable procurar por conta própria.

---

Preciso corrigir três defeitos do CRM. As causas já estão identificadas; não é para
investigar do zero nem redesenhar nada.

## Regras obrigatórias

1. **FASE 0 é somente leitura.** Rode-a, me mostre o resultado e **PARE**. Não avance
   para a Fase 1 sem eu autorizar.
2. **Uma fase por vez.** Ao fim de cada fase, mostre o que mudou e espere.
3. **Toda migration precisa de rollback escrito** no próprio arquivo, em comentário.
4. **Nenhum UPDATE em massa sem dry-run antes**: primeiro um `SELECT count(*)` com
   exatamente o mesmo `WHERE`, me mostre o número, depois execute.
5. **Não invente nome de coluna, função ou status.** Se algo não bater com o que está
   escrito aqui, **pare e me diga** — não adapte por conta própria.
6. Siga a convenção do repositório: migration em `supabase/migrations/`, e um
   `docs/ops/<assunto>.md` com as seções **Medir ANTES**, **Provar DEPOIS** e
   **Rollback**, como os documentos que já existem lá.
7. **Não mexa em nada além do que este prompt pede.** Sem refactor de brinde, sem
   "aproveitei e arrumei".

---

# FASE 0 — DIAGNÓSTICO (somente leitura, rode tudo e pare)

### 0a. Quantos dos leads sem dono são base do SDR

```sql
SELECT
  count(*)                                              AS sem_corretor_total,
  count(*) FILTER (WHERE sdr_id IS NOT NULL)            AS na_base_do_sdr,
  count(*) FILTER (WHERE sdr_id IS NULL)                AS sem_sdr_tambem,
  count(*) FILTER (WHERE sdr_id IS NOT NULL
                     AND sdr_entregue_em IS NULL)       AS sdr_ainda_nao_entregou,
  count(*) FILTER (WHERE corretor_anterior_id IS NOT NULL) AS ja_tiveram_corretor
FROM public.leads
WHERE deleted_at IS NULL AND na_lixeira = false
  AND corretor_id IS NULL
  AND status = 'aguardando_atendimento';
```

### 0b. Quantos SDRs existem e quanto cada um carrega

```sql
SELECT split_part(p.nome,' ',1) AS sdr, count(*) AS leads_na_base
  FROM public.leads l JOIN public.profiles p ON p.id = l.sdr_id
 WHERE l.deleted_at IS NULL AND l.na_lixeira = false
   AND l.corretor_id IS NULL AND l.sdr_entregue_em IS NULL
 GROUP BY 1 ORDER BY 2 DESC;
```

### 0c. Tarefas órfãs: quantas ficaram para trás por lead

```sql
SELECT n_abertas, count(*) AS leads
  FROM (
    SELECT lead_id, count(*) AS n_abertas
      FROM public.tarefas
     WHERE status IN ('pendente','em_andamento') AND deleted_at IS NULL
       AND tipo IN ('follow_up','whatsapp','ligacao','email')
     GROUP BY lead_id
  ) t
 GROUP BY 1 ORDER BY 1 DESC LIMIT 20;
```

### 0d. O secret do webhook de WhatsApp está configurado?

Verifique se a variável de ambiente **`WHATSAPP_WEBHOOK_SECRET`** existe no projeto e
tem **16 caracteres ou mais**. Me diga só **sim/não e o tamanho** — **nunca** me mostre o
valor.

### 0e. Chegou alguma mensagem pelo webhook?

```sql
SELECT count(*) AS total,
       min(created_at)::date AS primeira,
       max(created_at)::date AS ultima
  FROM public.mensagens;
```

Se a tabela `mensagens` não existir, me diga.

**➡️ Me mostre 0a a 0e e PARE aqui.**

---

# FASE 1 — A régua de follow-up (o bug mais simples e mais caro)

## A causa, já rastreada

`src/features/fila-unica/use-desfecho.ts` chama `garantirFollowUpAberto()` para criar a
tarefa do próximo passo, mas **não chama `concluirToquesDeHoje()`** — que existe em
`src/features/followup/fila-client.ts:96` e hoje só é usada por
`src/features/followup/fila-view.tsx:252`.

E `garantirFollowUpAberto` (`src/lib/follow-up.ts:130`) só reaproveita uma tarefa aberta
se ela vencer **dentro de ±1 dia** do novo vencimento. Como o toque seguinte é agendado
dias à frente, a tarefa vencida antiga **nunca é encontrada** — e uma nova é criada.

**Resultado:** cada desfecho registrado na Fila Única deixa uma tarefa pendente para
trás, para sempre. Hoje são **9.067 pendentes, 8.688 já vencidas (95,8%)**, contra
**429 concluídas** — 3% de conclusão.

## 1.1 A correção

Em `src/features/fila-unica/use-desfecho.ts`, **antes** de chamar
`garantirFollowUpAberto`, conclua os toques abertos do lead — exatamente como a
`fila-view.tsx` já faz:

```ts
import { concluirToquesDeHoje } from "@/features/followup/fila-client";
// ...
await concluirToquesDeHoje(lead.id);
await garantirFollowUpAberto({ /* ... como está hoje ... */ });
```

Requisitos:

- A ordem importa: **concluir primeiro, criar depois**. Invertido, a tarefa nova seria
  concluída junto.
- Se `concluirToquesDeHoje` falhar, **o desfecho inteiro falha** — não engula o erro. Um
  desfecho pela metade é o defeito que estamos corrigindo.
- O **Desfazer** de 5 s já existe nesse fluxo. Verifique se ele continua coerente e me
  diga o que decidiu sobre as tarefas concluídas: se o undo não as reabre, **escreva isso
  no `docs/ops/`** em vez de me deixar descobrir depois.

## 1.2 Teste

Adicione um teste cobrindo: lead com 1 tarefa de contato vencida → registrar desfecho →
a tarefa antiga fica `concluida` **e** existe exatamente **1** tarefa aberta (a nova).
Siga o padrão dos testes que já existem para essa feature.

## 1.3 Limpeza do passivo (só depois de 1.1 no ar)

As 8.688 tarefas vencidas são passivo acumulado pelo bug. **Não conclua nem apague** —
elas nunca foram executadas, e marcá-las como concluídas seria mentira no histórico.

Cancele apenas as **duplicatas**: quando um lead tem mais de uma tarefa de contato
aberta, mantenha **a de vencimento mais recente** e cancele as demais.

Dry-run primeiro:

```sql
WITH ranked AS (
  SELECT id, lead_id,
         row_number() OVER (PARTITION BY lead_id ORDER BY data_vencimento DESC, created_at DESC) AS rn
    FROM public.tarefas
   WHERE status IN ('pendente','em_andamento') AND deleted_at IS NULL
     AND tipo IN ('follow_up','whatsapp','ligacao','email')
)
SELECT count(*) AS seriam_canceladas FROM ranked WHERE rn > 1;
```

**Me mostre esse número e espere.** Só depois rode o `UPDATE ... SET status='cancelada'`
com o mesmo `WHERE`, e registre no `docs/ops/` a data, o número e o motivo.

---

# FASE 2 — O funil ilegível: o SDR engole o estoque

## A causa, já rastreada

Em `supabase/migrations/20260904102000_sdr_motor.sql`, por volta da **linha 1273**, a
rotina que alimenta a base do SDR faz:

```sql
UPDATE public.leads
   SET sdr_id = _sdr,
       status = 'aguardando_atendimento',   -- ⬅️ aqui
       classe_lead = 'base',
       data_distribuicao = now(),           -- ⬅️ e aqui
       ...
 WHERE id = _lead.id AND sdr_id IS NULL AND corretor_id IS NULL;
```

Três consequências, todas medidas:

1. **O status mente.** `aguardando_atendimento` significa, no funil da casa,
   *"distribuído ao corretor, sem primeiro contato"*. Mas esses leads **não têm
   `corretor_id`** — estão com o SDR. Hoje são **43.923** leads assim, e o funil reporta
   82,6% da base numa etapa que não descreve o que está acontecendo.
2. **Sem teto.** `distribuicao_settings.sdr_teto_leads_ativos = 0` (zero = sem limite).
   O motor registrou **46.943 entradas em 12 dias** (`lead_eventos.sdr_base_entrada`).
3. **O SLA fica impossível de medir.** `data_distribuicao = now()` é reescrito a cada
   entrada na base do SDR. Como o primeiro toque do lead pode ser de meses antes, a
   mediana do tempo até o 1º contato deu **negativa** na auditoria.

> ⚠️ Isto **não é um bug esquecido**: o comentário por volta da linha 1386 diz que
> `aguardando_atendimento` é *"nova de política (forçada e registrada)"*. Foi uma decisão
> deliberada. **Não a desfaça sozinho** — o que este prompt corrige é o **efeito
> colateral**, sem mudar a política.

## 2.1 Pôr teto na base do SDR (a correção mais barata)

Defina `sdr_teto_leads_ativos` em `distribuicao_settings` com um valor **> 0**, com base
no que a Fase 0b mostrar: use **500 por SDR ativo**, arredondando para baixo. A função já
respeita esse teto — é só configuração, sem deploy.

**Me diga o valor que calculou e por quê, antes de aplicar.**

## 2.2 Separar "na base do SDR" de "na mesa do corretor" nas leituras

**Não crie status novo** e **não mexa na máquina de estados** (`transicao_lead_permitida`
e o espelho em `src/lib/leads.ts`) — isso quebraria os testes e o Kanban.

A separação já é possível com os campos que existem:

```sql
-- na base do SDR
corretor_id IS NULL AND sdr_id IS NOT NULL AND sdr_entregue_em IS NULL

-- de fato na mesa de um corretor
corretor_id IS NOT NULL
```

Aplique esse recorte **nas leituras do funil**, começando por `fila_funil_v1` (a RPC do
painel de funil da Fila Única): a etapa `aguardando_atendimento` passa a contar **só
leads com `corretor_id`**, e a base do SDR vira uma linha própria.

Se `fila_funil_v1` já tiver um parâmetro de escopo, **use-o em vez de criar outro**.
Me mostre o antes e o depois das contagens por etapa.

## 2.3 Parar de reescrever `data_distribuicao`

Na rotina da linha 1273, **`data_distribuicao` não deve ser sobrescrita** quando já tem
valor. Troque a atribuição por:

```sql
data_distribuicao = COALESCE(leads.data_distribuicao, now()),
```

Mantenha `timestamp_recebimento = now()` como está — é esse o carimbo de entrada na base
do SDR.

Isso destrava a medição de SLA de primeiro contato, que hoje é inutilizável.

## 2.4 O que NÃO fazer nesta fase

- ❌ Não redistribua os 43.923 leads para corretores. Eles convertem **0,02%** (base
  importada) e entupiriam carteiras que já estão em até **727 leads** contra um teto de
  65. Fazer isso pioraria a operação.
- ❌ Não ligue `modelo_v2_ativo` nem `regua_followup.devolucao_ativa` agora. Só depois da
  Fase 1 estar no ar e medida — devolver lead em massa enquanto a régua está quebrada
  derrubaria a confiança do time no sistema.

---

# FASE 3 — A resposta do cliente não é gravada

## A causa, já rastreada

**O código existe e está correto.** `src/routes/api/public/webhooks/whatsapp.ts` grava a
mensagem em `mensagens` **e** ecoa na timeline como `interacoes` com
`direcao: 'entrada'` (por volta da linha 78) — que é exatamente o que acende o balde
**"Cliente respondeu e espera"** da Fila Única.

Só que o banco tem **1 (uma) interação de entrada em 90 dias**. Ou seja: **o webhook não
está sendo chamado**.

Duas hipóteses, e a Fase 0 já distingue entre elas:

| Se a Fase 0 mostrou | Então |
| --- | --- |
| `WHATSAPP_WEBHOOK_SECRET` ausente ou com menos de 16 caracteres | O endpoint devolve **503** para tudo. Configure a variável com um segredo forte e me confirme só o tamanho |
| Secret OK, mas `mensagens` vazia ou parada | O fluxo **n8n** não está chamando o endpoint, ou chama com o header errado |

## 3.1 O que fazer

1. Confirme/configure `WHATSAPP_WEBHOOK_SECRET` (mínimo 16 caracteres).
2. Faça **um** POST de teste no endpoint, com o header `x-webhook-secret`, no formato
   que `src/features/mensagens/webhook-contract.ts` define, apontando para um **lead de
   teste que você mesmo criar** — nunca um cliente real.
3. Prove que o teste produziu **uma linha em `mensagens`** e **uma em `interacoes` com
   `direcao='entrada'`**.
4. Se o endpoint responder certo, o problema é do lado do n8n: me diga isso
   explicitamente, com o corpo e os headers que o fluxo precisa enviar, que eu acerto lá.
5. **Apague o lead de teste** ao final.

**Não reescreva o webhook.** Ele está certo.

---

# Ordem, e o que eu espero de volta

| Fase | Risco | Só avance depois de |
| --- | --- | --- |
| **0** — diagnóstico | nenhum | — |
| **1** — régua | baixo (1 função + 1 teste) | eu ver a Fase 0 |
| **3** — webhook | baixo (configuração) | Fase 1 no ar |
| **2** — SDR e funil | médio (RPC de leitura + config) | Fases 1 e 3 provadas |

A Fase 1 vem primeiro porque é a de maior efeito por menor risco: corrige uma função,
e a régua — que hoje converte 3% das tarefas — volta a funcionar para todo mundo.

Ao final de cada fase, me entregue:

1. **O que mudou**, arquivo por arquivo.
2. **Os números antes e depois** das consultas de verificação.
3. **Como reverter**, em um comando.
4. **O que você decidiu e eu não pedi** — se houver, quero saber antes de descobrir.

Se qualquer coisa não bater com o que está descrito aqui, **pare e me pergunte.**
