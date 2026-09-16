# DOCUMENTO 9 — Os 15 erros que matam venda no CRM SMQ

Cada erro abaixo foi **observado nos dados de produção**, não imaginado.

---

## 🔴 Os 5 erros fatais

### ERRO 1 — Fechar a ficha do lead sem registrar o desfecho

**O que acontece.** O corretor liga, conversa, e sai da tela. Nada é gravado.

**Evidência [MEDIDO].** Lead `754d75ae…` em `analise_credito`, quente, com **9
documentos na pasta** — e `interacoes: []`, `tarefas: []`, `agendamentos: []`. Alguém
recolheu nove documentos deste cliente. Nenhuma conversa foi registrada.

**O que quebra.** Tudo:
- a temperatura volta a ser fria (ela depende de interação nas últimas 24h)
- o balde "Cliente respondeu e espera" nunca acende
- a régua não conta o toque — o cliente recebe o toque 3 pela terceira vez
- "Sem próximo passo" marca você
- o cálculo reverso da sua meta fica sem denominador

**O certo.** **[Registrar]** em todo card. São 3 a 5 respostas prontas, com desfazer de
5 segundos. Leva 4 segundos.

---

### ERRO 2 — Mover para "Agendado" sem criar o agendamento

**Evidência [MEDIDO].** Lead `e8b16635…` — Larissa Fonseca. Criada às 13:10, status
`agendado` às 13:20. `agendamentos: []`. Sem `visita_data`, sem `visita_hora`, sem
`visita_empreendimento`.

**O que quebra.**
- A visita não aparece na Agenda — nem na sua, nem na do gestor
- A confirmação D-2 / D-1 / D+0 **nunca dispara**
- A fila "Confirmar visita" nunca te avisa
- O comparecimento fica incalculável — e comparecimento é 65% da meta
- **O cliente simplesmente não aparece, e ninguém sabia que ele viria**

**O certo.** O modal de etapa `agendado` existe exatamente para isso. Preencha data,
hora e empreendimento. **Mudar o status não é agendar.**

---

### ERRO 3 — Deixar o cliente sem próximo passo com data

**O que acontece.** "Vou falar com ele depois." Depois não é data.

**O que quebra.** O lead cai no balde `sem_acao`, ocupa uma das 65 vagas da carteira,
não recebe toque da régua, e some da sua cabeça em 48 horas.

**O certo.** Todo desfecho da Fila Única **já cria** a próxima tarefa com data. Se você
registrar, o erro é impossível. Se o cliente pediu retorno numa data específica,
**use a data dele, não a da régua.**

---

### ERRO 4 — Trabalhar lead frio novo antes do fundo do funil parado

**A conta.** Lead em `analise_credito` vale **0,39 venda** em expectativa **[MEDIDO]**.
Lead frio novo vale ~0,005. **Diferença de 78 vezes.**

**Evidência [MEDIDO].** Em 12/09, **124 dos 134** leads em análise estavam parados 5+
dias, enquanto a base tinha 47.961 leads frios disponíveis. A operação estava mexendo
no lugar errado.

**O certo.** A Fila Única já põe `fundo` como balde 1. **Trabalhe de cima para baixo e
não pense.** A única exceção é o lead novo com SLA correndo — esse interrompe qualquer
coisa, porque o relógio de 15 minutos é irreversível.

---

### ERRO 5 — Não marcar "perdido" com motivo

**Evidência [MEDIDO].** Só **3,6%** da base está em `perdido`. Uma operação MCMV
saudável perde 60–80% dos leads — **e sabe por quê**.

**O que quebra.**
- Lead morto ocupa vaga na sua carteira de 65 e **empurra lead vivo para a Reserva**
- A gestão não sabe se o problema é mídia (`sem_perfil`), produto (`preco_parcela`) ou
  crédito (`credito_score` vs `credito_renda`)
- Você não recebe lead novo porque sua carteira está "cheia" de gente morta

**O certo.** Uma das **11 categorias**, todo dia, no fechamento. E perder não é jogar
fora: o job `sdr-alimentar-perdidos` recicla 100 perdidos por dia para o SDR reaquecer.

---

## 🟠 Os 5 erros caros

### ERRO 6 — Usar a Base de leads (`/leads`) como fila de trabalho

A Base serve para **buscar** um cliente específico. Usá-la para escolher quem chamar
descarta o Score de prioridade, os sete baldes e o relógio de dias parados. Você volta
a trabalhar por memória — e a memória escolhe sempre os mesmos clientes simpáticos.

**O certo.** `/fila`, de cima para baixo.

---

### ERRO 7 — Discar sem tabular

O discador 3C Plus grava a chamada, mas **sem tabulação não existe resultado**. A régua
não avança o contador, e o lead volta amanhã no mesmo toque.

