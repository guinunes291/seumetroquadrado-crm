# Fase 0: investigação da saída do Lovable (Supabase próprio + Vercel + Claude)

> Data da investigação: 26 e 27/10/2026. Commit analisado: `e0f719f` (o mesmo publicado no Lovable).
> Escopo: **só leitura**. Nada foi alterado em produção, no banco, no Lovable, na Vercel ou no Supabase.

---

## Sumário

1. [Como esta investigação foi feita](#1-como-esta-investigação-foi-feita)
2. [Veredito](#2-veredito)
3. [Retrato do CRM hoje, em números](#3-retrato-do-crm-hoje-em-números)
4. [Problemas de produção encontrados (independentes da migração)](#4-problemas-de-produção-encontrados-independentes-da-migração)
5. [Os cinco achados que mudam o plano](#5-os-cinco-achados-que-mudam-o-plano)
6. [Bloqueadores e riscos altos (já verificados)](#6-bloqueadores-e-riscos-altos-já-verificados)
7. [Drift: o banco de produção não é igual ao repositório](#7-drift-o-banco-de-produção-não-é-igual-ao-repositório)
8. [Banco: o que levar, como tirar do Lovable e como restaurar](#8-banco-o-que-levar-como-tirar-do-lovable-e-como-restaurar)
9. [Código: cada acoplamento com o Lovable e o substituto](#9-código-cada-acoplamento-com-o-lovable-e-o-substituto)
10. [Integrações e URLs que mudam no dia do corte](#10-integrações-e-urls-que-mudam-no-dia-do-corte)
11. [Segredos e variáveis de ambiente](#11-segredos-e-variáveis-de-ambiente)
12. [IA: hoje e depois](#12-ia-hoje-e-depois)
13. [Hospedagem: Vercel ou Cloudflare](#13-hospedagem-vercel-ou-cloudflare)
14. [O corte: janela, congelamento, rollback e LGPD](#14-o-corte-janela-congelamento-rollback-e-lgpd)
15. [Custos](#15-custos)
16. [Decisões que só você pode tomar](#16-decisões-que-só-você-pode-tomar)
17. [Perguntas para o suporte do Lovable (texto pronto)](#17-perguntas-para-o-suporte-do-lovable-texto-pronto)
18. [Plano revisado das fases 1 a 4](#18-plano-revisado-das-fases-1-a-4)
19. [Apêndices](#19-apêndices)

---

## 1. Como esta investigação foi feita

O trabalho foi dividido em frentes independentes, para que nenhum achado dependesse da leitura de uma pessoa só:

| Etapa      | O que foi feito                                                                                                                                                                                                                        | Agentes |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Investigar | 11 frentes: acoplamento com o Lovable, hospedagem/runtime, plataforma do banco, edge functions, segredos, integrações externas, autenticação, IA, servidor MCP, CI/processo e pesquisa de fornecedores                                 | 11      |
| Drift      | As 269 migrations do repositório que **não** estão registradas no banco foram divididas em 17 lotes. Cada lote foi conferido objeto por objeto contra o banco vivo, e o que deu "faltando" foi re-checado por um segundo agente cético | 24      |
| Verificar  | Cada achado classificado como **bloqueador** ou **alto** passou por dois verificadores independentes, um testando a evidência e outro testando se o impacto é real                                                                     | 168     |
| Completude | Um crítico procurou o que ninguém tinha olhado (janela de corte, rollback, ACL, sequências, LGPD...) e cada lacuna virou uma investigação nova                                                                                         | 9       |

Fontes consultadas: o código (commit `e0f719f`), o banco de produção (somente `SELECT`, pelo conector do Lovable), as contas Supabase e Vercel do dono (só listagem), o n8n (só leitura), a documentação pública do Lovable, Supabase, Vercel, Cloudflare e Anthropic, e testes locais: build do app, replay das migrations num Postgres local e ensaios de dump/restore com dados sintéticos.

**Por que a verificação adversarial importa aqui:** dos achados que vieram como "alto", a maioria foi **rebaixada para médio** pelos verificadores, quase sempre porque o recurso afetado nem está em uso hoje. Exemplo real: o servidor MCP do repositório parecia um risco alto de quebra no corte, mas o banco mostra 1 cliente OAuth, 0 sessões ativas e 0 autorizações. Este relatório já usa as severidades corrigidas, e a seção 6 diz quando houve ajuste.

---

## 2. Veredito

**Dá para migrar, e vale a pena, mas não do jeito simples que parecia.** Não existe "exportar e importar". O maior obstáculo não é o código: é **tirar o banco do Lovable Cloud com fidelidade** e **trocar os endereços espalhados fora do repositório** (n8n, Zapier, 3C Plus, Z-API, programas Python, links já enviados) sem perder lead no caminho.

O que sustenta o "dá para migrar":

- **O código roda fora do Lovable quase sem mudança.** O build para a Vercel funcionou aqui sem tocar em código (`NITRO_PRESET=vercel`, 2 min 13 s). As 13 edge functions não importam nada do Lovable.
- **Os dados de negócio são pequenos.** Dos 20 GB, cerca de 1,7 GB são leads, clientes, vendas, interações etc. O resto (cerca de 18 GB) são três tabelas de log, e a maior delas inchou por causa de um defeito (seção 4.2).
- **Senhas e contas Google podem ser preservadas.** Os hashes bcrypt e as identidades Google vão junto se os UUIDs de `auth.users` forem mantidos. Ninguém precisa redefinir senha. Todos fazem **um** login novo.
- **Há caminho de volta.** O banco antigo pode assinar uma replicação lógica do banco novo e ficar como reserva quente durante a validação (seção 14.4).

O que torna isso um projeto, e não uma tarde:

1. **O export oficial do Lovable tem limite de 15 GB por banco e 5 GB por arquivo** (documentação pública, ver seção 5.1). O banco tem 20 GB. Os logs precisam ser tratados antes, ou o Lovable precisa liberar um dump maior.
2. **Hoje não existe nenhum backup do CRM fora do Lovable.** Se algo der errado no Lovable, não há de onde restaurar. Isso é risco **atual**, mesmo sem migração.
3. **O banco de produção não é igual ao repositório.** O motor de distribuição de leads que roda hoje inclui código que **não está na `main`** (veio de uma branch não mergeada e de ajustes manuais). O banco novo tem que nascer de um dump da produção, não das migrations.
4. **Um restore lógico ingênuo reabre permissões.** O projeto Supabase novo vem com regras padrão que devolvem ao usuário anônimo o acesso a 541 funções que hoje estão fechadas. Tem correção, e ela foi testada localmente (seção 8.6).
5. **O lead que chega durante o corte pode sumir sem alerta.** O nó do n8n que entrega o lead ao CRM não tem retry nem fila (seção 14.1).

**Recomendação de próximo passo (nesta ordem):**

1. **Esta semana:** abrir chamado no suporte do Lovable com as perguntas da seção 17. A resposta define o caminho de extração dos dados.
2. **Esta semana:** subir a organização Supabase para o plano **Pro** e criar **um projeto novo** em São Paulo (`sa-east-1`) para o CRM. O `smq-operacional` fica separado. Primeiro uso do projeto novo: **ter um backup do CRM fora do Lovable**, independente da migração.
3. **Ligar um domínio próprio (ex.: `crm.seumetroquadrado.com.br`) ainda no Lovable.** Isso transforma a futura troca de hospedagem numa troca de DNS e mata metade dos riscos de URL antes do corte.
4. Corrigir os problemas da seção 4 que existem hoje, independentemente da migração.
5. Só então começar a Fase 1 (desacoplar o código).

---

## 3. Retrato do CRM hoje, em números

### 3.1 Código

| Item                                | Quantidade                              | Observação                                                   |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Linhas em `src/`                    | ~204 mil                                | TanStack Start + Nitro, React, Tailwind, shadcn              |
| Telas autenticadas                  | 66 rotas em `src/routes/_authenticated` |                                                              |
| Migrations em `supabase/migrations` | 467                                     | 198 geradas pelo Lovable, 269 escritas por Claude/Codex      |
| Migrations em `drizzle/migrations`  | 117 no journal, 109 aplicadas           | É o canal que o Lovable de fato aplica em produção (seção 7) |
| Edge functions                      | 13 (4.732 linhas em Deno)               | Só 2 com uso comprovado (seção 10.3)                         |
| Commits feitos pelo bot do Lovable  | 182 de 219 visíveis                     | O bot reescreve arquivos gerados e faz push direto na `main` |

### 3.2 Banco de produção (Lovable Cloud, ref `rldnprwjlomjmjvinxuh`)

| Item                                                      | Valor                                                                                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres                                                  | 17.6                                                                                                                                                |
| Tamanho total                                             | 20 GB                                                                                                                                               |
| Dados de negócio (sem os 3 logs)                          | ~1,7 GB                                                                                                                                             |
| Tabelas / funções / triggers / policies (schema `public`) | 178 / 680 / 670 / 289                                                                                                                               |
| Cron jobs ativos                                          | 34                                                                                                                                                  |
| Extensões                                                 | pg_cron, pg_net, pg_stat_statements, pg_trgm, pgcrypto, supabase_vault, unaccent, uuid-ossp (todas existem no Supabase próprio, nas mesmas versões) |
| Usuários (`auth.users`)                                   | 87: 43 com senha, 56 identidades Google, 35 que só entram com Google                                                                                |
| Sessões abertas                                           | ~776                                                                                                                                                |
| Storage                                                   | 5 buckets, 1.570 arquivos, 618 MB (`documentacao` tem 588 MB)                                                                                       |
| Realtime                                                  | 17 tabelas publicadas                                                                                                                               |
| Leads                                                     | ~231 mil                                                                                                                                            |

As maiores tabelas:

| Tabela                      | Tamanho | Linhas  | O que é                                         |
| --------------------------- | ------- | ------- | ----------------------------------------------- |
| `distribuicao_log_contexto` | 12 GB   | 3,5 mi  | Foto completa de cada tentativa de distribuição |
| `audit_log`                 | 5 GB    | 1,58 mi | Auditoria de alterações                         |
| `distribution_log`          | 1 GB    | 3,5 mi  | Log de distribuição                             |
| `leads`                     | 485 MB  | 231 mil |                                                 |
| `alertas`                   | 478 MB  | 1,5 mi  |                                                 |
| `clientes`                  | 197 MB  | 225 mil |                                                 |

### 3.3 Tráfego e uso

- O n8n faz cerca de **57 mil chamadas autenticadas em 30 dias** à API pública do CRM (`/api/public/*`).
- Cerca de **650 leads por mês** entram pelo webhook de lead (`/api/public/webhooks/lead/$token`), quase todos vindos do n8n (Marquinhos).
- IA: **996 execuções** desde 15/07. A versão ativa da Sami (`samiq-2026-10-v8`) usa `anthropic/claude-sonnet-5` desde 23/10. O custo médio de um turno da Sami no WhatsApp é de **cerca de R$ 0,34** (32,7 mil tokens de entrada em média).

### 3.4 O que você já tem fora do Lovable

| Conta                              | O que tem                                                           | Situação                                                                 |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Supabase (org `guinunes291's Org`) | `smq-operacional` (sa-east-1, ativo) e "Documentação CRM" (inativo) | **Plano Free.** Não comporta o CRM: o limite é de 500 MB e não há backup |
| Vercel (time "Seu Metro Quadrado") | Nenhum projeto                                                      | Plano a confirmar. Uso comercial exige **Pro**                           |
| Railway                            | Servidor `smq_crm_mcp` (o conector "CRM MCP" do Claude)             | Lê o banco do Lovable com a conta `docs-bot` (seção 10.4)                |
| Mac do dono                        | Daemon `smq-docs-crm` (baixa documentos dos leads)                  | Também usa a conta `docs-bot`                                            |

---

## 4. Problemas de produção encontrados (independentes da migração)

Estes problemas existem **hoje**, com ou sem migração. Alguns precisam ser resolvidos antes do corte, porque o corte os pioraria.

### 4.1 O push nunca funcionou: 102 mil notificações presas desde 16/06

**O que acontece:** o cron `push-dispatch-every-minute` chama a rota de envio de push a cada minuto, e a rota responde `500 missing PUSH_DISPATCH_SECRET`. Conferi pessoalmente: 353 erros 500 nas últimas 6 horas, **102.665 notificações nunca enviadas**, para 70 usuários, sendo a mais antiga de 16/06. Nenhuma notificação push foi entregue desde que a tabela existe.

**Por que importa para a migração:** não basta "configurar o segredo". O cron também não envia o cabeçalho `x-push-secret`. E, se as duas coisas forem consertadas sem limpar a fila, cerca de **50 mil notificações antigas saem de uma vez** para os 15 corretores que têm o push ativado (as outras ~52 mil são de usuários sem assinatura e ficam girando na fila, atrasando as notificações novas por dias).

**Exemplo concreto:** um corretor com push ativado recebe de uma vez, no meio de um atendimento, ~3.300 lembretes de visitas que aconteceram em julho.

**Agravante:** desde o commit `e0f719f`, os avisos de proposta (Link de Proposta) também passam pelo mesmo cron. Hoje eles só saem pelo envio imediato após o aceite. A nova tentativa a cada minuto não roda.

**O que fazer:** decidir se o push continua. Se continuar: (1) marcar como expiradas as pendências com mais de 24 h; (2) pôr um corte por idade em `claim_push_outbox`; (3) guardar o segredo no Vault e montar o comando do cron com o cabeçalho. **Mudança em produção, só com a sua autorização.**

### 4.2 Log de distribuição inchado por repetição de tentativas que falham

**O que acontece:** cerca de 96% das linhas de `distribution_log` são tentativas `sem_corretor` (o lead não encontrou corretor apto). O cron `distribuicao-automatica-5min` tenta de novo a cada 5 minutos (até 3 vezes a cada 30 min), e cada tentativa grava em `distribuicao_log_contexto` uma foto de ~2,7 KB com a lista de corretores aptos e inaptos. Nenhuma das três tabelas de log tem limpeza.

**Situação atual:** o problema está **dormente desde ~12/10**. Nas últimas 10 mil linhas, 85% são sucesso, e o ritmo caiu para ~850 linhas/dia (~1,5 MB/dia). Mas o mecanismo continua lá: basta uma roleta ficar sem corretor apto por alguns dias para voltar a crescer.

**Por que importa:** é isso que faz o banco ter 20 GB em vez de ~2 GB e passar do limite do export do Lovable.

**O que fazer:** (Fase 1) gravar a foto completa só no sucesso ou na primeira falha e, nas repetições, só o motivo e a contagem; criar um job de retenção. (Fase 0) decidir a política de retenção (seção 8.1).

### 4.3 O motor de distribuição em produção tem código que não está na `main`

A função `_distribuir_lead_v3`, que é o coração da roleta, tem em produção **40.034 caracteres**. A versão do repositório tem 30.773. As 171 linhas a mais vêm de duas fontes:

- a migration `0084_roletas_simples.sql`, que está **só na branch `claude/gifted-tesla-3yxonq`** (PR #291, aberto e não mergeado), mas foi aplicada em produção pelo pipeline do Lovable;
- ajustes manuais com a marca `[CAMPANHA FIXA 17/10/2026]`, que não estão em nenhum arquivo do git.

O mesmo vale para `distribuir_estoque_filiais`, a tabela `rodizio_sem_zona` e o cron `distribuir-estoque-filiais`.

**Por que importa:** se o banco novo for montado a partir do repositório, **a distribuição de leads muda de comportamento** sem ninguém perceber. Exemplo: as roletas por filial e a campanha fixa de 17/10 simplesmente deixariam de existir.

**O que fazer:** (Fase 0) decidir o destino do PR #291; (Fase 1) trazer para o repositório, como migration, o estado exato de produção (baseline, seção 7).

### 4.4 Não há backup do CRM fora do Lovable

O único backup é o da plataforma (diário, ~14 dias, sem PITR para você), e só o Lovable consegue restaurá-lo. O runbook `docs/ops/backup-restore.md` nunca foi ensaiado e depende de um painel ao qual você não tem acesso. A rotina automática de backup que existe no n8n copia só 35 tabelas do **smq-operacional**, e não do CRM.

**O que fazer:** este é o primeiro uso do projeto Supabase Pro novo, mesmo antes de decidir a migração: um dump periódico do CRM guardado fora do Lovable.

### 4.5 Credencial de gestor em texto claro no Google Drive

Os dois programas Python (daemon de documentos no seu Mac e o servidor "CRM MCP" no Railway) entram no CRM com a conta `docs-bot`, que tem **papel de gestor e pode escrever**. A senha está num `.env` que o Google Drive sincroniza, e o token do MCP aparece no `DEPLOY.md` e no instalador. Os dois programas também têm a URL e a chave antigas fixas como valor padrão no código.

**O que fazer:** rotacionar a senha da `docs-bot` e o token do MCP. No corte, trocar as variáveis nos dois programas (seção 10.4).

### 4.6 Lead perdido em silêncio quando o CRM falha

O nó "Handoff -> CRM / Notificar Corretor" do workflow Marquinhos, por onde passa quase todo lead, **não tem retry**, está com `onError=continueRegularOutput` e marca a execução como "success" mesmo quando o CRM falha. Do lado do CRM, quando o banco está fora do ar, o webhook responde `401 Unauthorized` (a busca do token falha e vira "token inexistente"), sem log.

**Exemplo concreto:** se o CRM ficar 5 minutos fora numa manhã de segunda, os leads desses 5 minutos não chegam a nenhum corretor, ninguém é alertado e o bot fica pausado para aqueles telefones.

**O que fazer:** (Fase 1) o CRM devolver 503 quando o banco estiver indisponível, e o n8n tentar de novo com espera e alertar quando desistir. Isso é pré-requisito para qualquer janela de corte.

### 4.7 Outros problemas menores

| Problema                                                                         | Evidência                                                                                                                                                    | Ação                                                                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| A `main` está vermelha                                                           | Orçamento de escapes de tipo em 146/145, estourado por `_snapshot: snapshot as never` em `src/lib/proposta-link.functions.ts` (commit `219eee96` do Lovable) | Corrigir 1 linha ou subir o teto. Os outros jobs passam                                                                             |
| A ferramenta `list_minhas_tarefas` do MCP do repositório está quebrada           | Consulta colunas que não existem                                                                                                                             | Corrigir para `data_vencimento`/`data_conclusao`                                                                                    |
| O "CRM MCP" devolve números errados                                              | Para 01 a 25/10 respondeu 0 vendas e 0 agendamentos; o banco tem 10 vendas e 119 agendamentos                                                                | Os próprios docs (`docs/academia/fatia0-fechamento.md`) já mandam não confiar nele. Decidir se aposenta ou porta para o repositório |
| 35 funções `SECURITY DEFINER` abertas ao usuário anônimo e uma view com telefone | Achado da frente de ACL                                                                                                                                      | Revisar antes do corte, para não copiar a exposição                                                                                 |
| `fila_equipe_v1()` executável por `anon`                                         | A migration manda revogar e a revogação não está em produção                                                                                                 | Aplicar o `REVOKE`                                                                                                                  |
| Índice único anti-duplicata de telefone nunca foi criado                         | `uq_leads_projeto_telefone_ativo` não existe por causa de 73 grupos de duplicatas                                                                            | Limpar as duplicatas e criar o índice                                                                                               |
| `api_rate_limits` não existe em produção                                         | A migration `20260719124000_rate_limit_distribuido.sql` nunca foi aplicada                                                                                   | O rate limit da API pública é só em memória. Decidir se aplica                                                                      |
| O repositório no GitHub é público                                                | Configuração do repositório                                                                                                                                  | Decidir se torna privado antes de pôr segredos de deploy no Actions                                                                 |

---

## 5. Os cinco achados que mudam o plano

### 5.1 Tirar os dados do Lovable Cloud é o problema central

O que a pesquisa encontrou (documentação pública do Lovable e testes no banco):

- **Não existe transferência de projeto.** O banco roda num projeto Supabase gerenciado pelo Lovable, que não aparece na sua organização Supabase (tentei: "permission denied"). Não há botão para "levar o projeto" para a sua conta.
- **O Lovable não entrega a connection string, a senha do Postgres nem a service role.** Os segredos são "write-only": a tela mostra só o nome e a data (docs.lovable.dev/features/secrets).
- **Existe um export oficial** (Cloud → Overview → Advanced settings → Export project data), que gera um `pg_dump` em formato custom com compressão zstd, restaurável com `pg_restore`. **Mas ele tem limite de 15 GB por banco e 5 GB por arquivo**, e o CRM tem 20 GB. Ele também **não leva** storage, edge functions, segredos, configuração de login nem chaves.

O que o banco mostrou e abre outros caminhos técnicos:

- A role `postgres` que o Lovable expõe tem `CREATEROLE` e `REPLICATION` e é dona das 178 tabelas. Em tese, dá para criar uma role temporária só de leitura e rodar `pg_dump` de fora, ou montar replicação lógica. **Ainda não verificado:** se o host do banco aceita conexão de fora, e se o Lovable permite isso. É uma mudança em produção, que só deve ser feita com o aval do Lovable e o seu.
- O runtime das edge functions do Supabase expõe `SUPABASE_DB_URL` (é o que o exportador open source da Dreamlit usa). Uma função temporária protegida devolveria a URL. Também é deploy em produção pelo chat do Lovable, e existe o risco de o projeto não permitir novas funções.

As opções estão comparadas na seção 8.2. **Recomendação:** perguntar ao suporte primeiro (seção 17) e, em paralelo, preparar o caminho do export oficial reduzindo os logs.

### 5.2 Não há backup fora do Lovable (risco de hoje, não de amanhã)

Explicado na seção 4.4. O ponto é de ordem: **o primeiro uso do Supabase próprio deve ser ter uma cópia do CRM**, antes de qualquer decisão de migração. Essa cópia também é o ambiente onde se ensaia o restore.

### 5.3 O banco novo tem que nascer de um dump da produção, não das migrations

O replay das 467 migrations do repositório **funciona** (rodei com Docker: 119 s; a suíte `tests/db` passou inteira, 87 arquivos e 1.381 testes). **Mas o resultado não é a produção:**

|           | Produção | Replay do repositório                                                       |
| --------- | -------- | --------------------------------------------------------------------------- |
| Tabelas   | 178      | 172                                                                         |
| Funções   | 680      | 647                                                                         |
| Triggers  | 670      | 603                                                                         |
| Cron jobs | 34       | outros (cria `distribuicao-auto` a cada minuto, que não existe em produção) |

O motivo é que o schema chega à produção por **três trilhas** sem fonte única da verdade: (1) o Lovable aplica SQL na hora, pelo chat; (2) os PRs do Claude/Codex só chegam ao banco se forem espelhados em `drizzle/migrations` e o migrator do Lovable rodar; (3) há SQL aplicado à mão. A seção 7 detalha o drift.

**Decisão recomendada:** o banco novo nasce de um `pg_dump --schema-only` da produção, que vira uma migration única de base (_baseline_) no repositório. Os 467 arquivos e o `drizzle/` viram histórico. Daqui para frente, **uma trilha só**: `supabase/migrations` + Supabase CLI no CI.

### 5.4 Um restore lógico ingênuo reabre permissões fechadas

Este achado veio de um teste local (Postgres 16.15 descartável) e é fácil de errar.

**O que acontece:** um projeto Supabase novo vem com regras de permissão padrão (_default ACL_) que dão ao usuário anônimo (`anon`) acesso a todo objeto que o `postgres` cria no schema `public`. O `pg_dump` grava as permissões **em relação ao padrão**, então não revoga o que o projeto novo concede. Resultado de qualquer restore lógico (com ou sem privilégios, texto ou custom):

- as **541 funções** hoje fechadas para `anon` (484 delas `SECURITY DEFINER`, das quais 449 chamáveis por `/rest/v1/rpc`) voltam a ficar abertas;
- 70 tabelas e 6 views sem acesso anônimo voltam a ter;
- os grants de coluna que escondem `api_token` e `webhook_token` se perdem.

**Exemplo concreto:** alguém com a chave pública do CRM (que fica no JavaScript do navegador) poderia chamar pela API REST funções administrativas que hoje são negadas.

Além disso, a role `sandbox_exec` do Lovable aparece na lista de permissões de todas as 208 relações do `public`. Ela não existe no Supabase próprio, e isso quebra o restore: o `psql --single-transaction` da receita oficial aborta inteiro, e o `pg_restore` descarta o bloco de permissões de cada tabela.

**Correção validada localmente** (a comparação de permissões origem × destino deu idêntica): (1) neutralizar o default ACL do projeto novo antes de restaurar o schema; (2) criar uma role vazia `sandbox_exec`; (3) restaurar **com** privilégios; (4) comparar a matriz de permissões e os hashes antes de liberar tráfego. **Atenção:** as receitas de migração Lovable → Supabase que circulam na internet usam `--no-privileges`, que é exatamente o caminho errado.

### 5.5 Domínio próprio antes de tudo

O endereço `seumetroquadrado-crm.lovable.app` (e o `project--862f238b…lovable.app`) está gravado em pelo menos:

- **11 workflows ativos do n8n** (Sami, Marquinhos, handoff, métricas);
- o código (`CRM_URL_PUBLICA` em `src/lib/proposta-link.ts:208`, usado nos links de proposta enviados aos clientes);
- o banco (`copiloto_config.handoff_url`, a função `_notificar_handoff_novo_dono`, o cron de push);
- o `smq-operacional` (`contingencia_config.crm_base`);
- Zaps, o webhook do WhatsApp, o callback do Google Agenda e o servidor MCP.

Esse domínio **não vai junto** para a Vercel. Se o app trocar de hospedagem com esse endereço, cada um desses lugares tem que ser trocado no mesmo dia, e cada esquecimento vira um lead ou um aviso perdido.

**Recomendação:** contratar `crm.seumetroquadrado.com.br` (ou outro) e ligá-lo **ainda no Lovable** (Fase 1). Migrar n8n, Zapier, Z-API, banco e código para ele com calma, com o Lovable no ar. No dia do corte, a hospedagem muda só no DNS. Assim, PWA, push, favoritos e links não mudam de origem uma segunda vez. O login novo acontece de qualquer jeito na troca de banco (a chave de sessão `sb-<ref>-auth-token` depende do projeto), mas acontece **uma vez só**.

---

## 6. Bloqueadores e riscos altos (já verificados)

Legenda de fase: 0 = decidir agora, 1 = desacoplar o código, 2 = banco, 3 = hospedagem, 4 = desligar o Lovable. Esforço: P (horas), M (dias), G (semanas).

### 6.1 Bloqueadores

| #   | Achado                                                                                          | Por que bloqueia                                                      | Ação                                                                                    | Fase | Esforço |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---- | ------- |
| B1  | Extração do banco: o export oficial vai até 15 GB e o banco tem 20 GB; não há connection string | Sem os dados não há migração                                          | Suporte do Lovable + reduzir logs + caminhos alternativos (seção 8.2)                   | 0    | M       |
| B2  | Não existe backup do CRM fora do Lovable                                                        | Sem rede de segurança para o corte (nem para hoje)                    | Supabase Pro + primeiro dump fora                                                       | 0    | P       |
| B3  | O replay das migrations não reproduz a produção                                                 | O banco novo teria outro comportamento (roletas, campanha fixa)       | Baseline por dump da produção                                                           | 0/2  | G       |
| B4  | Default ACL do projeto novo + role `sandbox_exec`                                               | Reabre 541 funções ao anônimo ou aborta o restore                     | Receita de restore da seção 8.3                                                         | 2    | M       |
| B5  | Login Google depende do broker do Lovable (`/~oauth/initiate`)                                  | 35 usuários só entram com Google (20 ativos no mês)                   | OAuth client próprio no Google Cloud + `supabase.auth.signInWithOAuth`                  | 1/2  | M       |
| B6  | Handoff de lead do n8n sem retry e CRM devolvendo 401 com banco fora                            | Leads somem sem alerta na janela de corte                             | 503 + retry e alerta no n8n                                                             | 1    | M       |
| B7  | Não há como congelar o banco antigo; `read_only` e `REVOKE` não funcionam                       | Escrita dividida entre os dois bancos (_split brain_)                 | Gatilho de congelamento por statement em todas as tabelas + desligar crons (seção 14.2) | 2    | M       |
| B8  | Uploads de 15 a 20 MB passam pelo corpo da função; a Vercel aceita 4,5 MB                       | Upload de documentação quebra (14 arquivos do bucket já passam disso) | URL de upload assinada direto para o Storage                                            | 1    | M       |

O B8 só vale se a hospedagem for a Vercel. No Cloudflare Workers ele não existe.

### 6.2 Riscos altos

| #   | Achado                                                                                                                                                                                                                                                             | Ação                                                                                                      | Fase |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---- |
| A1  | O `vite.config.ts` tem fallback fixo para o banco do Lovable (URL e chave públicas). Um deploy sem as variáveis **funciona em silêncio contra o banco antigo**, no navegador e no servidor                                                                         | Remover fallbacks e falhar o build se faltar variável; smoke que procura `rldnprwjlomjmjvinxuh` no bundle | 1    |
| A2  | URLs gravadas no banco. Ex.: `distribuicao_settings.sdr_aviso_corretor_url` aponta para a edge function do projeto antigo. Depois do corte, **o WhatsApp de entrega ao SDR para de sair sem erro visível** (o `pg_net` é assíncrono e o evento fica "enfileirado") | Roteiro de `UPDATE` pós-restore + URLs vindas de configuração                                             | 1/2  |
| A3  | Os 34 crons vêm **ativos** no dump, e os gatilhos de `leads` fazem chamadas HTTP. Um ensaio de restore dispararia n8n e WhatsApp de verdade, e os dois bancos rodariam os motores ao mesmo tempo                                                                   | Restaurar com crons desligados e `session_replication_role=replica`; neutralizar URLs no ensaio           | 2    |
| A4  | O gatilho `on_auth_user_created` (`handle_new_user`) recusa qualquer e-mail sem convite pendente e aborta a importação de `auth.users`                                                                                                                             | Carregar `auth` em modo réplica e recriar o gatilho depois                                                | 2    |
| A5  | Valores dos segredos não podem ser lidos no Lovable                                                                                                                                                                                                                | Inventário com a origem de cada valor; recuperar nos terceiros ou rotacionar em par (seção 11)            | 0/2  |
| A6  | Lovable e Claude editando ao mesmo tempo: o bot regrava arquivos gerados e faz push na `main`; schema de branch não mergeada já foi parar em produção                                                                                                              | Congelar o chat do Lovable a partir do dump de baseline                                                   | 0    |
| A7  | Dois programas Python usam a conta `docs-bot` com URL antiga fixa no código                                                                                                                                                                                        | Repontar e rotacionar (seção 10.4)                                                                        | 2    |
| A8  | A configuração do Auth fica fora do SQL: signup fechado, SMTP, Google, Site URL, Redirect URLs, servidor OAuth                                                                                                                                                     | Configurar no projeto novo antes do corte (seção 8.4)                                                     | 2    |
| A9  | Storage: 618 MB, 3 buckets criados fora das migrations, 21 policies                                                                                                                                                                                                | Script de cópia pela API do Storage + policies na baseline                                                | 2    |
| A10 | A organização Supabase está no plano Free (limite de 500 MB, sem backup)                                                                                                                                                                                           | Subir para Pro                                                                                            | 0    |
| A11 | Sequências: numa carga que não seja `pg_dump` completo, elas chegam zeradas. `cliente_eventos_id_seq` zerada derruba edição de lead e agendamento por link; `higiene_execucao_log_id_seq` aborta o cron de higiene                                                 | `setval` genérico + consulta de verificação no runbook                                                    | 2    |
| A12 | Todas as 5 superfícies de IA dependem da `LOVABLE_API_KEY`                                                                                                                                                                                                         | Provider direto da Anthropic atrás de `AI_PROVIDER` (seção 12)                                            | 1    |

### 6.3 Rebaixados na verificação (continuam no checklist, mas não são críticos)

| Achado original                                                                              | Por que caiu para médio ou baixo                                                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Servidor MCP do repositório e OAuth 2.1                                                      | 1 cliente, 0 sessões ativas, 0 autorizações. O conector que você usa é outro (o "CRM MCP" do Railway)                |
| Rajada de 102 mil pushes                                                                     | Só ~50 mil chegariam, para 15 corretores internos. Resolve com uma limpeza antes                                     |
| `distribuicao_log_contexto` com 12 GB                                                        | Não quebra nada no corte, só custa tempo e disco. Pesa para o limite do export (B1)                                  |
| Migrations 0100 (eventos 3C Plus) e 0103 (bloqueio de telefone de corretor) fora de produção | Com baseline por dump, elas ficam de fora automaticamente. Decida se entram depois, como migrations novas e testadas |
| Redirect do Google Agenda                                                                    | O refresh de token não usa redirect URI. Só conexões novas falhariam. Manter o mesmo `GOOGLE_CLIENT_ID`              |
| Wrapper `@lovable.dev/vite-tanstack-config`                                                  | Funciona na Vercel sem mudança (o bundle saiu idêntico byte a byte). Trocar é limpeza opcional                       |
| Proxy de PDF de até 150 MB                                                                   | A rota nunca foi usada com sucesso em produção (0 projetos com plantas) e a Vercel faz streaming                     |
| `smq-operacional` não serve como destino                                                     | Basta criar um projeto novo na mesma organização                                                                     |
| Links já enviados a clientes                                                                 | Hoje são 2 propostas (vencem até 24/11) e 4 links de agendamento                                                     |
| Sessões caem no corte                                                                        | Inevitável e aceitável: um login novo por pessoa, uma vez                                                            |

Um achado foi **refutado**: a ideia de que os hashes de senha "só se preservam com um dump completo fornecido pelo Lovable". A role `postgres` consegue ler `auth.users.encrypted_password`, e são só 43 linhas. Dá para transportá-las com `auth.admin.createUser` com `id` e `password_hash`.

---

## 7. Drift: o banco de produção não é igual ao repositório

### 7.1 Como as migrations chegam (ou não) à produção

Existem **dois registros** de migrations no banco:

- `supabase_migrations.schema_migrations`: 199 linhas. São as migrations que o próprio Lovable gerou pelo chat (nomes com UUID). Não há nada registrado depois de 16/09.
- `drizzle.__drizzle_migrations`: 109 linhas. É o canal que o Lovable usa para aplicar o que chega em `drizzle/migrations` na `main` (`drizzle.config.ts` → `LOVABLE_DB_MIGRATION_URL`).

As 269 migrations de `supabase/migrations` escritas fora do Lovable não estão no primeiro registro. Algumas chegaram pelo espelho em `drizzle/`, outras foram aplicadas à mão. Por isso o registro não serve como prova, e cada uma foi conferida objeto por objeto.

### 7.2 Resultado da conferência das 269

| Situação    | Quantidade | Significado                                                                   |
| ----------- | ---------- | ----------------------------------------------------------------------------- |
| Aplicada    | 178        | Tudo presente, com o corpo das funções igual ao arquivo                       |
| Substituída | 45         | Aplicada e depois reescrita de propósito por uma migration posterior (normal) |
| Só dados    | 27         | Só seed/`INSERT`, conferido pela chave                                        |
| **Parcial** | **13**     | Parte não está em produção                                                    |
| **Ausente** | **6**      | Nada (ou quase nada) está em produção                                         |

Além disso, existem **18 funções e 5 cron jobs que só existem em produção**, sem nenhum arquivo no repositório, e 10 entradas do `drizzle` sem correspondência exata de hash (0037, 0044, 0060, 0063, 0064, 0071, 0072, 0100, 0102, 0103). Duas migrations aplicadas em produção vieram de uma branch `lovable-sync` que nunca chegou à `main`.

### 7.3 As divergências que mudam comportamento

| Migration                                        | O que falta em produção                                                                                       | Efeito real hoje                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260720180000_gestor_escopo_equipe_hardening`  | As policies que restringem a **admin** a gestão da fila de distribuição, projetos e templates                 | **Em produção, o gestor ainda pode gerenciar a fila, criar, editar e apagar projetos e templates.** O repositório diz que só o admin pode                      |
| `20260720120000_leads_filtered_v2_escopo_equipe` | O escopo de equipe em `leads_filtered_v2`                                                                     | Verificar se a v2 ainda é chamada (há v5)                                                                                                                      |
| `20260719123000_correcoes_suite_sql`             | A guarda de lead encerrado em `sync_proximo_followup`                                                         | 27 leads fechados, perdidos ou em pós-venda ainda têm `proximo_followup` e podem aparecer em listas de follow-up                                               |
| `20260719130000_kpis_consistencia`               | A versão nova de `leads_status_counts_v2` e `dashboard_motivos_perda`                                         | Os KPIs de produção podem contar leads da lixeira e usar outro escopo                                                                                          |
| `20260719120000_dedup_hardening_e_guard_insert`  | O gatilho `proteger_fechamento_insert` e os índices únicos de telefone                                        | Duplicatas de telefone não são barradas pelo banco (73 grupos hoje)                                                                                            |
| `20260710122000_leads_dedup_telefone`            | O índice `uq_leads_projeto_telefone_ativo`                                                                    | Idem                                                                                                                                                           |
| `20260719124000_rate_limit_distribuido`          | A tabela `api_rate_limits` e o cron de limpeza                                                                | O rate limit da API pública é só em memória, por instância                                                                                                     |
| `20260912230000_fila_equipe_v1`                  | O `REVOKE` da função `fila_equipe_v1()`                                                                       | Executável por `anon`                                                                                                                                          |
| `20260616130100` (conquistas e presença)         | As tabelas `tipos_conquista`, `conquistas`, `historico_presenca`, `resumo_presenca_diaria`                    | Verificar a tela `/conquistas`; os crons `conceder-conquistas`, `consolidar-presenca` e `auto-checkout-presenca` do repositório também não existem em produção |
| Outras 10                                        | Comentários de coluna, índices cobertos por outros índices, funções v1 da Copa que deveriam ter sido apagadas | Sem efeito funcional relevante                                                                                                                                 |

**O que fazer:** nenhuma dessas diferenças precisa ser resolvida para migrar, porque a baseline copia a produção como ela é. Mas cada uma é uma **decisão de produto** (qual comportamento é o certo?). A recomendação é levar a produção como está e corrigir depois, com migrations novas e testadas. A exceção é a permissão do gestor (primeira linha): ela merece uma decisão sua antes.

---

## 8. Banco: o que levar, como tirar do Lovable e como restaurar

### 8.1 O que migrar e o que arquivar

| Dado                                                                | Tamanho         | Proposta                                                                                                                                         | Por quê                                                                               |
| ------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Núcleo (leads, clientes, vendas, interações, configurações, IA...)  | ~1,7 GB         | Migrar tudo                                                                                                                                      | É o negócio                                                                           |
| `distribuicao_log_contexto`                                         | 12 GB           | Migrar as linhas de sucesso e erro (~140 mil, menos de 300 MB) e só os últimos 30 dias de `sem_corretor`. O resto vai para arquivo frio (`COPY … | gzip`)                                                                                | 96% é repetição de tentativas que falharam |
| `audit_log`                                                         | 5 GB            | Migrar os últimos 90 dias (ou o que a política de auditoria exigir) e arquivar o resto                                                           | Boa parte são UPDATEs em lote do recálculo de temperatura com a linha inteira do lead |
| `distribution_log`                                                  | 1 GB            | Migrar inteiro                                                                                                                                   | Recebe UPDATEs e é pequeno                                                            |
| `alertas`                                                           | 478 MB          | Últimos 60 dias                                                                                                                                  | Sem retenção hoje                                                                     |
| `push_outbox`                                                       | ~100 mil linhas | **Não migrar** a fila antiga                                                                                                                     | Nunca foi enviada (seção 4.1)                                                         |
| `cron.job_run_details`, `net.*`, sessões, refresh tokens, `oauth_*` | —               | Não migrar                                                                                                                                       | Histórico de execução ou credenciais que não valem no projeto novo                    |

**Decisão sua (seção 16):** existe obrigação legal ou comercial de guardar o histórico completo de distribuição e auditoria (por exemplo, para disputas de comissão entre corretores)? Se sim, por quanto tempo? Arquivar fora do banco, num bucket privado, atende?

Com essa proposta, o banco a migrar fica com **cerca de 2 a 3 GB**: cabe no export oficial e reduz a janela de corte.

**Atenção:** reduzir o tamanho no Lovable exige `TRUNCATE` (ou recriar a tabela). `DELETE` + `VACUUM` comum não devolve espaço ao disco, e o export mede o tamanho físico. É uma operação em produção: arquivar primeiro, conferir o arquivo, depois truncar, com a sua autorização.

### 8.2 Como tirar os dados do Lovable: opções

| Opção                             | Como                                                                                                   | Prós                                              | Contras                                                                                                       | Depende de              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **A. Export oficial**             | Cloud → Overview → Advanced settings → Export project data                                             | Caminho suportado pelo Lovable; formato `pg_dump` | Limite de 15 GB/5 GB; não leva storage, functions, segredos nem config de Auth; só _snapshot_ (exige janela)  | Reduzir os logs antes   |
| **B. Suporte do Lovable**         | Pedir um dump completo ou uma connection string temporária                                             | Oficial e completo                                | Prazo e resposta desconhecidos                                                                                | Lovable                 |
| **C. Role temporária de leitura** | A `postgres` tem `CREATEROLE`: criar uma role `LOGIN` com `pg_read_all_data` e rodar `pg_dump` de fora | Dump completo, inclusive `auth`                   | Mudança em produção; **não verificado** se o host aceita conexão externa nem se os termos do Lovable permitem | Aval do Lovable + o seu |
| **D. Edge function temporária**   | Função protegida que lê `SUPABASE_DB_URL` do runtime                                                   | Técnica já usada por exportadores públicos        | Deploy em produção pelo chat; risco de o projeto não aceitar funções novas; expõe uma credencial forte        | Aval do Lovable + o seu |
| **E. Replicação lógica**          | Com credencial de B, C ou D, o banco novo assina uma publicação do antigo                              | Janela de corte de 10 a 20 min, em vez de 50 a 70 | Mais complexa; precisa vigiar o slot                                                                          | B, C ou D               |

**Recomendação:** B primeiro (pergunta formal, seção 17). Em paralelo, preparar A (arquivar e truncar logs), que funciona mesmo se o suporte negar o resto. C ou D só com resposta por escrito do Lovable de que é permitido.

### 8.3 Receita de restore (ensaiada localmente com dados sintéticos)

Ordem, com o motivo de cada passo:

1. **Criar o projeto Pro em `sa-east-1`** (compute Small ou maior; hoje a produção equivale a Small) e habilitar `pg_cron`, `pg_net`, `pg_trgm` e `unaccent` pelo painel, **antes** do schema.
2. **Neutralizar o default ACL** do `public` e criar a role vazia `sandbox_exec` (seção 5.4).
3. **Restaurar o schema da baseline com privilégios**, sem publicações e sem `CREATE EXTENSION`.
4. **Conferir a matriz de permissões** contra a produção (consulta de diff de ACL e hash de `pg_get_functiondef`). Só seguir se der idêntico.
5. **Carregar os dados com `session_replication_role = replica`**, na ordem `auth` → `public` → `storage`, preservando os UUIDs de `auth.users`. Motivo: com os gatilhos ligados, `handle_new_user` aborta a carga, e os gatilhos de `leads` disparam HTTP para o n8n e o `smq-operacional`.
6. **Recriar à mão o gatilho `on_auth_user_created`** em `auth.users` (ele não vem num dump só do `public`).
7. **Rodar `setval` em todas as sequências** e a consulta de verificação (seção 6.2, A11).
8. **Antes de qualquer teste**, desligar ou neutralizar as saídas: `metric_webhook_settings.enabled = false`, URLs de `copiloto_config` e `distribuicao_settings` apontando para lugar nenhum.
9. **Recriar os 34 crons por script, todos desligados** (`cron.alter_job(active := false)`), com o cron de push já corrigido. Acrescentar a limpeza de `cron.job_run_details`, que hoje não existe.
10. **Recriar a publicação do Realtime** com as 17 tabelas.
11. **Storage:** criar os 5 buckets com as mesmas configurações e as 21 policies, e copiar os 1.570 arquivos pela API (mesmo bucket e caminho). Não carregar `storage.objects` pelo dump.
12. **Vault:** não migrar o `service_role_key` (está órfão; nenhuma função o usa). Criar só o segredo do push.
13. `SELECT metrics.refresh_all()` e o roteiro de verificação de aceite (seção 14.3).

### 8.4 Autenticação no projeto novo

| Item                     | O que configurar                                                                                                                                              | Por quê                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup                   | Desligado ("Allow new users to sign up" = off)                                                                                                                | O CRM é só por convite                                                                                                                               |
| Provider Email           | Ligado, com confirmação de e-mail                                                                                                                             | 43 usuários com senha                                                                                                                                |
| Provider Google          | OAuth client **seu** no Google Cloud (tipo Web, escopos `openid email profile`, sem verificação). Redirect: `https://<novo-ref>.supabase.co/auth/v1/callback` | Hoje o login Google passa por um client do Lovable. O `sub` do Google é estável, então as 56 identidades continuam casando (conferir em homologação) |
| SMTP                     | Provedor próprio (ex.: Resend) com domínio `seumetroquadrado.com.br` e SPF/DKIM/DMARC; limite de e-mail acima de 30/h                                         | Convites (`crm-convites`) e reset de senha. O SMTP padrão do Supabase não serve para produção                                                        |
| Templates                | Convite e reset em português                                                                                                                                  | Hoje estão no Lovable (não exportáveis)                                                                                                              |
| Site URL e Redirect URLs | Domínio final, `/auth?next=**`, `/reset-password`, `localhost` para desenvolvimento                                                                           | Senão o convite e o reset mandam para o lugar errado                                                                                                 |
| Chave de assinatura JWT  | ES256 (assimétrica)                                                                                                                                           | Necessária para o servidor MCP/OIDC. Confirmar se o projeto novo já nasce assim                                                                      |
| OAuth 2.1 Server         | Só se o MCP do repositório continuar                                                                                                                          | Uso atual: zero                                                                                                                                      |

**Usuários a decidir antes de migrar:** 6 sem identidade, 6 sem profile, 4 banidos e convites pendentes. Depois do corte, os convites pendentes são reenviados pelo app.

### 8.5 Storage

- `avatars` (46 arquivos, 30 MB), `documentacao` (1.524, 588 MB), `documentos-leads`, `projetos-plantas` (público) e `propostas-midia` (vazios).
- **39 avatares** estão gravados em `profiles.avatar_url` como URL assinada de 5 anos com o host antigo. Depois da cópia, regerar as URLs no projeto novo; melhor ainda, passar a guardar só o caminho e assinar na leitura.
- A cópia exige a service role dos dois projetos (a do antigo só existe no runtime do Lovable) ou uma rota temporária de exportação. É a mesma questão da seção 8.2.

### 8.6 Permissões (ACL): pontos a conferir na baseline

- Default ACL neutralizado antes do schema (seção 5.4).
- `sandbox_exec`: role vazia criada antes e apagada depois do corte.
- Grants de coluna de `api_token` e `webhook_token` presentes.
- Decidir se a paridade exata é o objetivo: a produção **já tem** 35 funções `SECURITY DEFINER` abertas ao anônimo e uma view com telefone. Copiar igual replica a exposição. Recomendação: copiar igual, conferir a paridade e, numa migration seguinte, fechar essas 35.

---

## 9. Código: cada acoplamento com o Lovable e o substituto

| Ponto                                                  | Onde                                                                                                         | O que faz                                                                                          | Substituto                                                                                                                                                                                                                              | Fase         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Login Google (`@lovable.dev/cloud-auth-js`)            | `src/integrations/lovable/index.ts`, chamado em `src/routes/auth.tsx:131`                                    | Manda para `/~oauth/initiate`, servido pela borda do Lovable, e repassa os tokens com `setSession` | Módulo novo (ex.: `src/lib/auth-google.ts`) com `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })`. Não editar o arquivo gerado: o Lovable o regrava                                                      | 1            |
| IA (`ai.gateway.lovable.dev`, `LOVABLE_API_KEY`)       | `src/lib/ai-gateway.server.ts` e 5 chamadores                                                                | Roteia para Claude ou Gemini pelo gateway do Lovable                                               | Provider direto atrás de `AI_PROVIDER` (seção 12)                                                                                                                                                                                       | 1            |
| Fallback do Supabase no build                          | `vite.config.ts:85-96`                                                                                       | URL, chave e ref do banco antigo como valor padrão, inclusive no servidor                          | Remover; o build falha se faltar variável                                                                                                                                                                                               | 1            |
| Wrapper de build (`@lovable.dev/vite-tanstack-config`) | `vite.config.ts:7`                                                                                           | Plugins, preset Nitro, alias `@`, dedupe do React, lightningcss                                    | Opcional: config Vite comum (esboço pronto na investigação). Detalhe: a proteção de importação `.server` hoje está **desligada na prática** por causa do padrão do wrapper; a config nova deve usar `['**/*.server.*', '**/server/**']` | 1 (opcional) |
| Servidor MCP (`@lovable.dev/mcp-js`)                   | `src/lib/mcp/*`, rotas geradas, `.lovable/mcp/manifest.json`                                                 | Já roda sobre o SDK oficial; manda telemetria para `api.lovable.dev`                               | Manter com `metrics: false` ou trocar por `@modelcontextprotocol/sdk` + `jose`. Tirar o plugin na ordem errada quebra o build (fazer tudo num PR só)                                                                                    | 1            |
| Arquivos gerados pelo Lovable                          | `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher,previewAuthStorage,types}.ts` | O Lovable os regrava a cada edição                                                                 | Criar módulos novos e trocar os imports; `types.ts` passa a vir de `supabase gen types` no CI                                                                                                                                           | 1            |
| Sessão de preview (`previewAuthStorage`)               | `src/integrations/supabase/previewAuthStorage.ts`                                                            | Fora dos domínios Lovable vira `localStorage` puro                                                 | Remover                                                                                                                                                                                                                                 | 1            |
| Captura de erro (`window.__lovableEvents`)             | `src/lib/lovable-error-reporting.ts`                                                                         | Fora do Lovable vira um no-op silencioso                                                           | Remover e ativar o Sentry (`VITE_SENTRY_DSN`/`SENTRY_DSN`, que já são suportados)                                                                                                                                                       | 1            |
| Imagens no CDN do Lovable (`/__l5e/assets-v1`)         | `src/assets/logo-m2.png.asset.json` (usado em `/manual`)                                                     | O arquivo só existe no R2 do Lovable                                                               | Baixar enquanto o Lovable está no ar e pôr em `public/`                                                                                                                                                                                 | 1            |
| `bun.lock` com registro npm privado do Lovable         | `bun.lock` (416 URLs `lovable-core-prod`), `bunfig.toml`                                                     | Install falha fora do Lovable se a ferramenta escolher bun                                         | Apagar e padronizar no npm                                                                                                                                                                                                              | 1            |
| URL pública fixa                                       | `src/lib/proposta-link.ts:208` (`CRM_URL_PUBLICA`)                                                           | Links de proposta enviados aos clientes                                                            | Variável de ambiente (`APP_BASE_URL`)                                                                                                                                                                                                   | 1            |
| IP do cliente por `cf-connecting-ip`                   | rotas públicas e `public-api-auth`                                                                           | Fora do Cloudflare esse cabeçalho pode ser falsificado                                             | Helper de IP por plataforma (`x-real-ip` na Vercel)                                                                                                                                                                                     | 1            |
| Guardas de preview do service worker                   | `src/lib/pwa/register-sw.ts:17-25`                                                                           | Só reconhecem domínios do Lovable                                                                  | Registrar só em produção (`VITE_VERCEL_ENV`)                                                                                                                                                                                            | 3            |
| Testes, lint e textos que citam o Lovable              | `tests/*`, `eslint.config.js`, telas da Academia e Mensagens                                                 | Travas do fluxo antigo                                                                             | Atualizar junto com cada mudança                                                                                                                                                                                                        | 1/4          |
| `.lovable/` e `AGENTS.md`                              | Raiz                                                                                                         | Planos, manifest do MCP, regra "no own Anthropic key"                                              | Mover planos para `docs/historico`, revisar o `AGENTS.md`, criar `CLAUDE.md`                                                                                                                                                            | 4            |

**Regra para a Fase 1:** enquanto o Lovable estiver ativo, **não editar os arquivos que ele regrava**. Criar módulos novos e trocar os imports. Os originais são apagados na Fase 4.

---

## 10. Integrações e URLs que mudam no dia do corte

O CRM tem **dois endereços** que mudam, e os dois estão espalhados fora do repositório:

1. **O host do app:** `seumetroquadrado-crm.lovable.app` e `project--862f238b-1c33-4bd3-aec6-6e4ffb74e9ba.lovable.app`.
2. **O host das edge functions:** `rldnprwjlomjmjvinxuh.supabase.co/functions/v1/*`. Esse muda com o projeto Supabase, com ou sem domínio próprio.

### 10.1 Entradas (quem chama o CRM)

| Entrada                                        | Quem chama                                                           | Volume                                     | Onde trocar no corte                                             |
| ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------- |
| `/api/public/*` (API pública)                  | n8n (credencial "n8n automation") e 3C Plus                          | ~57 mil chamadas/30 dias                   | Nós HTTP do n8n; painel do 3C Plus                               |
| `/api/public/webhooks/lead/$token`             | n8n (Marquinhos) e Zaps                                              | ~650 leads/30 dias                         | n8n, Zapier e `smq-operacional` (`contingencia_config.crm_base`) |
| `/api/sami/*` (canal da Sami)                  | n8n (Sami WhatsApp, workflow `fasjOpLA6QWbRfkU`)                     | Diário                                     | n8n                                                              |
| `/api/public/hooks/push-dispatch`              | Cron do próprio banco (job 7)                                        | A cada minuto (falhando)                   | `cron.job`                                                       |
| `/api/public/hooks/copiloto-handoff`           | Banco (`copiloto_config.handoff_url`)                                | Nunca concluiu um handoff                  | Banco                                                            |
| `/api/public/webhooks/whatsapp`                | Z-API/Meta                                                           | Sem uso recente                            | Painel Z-API/Meta                                                |
| `/api/google/oauth/callback`                   | Google (OAuth do Google Agenda)                                      | 9 conexões ativas                          | Google Cloud Console (acrescentar o redirect novo)               |
| `/mcp`                                         | Conector "Crm-MCPv2" do claude.ai (provável)                         | Residual                                   | Recriar o conector                                               |
| `/p/$token`, `/agendar/$slug`, vitrine pública | Clientes, pelos links enviados                                       | 2 propostas e 4 links de agendamento vivos | Build "lápide" com redirect no Lovable (seção 14.2)              |
| `functions/v1/notify-lead-transfer`            | Banco, via `pg_net` (`distribuicao_settings.sdr_aviso_corretor_url`) | Em uso (último em 22/10)                   | `UPDATE` pós-restore                                             |
| `functions/v1/tcplus-webhook`                  | Painel do 3C Plus (segundo a documentação)                           | 0 chamadas registradas                     | Painel do 3C Plus                                                |
| `functions/v1/sonax-webhook`                   | PABX Sonax                                                           | Morto desde 04/09                          | Aposentar                                                        |
| `functions/v1/lead-intake`                     | Zaps antigos                                                         | Nenhum lead desde 25/06                    | Confirmar e aposentar                                            |

### 10.2 Saídas (quem o CRM chama)

| Saída                                           | Credencial                                                            | Observação                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z-API (WhatsApp de aviso ao corretor)           | `ZAPI_*` no app e nas edge functions                                  | Confirmar qual instância está configurada. O n8n chama a 5690 de "aposentada após o soft-ban"; se for ela, o aviso de transferência **já falha hoje** |
| n8n (avisos de proposta, contexto, métricas)    | `SAMI_WRITE_KEY` e tokens                                             | Commit `e0f719f`: webhook de proposta para o n8n                                                                                                      |
| `smq-operacional` (REST e `pg_net` de métricas) | `SMQ_OPERACIONAL_SERVICE_KEY`, token fixo em `trg_lead_metric_emit`   | A chave é service role completa; trocar por chave restrita                                                                                            |
| Google Agenda                                   | `GOOGLE_CLIENT_ID/SECRET`                                             | Manter o **mesmo client_id**; se o secret não for recuperável, gerar outro no mesmo client (os tokens continuam valendo)                              |
| Anthropic (via gateway Lovable)                 | `LOVABLE_API_KEY`                                                     | Seção 12                                                                                                                                              |
| Web push                                        | `VAPID_PRIVATE_KEY` + chave pública fixa em `src/lib/push/vapid.ts:4` | Se a privada não for recuperável, trocar o par e refazer as 17 assinaturas                                                                            |
| Sentry                                          | `SENTRY_DSN`, `VITE_SENTRY_DSN`                                       | Confirmar se está configurado hoje                                                                                                                    |

### 10.3 Edge functions: migrar ou aposentar

| Função                                                                | Uso comprovado no banco                                                                | Proposta                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `notify-lead-transfer`                                                | Sim: 37 de 37 tokens consumidos, o último em 22/10                                     | **Migrar** (com `verify_jwt = false`)                       |
| `crm-convites`                                                        | Sim: 58 convites; é o único caminho que cria convites                                  | **Migrar**; depende de SMTP próprio                         |
| `tcplus-campanha`, `tcplus-discar`, `tcplus-webhook`                  | 0 chamadas registradas                                                                 | Migrar só se o discador 3C Plus for continuar               |
| `lead-intake`                                                         | Nenhum lead desde 25/06                                                                | Aposentar, se você confirmar que nenhum Zap aponta para ela |
| `sami-agendar-visita`, `sami-consultar-agenda`                        | Marcadas como obsoletas nos docs; o sub-workflow do n8n que as chama não tem execuções | Aposentar                                                   |
| `sami-anexar-documento`                                               | Nenhum objeto no bucket dela                                                           | Aposentar                                                   |
| `sonax-campanha`, `sonax-discar`, `sonax-tabulacoes`, `sonax-webhook` | Mortas desde 04/09                                                                     | Aposentar                                                   |

Resultado: de 13 funções, **2 obrigatórias e 3 condicionais**. Nenhuma importa nada do Lovable; o deploy é `supabase functions deploy` + `supabase secrets set`. Atenção: hoje não dá para ler o código que está publicado no Lovable (o painel não mostra), então o repositório passa a ser a fonte da verdade, e cada função precisa de teste funcional no projeto novo antes de virar os chamadores. Os docs citam uma `admin-reset-password` que pode estar publicada e não existe no repositório.

### 10.4 Programas fora do repositório que leem o banco do CRM

Encontrados pelo rastro de sessões no `auth`:

| Programa                                                                   | Onde roda                                         | Credencial                                                              | O que fazer no corte                                                                                                                                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `smq_crm_mcp` (conector "CRM MCP" do Claude e `smq-crm` do Claude Desktop) | Railway (`mcp-crm-smq-production.up.railway.app`) | Conta `docs-bot` (gestor) em Railway → Variables                        | Trocar `SUPABASE_URL`/chave nas variáveis do Railway e **não confiar no valor padrão do código**. Decidir: aposentar, corrigir os números errados ou portar as 8 tools para o MCP do repositório |
| `smq-docs-crm` (baixa documentação dos leads)                              | `launchd` no seu Mac                              | Mesma conta `docs-bot`, senha num `.env` sincronizado pelo Google Drive | Trocar URL e chave no `config.py`; rotacionar a senha                                                                                                                                            |

No banco novo, a conta `docs-bot` precisa chegar com o mesmo UUID, o mesmo hash de senha, a linha em `service_bots` e o papel de gestor. O `auth` migrado cuida disso, desde que a migração preserve os UUIDs.

### 10.5 Checklist de troca de endereços (dia do corte)

- [ ] n8n: todos os nós com `lovable.app` (pelo menos 11 workflows ativos) e o nó do `sami-agendar-visita`
- [ ] Zapier: Zaps que postam na roleta ou no `lead-intake`
- [ ] `smq-operacional`: `contingencia_config.crm_base` e o `TOKEN_CRM`
- [ ] 3C Plus: URL da integração e chave da API pública
- [ ] Z-API/Meta: webhook do WhatsApp
- [ ] Google Cloud: redirect URI do Google Agenda e do login Google
- [ ] Banco novo: `cron.job` 7, `copiloto_config.handoff_url`, `distribuicao_settings.sdr_aviso_corretor_url`, função `_notificar_handoff_novo_dono`, `profiles.avatar_url`
- [ ] Edge functions: `APP_BASE_URL` e `CRM_APP_URL`
- [ ] Supabase Auth: Site URL e Redirect URLs
- [ ] Railway (`smq_crm_mcp`) e Mac (`smq-docs-crm`)
- [ ] Conectores do claude.ai ("CRM MCP" e "Crm-MCPv2")
- [ ] Vercel: todas as variáveis de build e runtime (seção 11)

Com o domínio próprio ligado antes (seção 5.5), os itens que dependem do host do app saem desta lista e são feitos com calma na Fase 1.

---

## 11. Segredos e variáveis de ambiente

O app lê cerca de **47 variáveis** (39 no servidor em tempo de execução e 8 no build) e as edge functions leem 25 (3 delas o Supabase injeta sozinho). O `.env.example` documenta 42, deixa de fora **22 que o código lê** (ex.: `SAMI_WRITE_KEY`, as 4 do Google Agenda, `SMQ_OPERACIONAL_SERVICE_KEY`, `SMQ_WEBHOOK_SECRET`, `N8N_METRICS_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, as `SONAX_*`) e documenta uma que ninguém lê (`SUPABASE_PROJECT_ID`).

**Regra geral:** os valores guardados no Lovable não podem ser lidos de volta. Para cada segredo, a pergunta é "**onde mais esse valor existe?**". Se existir em outro lugar (painel do fornecedor, n8n, Zapier), recupera. Se não, gera um novo e troca nos dois lados no mesmo passo. Como as URLs mudam de qualquer jeito, rotacionar quase não custa mais.

| Variável                                                                         | Lado                  | Hoje vem de                                   | Destino                                        | Recuperável?                                                        |
| -------------------------------------------------------------------------------- | --------------------- | --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Build (cliente e SSR) | Lovable + fallback fixo no `vite.config.ts`   | Vercel (Production e Preview separados)        | Novos do projeto novo                                               |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`                                       | Servidor              | Lovable                                       | Vercel                                         | Novos                                                               |
| `SUPABASE_SERVICE_ROLE_KEY`                                                      | Servidor              | Injetada pelo Lovable; você nunca viu o valor | Vercel (só Production, marcada como Sensitive) | Nova (`sb_secret_…`)                                                |
| `LOVABLE_API_KEY`                                                                | Servidor              | Lovable                                       | Sai; entra `ANTHROPIC_API_KEY`                 | —                                                                   |
| `PUSH_DISPATCH_SECRET`                                                           | Servidor + Vault      | **Nunca configurada**                         | Vercel + Vault                                 | Gerar                                                               |
| `VAPID_PRIVATE_KEY`                                                              | Servidor              | Lovable                                       | Vercel                                         | Só se você tiver cópia; senão trocar o par                          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                       | Servidor              | Lovable                                       | Vercel                                         | ID sim; secret novo no mesmo client                                 |
| `GOOGLE_OAUTH_STATE_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `APP_ORIGIN`           | Servidor              | Lovable (ou derivado)                         | Vercel                                         | Gerar/definir                                                       |
| `SAMI_WRITE_KEY`                                                                 | Servidor + edge       | Lovable; o n8n também tem, mas mascarada      | Vercel + Supabase + n8n                        | Provavelmente rotacionar                                            |
| `READ_API_KEY`, `MCP_WRITE_API_KEY`, `PUBLIC_API_LEGACY_*`                       | Servidor              | Lovable                                       | **Não criar** (API legada desligada)           | —                                                                   |
| `TURNSTILE_SECRET_KEY`                                                           | Servidor              | Lovable                                       | Vercel                                         | Painel da Cloudflare                                                |
| `LANDING_HASH_SECRET`, `API_AUDIT_IP_SALT`                                       | Servidor              | Lovable                                       | Vercel                                         | Gerar (perde a correlação dos hashes antigos, sem efeito funcional) |
| `SMQ_WEBHOOK_SECRET`                                                             | Servidor + banco      | Provavelmente ausente                         | Vercel + `copiloto_config.handoff_secret`      | Gerar                                                               |
| `SMQ_OPERACIONAL_SERVICE_KEY`                                                    | Servidor              | Lovable                                       | Vercel                                         | Seu projeto Supabase (trocar por chave restrita)                    |
| `N8N_METRICS_TOKEN`, `N8N_COPILOTO_URL`                                          | Servidor              | Lovable                                       | Vercel                                         | n8n                                                                 |
| `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`                            | Servidor + edge       | Lovable                                       | Vercel + Supabase                              | Painel Z-API                                                        |
| `LEAD_INTAKE_SECRET`                                                             | Edge                  | Lovable                                       | Supabase (se a função continuar)               | Visível no editor do Zap                                            |
| `TCPLUS_API_TOKEN`, `TCPLUS_WEBHOOK_SECRET`                                      | Edge                  | Lovable                                       | Supabase (se continuar)                        | Painel 3C Plus / URL cadastrada                                     |
| `APP_BASE_URL`, `CRM_APP_URL`                                                    | Edge                  | Lovable                                       | Supabase                                       | Domínio novo                                                        |
| `SENTRY_DSN`, `VITE_SENTRY_DSN`                                                  | Servidor/build/edge   | Lovable (talvez vazio)                        | Vercel + Supabase                              | Painel do Sentry                                                    |
| `NODE_OPTIONS=--max-old-space-size=6144`, `NITRO_PRESET=vercel`                  | Build                 | —                                             | Vercel                                         | Definir                                                             |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, ref do projeto                  | CI                    | —                                             | GitHub Environment `production` com aprovação  | Gerar                                                               |

Ação da Fase 1: reescrever o `.env.example` em seções por destino (Vercel Build, Vercel Runtime, Supabase Function Secrets, Banco/Vault, GitHub) e criar um teste que compare os nomes lidos no código com os documentados.

---

## 12. IA: hoje e depois

### 12.1 Hoje

- Todas as 5 superfícies (Sami no painel e no WhatsApp, Sugerir mensagem, Resumo do lead, Match de empreendimentos e Leitura da carta de aprovação) passam por `src/lib/ai-gateway.server.ts` → `https://ai.gateway.lovable.dev/v1` com a `LOVABLE_API_KEY`.
- A governança fica no banco (`samiq_prompt_versions`, `samiq_politica`, `samiq_diretrizes`). Versão ativa: `samiq-2026-10-v8`, modelo `anthropic/claude-sonnet-5`, _thinking_ desligado e **sem prompt caching**.
- Até 23/10 a maior parte das execuções usava Gemini (`google/gemini-3-flash-preview`). Nos últimos 30 dias: 284 em Gemini e 103 em Claude. Desde a v8, tudo é Claude, mas o **fallback** (`FALLBACK_MODEL_ID` em `src/lib/samiq-governance.server.ts:21`) ainda é Gemini, e as versões v1 a v5 também.
- A leitura de carta de aprovação (PDF/imagem) **nunca rodou em Claude**.
- Volume: 996 execuções desde 15/07; ~R$ 0,34 por turno da Sami no WhatsApp.

### 12.2 Depois (pode ser feito já, ainda no Lovable)

**Desenho:**

1. Variável `AI_PROVIDER = lovable | anthropic` (padrão `lovable`) e `ANTHROPIC_API_KEY`.
2. Uma função única `getGovernedModel(modelId)`. No ramo `anthropic`, tira o prefixo `anthropic/` do id (a API direta rejeita o prefixo) e usa `createAnthropic({ apiKey })`. O pacote `@ai-sdk/anthropic` já está instalado.
3. **Manter o formato `provedor/modelo` no banco.** É a chave da telemetria e do roteamento. A tradução fica no código.
4. Rejeitar com erro claro um `google/...` quando não houver chave do Google.
5. Trocar o fallback para um Claude (ex.: `anthropic/claude-haiku-4-5` ou `anthropic/claude-sonnet-5`).

**Ordem segura:** publicar com `AI_PROVIDER=lovable` (nada muda), cadastrar a `ANTHROPIC_API_KEY` nos segredos do Lovable e virar para `anthropic`. Reverter é trocar a variável. Isso tira a IA do caminho crítico do corte.

**Ganhos possíveis, em passos separados:**

- **Prompt caching:** a Sami manda ~32,7 mil tokens de entrada por turno, quase todos repetidos (system + ferramentas). Com cache, a parte repetida fica bem mais barata. Medir com `cache_read_input_tokens` antes de prometer número.
- **Modelo por ação:** Haiku nas ações leves (resumo, mensagem, match) e Sonnet na Sami. Exige uma coluna nova na governança.
- **Trocar para `claude-sonnet-5-5`:** mesmo preço; atenção, `thinking: { type: "disabled" }` dá erro 400 no Sonnet 5.5 e no Opus 5.5. Fazer só depois que o provedor novo estiver estável.

**Cuidados:**

- Criar no Console da Anthropic um **workspace só do CRM**, com chave própria e **limite de gasto**, separado da chave do n8n e do painel-marketing. Hoje não há teto em reais configurado (as colunas `max_cost_*_mes` existem e estão vazias).
- Confirmar o _tier_ e os limites de requisição da organização Anthropic.
- Testar a leitura de carta de aprovação com 2 ou 3 documentos reais nos dois provedores antes de virar.
- LGPD: hoje o CRM já envia dados de clientes ao modelo via Lovable. Com a API direta, o contrato passa a ser seu com a Anthropic (avaliar DPA e retenção).

---

## 13. Hospedagem: Vercel ou Cloudflare

O build atual já gera um Worker do Cloudflare (preset padrão do wrapper do Lovable). A Vercel também funciona sem mudar código. A escolha muda o que precisa ser feito antes.

| Critério                           | Vercel Pro                                                                               | Cloudflare Workers (conta própria)                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Mudança de código para rodar       | Nenhuma (testado: função Node 22, streaming ligado, 2,97 MB)                             | Nenhuma (é o alvo atual)                                                            |
| Upload de 15 a 20 MB pelo servidor | **Quebra** (limite de 4,5 MB no corpo): exige upload assinado direto para o Storage (B8) | Funciona como hoje                                                                  |
| Duração de função                  | Sami desenhada para 82 a 90 s: configurar `maxDuration` de 120 a 300 s com Fluid compute | Limite de CPU, não de tempo de parede; chamadas de IA esperando rede não contam CPU |
| Região                             | `gru1` (São Paulo), junto do Supabase em `sa-east-1`                                     | Rede global, perto de qualquer região                                               |
| Preço base                         | US$ 20 por membro/mês; uso comercial **exige** Pro                                       | US$ 5/mês (Workers Paid)                                                            |
| Previews por PR                    | Nativo, com integração Git                                                               | Disponível, menos integrado                                                         |
| Web push (`node:https`, ECDH)      | Node completo                                                                            | Não testado no runtime do Workers (nunca rodou em produção)                         |
| Painel e observabilidade           | Mais amigável                                                                            | Mais técnico                                                                        |
| painel-marketing                   | Já desenhado para Vercel                                                                 | —                                                                                   |

**Recomendação:** a Vercel continua uma boa escolha, alinhada ao painel-marketing e ao seu pedido original, **desde que** o upload assinado (B8) entre na Fase 1. Se o objetivo for o corte com menos mudança possível, o Cloudflare Workers próprio tem paridade total com o build de hoje e custa menos. Tanto faz para o Supabase e a IA.

**Em qualquer caso:** cabeçalhos de segurança (CSP, HSTS) passam a ser responsabilidade do app (via `routeRules` do Nitro); o build precisa de 4 a 6 GB de heap; e o `bun.lock` com o registro privado do Lovable tem que sair.

---

## 14. O corte: janela, congelamento, rollback e LGPD

### 14.1 Janela

- **Quando:** madrugada de **sábado para domingo, entre 00:05 e 06:59 (horário de Brasília)**. Motivos: o SLA de 15 minutos só roda das 08:00 às 19:59; as roletas exigem check-in no dia; desde 21/10 não houve nenhuma redistribuição entre 0h e 8h; e em 30 dias entraram só 6 leads pelo webhook entre 3h e 6h (contra 137 às 9h), com zero uploads entre 1h e 6h.
- **Duração estimada:** 50 a 70 minutos com pg_dump, se os dois logs grandes (que só recebem inserção) forem copiados **antes** e só o delta for copiado dentro da janela. Copiando tudo dentro da janela: 1h30 a 2h30. Com replicação lógica (opção E): 10 a 20 minutos. Estimativa feita com ensaio local sintético; o ensaio real no projeto Pro vai dar o número certo.
- **Pré-requisito:** o retry do n8n e o 503 do CRM (seção 4.6). Sem isso, o lead que chegar na janela some.
- **Cuidado com os motores:** a mesma função do cron 5 distribui leads novos **e** roda o SLA e os leads parados, então não dá para ligar uma coisa sem a outra. O contador do front (`transfer-sla-badge`) dispara o repasse por SLA sem olhar o horário. Por isso a janela de madrugada importa.

### 14.2 Congelar o banco antigo (anti _split brain_)

Depois do _snapshot_, o banco antigo **não pode mais aceitar escrita**. Senão, um lead entra no antigo, outro no novo, e os dois corretores recebem o mesmo cliente. O que **não** funciona:

- `ALTER DATABASE … default_transaction_read_only`: não afeta as conexões já abertas do PostgREST (a mais antiga tem 59 dias), e o PostgREST abre as transações de escrita com `READ WRITE` explícito.
- `REVOKE`: deixa passar 551 funções `SECURITY DEFINER` e 137 funções com `EXECUTE` para `PUBLIC`.

O que funciona (a ensaiar em staging), tudo com a role `postgres` que o Lovable expõe:

1. **Gatilhos de congelamento por statement** (`FOR EACH STATEMENT`, `ENABLE ALWAYS`) em todas as tabelas do `public`, em `storage.objects` e nas tabelas de sessão do `auth`, recusando qualquer escrita.
2. **Desligar os 34 crons** com `cron.alter_job(active := false)`.
3. **Bloquear refresh e login** nas sessões do `auth` e depois remover as sessões.
4. **Publicar no Lovable uma build "lápide"**: todas as rotas redirecionam (308) para o domínio novo, e as rotas de API respondem 503. **Não despublicar**, porque há links enviados a clientes.

Cuidado com o _split brain_ reverso: as configurações copiadas no dump (`handoff_url`, `sdr_aviso_corretor_url`, cron 7) apontam para a infraestrutura antiga e fariam o **banco novo** chamar o **app antigo**. Elas são trocadas no roteiro de `UPDATE` pós-restore.

Se algo for gravado no banco antigo por engano depois do congelamento, a fusão usa o `xmin` das linhas comparado com o identificador de transação capturado no instante do corte (`created_at`/`updated_at` não bastam: 33 tabelas recebem `UPDATE` sem coluna de data). A fusão é só para tabelas primárias, com dedupe por telefone e preservando o dono.

### 14.3 Critério de aceite (go/no-go)

Antes de abrir a escrita e de virar os webhooks:

- [ ] Contagens iguais por tabela (núcleo) e por bucket (arquivos e bytes)
- [ ] Usuários: 87 em `auth.users`, identidades, 81 profiles, 72 papéis, 57 ativas e 24 bloqueadas iguais
- [ ] Matriz de permissões idêntica à produção (seção 8.6)
- [ ] Hash de `pg_get_functiondef` igual para as funções críticas (`_distribuir_lead_v3`, `handle_new_user`, `has_role`, `conta_atual_ativa`)
- [ ] Sequências com `last_value` maior ou igual ao maior id
- [ ] Login com senha, login com Google, convite e reset testados com contas reais
- [ ] Um lead de teste entra pelo webhook, é distribuído e o corretor recebe o aviso (`net._http_response` com 200)
- [ ] Upload e download de documento
- [ ] Sami responde no painel
- [ ] Bundle do app sem `rldnprwjlomjmjvinxuh`

### 14.4 Rollback

- **Ponto sem volta:** a primeira escrita aceita no banco novo. Um dia útil gera ~35 mil alterações de linha, então reconciliação manual é inviável.
- **Caminho de volta que não depende do Lovable:** a role `postgres` do banco antigo é membro de `pg_create_subscription`, é dona das tabelas, e todos os gatilhos estão no modo que **não dispara** na aplicação da réplica. Então o **banco antigo pode assinar uma publicação do banco novo** e ficar como reserva quente durante a validação, com perda praticamente zero se for preciso voltar. Exige: banco antigo congelado (seção 14.2), espelhar ali qualquer DDL e vigiar o slot de replicação.
- **Três marcos:** (1) restore validado e sem escrita: voltar é só desligar o novo; (2) escrita aberta com a réplica reversa ativa: voltar é inverter o DNS e os webhooks; (3) réplica desligada: não há mais volta automática.

### 14.5 LGPD

- O dump tem dados pessoais de ~225 mil clientes. Ele trafega e fica guardado **só** em lugares controlados (o projeto Pro e um bucket privado com criptografia), nunca em notebook ou Drive pessoal.
- Registrar quem manuseou o dump e quando foi descartado.
- Depois do corte e do período de reserva, pedir ao Lovable a exclusão do projeto e guardar a confirmação.
- Os arquivos frios dos logs (seção 8.1) seguem a mesma regra e têm prazo de retenção definido.

---

## 15. Custos

Preços de tabela pesquisados em outubro de 2026. **Confirme nas páginas oficiais antes de contratar.** Os números do Lovable só você consegue ver.

| Item              | Hoje (Lovable)                                              | Depois                                                                                                              | Observação                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plataforma        | Plano Business do workspace + créditos de Cloud e IA        | —                                                                                                                   | Extrair em Workspace settings → Plans & credit usage → Usage details (últimos 90 dias) e o custo da instância em Manage instance. Manter o auto top-up ligado até o corte: sem crédito, o backend **pausa** |
| Banco             | Incluso no Lovable Cloud                                    | Supabase Pro: US$ 25/mês (inclui US$ 10 de compute) + compute Small (~US$ 15) + disco acima de 8 GB (~US$ 0,125/GB) | Com a retenção da seção 8.1, o banco cabe nos 8 GB. Atenção: o _spend cap_ do Pro bloqueia crescimento de disco; com 20 GB, desligar o cap ou reduzir antes                                                 |
| PITR (opcional)   | Não disponível para você                                    | ~US$ 100/mês (7 dias)                                                                                               | Recomendado depois de estabilizar                                                                                                                                                                           |
| Hospedagem        | Inclusa                                                     | Vercel Pro US$ 20 por membro/mês, ou Cloudflare Workers US$ 5/mês                                                   | Seção 13                                                                                                                                                                                                    |
| IA                | Créditos do gateway (o Lovable repassa o custo do provedor) | Anthropic API direta: custo de tokens praticamente igual; prompt caching reduz                                      | ~R$ 0,34 por turno da Sami no WhatsApp hoje                                                                                                                                                                 |
| SMTP              | Incluso                                                     | Resend (camada gratuita cobre o volume de convites)                                                                 |                                                                                                                                                                                                             |
| `smq-operacional` | Free                                                        | Vai junto para o Pro da organização                                                                                 | Ganha backup                                                                                                                                                                                                |

Estimativa do novo mundo, sem IA: **~US$ 45 a 65/mês** (Supabase Pro + Small + Vercel Pro com 1 membro), ou **~US$ 30 a 50** com Cloudflare. Some PITR se quiser. Compare com o que aparece no painel do Lovable.

---

## 16. Decisões que só você pode tomar

Em ordem de urgência:

1. **Retenção dos logs:** existe obrigação de guardar o histórico de distribuição, auditoria e alertas? Por quanto tempo? Arquivar fora do banco atende? (Define o tamanho do banco e se o export oficial serve.)
2. **Organização Supabase:** subir a organização atual para Pro (o `smq-operacional` vai junto) ou criar uma organização nova?
3. **Domínio do CRM:** qual (ex.: `crm.seumetroquadrado.com.br`)? Quem administra o DNS de `seumetroquadrado.com.br`?
4. **Hospedagem:** Vercel Pro (pede upload assinado antes) ou Cloudflare Workers próprio?
5. **Push:** o push deve existir? Pode descartar as 102 mil notificações antigas?
6. **Congelar o chat do Lovable:** aceita parar de pedir mudanças pelo chat do Lovable a partir do dump de baseline (ou só aceitá-las em branch revisada)? E o que fazer com o PR #291 (roletas simples, já em produção) e os outros 9 PRs abertos?
7. **Permissão do gestor:** em produção o gestor pode gerenciar a fila, os projetos e os templates; o repositório diz que só o admin pode. Qual é o certo?
8. **Migrations 0100 e 0103:** os eventos do 3C Plus e o bloqueio de telefone de corretor devem existir? Hoje não estão em produção.
9. **Edge functions e telefonia:** o discador 3C Plus está em uso ou planejado? O Sonax pode ser aposentado? Algum Zap ainda chama o `lead-intake`?
10. **IA:** padronizar tudo em Claude (inclusive o fallback) ou manter o Gemini como segunda opção? Qual teto mensal de gasto?
11. **MCP:** manter o MCP do repositório, consolidar nele as 8 ferramentas do "CRM MCP" do Railway ou aposentar os dois?
12. **Usuários:** apagar antes os 6 usuários sem identidade, os 6 sem profile e os 4 banidos?
13. **Janela e comunicação:** aceita um único login forçado de toda a equipe numa madrugada de sábado para domingo?
14. **Repositório público:** é intencional? Com deploy automático, ele passa a ter segredos de produção no GitHub Actions.

---

## 17. Perguntas para o suporte do Lovable (texto pronto)

Envie pelo suporte do Lovable, citando o projeto **862f238b-1c33-4bd3-aec6-6e4ffb74e9ba** (Seu Metro Quadrado).

> Hello Lovable team,
>
> We are planning to move our project 862f238b-1c33-4bd3-aec6-6e4ffb74e9ba ("Seu Metro Quadrado", Lovable Cloud) to a Supabase project in our own organization. We would like to do this in the supported way. Could you please help with the following?
>
> 1. **Database export:** our database is about 20 GB, above the documented 15 GB limit of "Export project data". Can you provide a full `pg_dump` (including the `auth` and `storage` schemas, with roles and privileges), or raise the export limit for this project?
> 2. **Direct access:** is it possible to get a temporary Postgres connection string (direct or pooler) for this project, so we can run `pg_dump` and set up logical replication for a short migration window? If not, are we allowed to create a temporary read-only login role ourselves with the `postgres` role exposed to us?
> 3. **Edge functions:** does the edge function runtime of this project expose `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and is it allowed to use them for a one-time data export?
> 4. **Storage:** what is the supported way to export the ~618 MB of files in our storage buckets?
> 5. **Region:** in which AWS region is the database of this project hosted?
> 6. **Auth configuration:** can you share the current Auth settings (Site URL, redirect URLs, signup setting, SMTP sender, email templates, JWT signing algorithm, OAuth server settings)? Is the Google login using a Lovable-owned OAuth client? Can we switch to our own Google OAuth client (BYOK) before the migration?
> 7. **Emails:** which SMTP service sends our invite and password-reset emails today?
> 8. **Published functions:** which edge functions are currently deployed for this project, and in which version?
> 9. **Transition period:** after the migration, can we keep the project published only as a redirect (HTTP 308) to our new domain for about 30 to 60 days? Can we connect our own custom domain to the current deployment now?
> 10. **AI Gateway:** does the `LOVABLE_API_KEY` work for calls made outside Lovable hosting while the workspace is active?
> 11. **Data deletion:** after the migration, what is the process to delete the project and all its data, and can we get a written confirmation?
>
> Thank you!

---

## 18. Plano revisado das fases 1 a 4

### Fase 0 (agora): decidir e proteger

- Suporte do Lovable (seção 17) e as decisões da seção 16.
- Supabase Pro, projeto novo em `sa-east-1`, **primeiro dump do CRM fora do Lovable**.
- Ensaio de restore no projeto novo com a receita da seção 8.3 (com saídas neutralizadas).
- Inventário de segredos com a origem de cada valor.
- **Pronto quando:** existe um backup restaurável fora do Lovable, o caminho de extração está escolhido e as decisões 1 a 6 estão tomadas.

### Fase 1: desacoplar o código (produção continua no Lovable)

Cada item num PR separado, testado no preview do Lovable, sem editar os arquivos que o Lovable regrava:

1. Domínio próprio ligado no Lovable; `CRM_URL_PUBLICA` e demais URLs vindas de variável; migrar n8n, Zapier, Z-API e `smq-operacional` para o domínio novo.
2. IA atrás de `AI_PROVIDER`, virar para `anthropic` ainda no Lovable.
3. Login Google próprio (OAuth client seu + BYOK no Lovable, depois `signInWithOAuth`).
4. Retry/503 no handoff de leads (CRM e n8n).
5. Upload assinado direto para o Storage (se for Vercel).
6. Remover os fallbacks do `vite.config.ts`; apagar `bun.lock`; trocar `cf-connecting-ip`.
7. Corrigir o push (se continuar) e limpar a fila.
8. Retenção dos logs e correção da gravação repetida de `distribuicao_log_contexto`.
9. Baseline: `pg_dump --schema-only` da produção vira `supabase/migrations/<ts>_baseline.sql`; trilha única de migrations; `CLAUDE.md` com o processo novo; `main` verde e protegida.

- **Pronto quando:** produção roda no Lovable sem usar o gateway de IA nem o broker de login do Lovable, com o domínio próprio, e o repositório tem a baseline idêntica à produção.

### Fase 2: banco (Supabase próprio)

- Ensaio completo em staging (restore + aceite da seção 14.3) pelo menos uma vez.
- Configurar o Auth do projeto novo (seção 8.4), SMTP, Storage e as 2 a 5 edge functions.
- No corte: congelar o antigo (seção 14.2), copiar o delta, rodar o roteiro de `UPDATE` de URLs, ligar os crons, aceite, abrir a escrita, réplica reversa ativa.
- Repontar Railway, Mac, conectores e terceiros.
- **Pronto quando:** o aceite passa, os leads fluem e o banco antigo está congelado com a réplica reversa.

### Fase 3: hospedagem

- Projeto na Vercel (ou Cloudflare) com as variáveis por ambiente, `maxDuration`, região `gru1`, cabeçalhos de segurança e deploy só depois do `db push` no CI.
- Virar o DNS do domínio próprio.
- **Recomendação:** fazer as Fases 2 e 3 **na mesma janela**, para todos fazerem login uma vez só.
- **Pronto quando:** o domínio próprio serve a Vercel, sem nenhum tráfego indo para `*.lovable.app` além da build lápide.

### Fase 4: desligar o Lovable

- Manter a build lápide por 30 a 60 dias (validade dos links enviados).
- Desconectar o GitHub do Lovable (corta o push do bot), apagar `.lovable/`, `src/integrations/lovable/`, `@lovable.dev/*`, textos e exceções de lint.
- Desligar a réplica reversa, pedir a exclusão do projeto e guardar a confirmação.
- **Pronto quando:** nenhum componente depende do Lovable e os dados lá foram excluídos.

---

## 19. Apêndices

### 19.1 Os 34 cron jobs de produção

| Job                            | Agenda (UTC)   | Comando                                                                                               |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------- |
| academia-motor-diario          | `45 5 * * *`   | `academia_rodar_motor()`                                                                              |
| alertar-agendamentos-proximos  | `*/5 * * * *`  | `gerar_alertas_agendamentos_proximos()`                                                               |
| alertar-leads-parados          | `0 11 * * *`   | `gerar_alertas_leads_parados()`                                                                       |
| alertar-roletas-vazias         | `*/15 * * * *` | `alertar_roletas_sem_apto()`                                                                          |
| alertar-sem-atendimento        | `*/10 * * * *` | `alertar_leads_sem_atendimento()`                                                                     |
| alertar-tarefas-atrasadas      | `0 * * * *`    | `gerar_alertas_tarefas_atrasadas()`                                                                   |
| alertar-volume-desproporcional | `0 21 * * *`   | `alertar_volume_desproporcional()`                                                                    |
| cadencia-auditoria             | `0 10 * * *`   | `cadencia_auditoria()`                                                                                |
| cadencia-avancar               | `23 * * * *`   | `cadencia_avancar()`                                                                                  |
| cadencia-encerrar              | `7 * * * *`    | `cadencia_encerrar()`                                                                                 |
| cadencia-vencidos              | `0 11 * * *`   | `cadencia_vencidos()`                                                                                 |
| distribuicao-automatica-5min   | `*/5 * * * *`  | `processar_distribuicao_automatica()`                                                                 |
| distribuir-estoque-filiais     | `*/10 * * * *` | `distribuir_estoque_filiais(30)` (**não está na `main`**)                                             |
| em-atendimento-processar       | `41 * * * *`   | `em_atendimento_processar()`                                                                          |
| expirar-lixeira                | `0 3 * * 0`    | `expirar_lixeira_antiga()`                                                                            |
| followup-devolver-vencidos     | `15 12 * * *`  | `devolver_leads_followup_vencido()`                                                                   |
| higiene-processar-diaria       | `0 4 * * *`    | `higiene_processar()`                                                                                 |
| lembretes-visita               | `*/5 * * * *`  | `gerar_pushes_lembretes_visita()`                                                                     |
| mcp-aplicar-guardas            | `17 4 * * *`   | `mcp_aplicar_guardas()` (roda DDL toda noite)                                                         |
| metrics-refresh                | `*/15 * * * *` | `metrics.refresh_all()`                                                                               |
| posse-expirada-diaria          | `0 12 * * *`   | `devolver_leads_posse_expirada()`                                                                     |
| proposta-avisos-varrer         | `*/5 * * * *`  | `proposta_avisos_varrer()`                                                                            |
| push-dispatch-every-minute     | `* * * * *`    | Gera pushes e chama `project--862f…lovable.app/api/public/hooks/push-dispatch` (**falhando com 500**) |
| recalc-temperatura             | `*/10 * * * *` | `recalcular_temperatura_leads()`                                                                      |
| recalc-tiers-roletas-weekly    | `0 11 * * 1`   | `recalcular_tiers_todas('cron')`                                                                      |
| recalcular-velocidade-contato  | `7 * * * *`    | `recalcular_velocidade_contato()`                                                                     |
| regua-devolucao-diaria         | `0 5 * * *`    | `regua_devolucao_processar()`                                                                         |
| resetar-presenca-diaria        | `0 3 * * *`    | `resetar_presenca_diaria()`                                                                           |
| roleta-sdr-apuracao-semanal    | `0 11 * * 6`   | `roleta_sdr_apurar_semana()`                                                                          |
| roleta-sdr-aviso-meio-semana   | `0 21 * * 3`   | `roleta_sdr_aviso_meio_semana()`                                                                      |
| samiq-briefing-diario          | `0 11 * * 1-6` | `samiq_gerar_briefing_alertas()`                                                                      |
| samiq-limpar-conversas         | `15 3 * * *`   | `DELETE FROM samiq_conversas WHERE expira_em < now()`                                                 |
| sdr-alimentar-perdidos         | `0 11 * * *`   | `alimentar_base_sdr_perdidos()`                                                                       |
| sdr-devolver-parados           | `30 12 * * *`  | `devolver_leads_sdr_parados()`                                                                        |

Crons que existem nas migrations do repositório mas **não** em produção: `distribuicao-auto` (a cada minuto), `conceder-conquistas`, `consolidar-presenca`, `auto-checkout-presenca` e `limpar-api-rate-limits`. Um replay das migrations os criaria.

### 19.2 Buckets

| Bucket             | Público | Limite por arquivo | Arquivos | Tamanho |
| ------------------ | ------- | ------------------ | -------- | ------- |
| `avatars`          | Não     | —                  | 46       | 30 MB   |
| `documentacao`     | Não     | 15 MB              | 1.524    | 588 MB  |
| `documentos-leads` | Não     | —                  | 0        | 0       |
| `projetos-plantas` | **Sim** | —                  | 0        | 0       |
| `propostas-midia`  | Não     | 10 MB              | 0        | 0       |

### 19.3 Material de apoio

Os resultados brutos de cada frente (evidências com arquivo e linha, consultas SQL e inventários completos) ficaram registrados na sessão de investigação e podem ser reabertos sob demanda. As afirmações deste relatório que **não** foram verificadas estão marcadas como tal no texto.
