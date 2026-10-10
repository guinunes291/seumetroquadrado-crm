# Roleta fechada à noite — das 22h às 9h o lead fica com o Marquinhos

Pedido do dono (10/10/2026): _"após as 22h todos os leads parem de cair na
roleta e passem a cair para o marquinhos"_.

Decisões do dono (10/10/2026):

1. A roleta fecha às **22h** e reabre às **9h** (horário de Brasília).
2. Lead que o Marquinhos termina de qualificar à noite: o CRM **guarda** e
   entrega na reabertura, para quem fez check-in. O robô avisa o cliente que
   o consultor chama **a partir das 9h**.
3. A rota direta (campanha que pula o robô) **desliga às 22h e religa às 9h**
   no banco do robô.
4. **Sem exceção da gestão**: à noite a roleta é fechada para todos,
   inclusive com "liberado pela gestão".

São três peças, em três lugares:

| Peça                     | Onde                                                                                         | O que faz à noite                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Roleta fechada           | CRM — `supabase/migrations/20261014120000_roleta_fechada_noite.sql` (espelho `drizzle/0075`) | Nenhum sorteio, de nenhuma porta; o que chega espera a reabertura                  |
| Rota direta → Marquinhos | Banco do robô (Supabase `smq-operacional`) — funções `rota_direta_noite_*` + 2 agendamentos  | O lead do formulário vai para o Marquinhos em vez de ir direto ao corretor         |
| Frase do handoff         | n8n — workflow "SMQ - Marquinhos" (`Bxr2DuaUDz24d7Dp`), versão "v5.5b" (`855c4293`)          | O cliente ouve "te chama amanhã a partir das 9h" em vez de "te chama em instantes" |

Testes: `tests/db/roleta-fechada-noite.test.ts` (regra no banco, 22 casos) e
`tests/roleta-noite.test.ts` (textos e leitura do retorno).

## 1. O caminho de um lead à noite

**Formulário do Meta, 23h10, campanha de rota direta (ex.: "Vibra Sabará")**

1. Zapier → `intake-guard?modo=direto`. Às 22h o agendamento desligou
   `contingencia_config.rota_direta_ativa`, então o guarda devolve o lead ao
   n8n (o mesmo caminho de quando a chave está desligada à mão). Nenhum lead
   é criado no CRM, nenhum alerta de "sem corretor" vai para o gestor.
2. O Marquinhos abre a conversa (template `abertura_lead_v2`) e qualifica.
3. Se o cliente responde e a qualificação fecha às 23h40: o robô diz _"o
   consultor responsável já recebeu seu contato e te chama **amanhã a partir
   das 9h**"_ e faz o handoff para o CRM.
4. O CRM cria o lead **sem dono**, responde `distributed: false`,
   `roleta_fechada: true`, `reabre_as: "09:00"` e grava a nota interna
   _"Chegou às 23:40, com a roleta fechada… Entra na roleta às 9h, para quem
   estiver com check-in. O Marquinhos avisou o cliente…"_.
5. Às **9h00** a primeira rodada do cron entrega o lead (rodízio de sempre,
   zona estrita de sempre) para quem já fez check-in. O corretor recebe o push
   e o alerta "Novo lead recebido".

**Cliente que só responde de manhã (8h20):** o handoff ainda é noite para o
robô → _"te chama **hoje** a partir das 9h"_ → o lead espera 40 minutos.

**Lead que chega direto ao CRM (outra integração, cadastro manual sem
corretor) às 2h:** espera sem dono e entra às 9h.

## 2. O que fecha no CRM (e o que não fecha)

A janela é **global**: `_roleta_fechada_agora()`, lida em cada porta que
**sorteia**:

| Porta                                                 | À noite                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Motor (`_distribuir_lead_v3`) — webhook, cron, gestão | `{ok:false, adiado:true, motivo:'roleta_fechada_noite'}`, sem exceção e sem log      |
| Campanha (`distribuir_lead_ponderado`)                | Idem (a equipe fixa sorteava por fora do motor)                                      |
| Repasse de campanha (`_repassar_lead_campanha`)       | Idem — o lead fica com o dono atual                                                  |
| Selo de SLA na tela (`disparar_repasse_sla_lead`)     | Não repassa e não toca no lead                                                       |
| Cron de distribuição (a cada minuto)                  | A rodada não roda (nem triagem, nem repasse por SLA, nem lead parado)                |
| Escoar estoque (cron de 10 min e botão)               | Não entrega (nem o estoque do SDR)                                                   |
| Alerta "roleta sem corretor apto"                     | Não dispara — roleta fechada não é roleta vazia                                      |
| Lead perdido (`marcar_lead_perdido`)                  | O lead sai da carteira e **espera a reabertura sem dono** (antes: ia para a lixeira) |

**Continua valendo à noite** (não é roleta):

- atribuir um lead **a um corretor escolhido** (exceção → Atribuir,
  transferência, Distribuir manual com corretor);
- lead que o corretor **puxa** (Bolsão, lote de prospecção, Discador);
- a roleta **Agendados do SDR** (visita marcada pelo SDR, entregue pela
  agenda);
- check-in: vale o dia inteiro. Quem faz check-in às 8h30 entra na primeira
  rodada das 9h — **o lote da noite é dividido entre quem já estava lá**; quem
  chega às 9h10 entra para os próximos.

**Por que a janela por fila não servia:** as roletas têm horário próprio
(`roletas.horario_inicio/fim`), mas ele só segura o cron (`auth.uid()` nulo):
o botão da gestão, o selo de SLA e o "lead perdido" passavam por cima; e só o
motor v3 o lê — a campanha de equipe fixa e o Escoar estoque nem olham.

## 3. Configuração

