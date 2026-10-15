# Roletas simples — só quatro: Campanha, Filial, SDR e Marquinhos

> Migrations: `20261023120000_roletas_simples.sql` (drizzle `0084`) e
> `20261024120000_marquinhos_automatica.sql` (drizzle `0088`). As drizzle
> 0085–0087 entre elas são a importação de leads por CSV, criada pelo Lovable.
> Testes: `tests/db/roletas-simples.test.ts`, `tests/db/estoque-filiais.test.ts`,
> `tests/db/marquinhos-automatica.test.ts`, `tests/quadro-roletas.test.tsx`,
> `tests/roletas-simples-telas.test.tsx`.
> Antes: [roletas-por-filial.md](roletas-por-filial.md) (12/10/2026).

## 1. O pedido e as decisões (13/10/2026)

O pedido do dono:

> "Precisamos deixar as roletas mais simples de entender quem está em qual
> roleta. Precisamos apenas dessas roletas no sistema: Roletas por campanha
> Facebook ADS (independe a filial que corretor está), Roletas por Filial,
> Roleta SDR, Roleta Marquinhos."

Antes havia seis "famílias" com regras próprias:

- 3 roletas de filial;
- Plantão, Landing e Base;
- campanhas de dois modos (equipe fixa e comum), com filial dona;
- o SDR;
- a Marquinhos;
- 6 `zona-*` antigas.

A aba Filas tinha 3 ou 4 níveis de abas, e nenhuma tela respondia "quem está em qual roleta".

As decisões tomadas com o dono:

| Tema                                              | Decisão                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead **sem zona** (era do Plantão e da Landing)   | **Rodízio entre as filiais**: vai para a filial há mais tempo sem receber lead sem zona. A filial sem ninguém apto **para este lead** é pulada. |
| Campanhas                                         | **A equipe sempre recebe, de qualquer zona.** Toda campanha vira "equipe fixa". Somem o modo comum, o interruptor e a **filial dona**.          |
| Marquinhos — distribuição                         | **Como hoje**: lead do bot com zona vai primeiro a quem da Marquinhos atende a zona.                                                            |
| Marquinhos — quem está                            | **Automático: os 6 com mais vendas nos últimos 30 dias.** Conta a quantidade de vendas `pendente`/`aprovada` sem distrato; empate pelo VGV.     |
| Marquinhos — quem era "Inapto"                    | Vira **bloqueio manual**: a regra não o traz de volta.                                                                                          |
| Estoque (era o cron `distribuir-estoque-plantao`) | **Passa para as filiais**, por vaga na carteira.                                                                                                |
| Cota diária padrão (`limite_diario_default`)      | **De 10 para 20.** O lead sem zona deixou de ter a cota própria do Plantão e da Landing.                                                        |
| Tela                                              | **Quadro corretor × roleta**: colunas Filial · Campanhas · SDR · Marquinhos, com filtros de filial, de campanha e "só sem roleta".              |

A revisão técnica acrescentou quatro proteções:

1. **O estoque não conta na cota nem anda a fila.** Um lote de 30 esgotaria a cota de 20 e travaria o lead quente do dia.
2. **No repasse de campanha, o lead sem zona sem ninguém livre na equipe vai para o rodízio.** Antes ele ficava preso na campanha.
3. **A Marquinhos fora do horário não segura o lead do bot.** O lead vai para o rodízio.
4. **Remoção da Marquinhos anterior à regra não conta como bloqueio.** Só vale a partir de `marquinhos_regra_desde`.

## 2. A regra em uma página

| Roleta                                     | Quem está                                                                             | Que lead recebe                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Filial** (Barra Funda, Liberdade, Belém) | O time fixo da loja, montado pela gestão. É a região do corretor, por filial inteira. | Lead com zona: a filial da zona (a Leste alterna entre Liberdade e Belém). **Lead sem zona: o rodízio entre as filiais.** **Estoque:** um lote por corretor, por vaga na carteira, fora da cota. |
| **Campanha Facebook Ads**                  | A equipe da campanha, com corretores de qualquer filial                               | O lead do webhook da campanha, **de qualquer zona**. Ninguém da equipe apto: a filial da zona; lead sem zona, o rodízio.                                                                         |
| **SDR** (Agendados do SDR)                 | Sem mudança: manual, ou a regra semanal                                               | Sem mudança.                                                                                                                                                                                     |
| **Marquinhos**                             | **Automático: top 6 em vendas (30 dias)**, apurado todo dia às 06:50                  | Lead do bot com zona: quem da Marquinhos atende a zona; ninguém, a filial da zona. Lead do bot sem zona: a Marquinhos inteira. Marquinhos vazia ou fora do horário: o rodízio entre filiais.     |

