# Fase 1 — régua de follow-up: fim da duplicação e limpeza do passivo

Data: 2026-09-16.

## 1.1 Correção (código)

`src/features/fila-unica/use-desfecho.ts`: antes de `garantirFollowUpAberto`,
o desfecho agora chama `concluirToquesDeHoje(lead.id)`
(`src/features/followup/fila-client.ts`) — o mesmo caminho que a Fila de
follow-up (`followup/fila-view.tsx`) já usava. Ordem: **concluir primeiro,
criar depois**. O erro **não é engolido**: se a conclusão falhar, o desfecho
inteiro falha e o corretor vê o toast de erro — caso contrário a duplicata
voltaria em silêncio.

Antes: cada desfecho criava um novo toque e deixava o vencido aberto → o lead
acumulava tarefas de contato. Depois: exatamente 1 tarefa de contato aberta
por lead após o desfecho.

## Decisão sobre o "Desfazer" de 5 s

O `desfazerDesfecho` continua desfazendo **apenas o que ele criou**: soft-delete
da interação e da tarefa nova (status `cancelada`) e restauração das objeções.
As tarefas antigas concluídas por `concluirToquesDeHoje` **não são reabertas**.

Motivo: o toque foi realmente dado (o corretor falou com o cliente); o Desfazer
existe para corrigir o registro do desfecho, não para negar que o contato
ocorreu. Reabrir tarefas vencidas no undo recriaria o passivo e faria o lead
voltar à fila todo dia. Se o corretor precisar de um novo toque, ele registra
um desfecho novo — que agenda a próxima tarefa pela régua.

## 1.2 Teste

`tests/use-desfecho.test.ts` — "conclui os toques vencidos ANTES de criar o
próximo (sem duplicata)": garante o `update {status:'concluida'}` em `tarefas`
e que ele ocorre antes da criação/leitura da tarefa nova. Suíte: 6/6 passando.

## 1.3 Limpeza das duplicatas (executada)

Dry-run imediatamente antes do UPDATE: **2.498 tarefas** em **1.612 leads**
(bate com a Fase 0). Regra: manter, por lead, a tarefa de contato aberta de
**vencimento mais recente** (desempate por `created_at`) e marcar as demais
como `cancelada`.

Números depois: 2.498 canceladas; **0** leads com mais de uma tarefa de contato
aberta; restam **6.738** tarefas de contato abertas para 6.738 leads.

**Os 5.126 leads com tarefa única e vencida ficaram de fora DE PROPÓSITO.**
Não é defeito de software: são toques que a régua agendou e ninguém trabalhou.
Marcá-los como concluídos seria mentira no histórico. Eles saem pelo trabalho
do time.

## Como reverter

```sql
UPDATE public.tarefas
SET status = 'pendente'
WHERE status = 'cancelada'
  AND tipo IN ('follow_up','ligacao','whatsapp','email')
  AND deleted_at IS NULL
  AND updated_at::date = date '2026-09-16';
```

(O código: reverter o commit que adicionou `concluirToquesDeHoje` em
`use-desfecho.ts`.)
