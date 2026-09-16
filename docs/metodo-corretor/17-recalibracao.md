# DOCUMENTO 17 — Recalibração com os dados reais (16/09/2026)

Extração completa do banco via Lovable. **Este documento corrige o
[Diagnóstico](01-diagnostico.md) e substitui os números do
[Documento 8](08-indicadores.md).** Onde houver conflito, vale este.

---

## 1. O que eu afirmei errado, e o que é verdade

| Afirmei | Verdade **[MEDIDO]** | Como errei |
| --- | --- | --- |
| "Zero vendas em 90 dias" | **126 vendas · 116 aprovadas · R$ 32,2 mi de VGV.** Setembro/2026 é o melhor mês do ano: **29 vendas** | A RPC do MCP devolvia 0. Tratei ausência de dado como ausência de fato |
| "`interacoes`, `tarefas`, `agendamentos` praticamente vazias" | **222.479 · 14.965 · 738** | Amostrei 2 leads pelo MCP, vi arrays vazios e generalizei |
| "Leads em `agendado` sem agendamento" | **Zero.** A integridade é perfeita | Mesma amostra de 2 leads |
| "O registro não acontece — é a causa-raiz" | O registro **acontece**. O problema é outro, e é maior | Ver §3 |
| "1.105 vendas potenciais na base atual" | **Falso.** Apliquei a taxa-meta (2,3%) a leads que convertem 0,02% | Ver §4 |

A coerência lead ↔ venda fecha exata: **0 leads com status de venda sem linha em
`vendas`**. O Financeiro da SMQ é confiável.

---

## 2. 🎯 O ACHADO QUE MUDA A OPERAÇÃO

### Conversão real por origem de lead — 6 meses **[MEDIDO]**

| Origem | Leads | Vendas | Taxa | Leads por venda |
| --- | ---: | ---: | ---: | ---: |
| **outro** (indicação, carteira própria) | 77 | **29** | **37,7%** | **3** |
| **captacao_corretor** | 241 | **39** | **16,2%** | **6** |
| indicacao | 11 | 1 | 9,1% | 11 |
| impulso_smq | 52 | 1 | 1,9% | 52 |
| facebook | 2.478 | 6 | 0,24% | **413** |
| chatbot (Marquinhos) | 1.203 | 2 | 0,17% | **602** |
| **importacao** | **26.201** | **4** | **0,02%** | **6.550** |
| google_sheets | 2.259 | **0** | 0% | — |
| **TOTAL** | **32.552** | **82** | **0,25%** | **397** |

> ### 1% dos leads gera 83% das vendas.
>
> `captacao_corretor` + `outro` = **318 leads (1,0% do total)** → **68 vendas (83%)**.
>
> Um lead captado pelo corretor converte **68× mais que Facebook** e **1.080× mais que
> a base importada**.

### A prova viva disso, nos dados de 30 dias **[MEDIDO]**

| Corretor | Carteira | Interações | Chamadas | Vendas/12m |
| --- | ---: | ---: | ---: | ---: |
| **eduardo** | 191 | 1.455 | **2.118** | **0** |
| **Sheldon** | **1** | **0** | **0** | **21** |
| **Kamilla** | **1** | **0** | **0** | **12** |
| Jefferson | **727** | 831 | 0 | 3 |
| Andrew | 324 | 385 | 0 | 18 |
| graziele | 459 | 1.306 | 1 | 7 |

Eduardo fez **2.118 ligações em 30 dias e vendeu zero**. Sheldon fez **zero ligações e
é o maior vendedor da casa**. Jefferson carrega **727 leads — 11× o teto de 65** — e fez
3 vendas no ano.

**Volume na base errada não converte. Nunca converteu.**

---

## 3. O funil real: onde a SMQ perde

### **[MEDIDO]** 6 meses

```
32.552 leads
    │
    │  1,9%  ◄────────── 98,1% morre aqui
    ▼
   626 visitas agendadas
    │
    │  80,4% de comparecimento (entre as resolvidas)   ◄── META CASA 65% · SUPERADA
    ▼
   185 visitas realizadas
    │
    │  44,3%   ◄────────── quase metade de quem visita, compra
    ▼
    82 vendas
```

**A SMQ perde 98% dos leads antes da visita e converte 44% depois dela.**

Isto vira o diagnóstico do avesso. O problema **não** é fechamento, **não** é crédito,
**não** é o time. O time fecha muito bem. O problema é que quase nada chega à visita — e
a razão principal é que **a matéria-prima é ruim**: 26.201 dos 32.552 leads (80%) são
importação, que converte 0,02%.

### As duas metas da casa que já estão batidas 🟢

| Passagem | **[META CASA]** | **[MEDIDO]** | |
| --- | ---: | ---: | :---: |
| Comparecimento em visita | 65% | **80,4%** | 🟢 superada |
| Visita realizada → venda | 30% (meta de análise→venda) | **44,3%** | 🟢 superada |