Plantão, Landing e Base ficam **desligadas e nunca apagadas**. Os motivos:

- **Histórico:** o "Roleta Plantão (antiga)" continua aparecendo no histórico.
- **Participações:** ficam intactas.
- **Rollback:** depende delas.

É a mesma convenção usada nas `zona-*` em 12/10.

## 3. Como o lead escolhe a roleta

**Lead com zona.** Nada muda: vai para a roleta da filial que atende a zona.

**Lead sem zona** (site ou landing sem região, indicação, cadastro manual, reativação), que não é de campanha nem do bot. A decisão segue esta ordem:

1. **Pino de filial**, que é a memória do repasse:
   - se essa filial está pronta para este lead, fica nela;
   - se não está, o pino vira "pino fraco": o lead só espera nela se nenhuma outra filial estiver pronta.
2. **Origem configurada.** Hoje só pode ser a `marquinhos` (chatbot), e só vale se ela estiver pronta para este lead.
3. **O rodízio.** É a primeira filial pronta em `rodizio_sem_zona`, na ordem `ultimo_lead_em NULLS FIRST` e depois pela ordem da filial.
   - A escolha usa `FOR UPDATE SKIP LOCKED`, então nunca espera: dois leads simultâneos vão para filiais diferentes. É o mesmo padrão do cursor da Leste.
4. **Nenhuma filial pronta.** O lead espera na primeira filial com time, e a exceção é registrada:
   - `sem_corretor_elegivel`, se há time mas ninguém apto para este lead;
   - `sem_corretor_ativo`, se nenhuma filial tem time.

   Os dois motivos já disparam o **fallback por velocidade** do cron, sem mudança em `processar_distribuicao_automatica`.

"Pronta para este lead" quer dizer que há alguém apto que ainda não teve este lead (`_roleta_pronta_para_lead`). Por isso o repasse por SLA não volta para quem já o teve.

**O cursor do rodízio usa `clock_timestamp()`, não `now()`.** O cron entrega até 200 leads numa transação só. Com `now()`, todas as filiais empatavam e a primeira ganhava sempre. O teste com 5 leads na mesma transação (BF → Liberdade → Belém → BF → Liberdade) falha com `now()`. O mesmo conserto foi aplicado ao cursor da Leste (`zonas_roletas`).

**Lead de campanha** (webhook com token):

- Vai para a equipe pelo SWRR por faixa A/B/C, de qualquer zona.
- A lista de aptos é montada **antes** da trava `roleta_swrr:`. Antes, a campanha travava a si mesma e depois a filial, enquanto o cron travava na ordem inversa, o que permitia deadlock.
- Ninguém apto: o lead vai para o motor. Com zona, motivo `campanha_equipe_fixa_sem_zona`; sem zona, `campanha_equipe_sem_apto`.
- O repasse por SLA fica na equipe. Sem ninguém livre, o lead sem zona vai para o rodízio.

**Atribuição direta** (estoque, fallback, exceção ou manual) sempre rotula o log com uma roleta, nunca com NULL. A ordem de escolha é:

1. o slug pedido;
2. a filial do corretor que atende a zona;
3. a roleta da zona;
4. a primeira filial do rodízio.

Um `roleta_slug` NULL no log contaria contra a cota de **todas** as roletas.

**Pedido para roleta desligada** é ignorado: vale para plantao, landing, base e `zona-*`, num pino antigo ou na config. O valor fica no contexto da decisão como `roleta_pedida`.

## 4. O estoque pelas filiais

`distribuir_estoque_filiais(_limite, _roletas)` roda pelo cron `distribuir-estoque-filiais` a cada 10 minutos, com lote de 30 por corretor. Também roda pelo botão "Escoar estoque (todas as filiais)".