`distribuicao_settings.roleta_noite = {"ativa": true, "inicio": "22:00", "fim": "09:00"}`
— Central de Distribuição → Configurações → "Roletas — funcionamento" (admin).
Ligar, início e fim salvam juntos.

- Chave ausente ou ilegível = a regra do dono (ligada, 22h–9h): um ajuste
  quebrado nunca abre a roleta de madrugada por acidente.
- Início = fim desliga.
- **Mudar o horário no CRM não muda o banco do robô** (seção 4): mude os dois.

## 4. Banco do robô (smq-operacional)

Aplicado em 10/10/2026 (migration `rota_direta_janela_noite` no projeto
`lwebydmveyqyzfgmbqfk`):

- coluna `contingencia_config.rota_direta_noite_desligou_em` — a marca de que
  foi a noite que desligou;
- `rota_direta_noite_desligar()` — desliga a rota direta **se estiver
  ligada** e grava a marca;
- `rota_direta_manha_religar()` — religa **só com a marca** e a apaga. Quem
  desligou a rota direta à mão (contingência) não tem o desligamento desfeito
  às 9h;
- pg_cron (em GMT): `rota-direta-noite-desligar` `0 1 * * *` (22h BRT) e
  `rota-direta-manha-religar` `0 12 * * *` (9h BRT). O Brasil não tem horário
  de verão desde 2019; se voltar a ter, os dois horários mudam.

Rede de segurança que já existia: se algum lead de rota direta escapar para o
CRM com a roleta fechada (corrida nos segundos da virada), o `intake-guard`
recebe `distributed: false` e o devolve ao Marquinhos (v7, 19/08).

## 5. n8n (Marquinhos)

Versão "v5.5b: grava o código noturno no lugar certo" (`855c4293`), publicada
em 10/10/2026 sobre a "v5.5: anti-corrida…" de outra sessão (`4833d10b`):

- **Injetar DATA DE HOJE**: das **21h55** às 9h acrescenta ao prompt a regra
  "consultores fora do ar: no handoff, não diga 'te chama em instantes';
  diga que o consultor te chama hoje/amanhã a partir das 9h". Começa 5 min
  antes porque a mensagem ao cliente sai **antes** do POST ao CRM (debounce +
  IA ≈ 1–2 min).
- **Guard vazio**: rede determinística no handoff noturno — troca "em
  instantes / em breve / já já / agora mesmo / daqui a pouco / ainda hoje"
  por "amanhã (ou hoje) a partir das 9h"; se a resposta não falar em 9h,
  acrescenta a linha _"Nossos consultores atendem a partir das 9h…"_. Qualquer
  erro devolve a mensagem como veio.
- **Guard roleta?**: com `roleta_fechada: true` não grava o alerta
  `roleta_sem_distribuicao` (seria um por handoff noturno).
- **Roleta aberta? (Copiloto)** (nó novo, entre "Montar payload Copiloto" e
  "POST Copiloto (Marcao)"): à noite o Marcão não é chamado — sem corretor,
  ele quebrava com "Phone is empty" e disparava o workflow de erro.

Rollback do n8n: restaurar a versão `4833d10b` (a v5.5 da outra sessão, sem a
parte noturna) — **não** a `cf2a93a0`, que desfaria também a v5.5 dela.

## 6. Conferências

```sql
-- CRM: a janela e o que está esperando
SELECT public.roleta_janela_v1();
SELECT count(*) FROM public.leads
 WHERE corretor_id IS NULL AND sdr_id IS NULL AND deleted_at IS NULL
   AND NOT na_lixeira AND status IN ('novo','aguardando_atendimento');
-- notas dos leads que chegaram à noite
SELECT lead_id, created_at FROM public.interacoes
 WHERE metadata->>'evento' = 'roleta_fechada_noite' ORDER BY created_at DESC LIMIT 20;
-- perdas à noite (esperaram a reabertura em vez da lixeira)
SELECT lead_id, motivo, created_at FROM public.distribution_log
 WHERE regra_aplicada = 'lead_perdido_noite' ORDER BY created_at DESC LIMIT 20;

-- Banco do robô
SELECT rota_direta_ativa, rota_direta_noite_desligou_em FROM public.contingencia_config;
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'rota-direta-%';
SELECT status, return_message, start_time FROM cron.job_run_details
 WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'rota-direta-%')
 ORDER BY start_time DESC LIMIT 10;
```

## 7. Rollback

Cada peça volta sozinha:

```sql
-- CRM (imediato): roleta 24h de novo
UPDATE public.distribuicao_settings
   SET valor = valor || '{"ativa": false}'::jsonb WHERE chave = 'roleta_noite';

-- Banco do robô: para de virar a rota direta (e religa agora, se a noite a desligou)
SELECT cron.unschedule('rota-direta-noite-desligar');
SELECT cron.unschedule('rota-direta-manha-religar');
SELECT public.rota_direta_manha_religar();
```

n8n: restaurar `4833d10b` (seção 5).

## 8. Pendências conhecidas

- **Dossiê no WhatsApp às 9h**: o lead da noite entregue pelo cron gera push
  e alerta no CRM (como hoje, quando um lead espera alguém da zona), mas o
  dossiê do Marcão no WhatsApp do corretor não sai de novo — o Marcão só é
  chamado no momento do handoff. Ligar isso é o próximo passo natural.
- **Campanha de equipe fixa**: um lead que chega à noite pelo token de uma
  campanha de **equipe fixa** é entregue às 9h pela triagem normal (zona /
  origem), não pela equipe da campanha — o cron não re-tenta a roleta
  ponderada (comportamento de hoje para qualquer lead de campanha que não
  achou ninguém na hora). À noite quase todo lead de formulário vai para o
  Marquinhos (rota direta desligada), então o caso é raro.