O protocolo de visita e o fechamento da SMQ **funcionam**. Eu recomendei treinar
fechamento e confirmação de visita — isso está errado. **Não mexa no que está ganhando.**

---

## 4. A meta de 1 venda por semana, honestamente

### Onde a operação está **[MEDIDO]**

| | Vendas |
| --- | ---: |
| Operação inteira (abr–set) | 81 em 6 meses = **13,5/mês = 3,1/semana** |
| Melhor corretor da casa (Sheldon) | 21 em 12 meses = **0,40/semana** |
| Segundo melhor (Andrew) | 18 em 12 meses = **0,35/semana** |
| **Meta pedida** | **1,00/semana = 4,33/mês** |

> **O melhor corretor da SMQ está a 40% da meta de 1 venda por semana.**
> Ninguém na casa atinge esse número hoje. Pedir 1 venda/semana para um corretor novo,
> trabalhando a base atual, é pedir 2,5× o recorde histórico da empresa.

**Isso não significa que a meta seja impossível — significa que ela é impossível pelo
caminho que está sendo tentado.**

### Quantos leads custam 1 venda por semana, por canal **[MEDIDO]**

| Canal | Leads/semana | Por dia útil | Viável? |
| --- | ---: | ---: | :---: |
| **outro** (indicação, carteira) | **3** | **0,5** | ✅ |
| **captacao_corretor** | **6** | **1,2** | ✅ |
| impulso_smq | 52 | 10,4 | ❌ |
| facebook | 417 | 83 | ❌ |
| chatbot | 588 | 118 | ❌ |
| importacao | 6.667 | 1.333 | ❌ |

> ### A meta é atingível — e a conta é pequena.
>
> **Um corretor que captar 2 leads próprios por dia útil bate 1 venda por semana.**
> Dois. Por dia.
>
> Pelo Facebook, o mesmo corretor precisaria de 83 leads por dia. Pela base importada,
> 1.333. **Nenhum volume de disciplina no CRM resolve uma taxa de 0,02%.**

### A meta que eu recomendo declarar

| Horizonte | Meta por corretor | Base |
| --- | --- | --- |
| **Agora (mês 1–2)** | **6 leads captados/semana** + 1 venda/mês | O que a taxa de 16,2% sustenta com margem |
| **Mês 3–4** | 1 venda a cada 2 semanas | ~0,5/semana — acima do recorde da casa |
| **Mês 6+** | **1 venda/semana** | Só com 6–10 captações/semana consolidadas |

A meta de atividade é **captação**, não toque. A venda é consequência.

---

## 5. O que ESTÁ quebrado (os problemas reais)

### 🔴 R1 — 50.196 leads sem dono no meio do funil

| Etapa | Sem corretor | Média de dias parado |
| --- | ---: | ---: |
| `aguardando_atendimento` | **43.923** | 7 |
| `em_atendimento` | **5.405** | **45** |
| `aguardando_retorno` | 502 | **54** |
| `qualificacao_corretor` | 365 | 21 |
| `analise_credito` | 1 | 4 |

**11.568 deles já tiveram corretor.** 22.107 vieram de importação. 694 já foram
redistribuídos.

**O bug estrutural:** `aguardando_atendimento` significa, por definição do funil,
*"distribuído, sem primeiro contato"*. Mas **43.923 deles não têm `corretor_id`**.
**O status mente.** A esteira `distribuir-estoque-plantao` move o lead para essa etapa
sem atribuir dono — então ele não está na fila de ninguém, não entra na régua de
ninguém, e o funil da casa reporta 48 mil leads "em atendimento" que não existem.

**Correção:** ou a esteira atribui dono, ou esses leads voltam para
`aguardando_corretor`. Do jeito atual o funil inteiro é ilegível.

### 🔴 R2 — A régua de follow-up está em colapso

| | |
| --- | ---: |
| Tarefas de follow-up **pendentes** | 9.067 |
| **das quais vencidas** | **8.688 — 95,8%** |
| Canceladas | 5.249 |
| **Concluídas** | **429** |
| **Taxa de conclusão sobre tudo que foi criado** | **3,0%** |

A régua cria a tarefa. **Ninguém fecha.** 96% do que está aberto já venceu.

Isto **é** um problema de registro — mas não o que eu diagnostiquei. As interações são
gravadas (222 mil); a **tarefa** não é fechada. O corretor toca o cliente e não marca o
toque como feito, então a Fila Única mostra o mesmo lead amanhã, e depois de amanhã.

### 🔴 R3 — Uma única interação de entrada em 90 dias

| Tipo | Direção | Qtd (90d) |
| --- | --- | ---: |
| `mudanca_status` | interna | **151.322** |
| whatsapp | saída | 11.616 |
| nota | interna | 8.076 |
| ligacao | saída | 6.656 |
| **whatsapp** | **entrada** | **1** |