- **Uma linha por corretor**, apto em qualquer filial ativa. Quem está em duas filiais recebe **um** lote, nunca acima das vagas da carteira.
- **Que estoque recebe:** o das zonas das filiais em que está **apto**, mais o estoque sem zona. Pausado na Barra Funda e apto na Belém: só o da Belém.
- **Ordem:** quem está há mais tempo sem lead (`profiles.last_lead_assigned_at NULLS FIRST`), depois quem entrou antes na roleta.
- **Rótulo no log:** `regra_aplicada = 'estoque_filial'`. Esse rótulo deixa a entrega **fora da cota** (`_elegibilidade_roleta`) e **fora da vez única**. Além disso, a posição na fila (`ultimo_lead_em`) não anda.
- **Concorrência:** usa `pg_try_advisory_xact_lock('estoque_filiais')`, então o cron e o botão nunca rodam juntos. A segunda rodada desiste na hora, com `escoamento_em_andamento`, e a tela avisa.
- **Parte do SDR:** roda uma vez só.
- **Assinatura antiga:** `distribuir_estoque_roleta(_roleta, _limite)` continua existindo, para o front antigo. Ela funciona assim:
  - com uma filial ativa, roda só para ela;
  - com outra roleta ativa, roda o corpo antigo (`_distribuir_estoque_roleta_legado`);
  - com uma roleta desligada (`'plantao'`), roda para todas as filiais.

## 5. A Marquinhos automática (0088)

**Configurações** em `distribuicao_settings`, editáveis em Central → Política → "Roleta Marquinhos — automática":

| Chave                     | Padrão                    |
| ------------------------- | ------------------------- |
| `marquinhos_regra_ativa`  | `true`                    |
| `marquinhos_top_n`        | `6`                       |
| `marquinhos_janela_dias`  | `30` (inclui hoje)        |
| `marquinhos_status_venda` | `["pendente","aprovada"]` |
| `marquinhos_regra_desde`  | o momento da aplicação    |

**O ranking (`_marquinhos_ranking`):**

- **Universo:** corretor ativo, com `status_conta = 'ativa'` e papel de corretor.
- **Vendas contadas:** status configurado, sem distrato, com `data_assinatura` em `(hoje − janela, hoje]`, em horário de Brasília.
- **Ordem:** quantidade de vendas, depois VGV (`valor_venda`), depois a última venda, depois o nome.
- **Quem entra:** só quem tem pelo menos 1 venda.

**A apuração (`_marquinhos_aplicar`):**

- Roda no cron `marquinhos-apuracao-diaria`, `50 9 * * *` UTC, que é 06:50 em Brasília, antes dos check-ins. Também roda pelo botão "Apurar agora" (admin).
- Os N do topo entram ou voltam. O `ultimo_lead_em` é mantido, para ninguém furar a fila.
- Quem está ativo e fora do topo sai (`ativo = false`).
- Cada mudança gera uma linha em `roleta_participantes_log` com `feito_por = NULL` e motivo "Regra Marquinhos: 2º em vendas nos últimos 30 dias (5 vendas) — apuração de 14/10".
- **A regra nunca mexe em pausa.** Pausado e no topo: continua no time e não recebe até a pausa acabar.
- Rodar de novo não muda nada; só reescreve o placar do dia em `marquinhos_apuracoes`.
- Ninguém com venda: a roleta fica vazia, o sino dos gestores recebe um alerta, e o lead do bot vai para a filial da zona ou para o rodízio.

**Bloqueio manual.** A última inclusão ou remoção do corretor é uma remoção feita por uma **pessoa** (`feito_por` preenchido), depois de `marquinhos_regra_desde`. É o mesmo padrão da regra semanal do SDR. Na aba Roletas → Marquinhos:

| Ação                           | Efeito                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Bloquear** (com confirmação) | `gerenciar_participante_roleta('marquinhos', id, 'remover')`. Sai na hora e o próximo do ranking entra. |
| **Devolver à regra** (admin)   | `incluir`. Limpa o bloqueio e reaplica a regra.                                                         |
| Reativar                       | Só tira a pausa.                                                                                        |

**"Inapto" vira bloqueio.** A pausa até 2099 que a tela antiga usava como "Inapto" vira `ativo = false`, com log `removido` assinado por quem pausou. Se não houver registro de quem pausou, assina o primeiro admin. Isso acontece na própria migration, antes da primeira apuração.

**Com a regra desligada** (`marquinhos_regra_ativa = false`), tudo volta ao comportamento manual de antes: a tela mostra a Marquinhos simples, e o cron devolve `regra_inativa` sem mexer em nada.

## 6. O que a gestão vê

