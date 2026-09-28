# Academia SMQ · Fatia 1 · Camada de dados (28/09/2026)

Schema, seed, RLS e testes do módulo Academia. Aplicado e testado só no harness local. Nada foi para produção: as migrations
entram em produção pelo Lovable quando `drizzle/` chega ao `main`, e esta branch
não vai para o `main` nesta fatia.

As decisões do dono estão em [`fatia0-respostas.md`](fatia0-respostas.md) (seção
"Fatia 1 · decisões"). O diagnóstico que redefiniu as regras está em
[`fatia0-fechamento.md`](fatia0-fechamento.md).

## 1. O que mudou

| Arquivo                                                    | O que é                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/20261002120000_academia_fundacao.sql` | Tipos, 17 tabelas, 3 views, 17 funções, RLS, grants, flags         |
| `supabase/migrations/20261002120100_academia_seed.sql`     | 6 fases, 26 módulos, 181 aulas, 136 questões, 8 regras             |
| `drizzle/migrations/0016_academia_fundacao.sql`            | Espelho byte a byte da migration de fundação                       |
| `drizzle/migrations/0017_academia_seed.sql`                | Espelho byte a byte do seed                                        |
| `drizzle/migrations/meta/_journal.json`                    | Entradas idx 16 e 17                                               |
| `drizzle/migrations/meta/0016_snapshot.json` e `0017_`     | Snapshots encadeados depois da 0015 do Lovable (tiers de comissão) |
| `docs/academia/fatia1-rollback.sql`                        | Rollback com a ordem corrigida                                     |
| `tests/db/academia.test.ts`                                | Testes de RLS, RPC e fluxo contra o banco real                     |
| `src/integrations/supabase/academia-pendente.ts`           | Fronteira tipada enquanto `types.ts` não é regenerado              |

Nenhum arquivo fora dessa lista foi tocado. Nada de `pg_cron` nesta fatia: o
motor de indicadores é da Fatia 5.

### O que a fundação corrige em relação à `01-migration-academia.sql`

As 12 adaptações da seção 7 do fechamento, todas aplicadas:

1. **Sem transação própria.** A 01 abria `begin;` e fechava `commit;`. Nenhuma
   migration da casa faz isso — o runner já abre a transação. A migration
   termina em `NOTIFY pgrst, 'reload schema';`.
2. **Escopo de equipe.** `academia_eh_gestor` (que tratava gestor como global)
   saiu. Entraram `academia_eh_admin()` e
   `academia_pode_gerir(_pessoa)` = "não sou eu" + `pode_acessar_corretor`.
3. **Sem `FOR ALL`.** O laço que dava escrita total a gestor em 17 tabelas foi
   removido. Tabelas pessoais só têm policy de SELECT; escrita é por RPC.
4. **Gabarito fechado.** `academia_questoes` só é lida por admin — gestor pode
   ser aluno e leria a resposta do próprio quiz.
5. **Ninguém age sobre si mesmo.** Avaliar prática, override de nível, promover,
   atribuir e decidir recomendação passam por `academia_pode_gerir`, que recusa
   o próprio `auth.uid()`.
6. **Conta bloqueada não estuda.** Toda RPC de aluno começa por
   `is_active_member(auth.uid())` e exige participação ativa.
7. **Buracos das RPCs fechados.** Prática exige participante, módulo publicado e
   `exige_pratica`; avaliação exige `FOUND` e status `pendente`; a atribuição só
   fecha quando o módulo inteiro fecha (`v_academia_modulo_status.concluido`),
   não só com a prática; feedback é obrigatório.
8. **Origem não vem do cliente.** `academia_atribuir` grava sempre
   `origem = 'gestor'`. Quem aceita origem é `academia_atribuir_interno`, sem
   `EXECUTE` para `authenticated`.
9. **Publicar é só admin**, e a nota de `revisao_pendente` continua bloqueando.
10. **Inscrição explícita.** `academia_definir_participacao` (só admin) recusa
    bot de serviço, identidade MCP ativa e conta não ativa. A participação nunca
    é inferida do papel — é o que permite o dono dizer "gestor pode ser aluno,
    mas o Sheldon não é".
11. **Permissões.** `REVOKE ... FROM PUBLIC, anon` e `GRANT` explícito logo após
    cada objeto; `search_path = pg_catalog, public` em todas as funções;
    `academia_recalcular_nivel` revogada até de `authenticated`.
12. **Fuso.** Toda data derivada usa `AT TIME ZONE 'America/Sao_Paulo'`: uma
    tentativa às 22:30 de Brasília caía no dia seguinte.

Mais três, fora da lista de 12:

- **Índice de recomendação viva** cobre só `sombra` e `aberta`. Com `atribuida`
  dentro (como estava), a regra nunca mais recomendava o mesmo módulo para a
  mesma pessoa. Quando a atribuição de origem recomendação fecha, a recomendação
  vira `concluida` (`academia_concluir_atribuicoes`).
- **FKs que faltavam**: `academia_atribuicoes.recomendacao_id` →
  `academia_recomendacoes` `ON DELETE SET NULL`, e `academia_config.atualizado_por`
  → `auth.users` `ON DELETE SET NULL`.
- **CHECK nomeado** `academia_config_gate_roleta_modo_chk`, para a migration que
  um dia ligar o gate poder removê-lo sem adivinhar nome gerado. `'ativo'`
  continua recusado.

### As regras do seed, com os números da Fatia 0

| Regra | O que mudou                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------- |
| R01   | Minutos **úteis** (`public._minutos_uteis_entre`, 08:00–19:00 BRT), só lead novo, janela 90 dias, sem contato = pior tempo |
| R04   | "Avançou" = análise de crédito **ou** pasta montada. `proposta_enviada` é legado e não conta                               |
| R05   | Régua da Carteira Ativa: 7 dias no topo, 30 no fundo                                                                       |
| R07   | Nasce `ativa = false`: não existe registro de devolução de pasta                                                           |
| R08   | Motivos `credito_renda`, `estourou_teto`, `sem_perfil`, `credito_score`; avançar = passou por agendado                     |

R02, R03 e R06 ficaram como estavam — o fechamento só mandou redefinir R01, R04,
R05 e R08.

## 2. O que eu medi

| Checagem               | Antes                                          | Depois                                         |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `npm run test:db`      | **720 de 721** — só `cadencia-painel` falhando | **761 de 762** — só `cadencia-painel` falhando |
| `npm run typecheck`    | limpo                                          | limpo                                          |
| `npm run lint:ci`      | limpo                                          | limpo                                          |
| `npm test`             | 2023 de 2023, 196 arquivos                     | 2023 de 2023, 196 arquivos                     |
| `npm run format:check` | vermelho em 8 arquivos                         | vermelho nos **mesmos** 8 arquivos             |

O baseline saiu com as mudanças da Fatia 1 guardadas (`git stash -u`), no mesmo
banco. A diferença é exatamente os **41 testes novos** de `tests/db/academia.test.ts`:
720 + 41 = 761. Nenhum teste que passava antes passou a falhar.

As duas migrations aplicaram **sem erro na primeira execução**, e o seed carregou
o que o fechamento previa: 6 fases, 26 módulos, 181 aulas, 136 questões, 8 regras.

### Sobre o ambiente da prova

A máquina não tem Docker, Homebrew nem Postgres, e o instalador do Homebrew
precisa de `sudo` — que não estava disponível. O harness subiu assim:

- **servidor:** PostgreSQL **16.14 de verdade**, binários do pacote npm
  `@embedded-postgres/darwin-arm64@16.14.0-beta.17`, descompactados fora do repo
  e rodando na porta 54329. As extensões fake `pg_cron`/`pg_net` foram
  instaladas pelo `install-fake-extensions.sh` da casa, passando o diretório de
  extensões como argumento (no lugar de `pg_config --sharedir`).
- **cliente:** essas distribuições não trazem `psql`. Como `apply.sh` e
  `reset.sh` usam `psql` de forma bem contida (`-q -X -v ON_ERROR_STOP=1`,
  `-f`, `-c`, `-tAc`, `-1`), entrou no `PATH` um substituto de ~60 linhas em
  Node sobre o pacote `pg`, **fora do repo**. Os scripts do harness rodaram sem
  nenhuma alteração.

O que isso quer dizer na prática: **o SQL foi executado por um Postgres 16 real**
— as 401 migrations do repo mais as 2 novas, a RLS, as RPCs e os 41 testes. O
que não foi exercitado é o `psql` oficial como cliente. Se alguma migration
dependesse de meta-comando de psql (`\echo`, `\copy`, `\set`), o substituto
teria quebrado; nenhuma depende. Ainda assim, **vale repetir com o psql de
verdade** quando houver Postgres instalado — os comandos estão na seção 4.

## 3. O que a execução achou (e eu consertei)

Duas coisas, nenhuma delas visível na revisão estática:

1. **O rollback falhava na ordem dos DROPs.** `academia_atribuicoes.recomendacao_id`
   tem FK para `academia_recomendacoes`, e eu derrubava a segunda antes da
   primeira: `cannot drop table academia_recomendacoes because other objects
