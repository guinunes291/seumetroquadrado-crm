# Botão "Pedir lote" na Prospecção (30 clientes do Bolsão por zona)

## O que o corretor vai ver
- Na tela de Prospecção (Modo Foco) aparece um cartão **"Pedir lote de 30"** com a escolha de zona (Leste, Oeste, Norte, Sul, Centro).
- Ao pedir, ele recebe até 30 clientes do Bolsão daquela zona. Se a zona tiver menos, recebe o que houver, com o aviso "Vieram X clientes".
- Os clientes do lote entram direto na cadência (Lead chegou → D1 → D2 → D3 → encerramento) e aparecem na Fila do Dia.
- No encerramento, quem respondeu **fica** na carteira ativa. Quem não respondeu **sai** e volta ao Bolsão, pela regra de encerramento que já existe hoje.
- O cartão mostra o andamento do lote atual: "Lote de 26/09 — 18 em cadência, 7 ficaram, 5 saíram".

## Travas (as respostas que você deu)
- **Novo lote só depois de zerar o anterior:** o botão fica bloqueado enquanto algum cliente do último lote ainda estiver na cadência. Aparece o motivo e quantos faltam.
- **Carteira cheia bloqueia:** se a carteira ativa estiver no teto (65), o botão fica bloqueado com a explicação.
- **Zona com poucos clientes:** entrega o que tiver.

## Portas que fecham (base nova só pelo lote)
- Entrega automática de 15 por dia do estoque: **desligada**.
- "Assumir" cliente do Bolsão pelo Discador: **fechado para o corretor**. O Discador continua ligando e registrando o atendimento, mas não passa o cliente para ele.
- Resgate da Reserva: **fechado para o corretor**.
- Continuam iguais: roletas, redistribuição, cadastro manual de cliente próprio, e tudo que a gestão já faz.
- O SDR não muda.

## O que escolhe os 30
Mesmo critério do Bolsão hoje (clientes sem dono e liberados): nada de fase avançada, venda viva, descanso da cadência ou cliente em triagem do SDR. Primeiro os que estão parados há mais tempo e têm telefone válido. Dois corretores pedindo ao mesmo tempo nunca recebem o mesmo cliente.

## Gestão
- Cada lote fica registrado (quem pediu, zona, quantos vieram, quantos ficaram/saíram) e aparece no Painel da cadência.
- Uma chave na configuração da cadência permite religar as portas antigas se precisar voltar atrás.

---

## Detalhes técnicos
- Nova tabela `prospeccao_lotes` (id, corretor_id, zona, solicitados, entregues, created_at) + `leads.prospeccao_lote_id` (nullable). GRANT + RLS: corretor lê os seus; gestão lê pelo `_gestao_escopo`.
- RPC `prospeccao_pedir_lote(_zona text)` SECURITY DEFINER: valida papel corretor ativo, carteira < teto (`carteira_ativa_config`), nenhum lead do lote anterior ainda em cadência; seleciona via `_bolsao_elegivel` + zona do lead/projeto com `FOR UPDATE SKIP LOCKED LIMIT 30`; atribui usando o mesmo caminho de `atribuir_lead_a_corretor` (log em distribution_log tipo manual, motivo 'lote_prospeccao'); insere em cadência na etapa inicial reutilizando a função de admissão existente (Fase 0).
- RPC `prospeccao_lote_status_v1()` para o cartão.
- `cadencia_config`: `lote_estoque_dia` → 0; nova coluna `portas_legadas_bolsao boolean default false`; `discador_bolsao_assumir_v1` e `carteira_resgatar` passam a recusar corretor quando false (gestão segue podendo).
- Front: cartão em `src/features/prospeccao/modo-foco-page.tsx`, hook em `src/features/prospeccao/use-lote.ts`; esconder botões "Assumir"/"Resgatar" para corretor. Testes vitest para a lógica do cartão e teste de banco para as travas.
- Nada muda em comissões, roleta, SLA ou financeiro.