- **Central → "Quem está em qual roleta"** (a antiga aba Corretores; o link `?tab=corretores` continua valendo). Uma linha por corretor:

  | Coluna         | Como funciona                                                                                                                         |
  | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
  | **Filial**     | Editor por filial inteira. Só o admin edita; grava em `atualizar_corretor_distribuicao`.                                              |
  | **Campanhas**  | Popover com as campanhas ativas; grava em `gerenciar_participante_roleta`. O gestor edita só o próprio time (o banco também confere). |
  | **SDR**        | Caixa de seleção. Só leitura com a regra semanal ligada e fora do modo sombra.                                                        |
  | **Marquinhos** | Sempre só leitura: "2º em vendas", "Fora — 9º (top 6)", "Bloqueado pela gestão" ou "Sem venda em 30 dias".                            |

  Acima da tabela ficam os totais por filial, campanhas, SDR, Marquinhos e "Sem roleta" (clicar filtra). Também há os filtros de filial, campanha, "Só quem está sem roleta" e a busca por nome.

- **Central → Roletas** (o valor da aba continua `filas`). Tem quatro grupos, na ordem do pedido: Campanhas Facebook Ads · Filiais · SDR · Marquinhos.
  - A nova campanha pede só o nome.
  - As propriedades da campanha perderam o interruptor de equipe fixa e a filial.
  - O grupo Filiais tem o botão "Escoar estoque (todas as filiais)".
  - Plantão, Landing e Base não aparecem. Um link antigo `?tab=plantao` abre a aba Roletas no grupo padrão.
- **Indicadores do topo:**
  - "Aptos · Filiais": pessoas distintas, que contam uma vez mesmo se estão em duas filiais;
  - "Aptos · Marquinhos";
  - "Time do SDR".
- **Visão geral:** um cartão por filial, a linha "Lead sem zona: a vez é da X", e os cartões da Marquinhos e do SDR.
- **Configurações → Origens:** o seletor tem só "Filiais (zona do lead; sem zona, rodízio)" e "Roleta Marquinhos". O banco recusa qualquer outro valor, com o erro 22023.
- **Cartão do corretor e "Sua vez":** não mudam no código, porque as RPCs deles já filtram roleta ativa.

## 7. Peças no banco

| Peça                                                                                                               | O quê                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rodizio_sem_zona (roleta_slug, ultimo_lead_em)`                                                                   | Cursor do rodízio do lead sem zona, uma linha por filial. Fica numa tabela e não em `roletas`, porque `roletas` é lida em toda entrega e travar linhas dela brigaria com as chaves estrangeiras. **Filial nova precisa de uma linha aqui.** |
| `_roletas_sem_zona(_tentaram)`, `roleta_sem_zona_da_vez()`                                                         | As filiais na ordem do rodízio, com `pronta` e `da_vez`, e a filial da vez (Visão geral).                                                                                                                                                   |
| `trg_roletas_campanha_equipe_fixa`                                                                                 | Força `equipe_fixa = true` e `filial_id = NULL` em toda campanha. O front antigo continua salvando sem erro.                                                                                                                                |
| `_distribuir_lead_v3`                                                                                              | Os blocos `[ROLETAS SIMPLES]`: o rodízio, o pino fraco, a roleta desligada ignorada, o rótulo da atribuição direta, o estoque fora da fila e o `clock_timestamp()`.                                                                         |
| `distribuir_lead_ponderado`, `_repassar_lead_campanha`                                                             | A equipe é montada antes da trava. Sem apto, o lead vai para o motor (filial da zona ou rodízio).                                                                                                                                           |
| `_elegibilidade_roleta`, `_vez_unica_unidades`                                                                     | Ignoram `estoque_filial`, que fica fora da cota e da vez única.                                                                                                                                                                             |
| `distribuir_estoque_filiais`, `distribuir_estoque_roleta` (wrapper), `_distribuir_estoque_roleta_legado`           | O estoque pelas filiais (§4).                                                                                                                                                                                                               |
| `_zona_destravar_espera`                                                                                           | O check-in também acorda o lead sem zona que está esperando.                                                                                                                                                                                |
| `painel_distribuicao_resumo`                                                                                       | Ganhou `aptos_filiais`, `aptos_por_filial`, `time_sdr` e `sem_zona_da_vez`. `aptos_plantao` e `aptos_landing` continuam existindo, com o número das filiais.                                                                                |
| `atualizar_distribuicao_config`                                                                                    | A origem só aceita `marquinhos` ou NULL (NULL quer dizer filiais). Não uso CHECK constraint: ela travaria uma tabela lida o tempo todo e tiraria do rollback o caráter de "só dados".                                                       |
| `criar_roleta_campanha`, `atualizar_roleta`                                                                        | Mesmas assinaturas. A campanha nasce de equipe fixa e sem filial, e religar plantao, landing ou base dá o erro 22023.                                                                                                                       |
| `marquinhos_apuracoes`, `_marquinhos_ranking`, `_marquinhos_aplicar`, `marquinhos_apurar`, `marquinhos_ranking_v1` | A Marquinhos automática (§5). O ranking é visto pela gestão inteira; o corretor vê só a própria linha.                                                                                                                                      |
| `gerenciar_participante_roleta`                                                                                    | Na Marquinhos com a regra ligada: `remover` bloqueia e reaplica; `incluir` (só admin) devolve à regra.                                                                                                                                      |
| Cron                                                                                                               | Sai `distribuir-estoque-plantao`. Entram `distribuir-estoque-filiais` (`*/10 * * * *`) e `marquinhos-apuracao-diaria` (`50 9 * * *`).                                                                                                       |

## 8. Pré-checagem (rodar ANTES de aplicar e guardar o resultado no §11)

```sql
-- 8.1 Quem SÓ está no Plantão/Landing/Base (fica sem roleta na virada).
--     Corrigir antes: dar filial (Central → Corretores) ou pôr numa campanha.
SELECT p.nome, string_agg(r.slug, ', ' ORDER BY r.slug) AS onde
  FROM public.roleta_participantes rp
  JOIN public.roletas r  ON r.id = rp.roleta_id AND r.slug IN ('plantao', 'landing', 'base')
  JOIN public.profiles p ON p.id = rp.corretor_id AND p.ativo
 WHERE rp.ativo
   AND NOT EXISTS (
     SELECT 1 FROM public.roleta_participantes rp2
       JOIN public.roletas r2 ON r2.id = rp2.roleta_id AND r2.ativo
      WHERE rp2.corretor_id = rp.corretor_id AND rp2.ativo
        AND (r2.tipo IN ('campanha', 'sdr') OR r2.slug = 'marquinhos'
             OR (r2.tipo = 'zona' AND r2.filial_id IS NOT NULL)))
 GROUP BY p.nome
 ORDER BY p.nome;