depend on it`. Como o arquivo roda dentro de `BEGIN ... COMMIT`, nada ficou
   pela metade — a transação reverteu inteira. Com `academia_atribuicoes` movida
   para antes, o rollback devolve **0 objetos, 0 funções, 0 tipos, 0 flags**, e a
   reaplicação do zero volta ao estado completo.
   Era exatamente o mesmo tipo de defeito que o `99-rollback-academia.sql`
   original tinha, uma camada mais fundo.

2. **Dois testes meus afirmavam a coisa errada.** Eu esperava erro `42501` num
   `UPDATE` de não-admin em `academia_config` e `academia_questoes`. Não é o que
   acontece, e não é o que deve acontecer: `authenticated` TEM o `GRANT` de
   escrita (o admin precisa dele) e quem barra é a policy — a cláusula `USING`
   não enxerga linha nenhuma e o comando afeta **0 linhas**, em silêncio. Seguro
   do mesmo jeito, mas por outro mecanismo. O teste passou a provar a
   propriedade real: `rowCount = 0` e o valor intacto antes e depois. A barreira
   tem duas formas e agora o arquivo diz isso em voz alta — tabela pessoal morre
   no privilégio (`42501`), conteúdo e config morrem na policy (0 linhas).

Nenhuma linha das duas migrations precisou mudar.

## 4. Como repetir a prova

Com Postgres instalado na máquina (caminho oficial do
`scripts/db-harness/README.md`):

```bash
brew install postgresql@16                       # precisa de sudo, rode no Terminal
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

