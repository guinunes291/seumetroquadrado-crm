# Prompt para o Lovable — Fases 1, 3 e 2 (continuação)

**Como usar:** cole no Lovable, na mesma conversa da Fase 0.
A Fase 0 já rodou; os números dela estão embutidos aqui.

⚠️ Continua valendo tudo do prompt anterior: **uma fase por vez**, dry-run antes de
UPDATE em massa, rollback escrito, e **pare se algo não bater**.

---

Fase 0 recebida e analisada. **Autorizo a Fase 1.** Duas fases foram reescritas com o
que a Fase 0 mostrou — leia antes de executar.

---

# ✅ FASE 1 — AUTORIZADA (régua de follow-up)

## O que a Fase 0 mudou no diagnóstico

O bug que eu descrevi é real, mas explica **menos da metade** do problema:

| | Tarefas abertas | % |
| --- | ---: | ---: |
| **Duplicatas** (leads com 2+ tarefas abertas) — **é o bug** | **2.498** | 27% |
| **Leads com exatamente 1 tarefa aberta e vencida** — **não é bug** | **5.126** | 56% |
| Demais | 1.612 | 17% |
| **Total aberto** | **9.236** | |

Os 5.126 leads com **uma** tarefa aberta não sofreram vazamento: são toques que a régua
agendou e **ninguém nunca trabalhou**. Isso é dívida comercial, não defeito de software,
e **não se resolve com código**.

**Consequência prática:** a correção 1.1 impede que o passivo cresça. Ela **não** zera o
que já existe.

## 1.1 A correção (mantida como estava)

Em `src/features/fila-unica/use-desfecho.ts`, **antes** de `garantirFollowUpAberto`:

```ts
import { concluirToquesDeHoje } from "@/features/followup/fila-client";
// ...
await concluirToquesDeHoje(lead.id);
await garantirFollowUpAberto({ /* ... como está hoje ... */ });
```

- Ordem importa: **concluir primeiro, criar depois.**
- Se `concluirToquesDeHoje` falhar, o desfecho inteiro falha. Não engula o erro.
- Verifique a coerência com o **Desfazer** de 5 s e **escreva no `docs/ops/`** o que
  decidiu sobre as tarefas concluídas no undo.

## 1.2 Teste

Lead com 1 tarefa de contato vencida → registrar desfecho → a antiga fica `concluida` e
existe **exatamente 1** tarefa aberta (a nova). Siga o padrão dos testes da feature.

## 1.3 Limpeza das duplicatas

Dry-run confirmado na Fase 0: **2.498 tarefas** seriam canceladas, em **1.612 leads**.

Mantenha a de **vencimento mais recente** por lead e cancele as demais
(`status = 'cancelada'`). Rode o `SELECT count(*)` com o mesmo `WHERE` imediatamente
antes, confirme que continua ~2.498, e só então execute.

**Não toque nos 5.126 leads com tarefa única.** Marcá-las como concluídas seria mentira
no histórico — elas nunca foram executadas. Elas saem pelo trabalho do time, não por
`UPDATE`.

Registre no `docs/ops/`: data, número cancelado, e que os 5.126 ficaram de fora **de
propósito**.

---

# ✅ FASE 3 — AUTORIZADA (WhatsApp) — diagnóstico fechado

A Fase 0 eliminou a dúvida:

- `WHATSAPP_WEBHOOK_SECRET` **não existe** → o endpoint devolve **503 para tudo**
- `mensagens` tem **zero linhas** → **a integração nunca rodou**, nem uma vez

Não é bug nem regressão: **o recurso foi construído e nunca foi ligado.** Por isso há
1 interação de entrada em 90 dias e o balde "Cliente respondeu e espera" da Fila Única
nunca acendeu.

## 3.1 O que fazer

1. Criar `WHATSAPP_WEBHOOK_SECRET` no projeto, com **32 caracteres aleatórios**.
   Me confirme **só o tamanho** — nunca o valor.
2. Criar um **lead de teste seu** (nome "TESTE WEBHOOK", telefone fictício).
3. Um POST no endpoint com o header `x-webhook-secret`, no formato que
   `src/features/mensagens/webhook-contract.ts` define.
4. Provar que gerou **1 linha em `mensagens`** e **1 em `interacoes` com
   `direcao='entrada'`**.