-- 8.2 Campanhas que mudam (comuns viram equipe fixa; a filial dona sai).
SELECT r.slug, r.nome, r.ativo, r.equipe_fixa, f.nome AS filial_dona
  FROM public.roletas r
  LEFT JOIN public.filiais f ON f.id = r.filial_id
 WHERE r.tipo = 'campanha' AND (NOT r.equipe_fixa OR r.filial_id IS NOT NULL)
 ORDER BY r.nome;

-- 8.3 Origem → roleta hoje (tudo que não é a Marquinhos vira "filiais").
SELECT origem, roleta_slug FROM public.distribuicao_config ORDER BY origem;

-- 8.4 Volume de lead sem zona nos últimos 30 dias (o que entra no rodízio).
SELECT l.origem,
       count(*) FILTER (WHERE l.zona IS NULL) AS sem_zona,
       count(*)                              AS total
  FROM public.leads l
 WHERE l.created_at >= now() - interval '30 days' AND l.deleted_at IS NULL
 GROUP BY l.origem
 ORDER BY sem_zona DESC;

-- 8.5 A cota padrão hoje (só sobe para 20 se ainda estiver em 10).
SELECT valor FROM public.distribuicao_settings WHERE chave = 'limite_diario_default';

-- 8.6 O time da Marquinhos hoje — GUARDAR (é a fonte do rollback exato da 0088).
SELECT p.nome, rp.corretor_id, rp.ativo, rp.pausado_ate, rp.motivo_pausa, rp.limite_diario
  FROM public.roleta_participantes rp
  JOIN public.roletas r  ON r.id = rp.roleta_id AND r.slug = 'marquinhos'
  JOIN public.profiles p ON p.id = rp.corretor_id
 ORDER BY rp.ativo DESC, p.nome;

-- 8.7 Os "Inapto" (pausa até 2099) que viram bloqueio.
SELECT p.nome, rp.pausado_ate, rp.motivo_pausa
  FROM public.roleta_participantes rp
  JOIN public.roletas r  ON r.id = rp.roleta_id AND r.slug = 'marquinhos'
  JOIN public.profiles p ON p.id = rp.corretor_id
 WHERE rp.pausado_ate >= '2099-01-01'::timestamptz
 ORDER BY p.nome;

