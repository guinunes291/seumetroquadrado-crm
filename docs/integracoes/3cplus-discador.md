# Telefonia — Discador 3C Plus

Integração do CRM com o **3C Plus** (discador/telefonia em nuvem), que
substitui o Sonax PABX Virtual como discador da operação a partir de
**2026-09-15** (o desenho anterior fica em `sonax-discador.md`, marcado como
legado; o histórico de ligações `chamadas` é o mesmo para os dois).

Fonte do contrato da API: SDK JavaScript oficial `@3cplus/3cplusv2-sdk`
(rotas v1) e o pacote `n8n-nodes-tcplus` (mailing, campos do CallHistory,
buckets de status), ambos lidos do npm em 14/09/2026. A referência final é
https://api-docs.3c.plus — veja **"O que calibrar com a doc oficial"** no fim:
os pontos que este desenho assume e que devem ser confirmados no primeiro
teste real.

## O que a integração faz

1. **Click-to-call** — o botão "Ligar" (dossiê, tabela de leads, sessão de
   discagem, pop-up) chama a edge function `tcplus-discar`, que manda o
   **agente do corretor no 3C Plus** discar para o lead (chamada manual:
   `POST /agent/login {campaign, mode:"manual"}` → `/agent/manual_call/enter`
   → `/agent/manual_call/dial {phone}`). A voz toca no **webphone do 3C Plus**
   (ou no ramal SIP do agente); o CRM entrega o contexto. A chamada é gravada
   em `chamadas` (`provider = '3cplus'`, `origem = 'click2call'`) e ecoada na
   timeline (`interacoes`, tipo `ligacao`). Sem telefonia configurada (sem
   token, sem campanha, 3C Plus fora), o botão degrada para o `tel:` de antes
   — nada quebra.

   **Por que o token é do agente, e não do gestor**: no 3C Plus toda ação de
   agente (login, discagem manual, qualificação) só é aceita com o token do
   próprio agente; o token do gestor devolve 403. E `GET /users` não expõe o
   token dos agentes — então quem cola o token é **o corretor**, uma vez, no
   card "Meu 3C Plus" da aba Discador (o admin também pode, em Gestão →
   Corretores → Discador).

2. **Eventos de chamada → CRM** — o webhook do 3C Plus (Configurações →
   Integrações) aponta para a edge function `tcplus-webhook`. Dois eventos
   importam:
   - `call-was-connected`: cliente na linha → `chamadas.status = atendida` e o
     **pop-up de chamada ativa** acorda em qualquer tela do CRM (realtime).
   - `call-history-was-created`: a chamada terminou → status final (pelos
     buckets de `status_id`/`hangup_cause`), duração, **gravação**
     (`gravacao_url`), **qualificação** (`tabulacao`) e o
     `mailing_data.identifier` (UUID do lead que a `tcplus-campanha` planta no
     mailing — telefone repetido entre leads não confunde; o telefone, com
     variantes de DDI 55 e nono dígito, é o fallback do receptivo/manual).

   Idempotência por `sid` (`provider_call_id`). A linha que a `tcplus-discar`
   criou **sem sid** (a discagem manual responde 204, sem id) é **adotada**
   pelo primeiro evento com o mesmo número + corretor numa janela de 2 h.
   Eventos fora de ordem não regridem o status (um histórico atrasado nunca
   desfaz "atendida" → vira "concluída"); dois eventos simultâneos não se
   perdem (o perdedor da corrida de insert é aplicado sobre a linha
   vencedora). A timeline só recebe a ligação no **primeiro atendimento
   real**; chamada perdida fica só no histórico do Discador.

