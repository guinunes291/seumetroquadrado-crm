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

| Etapa | O que foi feito | Agentes |
|---|---|---|
| Investigar | 11 frentes: acoplamento com o Lovable, hospedagem/runtime, plataforma do banco, edge functions, segredos, integrações externas, autenticação, IA, servidor MCP, CI/processo e pesquisa de fornecedores | 11 |
| Drift | As 269 migrations do repositório que **não** estão registradas no banco foram divididas em 17 lotes. Cada lote foi conferido objeto por objeto contra o banco vivo, e o que deu "faltando" foi re-checado por um segundo agente cético | 24 |
| Verificar | Cada achado classificado como **bloqueador** ou **alto** passou por dois verificadores independentes, um testando a evidência e outro testando se o impacto é real | 168 |
| Completude | Um crítico procurou o que ninguém tinha olhado (janela de corte, rollback, ACL, sequências, LGPD...) e cada lacuna virou uma investigação nova | 9 |

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

| Item | Quantidade | Observação |
|---|---|---|
| Linhas em `src/` | ~204 mil | TanStack Start + Nitro, React, Tailwind, shadcn |
| Telas autenticadas | 66 rotas em `src/routes/_authenticated` | |
| Migrations em `supabase/migrations` | 467 | 198 geradas pelo Lovable, 269 escritas por Claude/Codex |
| Migrations em `drizzle/migrations` | 117 no journal, 109 aplicadas | É o canal que o Lovable de fato aplica em produção (seção 7) |
| Edge functions | 13 (4.732 linhas em Deno) | Só 2 com uso comprovado (seção 10.3) |
| Commits feitos pelo bot do Lovable | 182 de 219 visíveis | O bot reescreve arquivos gerados e faz push direto na `main` |

### 3.2 Banco de produção (Lovable Cloud, ref `rldnprwjlomjmjvinxuh`)

| Item | Valor |
|---|---|
| Postgres | 17.6 |
| Tamanho total | 20 GB |
| Dados de negócio (sem os 3 logs) | ~1,7 GB |
| Tabelas / funções / triggers / policies (schema `public`) | 178 / 680 / 670 / 289 |
| Cron jobs ativos | 34 |
| Extensões | pg_cron, pg_net, pg_stat_statements, pg_trgm, pgcrypto, supabase_vault, unaccent, uuid-ossp (todas existem no Supabase próprio, nas mesmas versões) |
| Usuários (`auth.users`) | 87: 43 com senha, 56 identidades Google, 35 que só entram com Google |
| Sessões abertas | ~776 |
| Storage | 5 buckets, 1.570 arquivos, 618 MB (`documentacao` tem 588 MB) |
| Realtime | 17 tabelas publicadas |
| Leads | ~231 mil |

As maiores tabelas:

| Tabela | Tamanho | Linhas | O que é |
|---|---|---|---|
| `distribuicao_log_contexto` | 12 GB | 3,5 mi | Foto completa de cada tentativa de distribuição |
| `audit_log` | 5 GB | 1,58 mi | Auditoria de alterações |
| `distribution_log` | 1 GB | 3,5 mi | Log de distribuição |
| `leads` | 485 MB | 231 mil | |
| `alertas` | 478 MB | 1,5 mi | |
| `clientes` | 197 MB | 225 mil | |

### 3.3 Tráfego e uso

- O n8n faz cerca de **57 mil chamadas autenticadas em 30 dias** à API pública do CRM (`/api/public/*`).
- Cerca de **650 leads por mês** entram pelo webhook de lead (`/api/public/webhooks/lead/$token`), quase todos vindos do n8n (Marquinhos).
- IA: **996 execuções** desde 15/07. A versão ativa da Sami (`samiq-2026-10-v8`) usa `anthropic/claude-sonnet-5` desde 23/10. O custo médio de um turno da Sami no WhatsApp é de **cerca de R$ 0,34** (32,7 mil tokens de entrada em média).

### 3.4 O que você já tem fora do Lovable

| Conta | O que tem | Situação |
|---|---|---|
| Supabase (org `guinunes291's Org`) | `smq-operacional` (sa-east-1, ativo) e "Documentação CRM" (inativo) | **Plano Free.** Não comporta o CRM: o limite é de 500 MB e não há backup |
| Vercel (time "Seu Metro Quadrado") | Nenhum projeto | Plano a confirmar. Uso comercial exige **Pro** |
| Railway | Servidor `smq_crm_mcp` (o conector "CRM MCP" do Claude) | Lê o banco do Lovable com a conta `docs-bot` (seção 10.4) |
| Mac do dono | Daemon `smq-docs-crm` (baixa documentos dos leads) | Também usa a conta `docs-bot` |

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

| Problema | Evidência | Ação |
|---|---|---|
| A `main` está vermelha | Orçamento de escapes de tipo em 146/145, estourado por `_snapshot: snapshot as never` em `src/lib/proposta-link.functions.ts` (commit `219eee96` do Lovable) | Corrigir 1 linha ou subir o teto. Os outros jobs passam |
| A ferramenta `list_minhas_tarefas` do MCP do repositório está quebrada | Consulta colunas que não existem | Corrigir para `data_vencimento`/`data_conclusao` |
| O "CRM MCP" devolve números errados | Para 01 a 25/10 respondeu 0 vendas e 0 agendamentos; o banco tem 10 vendas e 119 agendamentos | Os próprios docs (`docs/academia/fatia0-fechamento.md`) já mandam não confiar nele. Decidir se aposenta ou porta para o repositório |
| 35 funções `SECURITY DEFINER` abertas ao usuário anônimo e uma view com telefone | Achado da frente de ACL | Revisar antes do corte, para não copiar a exposição |
| `fila_equipe_v1()` executável por `anon` | A migration manda revogar e a revogação não está em produção | Aplicar o `REVOKE` |
| Índice único anti-duplicata de telefone nunca foi criado | `uq_leads_projeto_telefone_ativo` não existe por causa de 73 grupos de duplicatas | Limpar as duplicatas e criar o índice |
| `api_rate_limits` não existe em produção | A migration `20260719124000_rate_limit_distribuido.sql` nunca foi aplicada | O rate limit da API pública é só em memória. Decidir se aplica |
| O repositório no GitHub é público | Configuração do repositório | Decidir se torna privado antes de pôr segredos de deploy no Actions |