-- 8.8 Prévia do top 6 (a mesma régua da _marquinhos_ranking, sem bloqueios).
WITH cfg AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje),
ven AS (
  SELECT v.corretor_id, count(*) AS vendas, sum(v.valor_venda) AS vgv,
         max(v.data_assinatura) AS ultima
    FROM public.vendas v, cfg
   WHERE v.status_venda::text IN ('pendente', 'aprovada')
     AND NOT COALESCE(v.distrato, false)
     AND v.data_assinatura > cfg.hoje - 30 AND v.data_assinatura <= cfg.hoje
   GROUP BY v.corretor_id
)
SELECT row_number() OVER (ORDER BY ven.vendas DESC, ven.vgv DESC, ven.ultima DESC, p.nome) AS posicao,
       p.nome, ven.vendas, ven.vgv
  FROM ven
  JOIN public.profiles p ON p.id = ven.corretor_id AND p.ativo AND p.status_conta = 'ativa'
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'
 ORDER BY posicao
 LIMIT 10;

-- 8.9 As funções que a 0084/0088 substituem — GUARDAR o resultado inteiro
--     (pg_get_functiondef) num arquivo: é o rollback do comportamento.
SELECT p.oid::regprocedure AS funcao, md5(pg_get_functiondef(p.oid)) AS md5,
       pg_get_functiondef(p.oid) AS definicao
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
 WHERE p.proname IN ('_distribuir_lead_v3', 'distribuir_lead_ponderado', '_repassar_lead_campanha',
                     '_vez_unica_unidades', '_elegibilidade_roleta', 'distribuir_estoque_roleta',
                     '_zona_destravar_espera', 'painel_distribuicao_resumo',
                     'atualizar_distribuicao_config', 'criar_roleta_campanha', 'atualizar_roleta',
                     'gerenciar_participante_roleta')
 ORDER BY 1;
```

## 9. Ordem de aplicação

1. Rodar a pré-checagem (§8) e corrigir quem aparece em 8.1.
   - **A 0083 é a do link de agendamento** (#292, `20261022120000_link_agendamento_cliente.sql`). Se ela ainda não estiver em produção, entra e é registrada **antes** da 0084. O migrador do drizzle só aplica entradas com `when` maior que o do último registro; registrar a 0084 primeiro faria a 0083 ser pulada para sempre.
   - As duas não mexem nas mesmas funções. Em 14/10 à tarde, os tipos regenerados pela Lovable vieram sem as RPCs do link, sinal de que a 0083 ainda não estava em produção. Os regenerados às 23:34 UTC já trazem as duas (link e roletas simples).
   - **A 0085–0087 é a importação de leads por CSV** (`importar_leads_csv_lote`), que o Lovable criou e aplicou direto em produção logo depois da 0084. O `when` delas é o da 0084 + 1, 2 e 3 ms. No journal, elas ficam na ordem em que entraram no banco. A 0084 não muda nem um byte (o hash registrado é o deste arquivo), e só a 0088 tem `when` maior que o do último registro.
2. **0084** (`20261023120000_roletas_simples.sql`). Ela recusa rodar sem a 0082. Pode entrar inteira, ou nos 4 blocos marcados no arquivo, nesta ordem, cada um numa transação com o `SET LOCAL lock_timeout = '5s'` no início:
   1. **Guardas + BLOCO 1** (cabeçalho até `BLOCO 2/4`): tabela, funções auxiliares e gatilho.
   2. **BLOCO 2** (`BLOCO 2/4` até `BLOCO 3/4`): motor, ponderado, repasse, estoque, painel e RPCs.
      - Ainda **não muda o comportamento**: as origens continuam apontando para o Plantão, e o ponderado ainda respeita `equipe_fixa`, então a campanha comum segue comum.
      - Única ressalva: o gatilho do bloco 1 já age. Uma campanha salva pela tela entre os blocos 1 e 3 vira equipe fixa na hora.
   3. **BLOCO 3** (`BLOCO 3/4` até `BLOCO 4/4`): **a virada**.
      - campanhas;
      - Plantão, Landing e Base desligadas;
      - origens;
      - cota 20;
      - troca do cron.
   4. **BLOCO 4**: permissões, guarda final e `NOTIFY pgrst`.

   Depois, registrar no drizzle (`0084`).

3. Conferir no cron seguinte (até 10 minutos):
   - um lead sem zona entregue numa filial: `distribuicao_log_contexto.contexto->>'sem_zona_rodizio' = 'true'` (junte com `distribution_log` por `log_id`);
   - `distribuir-estoque-filiais` em `cron.job_run_details` com `succeeded`.
4. **0088** (`20261024120000_marquinhos_automatica.sql`), depois de ver a prévia 8.8 com o dono. Ela recusa rodar sem a 0084.
   - **Quando entra.** O `when` dela é maior que o do último registro (a 0087 do Lovable). Por isso, **depois do merge, o migrador do drizzle a aplica sozinho** na próxima vez que rodar.
   - **A prévia 8.8 é antes do merge.**
   - **Aplicar à mão antes do migrador** também serve. Nesse caso, registre-a no drizzle (`0088`, `created_at` = 1792854000000) logo em seguida, para ela não rodar duas vezes.
5. **Publicar o front.** **Banco primeiro.**
   - **Front antigo com o banco na 0084/0088:** funciona. As RPCs mantêm as assinaturas e o gatilho corrige a campanha.
   - **Front novo com o banco antigo:** funciona em parte. O ranking cai em `null`, e a tela mostra a Marquinhos manual. Os indicadores caem nas chaves antigas do painel. Mas "Escoar estoque (todas as filiais)" e "Apurar agora" dão erro até as migrations entrarem.

## 10. Rollback (script, não migration)

O motor é guiado pelos dados. Desfazer os dados devolve quase todo o comportamento; para voltar **100%**, reaplicar as definições guardadas em 8.9.

**0088 — desligar a Marquinhos automática** (o time fica como está):

```sql
UPDATE public.distribuicao_settings SET valor = 'false'::jsonb, updated_at = now()
 WHERE chave = 'marquinhos_regra_ativa';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'marquinhos-apuracao-diaria';