3. **Qualificação → etapa do funil (em tempo de evento)** — a qualificação
   que o corretor aplica no 3C Plus ao encerrar a chamada chega no
   `call-history-was-created` e move o lead pela RPC oficial
   `transicionar_lead` (máquina de estados + timeline + follow-up), conforme o
   mapeamento em `gestao_config` (chave `telefonia_tabulacao_status`, chaves
   comparadas sem acento/maiúsculas). **Sem polling**: o sync de arquivo do
   Sonax deixou de existir. Idempotente (só qualificação **nova** em relação à
   já gravada na chamada processa; etapa ajustada à mão depois não é
   desfeita). A RPC exige "próxima ação ou follow-up" nas etapas ativas e
   follow-up **futuro** em `aguardando_retorno`: o webhook só preenche o que o
   lead ainda não tem (uma ação/follow-up já planejados pelo corretor não são
   sobrescritos), com o prazo `followup_padrao_horas` (default 24, na mesma
   `gestao_config`). Fechamento e pós-venda nunca são automatizados.

   Defaults do mapeamento (da parte 3 do Sonax, mantidos): interessado → Em
   atendimento; agendou visita → Agendado; pediu retorno → Aguardando
   retorno; sem interesse / não perturbar / número errado → Perdido.
   **Alinhe os nomes das qualificações criadas no 3C Plus com as chaves do
   mapeamento** (ou edite o mapeamento); qualificação sem entrada só fica
   registrada na chamada.

4. **Vínculo por corretor** — tabela `telefonia_agentes` (uma linha por
   corretor): `agent_id` (ID do usuário no 3C Plus; casa `agent.id` dos
   eventos — o e-mail do agente é o fallback), `campaign_id` (campanha do
   discador **dedicada** ao corretor) e `api_token` (token do agente,
   **write-only para o app**: a coluna não tem GRANT de SELECT para
   `authenticated`; só a service_role das functions lê). A tela mostra
   "token atualizado há X" (`token_atualizado_em`, mantido pelo trigger),
   nunca o valor.

5. **Aba Discador** (`/discador`, menu Prospecção) — card "Meu 3C Plus"
   (status + colar/trocar token), sessão de discagem, KPIs do dia
   (chamadas/atendidas/perdidas + meu 3C Plus), histórico com filtros e link
   da gravação, rediscagem em um clique. Corretor vê as chamadas da própria
   carteira/agente; gestão vê a operação inteira (RLS). Atualiza ao vivo.