**68% das 222 mil "interações" são log de mudança de status**, não contato com cliente.
E a resposta do cliente **não é gravada**: uma única interação de entrada em 90 dias.

**Consequência direta:** o balde **"Cliente respondeu e espera"** da Fila Única — a
terceira prioridade do dia — **nunca acende**. O lead que respondeu no WhatsApp fica
invisível para o sistema.

### 🟠 R4 — 367 visitas sem desfecho registrado

Das 626 visitas dos últimos 180 dias, **367 (59%) continuam em `agendado`** — datas já
passadas, sem ninguém marcar se foi ou não foi. Por isso o comparecimento de 80,4% é
calculado só sobre as 230 resolvidas. **No pior caso (todas as 367 são no-show), o
comparecimento cai para 31%.** A verdade está entre os dois, e o CRM não sabe qual.

### 🟠 R5 — Carteiras 11× acima do teto

Teto configurado: **65**. Jefferson: **727**. Ana: 496. Leticia: 472. graziele: 459.
Média dos que têm carteira: ~159.

O teto existe em `gestao_config` e é respeitado **na tela**, não na distribuição.

### 🟢 R6 — Os motivos de perda estão impecáveis

5.005 perdas, **zero sem categoria**. `sem_contato` 2.187 · `sem_perfil` 2.067 —
**85% das perdas são lead que nunca respondeu ou nunca teve perfil**. Que é exatamente
o que a tabela do §2 prevê para base importada.

**Retrato:** eu disse que não marcavam motivo de perda. Marcam, e melhor do que a
maioria das operações.

---

## 6. O SLA não é medível hoje (e a culpa é da minha consulta)

**[MEDIDO]** 59.246 leads distribuídos em 90 dias · 14.945 com primeiro toque (25,2%) ·
mediana **−85.347 min**.

A mediana negativa significa que o primeiro toque é **anterior** à data de distribuição —
efeito de base importada e redistribuída. Minha consulta não filtrou isso.

**Consulta corrigida, para rodar depois:** restringir a leads com
`origem NOT IN ('importacao','google_sheets')`, `data_distribuicao IS NOT NULL`,
`tentativas_redistribuicao = 0` e primeiro toque **posterior** à distribuição.

---

## 7. O que muda no método

| Recomendação original | Status | Substituída por |
| --- | :---: | --- |
| "Desfecho obrigatório é a maior alavanca" | 🔁 **rebaixada** | **Captação própria é a maior alavanca.** O registro vira o 2º |
| "Treinar confirmação de visita (D-2/D-1/D+0)" | ❌ **cortada** | Comparecimento já está em **80,4%**, acima da meta |
| "Treinar fechamento" | ❌ **cortada** | Visita→venda já está em **44,3%** |
| "Não precisa de mais leads, precisa de registro" | ❌ **errada** | **Precisa de leads MELHORES.** 80% da base converte 0,02% |
| "Gargalo #1 = em_atendimento → agendado" | ✅ **confirmada e ampliada** | 98,1% morre antes da visita |
| "Ligar devolução automática" | ✅ **promovida a urgente** | 50.196 órfãos, `devolucao_ativa=false` |
| "Alerta de fundo de funil parado" | ✅ mantida | |
| "Reatribuir os órfãos" | ✅ **promovida a prioridade 1** | 50 mil, não 5,8 mil |

### A nova ordem de prioridade

| # | Ação | Por quê |
| :-: | --- | --- |
| **1** | **Meta de captação própria: 6 leads/semana por corretor** | Único caminho matemático para 1 venda/semana |
| **2** | **Consertar `aguardando_atendimento` sem dono** (43.923) | O funil da casa é ilegível enquanto isso durar |
| **3** | **Fechar tarefa ao registrar o toque** | 95,8% de vencidas quebra a Fila Única |
| **4** | **Gravar interação de ENTRADA do WhatsApp** | O balde "respondeu" nunca acende |
| **5** | **Registrar desfecho das 367 visitas em aberto** | Sem isso o comparecimento não é confiável |
| **6** | **Aplicar o teto de 65 na distribuição** | Jefferson com 727 não trabalha 727 |
| **7** | Reavaliar Facebook e chatbot (0,24% e 0,17%) | 3.681 leads em 6 meses → 8 vendas |
| **8** | Parar de comprar/importar base | 26.201 leads → 4 vendas |

---

## 8. O que dizer ao time

> A SMQ **vende bem**: 126 vendas, R$ 32 milhões, e setembro foi o melhor mês do ano.
> Quem visita compra em 44% dos casos e o comparecimento é de 80% — números acima do
> que a casa define como meta.
>
> O problema é a **matéria-prima**. 80% dos leads vêm de importação e convertem 0,02%.
> Um lead que o próprio corretor capta converte **16%** — 1 venda a cada 6.
>
> Por isso a meta muda de natureza: não é "toque mais leads". É **capte 2 leads por
> dia**. Dois. É isso que separa 1 venda por semana de 1 venda por trimestre.