bash scripts/db-harness/install-fake-extensions.sh
initdb -D /tmp/pgharness/pgdata -U postgres --auth=trust
pg_ctl -D /tmp/pgharness/pgdata -o "-p 54329 -c fsync=off" start

# baseline: 720 de 721
git stash push -u -m baseline && npm run db:apply && npm run test:db ; git stash pop

# com a Fatia 1: 761 de 762
npm run db:reset && npm run test:db
npm run lint:ci && npm run typecheck && npm test

# rollback: 0 | 0 | 0 | 0, depois reaplica
psql "postgresql://postgres:postgres@localhost:54329/postgres" -X -f docs/academia/fatia1-rollback.sql
psql "postgresql://postgres:postgres@localhost:54329/postgres" -X -tAc "
  SELECT (SELECT count(*) FROM pg_class WHERE relname LIKE 'academia%' OR relname LIKE 'v_academia%')
       ||' | '||(SELECT count(*) FROM pg_proc WHERE proname LIKE 'academia%')
       ||' | '||(SELECT count(*) FROM pg_type WHERE typname LIKE 'academia%')
       ||' | '||(SELECT count(*) FROM public.app_flags WHERE chave LIKE 'academia%')"
npm run db:reset
```

Só os testes da Academia, que rodam em ~2 s:

```bash
npx vitest run --config vitest.db.config.ts tests/db/academia.test.ts   # 41 de 41
```

## 5. Rollback

1. **Desligue as flags primeiro** (a tela some antes do schema):
   ```sql
   UPDATE public.app_flags SET ativo = false, atualizado_em = now()
    WHERE chave IN ('academia_menu','academia_card_inicio');
   ```
2. Rode `docs/academia/fatia1-rollback.sql`. Ele apaga as flags, as views, as
   tabelas (as policies vão junto), as funções e os tipos — nessa ordem. O
   `99-rollback-academia.sql` original falhava por derrubar as funções antes das
   tabelas cujas policies dependiam delas.
3. **Apaga progresso, notas, práticas e certificados.** Se já houver uso real,
   exporte antes — os `\copy` estão no cabeçalho do arquivo.

## 6. O que falta e o que depende de você

- **Repetir a prova com o `psql` oficial.** O servidor foi um Postgres 16 real, mas
  o cliente foi um substituto (seção 2). É a única parte do harness que não rodou
  igual ao CI.
- **`npm run format:check` já estava vermelho nesta branch**, em 8 arquivos que
  eu não posso tocar (`src/components/ui/card.tsx`, `src/features/inicio/inicio-page.tsx`,
  `src/features/leads/dossie/historico-responsaveis-card.tsx`,
  `src/features/manual/conteudo-gestao.tsx`, `src/features/manual/conteudo-operacao.tsx`,
  `src/lib/tarefas.ts`, `src/routes/_authenticated/leads.index.tsx`,
  `src/routes/_authenticated/meu-perfil.tsx`). Um `npx prettier --write` neles
  resolve, mas é tarefa separada — como o `cadencia-painel`.
- **`janela_dias` da R05 = 30**, minha decisão, não sua: a régua é 7 no topo e 30
  no fundo, e a janela precisa cobrir o maior dos dois prazos. Quem medir escolhe
  o corte por degrau. Se preferir outro número, é uma linha no seed.
- **Quem entra na Academia.** Nenhum participante é criado pelas migrations: a
  participação é sempre explícita, via `academia_definir_participacao`. Falta sua
  lista. O Sheldon Barbosa fica de fora por decisão sua, e a função suporta a
  exceção sem gambiarra.
- **O quiz ainda vira decoreba.** Cerca de 5 questões por módulo, sorteio de até
  10, gabarito devolvido no envio. A segunda tentativa é memória. O intervalo e o
  limite diário só atrasam. Resolver de verdade é mais questão por módulo — nesta
  fatia ficou só o freio.
- **Apagar um perfil apaga a trilha** (`ON DELETE CASCADE`), inclusive
  certificados. Mantive o comportamento da 01; se um certificado precisa
  sobreviver à saída da pessoa, isso é decisão sua e migration nova.