6. **Sessão de discagem — a fila é o Bolsão** (decisão 2026-09-15: "a base
   que o discador deve gerar é tudo que está fora da carteira ativa dos
   corretores"). No modelo em três camadas do CRM (carteira ativa → Reserva →
   Bolsão, `docs/ops/bolsao-oportunidades-fatia4.md` §1) isso é o **Bolsão**:
   a base **sem dono**, a mesma população de `bolsao_v1`. A Reserva fica de
   fora de propósito: ainda tem dono, e lead com dono só chega ao discador
   pela régua de devolução, nunca por um robô discando a carteira alheia.

   A fila **não nasce no navegador**. O corretor não enxerga (nem deve) o
   telefone de um lead que não é dele, então a `tcplus-campanha` reserva o
   lote no servidor, com service_role, pela RPC
   `discador_bolsao_reservar_v1`: os mais frios primeiro, pulando quem está
   com o SDR (`sdr_id`), quem foi discado há menos de `discador_rediscagem_dias`
   (qualquer corretor, atendido ou não), quem está reservado por outra sessão
   e quem o próprio corretor devolveu há menos de `discador_anti_ioio_dias`
   (anti-ioiô, mesma régua do puxar). A reserva vive em `bolsao_discagem`
   (validade `discador_reserva_horas`) e é o que impede dois corretores
   discarem o mesmo cliente ao mesmo tempo (`FOR UPDATE SKIP LOCKED`). O
   corretor lê só a própria sessão, **anonimizada**
   (`bolsao_discagem_minha_v1`: telefone mascarado, sem dono anterior) — e por
   isso a sessão sobrevive a recarregar a página.

   - `iniciar`: **higiene** (logout do agente, apaga as listas do CRM na
     campanha, reconhecidas pelo marcador `[crm:<uid>]`, solta as reservas
     anteriores), reserva `discador_lote` leads (default 200), cria uma
     **lista nova** na campanha, sobe o mailing em fatias (`{phone,
identifier: <uuid do lead>, data:{nome, projeto}}`), garante **peso ≥ 1**
     e faz o **login do agente na campanha**. Devolve `list_id`.
   - `adicionar`: reserva mais um lote e sobe na **mesma** lista ("Mais
     leads" no card).
   - `reservar`: modo **um a um** — reserva um lote pequeno (20) sem mailing
     nem login; o cockpit disca um por vez pelo click-to-call (a
     `tcplus-discar` aceita o lead reservado, lendo-o pela service_role).
   - `parar` / `liberar`: logout + apaga as listas do CRM + solta as reservas
     (o que sobrou volta ao Bolsão) / só solta as reservas.

   **Quem atende NÃO ganha dono: vira um Atendido.** No primeiro atendimento
   real (`call-was-connected` ou histórico com desfecho atendida) o webhook
   chama `discador_bolsao_atender_v1`, que registra o lead na aba
   **Atendidos** do corretor (`discador_atendimentos`, idempotente por
   chamada) sem mexer na posse. O lead **segue no Bolsão**, fora da base
   ativa (sem dono, nunca conta nos 65) e **discável por outros corretores**
   (respeitada a rediscagem de `discador_rediscagem_dias`). Vários corretores
   podem ter o mesmo cliente em Atendidos. Da aba o corretor liga de novo pelo
   CRM, registra contato na timeline sem ser dono (`discador_atendido_nota_v1`,
   autoria dele) ou **assume para agendar** (`discador_atendido_assumir_v1`).

   **A posse vem com o avanço de fase.** Quando a qualificação leva o lead a
   uma etapa de `gestao_config.bolsao.discador_posse_a_partir_de` (default:
   agendado, visita realizada, proposta enviada, análise de crédito) e ele
   ainda não tem dono, o webhook chama `discador_bolsao_assumir_v1`: o lead
   entra na carteira de quem avançou (faixa fundo, conta nos 65), sai do
   Bolsão e os atendimentos de todos se encerram — a aba dos outros mostra
   "outro corretor avançou", sem dizer quem. Só lead sem dono, fora da triagem
   do SDR e sem venda viva; lead com dono nunca troca de mão por aqui. Fica em
   `distribution_log` (regra `discador_bolsao`). Discar sem atender não gera
   nada além do histórico.

   **Uma campanha por corretor (obrigatório)**: o discador entrega as
   chamadas a QUALQUER agente logado na campanha — dois corretores na mesma
   campanha trocariam leads entre si e a higiene de um apagaria a lista do
   outro. `iniciar` recusa com `campanha_compartilhada` (409).

7. **Pop-up de chamada ativa (screen pop)** e **modo um a um** — inalterados
   no desenho (ver `sonax-discador.md`, itens 6 e 7): o pop-up acorda com o
   `call-was-connected` e o modo um a um disca a mesma fila pelo click-to-call
   com avanço humano.

## Peças no repositório

| Peça                                                | Arquivo                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| Migration (`telefonia_agentes`, grants por coluna)  | `supabase/migrations/20260915120000_telefonia_3cplus.sql`                    |
| Helpers compartilhados (HTTP, número, eventos)      | `supabase/functions/_shared/tcplus.ts` (TS puro — testado pela suíte vitest) |
| Click-to-call (JWT + RLS; service_role só p/ token) | `supabase/functions/tcplus-discar/index.ts`                                  |
| Discador automático (lista de mailing + login)      | `supabase/functions/tcplus-campanha/index.ts`                                |
| Webhook de eventos (secret + service_role)          | `supabase/functions/tcplus-webhook/index.ts`                                 |
| Hook do botão Ligar (com fallback `tel:`)           | `src/hooks/use-ligar-lead.ts`                                                |
| Fronteira tipada de `telefonia_agentes`             | `src/features/telefonia/telefonia-3cplus-client.ts`                          |
| Card "Meu 3C Plus" (token self-service)             | `src/features/telefonia/conectar-tcplus.tsx`                                 |
| Aba Discador (rota, página, sessão, pop-up)         | `src/routes/_authenticated/discador.tsx` + `src/features/telefonia/`         |
| Coluna Discador na gestão                           | `src/features/gestao/corretores-page.tsx`                                    |
| Testes de guarda + unidade                          | `tests/telefonia-3cplus.test.ts`                                             |
| Teste de banco (RLS + privilégio por coluna)        | `tests/db/telefonia-agentes.test.ts`                                         |

## Setup (checklist de ativação)

1. **Aplicar a migration** no projeto Supabase (fluxo normal de deploy).
2. **Secrets** em _Supabase → Edge Functions → Secrets_:
   - `TCPLUS_API_TOKEN` — token de API do **gestor** no 3C Plus (fixo, não
     expira; aparece em `GET /me` do usuário gestor). Usado só pela
     `tcplus-campanha` (listas/mailing).
   - `TCPLUS_WEBHOOK_SECRET` — segredo longo e aleatório, exclusivo do
     webhook (ex.: `openssl rand -hex 32`).
   - Opcionais: `TCPLUS_BASE_URL` (instância white-label; default
     `https://app.3c.plus/api/v1`), `TCPLUS_AUTH_MODE` (`bearer` default |
     `query`), `TCPLUS_DIAL_FORMAT` (`nacional` default | `ddi`),
     `TCPLUS_ALLOW_QUERY_SECRET` (`true` default).
3. **Deploy das functions**
   `supabase functions deploy tcplus-discar tcplus-campanha tcplus-webhook`.
   O `config.toml` já define `verify_jwt` correto para cada uma. As
   `sonax-*` não precisam mais de deploy.
4. **No 3C Plus**: criar **uma campanha por corretor** que vai usar o
   discador (tipo discador/preditivo, com a qualificação configurada e as
   qualificações nomeadas conforme o mapeamento). Anotar o ID da campanha e o
   ID do usuário (agente) de cada corretor (`GET /users?role=agent` ou o
   painel).
5. **Registrar o webhook no 3C Plus** (Configurações do sistema → Integrações
   → webhook), eventos `call-was-connected` e `call-history-was-created`:

   ```
   https://rldnprwjlomjmjvinxuh.supabase.co/functions/v1/tcplus-webhook?secret=SEU_SEGREDO
   ```

   Se a tela aceitar header, prefira `x-webhook-secret: SEU_SEGREDO` (ou
   `Authorization: Bearer SEU_SEGREDO`) e depois ligue o kill-switch
   `TCPLUS_ALLOW_QUERY_SECRET=false`.

6. **Cadastrar o vínculo dos corretores** em **Gestão → Corretores →
   Discador**: ID do agente e ID da campanha (o token pode ficar em branco).
7. **Cada corretor** abre a aba Discador → card "Meu 3C Plus" → cola o token
   de agente (no 3C Plus: perfil do usuário → token de API).
8. Testar: abrir um lead → "Ligar" (o webphone do 3C Plus disca; linha em
   `chamadas` e na timeline). Encerrar e qualificar no 3C Plus → o webhook
   preenche status/duração/gravação e move o lead de etapa. Depois, aba
   Discador → "Iniciar agora": o lote do Bolsão é reservado, a lista sobe e o
   discador passa a entregar chamadas ao webphone; quem atende aparece em
   Atendidos, e "agendou visita" o coloca na carteira. Ajustes de lote,
   rediscagem, validade e etapas de posse ficam em `gestao_config.bolsao`
   (`discador_*`).

### Nota de segurança — dois segredos, dois lugares

- O **token do gestor** é secret de function; nunca vai ao browser.
- O **token de cada agente** fica em `telefonia_agentes.api_token`,
  gravável pelo app (o corretor cola o dele; o admin pode trocar) e legível
  só pela service_role — `select api_token` do browser devolve 42501, por
  privilégio de coluna (não depende de RLS). O trigger impede que o app
  manipule o carimbo `token_atualizado_em`.
- O webhook aceita `?secret=` porque a tela de Integrações do 3C Plus pode
  não aceitar headers; secret exclusivo, comparação em tempo constante,
  kill-switch. GET no webhook é só liveness (sem dado).

## Modelo de dados

### `public.telefonia_agentes`

| Coluna                | Uso                                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| `user_id`             | PK → `profiles.id` (CASCADE)                                             |
| `provider`            | `'3cplus'`                                                               |
| `agent_id`            | ID do usuário/agente no 3C Plus (casa `agent.id` dos eventos)            |
| `campaign_id`         | Campanha do discador dedicada ao corretor                                |
| `api_token`           | Token do agente — INSERT/UPDATE liberados ao app, SELECT só service_role |
| `token_atualizado_em` | Carimbo do trigger (o app não edita)                                     |

RLS: SELECT (colunas liberadas) para o próprio corretor e gestão
(admin/gestor/superintendente); INSERT/UPDATE para o próprio e admin; DELETE
só admin.

### `public.bolsao_discagem`

| Coluna                       | Uso                                                             |
| ---------------------------- | --------------------------------------------------------------- |
| `lead_id`                    | PK → `leads.id` (CASCADE); um lead está em no máximo uma sessão |
| `corretor_id`                | Quem reservou                                                   |
| `modo`                       | `campanha` (lista no 3C Plus) ou `um_a_um` (click-to-call)      |
| `campaign_id` / `list_id`    | Onde a lista subiu                                              |
| `reservado_em` / `expira_em` | Validade da reserva (`discador_reserva_horas`)                  |
| `assumido_em`                | Quando o lead entrou na carteira do corretor (atendeu)          |

Só a service_role toca na tabela (sem GRANT para `authenticated`); o corretor
lê a própria sessão, mascarada, por `bolsao_discagem_minha_v1`.

### `public.chamadas` (inalterada)

`provider = '3cplus'`, `provider_call_id = sid` do CallHistory, `ramal` = ramal
SIP do agente quando o evento traz, `tabulacao` = nome da qualificação,
`gravacao_url` = `recording` do CallHistory, `payload` = cada evento cru
(`evento_call_was_connected`, `evento_call_history_was_created`) — é daí que
se calibra o parser.

## Referência da API 3C Plus (o que o CRM usa)

Base: `https://app.3c.plus/api/v1`. Autenticação: `Authorization: Bearer
<token>` (o SDK oficial usa Bearer para o token fixo de 60 caracteres e para o
JWT de 12 h de `POST /authenticate`); `?api_token=` também é aceito pela
plataforma (modo `query`). Muitas ações de agente respondem **204** (aceitas,
assíncronas) — a confirmação vem pelos eventos.

| Endpoint                                                    | Token  | Uso no CRM                                                                      |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `GET /me`                                                   | ambos  | Teste de credencial                                                             |
| `POST /agent/login` `{campaign, mode?:"manual"}`            | agente | Entrar na campanha (manual = click-to-call; sem mode = discador)                |
| `POST /agent/logout`                                        | agente | Parar de receber chamadas                                                       |
| `POST /agent/manual_call/enter` / `exit`                    | agente | Modo de chamada manual                                                          |
| `POST /agent/manual_call/dial` `{phone}`                    | agente | Discar (click-to-call)                                                          |
| `POST /agent/manual_call_acw/dial` `{phone}`                | agente | Discar durante o pós-atendimento                                                |
| `POST /agent/call/{id}/qualify` / `hangup`                  | agente | (não usados — a qualificação é feita no 3C Plus)                                |
| `GET /campaigns`                                            | gestor | Listar campanhas                                                                |
| `GET/POST /campaigns/{id}/lists` `{name}`                   | gestor | Listas de mailing da campanha                                                   |
| `PUT /campaigns/{id}/lists/{list}` `{weight}`               | gestor | Peso da lista (≥ 1 para discar)                                                 |
| `DELETE /campaigns/{id}/lists/{list}`                       | gestor | Higiene das listas do CRM                                                       |
| `POST /campaigns/{id}/lists/{list}/mailing_sync.json` `[…]` | gestor | Subir contatos `{phone (11 díg.), identifier, data}` → `data.imported/filtered` |
| `GET /campaigns/{id}/lists/qualifications`                  | gestor | Qualificações da campanha                                                       |
| `GET /calls?start_date&end_date&sid`                        | gestor | Histórico (conciliação futura)                                                  |
| `GET /users?role=agent`                                     | gestor | id/nome/e-mail/ramal dos agentes (sem token)                                    |
| `PUT /campaigns/{id}` `{url}`                               | gestor | Screen-pop URL (futuro)                                                         |

Campos do CallHistory que o parser lê (com candidatos): `sid`, `number`,
`agent{id,name,email,extension_number}`, `campaign{id}`,
`mailing_data{identifier,phone,…}`, `qualification{id,name,conversion,
should_insert_blacklist,dmc,callback}`, `qualification_note`, `status_id`,
`hangup_cause`, `speaking_time`/`billsec`/`duration`, `recording`,
`call_date_rfc3339`, `mode`/`receptive`. Buckets: `status_id` 5/9/15 = sem
contato, 6 = abandonada, 14 = falha, 8 = pela causa de desligamento (17–21
não atende/ocupado; 22/28/34/102/487/606/609 falha); qualificação aplicada,
status 7 ou tempo de conversa > 0 = atendida.

## O que calibrar com a doc oficial (https://api-docs.3c.plus)

Estas escolhas foram feitas a partir do SDK/n8n e são as únicas que dependem
de confirmação no primeiro teste real — todas ajustáveis **sem deploy**
(secret) ou com calibração pontual do parser:

1. **Formato do `phone` em `/agent/manual_call/dial`** — assumido nacional
   com DDD (11 dígitos, como no mailing). Se a discagem exigir DDI, defina
   `TCPLUS_DIAL_FORMAT=ddi`.
2. **Modo de autenticação** — Bearer (SDK). Se a instância recusar o token
   fixo no header, `TCPLUS_AUTH_MODE=query`.
3. **Corpo de `/agent/login`** — `{campaign: <id>, mode: "manual"}` (SDK
   `loginManual`). Se o campo tiver outro nome, ajuste na `tcplus-discar` e
   `tcplus-campanha` (um lugar cada).
4. **Nomes dos campos do evento** — o parser tem candidatos para cada campo
   e guarda o evento cru em `chamadas.payload`; compare o primeiro payload
   real com `extrairChamadaDoEvento` (tests/telefonia-3cplus.test.ts) e
   acrescente o candidato que faltar.
5. **`DELETE /campaigns/{id}/lists/{list}`** — presumido pelo padrão REST das
   demais rotas; se não existir, a higiene fica só no logout (as listas antigas
   com peso ficariam discáveis — nesse caso, zere o peso via
   `PUT …/lists/{list} {weight: 0}` na higiene).
6. **Buckets de `status_id`** — herdados do n8n-nodes-tcplus (validados por
   terceiros em produção); o status 7 como "atendida" é inferência.

## Próximos passos naturais (fora deste escopo)

- **Gravações no dossiê**: proxy autenticado para `recording` relativo /
  `GET /records/{y}/{m}/{d}/{file}` (o token do gestor não pode ir ao
  browser); hoje só URL absoluta vira link.
- **Screen-pop nativo**: `PUT /campaigns/{id} {url}` apontando para
  `/leads/{identifier}` no CRM, complementando o pop-up próprio.
- **Conciliação diária**: cron puxando `GET /calls` para fechar chamadas que
  o webhook perdeu.
- **Remover o Sonax** (functions `sonax-*`, colunas `profiles.ramal_sonax` /
  `sonax_id_*`, `docs/integracoes/sonax-discador.md`) depois de o 3C Plus
  rodar uma semana em produção.