```

**0088 — devolver o time de antes.** O jeito exato é refazer as linhas a partir do resultado guardado em 8.6. Sem ele, o log basta. Para cada corretor, a **primeira** mudança feita pela regra (ou pela conversão "Inapto") desde `marquinhos_regra_desde` diz como ele estava:

| Primeira mudança   | Como estava antes            |
| ------------------ | ---------------------------- |
| `incluido`         | fora                         |
| `removido`         | dentro                       |
| conversão "Inapto" | dentro, com a pausa até 2099 |

Ações manuais feitas depois (Bloquear ou Devolver) não são desfeitas.

```sql
BEGIN;
WITH r AS (SELECT id FROM public.roletas WHERE slug = 'marquinhos'),
desde AS (
  SELECT (valor #>> '{}')::timestamptz AS t
    FROM public.distribuicao_settings WHERE chave = 'marquinhos_regra_desde'
),
primeiro AS (
  SELECT DISTINCT ON (l.corretor_id) l.corretor_id, l.acao, l.motivo
    FROM public.roleta_participantes_log l, r, desde
   WHERE l.roleta_id = r.id AND l.created_at >= desde.t
     AND (l.motivo LIKE 'Regra Marquinhos:%' OR l.motivo LIKE 'Era "Inapto"%')
   ORDER BY l.corretor_id, l.created_at, l.id
)
UPDATE public.roleta_participantes rp
   SET ativo        = (p.acao = 'removido'),
       pausado_ate  = CASE WHEN p.motivo LIKE 'Era "Inapto"%'
                           THEN '2099-12-31 23:59:59+00'::timestamptz ELSE rp.pausado_ate END,
       motivo_pausa = CASE WHEN p.motivo LIKE 'Era "Inapto"%' THEN 'Inapto' ELSE rp.motivo_pausa END
  FROM primeiro p, r
 WHERE rp.roleta_id = r.id AND rp.corretor_id = p.corretor_id;
COMMIT;
```

**0084 — os dados, pelo `audit_log`.** Cada linha mexida no BLOCO 3 tem `valores_novos->>'_migracao' = '0084'`:

```sql
BEGIN;
-- Sem o gatilho, senão ele força equipe fixa de novo.
DROP TRIGGER IF EXISTS trg_roletas_campanha_equipe_fixa ON public.roletas;

-- Campanhas (equipe_fixa/filial) e Plantão/Landing/Base (ativo/descrição).
UPDATE public.roletas r
   SET equipe_fixa = (a.valores_antigos->>'equipe_fixa')::boolean,
       filial_id   = (a.valores_antigos->>'filial_id')::uuid,
       ativo       = (a.valores_antigos->>'ativo')::boolean,
       descricao   = a.valores_antigos->>'descricao'
  FROM public.audit_log a
 WHERE a.tabela = 'roletas' AND a.valores_novos->>'_migracao' = '0084'
   AND a.registro_id = r.id;

-- Origem → roleta.
UPDATE public.distribuicao_config c
   SET roleta_slug = a.valores_antigos->>'roleta_slug', updated_at = now()
  FROM public.audit_log a
 WHERE a.tabela = 'distribuicao_config' AND a.valores_novos->>'_migracao' = '0084'
   AND a.valores_antigos->>'origem' = c.origem::text;

-- Cota padrão.
UPDATE public.distribuicao_settings s
   SET valor = a.valores_antigos->'valor', updated_at = now()
  FROM public.audit_log a
 WHERE a.tabela = 'distribuicao_settings' AND a.valores_novos->>'_migracao' = '0084'
   AND a.valores_antigos->>'chave' = s.chave;

-- O cron do estoque volta ao Plantão.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'distribuir-estoque-filiais';
SELECT cron.schedule('distribuir-estoque-plantao', '*/10 * * * *',
                     $$SELECT public.distribuir_estoque_roleta('plantao', 30);$$);
COMMIT;
```

Com só os dados desfeitos, a diferença que sobra no motor está no lead sem zona:

- **Plantão pronto para o lead:** o lead vai para o Plantão, como antes.
- **Plantão sem ninguém apto para o lead:** o lead vai para o **rodízio das filiais**, em vez de esperar no Plantão.

Para voltar exatamente ao de antes, reaplicar as definições guardadas em 8.9 e conferir os md5.

`rodizio_sem_zona`, `marquinhos_apuracoes` e as funções novas podem ficar, porque não são chamadas por nada antigo.

## 11. Em produção

_(preencher na aplicação: data, resultado da pré-checagem 8.1–8.8, md5 de 8.9,
contagens da virada, primeiro lead sem zona no rodízio, primeira apuração da
Marquinhos)_

## 12. Riscos conhecidos e limites

- **O lead do bot concentra-se em 6 pessoas.** A cota de 20 ajuda. Acompanhar a carteira delas na primeira semana; se preciso, subir `marquinhos_top_n` na Política.
- **Filial nova precisa de uma linha em `rodizio_sem_zona`.** Sem ela, a filial recebe os leads das zonas dela, mas não o lead sem zona. A guarda final só confere que há pelo menos uma.
- **O "pronta" não considera as regras extras do modelo v2.** É um limite conhecido, e o v2 está desligado.
- **A vez única de lead sem zona** passa a valer também no rodízio das filiais, para bater com o que o corretor vê em "Sua vez".
- **O gatilho só corrige campanha no INSERT/UPDATE.** O BLOCO 3 faz o UPDATE de todas, e a guarda final confere.

## 13. Testes

- **Banco** (`npm run test:db`):
  - `roletas-simples.test.ts`:
    - o rodízio BF → Liberdade → Belém → BF;
    - filial sem apto é pulada;
    - lead que espera, e o fallback;
    - o pino;
    - 5 leads numa transação;
    - 2 leads concorrentes;
    - roleta desligada ignorada;
    - o rótulo da atribuição direta;
    - a Marquinhos;
    - as campanhas;
    - as RPCs que recusam;
    - o painel.
  - `estoque-filiais.test.ts`:
    - um lote por pessoa;
    - fora da cota e da fila;
    - pausado numa filial;
    - cron e botão juntos;
    - a assinatura antiga.
  - `marquinhos-automatica.test.ts`:
    - janela de 30 e 31 dias;
    - status e distrato;
    - desempate;
    - top N;
    - bloqueio vence a regra, e o 7º entra;
    - remoção antiga não bloqueia;
    - devolver à regra;
    - pausa mantida;
    - Inapto vira bloqueio;
    - rodar de novo não muda nada;
    - RLS;
    - cron.
  - Adaptados:
    - `distribuicao-v3`;
    - `jornada-lead-venda`;
    - `distribuicao-por-vaga`;
    - `repasse-sla-campanha`;
    - `roletas-por-filial`;
    - `roletas-fila-zona`;
    - `zona-estrita`.
- **Telas** (`npm test`):
  - `quadro-roletas.test.tsx`: a régua pura, os filtros, os totais e o rótulo da Marquinhos; o que admin, gestor e superintendente podem fazer; o SDR automático.
  - `roletas-simples-telas.test.tsx`: as 4 famílias, as Origens, os indicadores; a Marquinhos automática com Bloquear, Devolver e Apurar.
  - Adaptados:
    - `roletas-por-filial-telas`;
    - `campanha-equipe-fixa`;
    - `origem-fallback`;
    - `central-distribuicao-unica`;
    - `roletas-fila-zona`;
    - `roletas-por-zona`;
    - `distribuicao`.