**Nota técnica útil:** `followup_toques_do_lead` colapsa eventos a menos de 10 minutos
num toque só — então tabular **e** registrar o desfecho **não conta dobrado**. Faça os
dois.

---

### ERRO 8 — Não preencher a qualificação

**Evidência [MEDIDO].** Nos leads amostrados: `renda_informada`, `faixa_mcmv`,
`tipo_renda`, `tem_fgts`, `resumo_qualificacao` — **todos nulos**, inclusive num lead
já em análise de crédito.

**O que quebra.** Sem faixa MCMV não há match de produto, não há simulação correta, e a
pasta entra na Caixa às cegas — o que vira reprovação e `credito_renda` no motivo de
perda.

**O certo.** Renda · tipo de renda · FGTS · entrada · decisor · faixa MCMV. **Na
primeira conversa efetiva**, sempre.

---

### ERRO 9 — Acumular leads sem desovar a carteira

Teto de **65**. Quem estoura para de receber lead novo.

**Importante:** estourar **por fundo de funil é bom** — o CRM diz explicitamente
*"nenhum negócio avançado foi devolvido"*. Estourar por lead frio parado é ruim.

**O certo.** Desovar = avançar, ou marcar perdido com motivo, ou mandar para a Reserva.

---

### ERRO 10 — Ditar para a Sami e não confirmar a proposta

A Sami monta o pacote (interação + objeção + follow-up) mas **espera confirmação**.
Ditar e fechar a tela = nada gravado. É o ERRO 1 com passos extras.

---

## 🟡 Os 5 erros de ritmo

### ERRO 11 — Não declarar as metas do dia

Sem a declaração, os checkpoints das 12h, 15h e 17h **não disparam**. Você perde os três
avisos de ritmo do dia e descobre na sexta que a semana não fechou.

### ERRO 12 — Não marcar presença

Sem presença, **você não entra na roleta** — nem no quente, nem na base. Você passa o dia
sem receber lead e acha que "não está chegando lead".

### ERRO 13 — Estourar o SLA de 15 minutos duas vezes no mesmo dia

Dois estouros **pausam você no lead quente até o dia seguinte**. O lead quente é o de
maior conversão da casa. Perder o dia inteiro de quente por dois atrasos é caro.

### ERRO 14 — Não confirmar a visita

Sem o protocolo D-2 / D-1 / D+0 o comparecimento cai de 65% para 30–40% **[HIPÓTESE]**.
Metade das visitas que você agendou vira no-show — e no-show que não é registrado nem
remarca.

### ERRO 15 — Não oferecer visita em toda conversa ativa

**Este é o erro que explica o gargalo #1 da SMQ.** A passagem `em_atendimento →
agendado` marca **7% contra meta de 70% [MEDIDO]**. Com 7%, seriam necessários **434
leads por semana** para 1 venda, em vez de 43 — dez vezes mais
([Doc 8 §4](08-indicadores.md)).

**O certo.** Oferta assumida, com duas opções:

> *"Separei duas opções que cabem na sua renda. Você prefere conhecer **sábado de manhã
> ou sábado à tarde**?"*

Nunca *"quer visitar?"*.

---

## Tabela de consulta rápida

| # | Erro | Custo | Onde se corrige |
| :-: | --- | --- | --- |
| 1 | Não registrar o desfecho | 🔴 quebra o CRM inteiro | `[Registrar]` na `/fila` |
| 2 | "Agendado" sem agendamento | 🔴 visita perdida | modal de etapa |
| 3 | Sem próximo passo com data | 🔴 cliente esquecido | desfecho cria sozinho |
| 4 | Lead frio antes do fundo | 🔴 78× menos valor | ordem da `/fila` |
| 5 | Não marcar perdido | 🔴 carteira entupida | 11 categorias |
| 6 | Base de leads como fila | 🟠 perde priorização | usar `/fila` |
| 7 | Discar sem tabular | 🟠 régua trava | tabulação 3C Plus |
| 8 | Qualificação vazia | 🟠 pasta reprovada | ficha do lead |
| 9 | Carteira entupida | 🟠 para de receber | `/reserva` |
| 10 | Sami sem confirmar | 🟠 nada gravado | confirmar proposta |
| 11 | Metas não declaradas | 🟡 sem checkpoints | popup de manhã |
| 12 | Sem presença | 🟡 sem leads | botão "Cheguei" |
| 13 | 2 estouros de SLA | 🟡 dia sem quente | atender em 15 min |
| 14 | Visita não confirmada | 🟡 no-show | D-2 / D-1 / D+0 |
| 15 | Não oferecer visita | 🔴 **o gargalo #1** | duas opções de horário |
