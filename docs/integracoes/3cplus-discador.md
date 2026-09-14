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

6. **Sessão de discagem ("Iniciar agora") — discador automático** — a fila é
   SEMPRE a base do próprio corretor com a régua fixa da operação (leads em
   Aguardando atendimento OU com follow-up vencido, sem contato há mais tempo
   primeiro; nunca opt-out, lixeira ou sem telefone; base completa, paginada
   até o fim) e vai ao 3C Plus em lotes de 100 pela `tcplus-campanha`:
   - `iniciar`: **higiene** (logout do agente + apaga as listas que o CRM
     subiu antes nesta campanha, reconhecidas pelo marcador `[crm:<uid>]` no
     nome — listas subidas pela gestão no painel não são tocadas), cria uma
     **lista nova** na campanha (`POST /campaigns/{id}/lists`), sobe o lote
     (`POST .../lists/{list}/mailing_sync.json` com `{phone, identifier:
<uuid do lead>, data:{nome, projeto}}`), garante **peso ≥ 1** (lista com
     peso 0 não é discada) e faz o **login do agente na campanha**
     (`POST /agent/login {campaign}` com o token do agente). Devolve
     `list_id`.
   - `adicionar`: sobe mais um lote na **mesma** lista (`list_id`) — repetir
     a higiene apagaria o lote anterior.
   - `parar`: logout do agente (+ apaga as listas do CRM se `limpar`).
     Tolera agente já deslogado — o cockpit sempre fecha.

   O discador do 3C Plus liga a lista sozinho e **só entrega ao agente quem
   atende**; cada conexão chega pelo webhook (origem `campanha`). Importados
   vs. **filtrados** pelo 3C Plus (número inválido, blacklist, duplicado) são
   reportados — filtrado não é erro nosso. Login do agente não confirmado é
   **avisado**, não engolido (sem login, a lista sobe mas ninguém recebe).

   **Uma campanha por corretor (obrigatório)**: o discador entrega as
   chamadas a QUALQUER agente logado na campanha — dois corretores na mesma
   campanha trocariam leads entre si e a higiene de um apagaria a lista do
   outro. `iniciar` recusa com `campanha_compartilhada` (409) quando detecta o
   mesmo `campaign_id` em outro vínculo.

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
   Discador → "Iniciar agora": a lista sobe e o discador passa a entregar
   chamadas ao webphone.

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
