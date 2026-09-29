# Lote de prospecção — 30 clientes do Bolsão por zona

> Migration `supabase/migrations/20261005120000_prospeccao_lote_30.sql`
> (espelho `drizzle/migrations/0023_prospeccao_lote_30.sql`). Testes:
> `tests/db/prospeccao-lote.test.ts` (regras) e `tests/prospeccao-lote.test.tsx`
> (tela).

## 1. O que é

No **Modo Foco da Prospecção** o corretor escolhe uma zona (Norte, Sul, Leste,
Oeste, Centro) e pede um lote. Vêm até **30 clientes sem dono** dessa zona, os
parados há mais tempo primeiro. Eles entram direto na cadência (Lead chegou →
D1 → D2 → D3) e são trabalhados na **Fila do Dia** (`/cadencia`), marcados como
"Lote".

Decisões do dono:

- 28/09/2026 — novo lote só quando ninguém do anterior estiver mais na
  cadência; carteira ativa no teto bloqueia; base nova do corretor só por essa
  porta (resgate da Reserva, "assumir" pelo Discador e admissão do estoque
  fechados para o corretor; a gestão segue podendo).
- 29/09/2026 — "esses 30 que puxar não devem fazer parte da base ativa do
  corretor".

## 2. "Fora da base ativa" no banco

Enquanto o cliente do lote está em D0..D3 (`_prospeccao_em_lote`):

| Onde                                          | Efeito                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Carteira de 65 (`carteira_vagas_v1`)          | não ocupa vaga (já era assim: é base em formação)                      |
| Vaga de entrada (`carteira_vagas_entrada_v1`) | **não ocupa** — a roleta continua mandando lead pago ao corretor       |
| Admissão do estoque (Fase 0)                  | não conta na cota da formação                                          |
| Modo Foco (três bases) e badge                | fica de fora (`FORA_DO_LOTE_ATIVO` na tela, `nav_pendencias` no banco) |
| Fila do Dia                                   | vem depois dos clientes da carteira, no mesmo balde (atrasados / hoje) |

O tamanho do lote **não depende das vagas**: são 30 (ou o que a zona tiver). A
trava "carteira cheia" continua, porque quem responde sobe para os 65.

Quando o cliente responde ou avança de fase, sai da cadência e segue as regras
normais da carteira.

## 3. Quem vem no lote (`_prospeccao_lote_elegivel`)

- Bolsão de verdade: `_bolsao_elegivel` (sem dono, telefone discável, sem
  opt-out, sem venda viva, sem arquivado, fora da reativação).
- Entra na cadência: sem etapa, status `novo`, `aguardando_atendimento`,
  `em_atendimento` ou `aguardando_retorno`.
- Não é pago (Facebook, Marquinhos, Impulso SMQ, SDR) nem está com o SDR.
- Não está sendo distribuído: criado há mais de 1 dia, fora da fila da roleta
  (`aguardando_corretor`), sem exceção de distribuição aberta.
- Ninguém está discando agora (reserva viva do Discador).
- Anti-ioiô: não foi devolvido por este corretor, nem vencido num lote dele, há
  menos de `discador_anti_ioio_dias` (30).
- Zona pela mesma cascata de `zona_do_lead`: zona do lead → bairro → projeto
  (`zona_smq` ou `regiao`), normalizada ("Zona Leste" = Leste).

## 4. As saídas

| Caminho                                              | Destino                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Respondeu / agendou / avançou                        | fica com o corretor ("ficaram")                                                                 |
| Cadência cumprida sem retorno                        | descanso → reativação (regra geral da cadência)                                                 |
| Etapa vencida, cadência incompleta, corretor inativo | **volta ao Bolsão** como estava (status, classe, data de distribuição) — nunca à fila da roleta |
| Transferência pela gestão                            | o lote solta o lead (gatilho) e ele segue com o novo dono                                       |

Placar por lote: `_prospeccao_lote_placar` (entregues = em cadência + ficaram +
saíram). A gestão vê em **Cadência › Painel › Lotes de prospecção**.

## 5. O que a versão de 28/09 (Lovable) tinha de errado

A versão aplicada em produção pelo Lovable ficou presa no branch `lovable-sync`
(o PR da Academia entrou no `main` 52 segundos antes). Corrigido aqui:

1. Zona comparava o texto cru do projeto ("Zona Leste" ≠ "Leste").
2. Aceitava `qualificado`/`qualificacao_corretor`, que não entram na cadência.
3. Pegava lead pago, a fila da roleta, lead chegando e reserva do Discador.
4. O SLA de 15 minutos tomava o lote (classe `quente` / `via_webhook`).
5. Vencido ia para a fila da roleta e furava a fila dos leads pagos.
6. 30 alertas e 30 pushes "Novo lead recebido" de uma vez.
7. A admissão do estoque (Painel) quebrava em silêncio; agora diz por quê.

## 6. Implantação

Ordem: **banco primeiro, app depois**. Se o app subir antes, o botão fica
travado com o aviso "O lote está sendo atualizado no banco" (a tela detecta a
versão velha pela falta de `em_cadencia_total`).

1. Aplicar `drizzle/migrations/0023_prospeccao_lote_30.sql` no banco de
   produção (mesmo texto de `supabase/migrations/20261005120000_…`). Ela é
   idempotente e foi testada nos dois caminhos: banco com a versão do Lovable e
   replay do zero.
2. Regenerar `src/integrations/supabase/types.ts`.
3. Publicar o app.

Conferência depois de aplicar:

```sql
-- a versão nova está no ar (deve trazer em_cadencia_total)
select pg_get_functiondef('public.prospeccao_lote_status_v1()'::regprocedure)
       like '%em_cadencia_total%' as nova;

-- quantos clientes cada zona tem para lote hoje (visão geral, sem anti-ioiô)
select public._prospeccao_zona_do_lead(l) as zona, count(*)
  from public.leads l
 where l.corretor_id is null
   and public._prospeccao_lote_elegivel(l, '00000000-0000-0000-0000-000000000000', 30)
 group by 1 order by 2 desc;
```

## 7. Pontos em aberto (decisão do dono)

- **Comissão**: o documento do Bolsão (`bolsao-oportunidades-fatia4.md` §9)
  pede a regra de comissão de quem puxa lead parado publicada antes do primeiro
  puxão. O lote não mexe em comissão.
- **Motor da cadência**: o lote só anda com `cadencia_config.modo = 'ativo'`
  (é o motor que avança etapa, vence prazo e encerra).
- **Portas antigas**: `cadencia_config.portas_legadas_bolsao = true` religa
  resgate da Reserva, "assumir" pelo Discador e a admissão do estoque.
