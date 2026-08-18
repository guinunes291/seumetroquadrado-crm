# Telefonia — Discador Sonax PABX Virtual

Integração do CRM com o Sonax PABX Virtual (discador/telefonia em nuvem).
Fonte da API: documentação oficial Postman ("Documentação de API Sonax Pabx
Virtual", https://documenter.getpostman.com/view/39712701/2sB34eH2J9), extraída
em 16/08/2026.

## O que a integração faz

1. **Click-to-call** — o botão "Ligar" no dossiê do lead chama a edge function
   `sonax-discar`, que dispara o Click2Call do Sonax: o PABX toca primeiro no
   **ramal do corretor** e, quando ele atende, disca para o lead. A chamada é
   gravada em `chamadas` e ecoada na timeline (`interacoes`, tipo `ligacao`).
   Sem telefonia configurada (sem secret, sem ramal, PABX fora), o botão degrada
   para o `tel:` de antes — nada quebra.
2. **Eventos de chamada → CRM** — a "URL de integração" do PABX aponta para a
   edge function `sonax-webhook`. Cada evento (receptivo atendido, chamada de
   campanha do discador etc.) vira uma linha em `chamadas` (idempotente por
   `id_chamada`) e, quando o número casa com um lead ativo
   (`buscar_lead_ativo_por_telefone_global`), uma interação `ligacao` na
   timeline — o que já atualiza `leads.ultima_interacao`/`ultimo_contato` via
   trigger.
3. **Ramal por corretor** — coluna `profiles.ramal_sonax`, editável pelo admin
   em **Gestão → Corretores** (coluna "Ramal"). É o ramal que o click-to-call
   disca e a chave que casa eventos do webhook (`<RAMAL>`) com o corretor.
4. **Aba Discador** (`/discador`, menu Atender) — central de telefonia: KPIs do
   dia (chamadas/atendidas/perdidas + meu ramal), histórico com filtros
   (direção, status, busca por lead/número) e rediscagem em um clique. Corretor
   vê as chamadas da própria carteira/ramal; gestão vê a operação inteira
   (RLS). Atualiza ao vivo via realtime.
5. **Sessão de discagem ("Iniciar agora") — discador automático** — a aba monta
   a fila com os leads da carteira do corretor (sem contato há mais tempo
   primeiro; nunca opt-out, lixeira ou sem telefone; filtro por etapa e tamanho
   10/25/50) e entrega à **campanha do discador Sonax** (edge function
   `sonax-campanha`: `acao=chamada` por lead + `play_campanha`): o PABX disca a
   fila sozinho, **descarta caixa postal e só conecta ao ramal quem atende**,
   continuando até a fila acabar ou o corretor clicar "Parar discador" (stop +
   limpeza da fila restante). As chamadas conectadas chegam pelo webhook
   (origem `campanha`) e aparecem no histórico e na timeline em tempo real.
   Requisitos por corretor: campanha dedicada no painel Sonax (fila do ramal
   dele + descarte de caixa postal) e os vínculos em Gestão → Corretores →
   PABX.
6. **Modo um a um (fallback)** — para quem ainda não tem campanha configurada:
   a mesma fila é discada sequencialmente pelo click-to-call no ramal, com
   avanço humano ("Próximo" ou registrar o resultado já disca o seguinte).
7. **Tabulação → etapa do funil (automático)** — a tabulação aplicada pelo
   corretor no painel de agente do Sonax move o lead de etapa no CRM. A edge
   function `sonax-tabulacoes` baixa o arquivo de contatos da campanha
   (`acao=download_arquivo_contato` — cada contato carrega o UUID do lead),
   grava a tabulação na chamada e transiciona o lead pela RPC oficial
   `transicionar_lead` (máquina de estados + timeline + follow-up). Roda
   sozinha a cada 2 min enquanto a aba Discador está aberta, e no botão
   "Sincronizar tabulações". Idempotente: só tabulação **nova** processa — se
   o corretor mudar a etapa manualmente depois, o sync não briga.

   O mapeamento tabulação → etapa é **configuração**, na `gestao_config`
   (chave `telefonia_tabulacao_status`), comparado sem acento/maiúsculas.
   Defaults: interessado → Em atendimento; agendou visita → Agendado; pediu
   retorno → Aguardando retorno; sem interesse / não perturbar / número
   errado → Perdido. **Alinhe os nomes das tabulações criadas no painel do
   Sonax com as chaves do mapeamento** (ou edite o mapeamento); tabulação sem
   entrada só fica registrada na chamada, sem mudar etapa.

## Peças no repositório

| Peça                                             | Arquivo                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Migration (`chamadas`, `ramal_sonax`, trigger)   | `supabase/migrations/20260816120000_telefonia_sonax.sql`                    |
| Migration (vínculos do discador por corretor)    | `supabase/migrations/20260817120000_telefonia_sonax_campanha.sql`           |
| Click-to-call (JWT + RLS do corretor)            | `supabase/functions/sonax-discar/index.ts`                                  |
| Discador automático (fila → campanha, play/stop) | `supabase/functions/sonax-campanha/index.ts`                                |
| Tabulação → etapa (sync + mapeamento)            | `supabase/functions/sonax-tabulacoes/index.ts` + migration `20260818120000` |
| Webhook de eventos (secret + service_role)       | `supabase/functions/sonax-webhook/index.ts`                                 |
| Hook do botão Ligar (com fallback `tel:`)        | `src/hooks/use-ligar-lead.ts`                                               |
| Botões no dossiê do lead                         | `src/routes/_authenticated/leads.$leadId.tsx`                               |
| Coluna Ramal na gestão                           | `src/features/gestao/corretores-page.tsx` + `ramal-sonax-client.ts`         |
| Aba Discador (rota, página, fronteira de dados)  | `src/routes/_authenticated/discador.tsx` + `src/features/telefonia/`        |
| Testes de guarda                                 | `tests/telefonia-sonax.test.ts`                                             |

## Setup (checklist de ativação)

1. **Aplicar a migration** no projeto Supabase (fluxo normal de deploy do repo).
2. **Secrets** em _Supabase → Edge Functions → Secrets_:
   - `SONAX_TOKEN` — token de ativação fornecido pelo Sonax (o mesmo dos
     exemplos da API v1).
   - `SONAX_ID_CLIENTE` — id do cliente Sonax (vem junto com o token nos dados
     de ativação; obrigatório para o discador automático).
   - `SONAX_WEBHOOK_SECRET` — segredo longo e aleatório, exclusivo do webhook
     (ex.: `openssl rand -hex 32`).
   - `SONAX_CLICK2CALL_URL` / `SONAX_API_URL` (opcionais) — só se o Sonax
     fornecer hosts diferentes dos padrões.
3. **Deploy das functions** `sonax-discar`, `sonax-campanha`,
   `sonax-tabulacoes` e `sonax-webhook`
   (`supabase functions deploy sonax-discar sonax-campanha sonax-tabulacoes sonax-webhook`).
   O `config.toml` já define `verify_jwt` correto para cada uma.
4. **Criar a campanha do discador no painel Sonax** (uma por corretor que vai
   usar o "Iniciar agora"): campanha apontando para a **fila que entrega no
   ramal do corretor**, com **descarte de caixa postal = S** e a
   simultaneidade desejada. Anote o ID da campanha e o ID do atendente.
5. **Cadastrar a URL de integração no PABX Sonax** (painel do PABX; as
   variáveis entre `<>` são do Sonax e ficam literais na URL cadastrada):

   ```
   https://rldnprwjlomjmjvinxuh.supabase.co/functions/v1/sonax-webhook?secret=SEU_SEGREDO&evento=atendida&id_chamada=<ID_CHAMADA>&numero=<NUMERO>&ramal=<RAMAL>&id_atendente=<ID_ATENDENTE>&id_fila=<ID_FILA>&id_campanha=<ID_CAMPANHA>&numero_rec=<NUMERO_REC>
   ```

   Se o PABX permitir URLs em momentos diferentes da chamada, cadastre uma por
   evento mudando só `evento=`: `chamando`, `atendida`, `finalizada`,
   `nao_atendida` (o webhook atualiza a mesma linha de `chamadas` pelo
   `id_chamada`; a duração pode vir em `&duracao=` se o PABX expuser).

6. **Cadastrar a telefonia dos corretores** em **Gestão → Corretores → PABX**:
   ramal (click-to-call), ID do atendente e ID da campanha (discador
   automático).
7. Testar: abrir um lead → "Ligar" (ramal toca; ligação na timeline e em
   `chamadas`). Depois, na aba Discador → "Iniciar agora": o PABX passa a
   discar a fila e só conecta quem atende.

### Nota de segurança — secret na query string

A regra da casa (lição P-3) é secret **só em header**. O webhook aceita
`?secret=` porque a URL de integração do Sonax é um template estático sem
suporte a headers — é o único canal possível. Mitigações: segredo exclusivo
desta função (rotacionável sem afetar mais nada), comparação em tempo
constante, e kill-switch `SONAX_ALLOW_QUERY_SECRET=false` para o dia em que o
tráfego passar por um intermediário que saiba mandar `x-webhook-secret`
(ex.: n8n).

## Modelo de dados (`public.chamadas`)

| Coluna                                          | Uso                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `lead_id`                                       | Lead casado (NULL quando o número receptivo não bate com nenhum lead ativo)       |
| `corretor_id`                                   | Corretor (autor do click-to-call, ou dono do ramal no evento)                     |
| `direcao`                                       | `saida` (click2call/campanha) ou `entrada` (receptivo)                            |
| `origem`                                        | `click2call` \| `campanha` \| `receptivo` \| `agendada`                           |
| `provider` / `provider_call_id`                 | `sonax` + protocolo/ID da chamada (chave de idempotência)                         |
| `numero` / `ramal`                              | Número do cliente (dígitos) e ramal envolvido                                     |
| `status`                                        | `iniciada` → `chamando`/`falando`/`atendida` → `concluida`/`nao_atendida`/`falha` |
| `duracao_segundos`, `tabulacao`, `gravacao_url` | Enriquecimentos (webhook/futuro)                                                  |
| `payload`                                       | Eventos crus recebidos (auditoria/debug)                                          |

RLS: leitura espelha o acesso ao lead (`pode_acessar_lead`); chamadas sem lead
só aparecem para o corretor do ramal e admin/superintendente. INSERT de usuário
autenticado só `direcao='saida'` em nome próprio (é o que a `sonax-discar` faz
com o JWT do corretor); entrada e updates são exclusivos do webhook
(service_role). Realtime publicado (dossiê ao vivo).

> Os types gerados do Supabase ainda não conhecem `chamadas`/`ramal_sonax`;
> o acesso do front passa por `src/features/gestao/ramal-sonax-client.ts`
> (fronteira estrutural, molde de `mensagens-client.ts`). Ao regenerar os
> types, remova o shim.

## Referência da API Sonax

### Autenticação

- **v1**: `id_cliente` + `token` em query string (dados de ativação fornecidos
  pelo Sonax).
- **Click2Call**: host próprio, só `token`.
- **v2** (`https://apiv2.sonax.net.br`): `POST /login` com `id` + `senha`
  (form-data).

### Base URLs

| API        | URL                                                                    |
| ---------- | ---------------------------------------------------------------------- |
| v1         | `https://api.sonax.net.br/a2billing_v2/admin/Public/dbdial_webapi.php` |
| Click2Call | `https://click2call.sonax.net.br/sonax-click2call.php`                 |
| v2         | `https://apiv2.sonax.net.br`                                           |

### v1 — ações (GET com `?acao=<acao>&id_cliente=<ID>&token=<TOKEN>` + parâmetros)

| Ação                                                           | Parâmetros                                                                                                                                                                                        | Uso                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Click2Call                                                     | `numero`, `ramal`, `token` (host click2call)                                                                                                                                                      | Liga do ramal para o número (usada pela `sonax-discar`)                       |
| `chamada`                                                      | `id_contato`, `numero`, `id_campanha`, `prioridade`, `data_hora`, `script`                                                                                                                        | Insere chamada em campanha do discador (o `script` aparece na tela do agente) |
| `status_chamada`                                               | `id_chamada`                                                                                                                                                                                      | Status de uma chamada (chamando, falando…)                                    |
| `status_chamadas_andamento` / `status_chamadas_falando`        | `id_campanha`                                                                                                                                                                                     | Chamadas da campanha                                                          |
| `status_chamadas_na_fila`                                      | `id_fila`                                                                                                                                                                                         | Chamadas na fila                                                              |
| `pega_gravacao`                                                | `id_chamada`                                                                                                                                                                                      | Arquivo da gravação (wav)                                                     |
| `agendar_ligacao`                                              | `atendente_id`, `dt_agendamento`, `obs`, `numero`                                                                                                                                                 | Agenda ligação                                                                |
| `lista_campanha`                                               | `id_campanha` (`todas` ou ID)                                                                                                                                                                     | Lista campanhas                                                               |
| `cria_campanha`                                                | `descricao_campanha`, `id_fila`, `descarte_caixa_postal` (S/N), `qtd_simultanea`, `auto_concluir`, `dia_semana_ini/fim`, `hora_ini/fim`, `tabulacoes_positivas/negativas`, `pausas`, `tentativas` | Cria campanha apontando para fila                                             |
| `play_campanha` / `stop_campanha`                              | `id_campanha`                                                                                                                                                                                     | Liga/pausa a discagem                                                         |
| `limpa_contatos_campanha`                                      | `id_campanha`                                                                                                                                                                                     | Limpa o mailing                                                               |
| `upload_arquivo_contato` (POST form-data)                      | `id_campanha`, `prioridade`, `arquivo`                                                                                                                                                            | Sobe mailing na campanha                                                      |
| `download_arquivo_contato`                                     | `id_campanha`                                                                                                                                                                                     | Baixa o mailing                                                               |
| `lista_tabulacao` / `atualiza_tabulacao_contato`               | `id_campanha`, `id_tabulacao`, `id_contato_campanha`                                                                                                                                              | Tabulações                                                                    |
| `lista_filas` / `lista_pausas` / `limpa_estatisticas_fila`     | `id_fila`                                                                                                                                                                                         | Filas e pausas                                                                |
| `login` / `logout` / `pausar` / `play` / `status_atendente`    | `id_atendente`, `ramal`, `id_motivo`                                                                                                                                                              | Sessão do atendente                                                           |
| `inserir_blacklist` / `deletar_blacklist` / `buscar_blacklist` | `numero_bloqueado`, `numero_virtual`, `ativo_receptivo`                                                                                                                                           | Não perturbe                                                                  |
| `alterar_simultaneidade_campanha`                              | `id_campanha`, `nova_quantidade`                                                                                                                                                                  | Simultaneidade                                                                |

Retornos v1 (texto, não JSON): sucesso é `1`/"Inserido com sucesso"/protocolo da
ligação/status textual (`chamando`, `falando`, `disponível`, `pausado`…); erro é
**HTTP 404** ("transação recusada — sem resultados ou parâmetro incorreto").

### Variáveis da URL de integração (webhook)

`ID_CHAMADA`, `ID_CHAMADA_ORIGINADOR`, `ID_CONTATO`, `RAMAL`, `ALIASRAMAL`,
`ALIAS2` (ID de integração do ramal), `NUMERO` (cliente; **destino** em
campanha), `NUMERO_REC` (número receptivo), `AT_LOGIN`, `ID_ATENDENTE`,
`ID_FILA`, `ID_CAMPANHA`. Citar na URL entre `<>`.

### v2 — endpoints (POST form-data em `https://apiv2.sonax.net.br`)

| Endpoint                                                                              | Campos                                                             | Uso                                                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `/login`                                                                              | `id`, `senha`                                                      | Autenticação v2                                                                                                  |
| `/api/vingadora/relatorioAgentes`                                                     | `dataInicio`, `dataFim`, `idCliente`                               | Relatório de agentes                                                                                             |
| `/api/vingadora/relatorioPausas`                                                      | `dt_inicio`, `dt_fim`, `agentes` [ids], `departamentos`, `motivos` | Pausas                                                                                                           |
| `/api/vingadora/pegaGravacao`                                                         | `idChamada`, `idCliente`                                           | Gravação por protocolo                                                                                           |
| `/api/vingadora/relatorioEntrante`                                                    | `dt_inicio`, `dt_fim` (dd/mm/aaaa; máx. 31 dias) + filtros         | Entrantes — devolve `relatorio[]` com `cid`, `espera`, `duracao_segundos`, `atendido`, `numero`, `agente_login`… |
| `/api/vingadora/relatorioSainte`                                                      | idem                                                               | Saintes                                                                                                          |
| `/api/vingadora/uploadDeCampanhaLeadscore` / `statusCampanhaLeadscore`                | `score`, `arquivo`, `idCliente`, `descricaoCampanha`, `idFila`…    | Campanha com leadscore                                                                                           |
| `/api/vingadora/cadastrarAtualizarContatoRapido`                                      | `identificadorContato`, `nome`, `telefone1/2`, `obs`, endereço…    | Upsert de contato no PABX                                                                                        |
| `/api/vingadora/inativarContatoCampanha`                                              | `identificadorContato`                                             | Inativa contato                                                                                                  |
| `/api/vingadora/chamadasEmEsperaNaFila` / `listaFilas` / `listarUras` / `listaPausas` | `filasId` / `idCliente`                                            | Listagens/monitoração                                                                                            |
| `/supervisor/disponibilidadeDeAgentesNaFila`                                          | `filas`                                                            | Disponibilidade                                                                                                  |
| `/api/sonia/buscarLigacoesProcessadas`                                                | `dataInicio`, `dataFim`, `filasId`, `chamadasId`                   | SonIA                                                                                                            |

## Próximos passos naturais (fora deste escopo)

- **Gravações no dossiê**: proxy `pega_gravacao`/`pegaGravacao` (o token não
  pode ir ao browser) preenchendo `chamadas.gravacao_url`.
- **Campanhas do discador a partir do CRM**: empurrar listas de leads via
  `acao=chamada`/`upload_arquivo_contato` (ex.: reaquecimento de base parada).
- **Conciliação diária**: cron puxando `relatorioSainte`/`relatorioEntrante`
  (v2) para fechar duração/status de chamadas que o webhook perdeu.
- **Ligar de outros pontos**: os ~14 `tel:` restantes (tabela de leads, focus
  mode, atendimento, command center…) podem migrar para `useLigarLead`.