5. Confirmar que o lead de teste apareceu no balde **"Cliente respondeu e espera"**
   da `/fila`. **É este o teste que importa** — os outros quatro são meio do caminho.
6. **Apagar o lead de teste.**

## 3.2 O que me entregar

O **contrato exato** que o n8n precisa enviar: URL, método, headers e um corpo de
exemplo válido. Eu ligo o fluxo do lado do n8n.

**Não reescreva o webhook.** O código está certo — ele só nunca foi chamado.

> Observação para você: no seu relatório da Fase 0e a coluna de `mensagens` é
> `criado_em`, não `created_at`. Anotado — o erro foi do meu script, não do banco.

---

# ⚠️ FASE 2 — REESCRITA. NÃO EXECUTE AINDA.

A Fase 0 mostrou um número que muda completamente o escopo desta fase.

## O que a Fase 0 revelou

| | |
| --- | ---: |
| Sem corretor em `aguardando_atendimento` | 43.923 |
| **dos quais na base do SDR** | **42.973 (97,8%)** |
| **Concentrados em uma única pessoa (Vanessa)** | **42.884** |
| Na base do outro SDR (Kauan) | 111 |

Contexto que fecha o quadro: na extração anterior, **Vanessa registrou 51 interações em
30 dias**. Com 42.884 leads, isso é **0,12% da base dela por mês**.

E pela meta que a própria casa configurou (`sdr_meta_contatos_dia = 40`), **uma única
passada pela base dela levaria 49 meses.**

> **Não existe teto de SDR quebrado. Existe uma pessoa com 42.884 clientes.**
> Enquanto isso durar, o funil da SMQ reporta 82,6% da base numa etapa que significa
> "distribuído, aguardando primeiro contato" — quando na verdade ninguém vai atender.

## Por que eu não vou mandar você executar isso agora

Definir para onde vão os ~41 mil leads excedentes **não é decisão técnica**. É decisão
do Guilherme sobre o modelo de pré-venda da SMQ. Vou levar a ele com a recomendação
abaixo, e você recebe a autorização depois.

## A recomendação que vou levar

**Destino: o Bolsão.** O CRM já tem o desenho de três níveis —
`Carteira ativa (65) → Reserva → Bolsão (sem dono, discador e SDR)`. Os 41 mil leads
pertencem ao **terceiro nível**, que existe exatamente para isso. Hoje eles estão
fantasiados de "base de um SDR" que não tem como trabalhá-los.

Ordem obrigatória (inverter isso recria o problema em uma semana):

1. **Primeiro** definir `sdr_teto_leads_ativos` > 0 em `distribuicao_settings`
   (hoje é `0` = sem teto). Sugestão: **2.000 por SDR** — 50 dias de trabalho na meta de
   40 contatos/dia, o que já é generoso.
2. **Depois** drenar o excedente: limpar `sdr_id` e devolver `status` para
   `aguardando_corretor`, **em lotes de 2.000/dia**, do mais parado para o mais recente.
3. **Só então** os ajustes 2.2 (separar o recorte nas leituras do funil) e 2.3
   (`data_distribuicao = COALESCE(...)`, que destrava a medição de SLA).

Sem o passo 1 antes do 2, os jobs `distribuir-estoque-plantao` (a cada 10 min) e
`sdr-alimentar-perdidos` (diário) reenchem a base do SDR.

## O que continua proibido nesta fase

- ❌ Não redistribuir os 42 mil para corretores. Convertem **0,02%** e as carteiras já
  estão em até **727** contra um teto de **65**.
- ❌ Não criar status novo nem mexer em `transicao_lead_permitida` ou no espelho em
  `src/lib/leads.ts`.
- ❌ Não ligar `devolucao_ativa` nem `modelo_v2_ativo`.

---

# Ordem confirmada

| | Fase | Status |
| :-: | --- | --- |
| 1º | **Fase 1** — régua | ✅ autorizada |
| 2º | **Fase 3** — WhatsApp | ✅ autorizada |
| 3º | **Fase 2** — SDR e funil | ⏸️ aguardando decisão de negócio |

Ao fim de cada fase: o que mudou arquivo por arquivo, os números antes e depois, como
reverter em um comando, e **o que você decidiu que eu não pedi**.
