# PROMPT · Módulo "Academia SMQ" no CRM

> Cole isto inteiro no Claude Code, aberto no repositório do CRM. É autocontido.
> Irmão do `PROMPT-CLAUDE-CODE-higiene-funil.md` e do `PROMPT-CLAUDE-CODE-roletas.md`.
> Pasta de apoio (leia antes de tudo): `/Users/guilhermenunes/Documents/SMQ-Operacao/Academia-CRM/`

---

Você vai construir o módulo **Academia SMQ** dentro do CRM da Seu Metro Quadrado: trilha de
treinamento dos corretores (fases, módulos, aulas, quiz, prática avaliada, níveis), painel do
gestor, e a ligação com a operação (recomendar o módulo certo a partir dos números do corretor).

O CRM **está no ar e fazendo dinheiro**. A Academia é um módulo novo ao lado dele. A regra que
manda em tudo: **o que já funciona não pode parar, e nada existente é alterado sem eu aprovar.**

## Arquivos que já existem na pasta de apoio

| Arquivo                                         | O que é                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ESPEC-ACADEMIA-SMQ.md`                         | A especificação de produto. **Leia inteira.** Ela explica o porquê de cada regra   |
| `01-migration-academia.sql`                     | Tabelas, views, RLS e RPCs, tudo prefixado `academia_`. Testado em Postgres 16     |
| `02-seed-academia.sql`                          | Carga inicial: 6 fases, 26 módulos, 181 aulas, 136 questões, 8 regras. Idempotente |
| `99-rollback-academia.sql`                      | Remove só objetos `academia_*`                                                     |
| `03a-stub-supabase.sql` + `03b-teste-fluxo.sql` | Teste local do fluxo completo (NUNCA rode o stub no banco real)                    |
| `modulos.json`                                  | Os 24 módulos extraídos do Notion, com `notion_page_id`                            |
| `gen_seed.py`                                   | Gera o seed a partir do JSON                                                       |

A migration foi escrita **sem ver o seu schema**. Ela assume três coisas que você precisa
confirmar na Fatia 0 e adaptar: `public.profiles(id)` com coluna `nome`; uma função de papel
`public.has_role(uuid, <tipo>)` com os papéis `admin`, `gestor`, `superintendente`; e
`auth.uid()` do Supabase. Os pontos a adaptar estão marcados com `ADAPTE`.

---

## 0. Antes de escrever uma linha de código

### 0.1 Descubra o terreno, não presuma

Mapeie e me diga o que encontrou:

- Qual repositório é este e a stack real. Espero React + Vite + TS, Tailwind, shadcn/ui,
  react-router, `@supabase/supabase-js` e React Query. **Adapte o código ao que existir.**
- Se você alcança o banco do CRM (Supabase `rldnprwjlomjmjvinxuh`). Se **não**, diga isso
  explicitamente: todo diagnóstico vira SQL para eu rodar no console e você só escreve código
  depois do resultado.
- Como o app resolve papel hoje: tabela, enum, função, guard de rota. Onde ficam as rotas de
  gestor/admin, o layout, o menu lateral, o padrão de tabela e de formulário da casa.
- Como migrations são aplicadas neste projeto (pasta `supabase/migrations`? painel?).
- O schema real do que a Fatia 5 vai ler: `leads` (dono, datas, status), onde mora o **histórico
  de status** do lead, `agendamentos` ou equivalente, `documentacoes`, `tarefas`/follow-up,
  `motivo_perda`. Liste tabela, colunas e volume.
- Se já existe qualquer coisa de treinamento no CRM (tabela, rota, componente). Se existir, pare
  e me mostre antes de criar paralelo.
- Se o repo tem testes e como rodá-los.

### 0.2 As regras de medição da casa (não são opcionais)

Nasceram de erros medidos nesta operação:

1. **Medir antes de mexer.** Número ANTES e número DEPOIS.
2. **Controle positivo antes de afirmar ausência.** Consulta que volta zero só vira achado depois
   de você provar que ela acharia algo se existisse. Caso real e atual: o MCP do CRM devolve
   **0 agendamentos e 0 vendas para ago-set/2026** com 2.532 leads novos no período. Isso é
   instrumento quebrado. Não use esse caminho como fonte de indicador.
3. **Três leituras da MESMA camada não são três provas.** Ausência se confirma por caminho
   independente.
4. **Estado de lead se lê em "passou por"** (`bool_or(...)` no histórico), nunca no último
   rótulo, porque o rótulo anda. Ler pelo último valor já subcontou um gargalo em ~5x.
5. **Timestamps idênticos ao microssegundo = escrita em lote** (importação), não comportamento.
   Separe antes de calcular taxa.
6. **Trocar falha ruidosa por falha silenciosa é PIORA.**
7. **Tempo se exibe em hh:mm**, nunca em minutos soltos (convenção do CRM).

### 0.3 O que você NÃO vai tocar

- `distribuir_lead_ponderado`, `atribuir_lead_a_corretor`, roletas, SLA de 15 minutos, motor de
  SLA (`sla_*`), `transicionar_lead`, guardas `mcp_g*`, `alertas`, intake-guard, webhooks.
- O gate da roleta. A Academia **mostra** o selo Apto, mas **não bloqueia** distribuição nesta
  entrega. A `academia_config` recusa `gate_roleta_modo = 'ativo'` de propósito.
- Qualquer coisa de WhatsApp, n8n, Z-API ou Cloud API. A Academia não manda mensagem para
  ninguém. Notificação é só dentro do CRM.

Se achar que algo disso é necessário, **me diga, não faça.**

---

## 1. O produto em 10 linhas (detalhe na ESPEC)

- **Níveis:** Iniciante → **Apto** (Fase 0, onboarding de 5 dias, módulo O01) → Intermediário
  (Fases 1 e 2) → Especialista (Fase 3) → Mestre (Fases 4 e 5 + validação humana).
- **Módulo concluído** = aulas publicadas marcadas + quiz ≥ nota mínima (80%) + prática aprovada
  pelo gestor quando `exige_pratica` (9 dos 26 módulos).
- **Nível nunca cai sozinho.** Módulo novo em fase já concluída vira atribuição com prazo.
- **Apto manual** pelo gestor, com motivo obrigatório (veteranos).
- **Gabarito nunca chega ao navegador antes do envio.** O corretor não tem SELECT em
  `academia_questoes`; recebe questões por `academia_quiz_iniciar` e o gabarito comentado só
  no retorno de `academia_quiz_enviar`.
- **Corretor escreve só via RPC**, lê só o que é dele e só conteúdo `publicado`.
- **Conteúdo nasce em rascunho** com `revisao_pendente`. `academia_publicar_modulo` recusa
  publicar enquanto a nota existir. Quem limpa a nota é o admin, na tela de Conteúdo.
- **Recomendação por indicador** compara o corretor com a **mediana do time** na mesma janela,
  com amostra mínima. Modo `sombra` por padrão: só o gestor vê; nada é atribuído sem um humano
  clicar.
- **Corretor não vê progresso de colega.**

---

## 2. Fatias (pare para eu aprovar entre uma e outra)

### Fatia 0 · Diagnóstico (só leitura)

O item 0.1 completo. Termine com: (a) a lista exata de adaptações que a migration precisa
(nomes de coluna, função de papel, tipo do enum de papel); (b) o SQL que você usaria para cada
indicador da Fatia 5 com **o número atual e o controle positivo** que prova que ele enxerga;
(c) a lista dos perfis que parecem corretor de verdade e dos que parecem bot, admin ou teste
(ex.: `docs-bot`, e-mail `.local`, "Seu Metro Quadrado"). **Eu confirmo quem entra na Academia.
Você não infere.**

### Fatia 1 · Camada de dados

1. Rode `03a` + `01` + `02` + `03b` num Postgres local ou branch do Supabase e mostre a saída:
   cada linha "deve FALHAR" tem que mostrar ERROR com a mensagem da regra.
2. Adapte a `01` ao schema real (Fatia 0) e transforme em migration do projeto. Uma migration
   para o schema, outra para o seed. Nada de DDL solto.
3. Gere os tipos TS do Supabase.
4. **Testes de RLS obrigatórios**, com dois usuários reais de teste (um corretor, um gestor):
   - corretor lê 0 linhas de `academia_questoes`, `academia_regras_recomendacao`,
     `academia_indicadores`, `academia_config`;
   - corretor lê só os próprios `academia_participantes`, `academia_tentativas`, `academia_praticas`;
   - corretor não consegue `insert`/`update` direto em nenhuma tabela `academia_*`;
   - corretor não enxerga módulo em `rascunho`, nem recomendação em `sombra`;
   - gestor lê tudo.
5. Não insira participantes em massa. Crie a tela/ação para eu escolher (Fatia 3) ou me entregue
   o `insert` com a lista para eu aprovar.

Aceite: seed roda 2x sem erro nem duplicata; testes de RLS passam; o app continua subindo igual.

### Fatia 2 · Telas do corretor

Rotas sob `/academia` (adapte ao padrão de rotas do app). Tudo mobile first: o corretor estuda no
celular entre um atendimento e outro.

- `/academia` **Minha trilha**: nível atual e progresso até o próximo; "Continue de onde parou"
  (último módulo com atividade e não concluído); **atribuições abertas no topo**, com prazo e
  motivo; as 6 fases em acordeão com o estado de cada módulo (não iniciado, em andamento, quiz
  pendente, prática pendente, concluído, atrasado); próximo encontro presencial.
- `/academia/modulo/:codigo`: objetivo, objetivos de aprendizagem, lista de aulas com check,
  prática, botão do quiz. **Quiz desabilitado com o motivo visível** até concluir as aulas.
- `/academia/modulo/:codigo/aula/:ordem`: markdown renderizado (use o renderer que o app já
  tiver; se não tiver, `react-markdown` + `remark-gfm`, sem HTML cru). Aula `slides`: embed do
  Gamma quando a URL permitir, senão botão "Abrir slides". Aula `video`: player pelo
  `url_video` (hoje vazio). Botões "Concluí esta aula" e "Próxima".
- `/academia/modulo/:codigo/quiz`: uma questão por tela, contador de tempo discreto,
  confirmação antes de enviar, tela de resultado com a correção comentada. Trate as mensagens de
  erro das RPCs (intervalo, limite diário, tempo esgotado) como texto amigável, não toast de erro.
- Prática: instrução, campo de texto e link, status e feedback do gestor.
- `/academia/progresso`: certificados por nível (código de verificação) e histórico.
- **Card "Sua próxima aula"** na home atual do corretor. É a única mudança fora da rota
  `/academia`, então faça atrás de feature flag.

Aceite: um corretor de teste consegue ir de Iniciante a Apto sozinho no celular, exceto a
correção da prática, sem nenhum erro no console.

### Fatia 3 · Painel do gestor

Rotas sob a área de gestão (ex.: `/admin/academia`), guard `admin`/`gestor`/`superintendente`.
Mesmo princípio da Higiene do Funil: **abre no que precisa de ação.**

- **Agora**: práticas pendentes (mais antigas primeiro, com o tempo de espera em hh:mm ou dias),
  atribuições vencidas, corretores sem atividade na trilha há 7+ dias.
- **Correção de prática**: rubrica do módulo em checklist (`pratica_rubrica`), status
  aprovada/refazer, **feedback obrigatório** (a RPC recusa vazio). Botão "Registrar roleplay
  presencial" que abre a mesma rubrica para um corretor escolhido (`academia_registrar_roleplay`).
- **Time**: matriz corretor x fase (percentual por fase), nível, selo Apto (distinguir "Apto por
  trilha" de "Apto por decisão"), atrasados, última atividade. Clique abre a ficha do corretor
  na Academia, com ações: atribuir módulo com prazo, definir Apto manual (motivo obrigatório),
  promover a Mestre.
- **Participantes**: incluir/remover da Academia, definir `inicio_trilha`.
- **Conteúdo** (só admin): lista de módulos com status, versão, `revisao_pendente` em destaque e
  `revisar_em` vencido em vermelho; editor de aulas (markdown com preview) e questões
  (alternativas + correta + explicação); botões "Marcar como revisado" (limpa a nota) e
  "Publicar" (chama a RPC e mostra o erro dela).
- **Selo Apto** também na ficha do corretor e na lista de participantes da roleta, **só leitura**.

Aceite: gestor corrige uma prática e o corretor vê o nível mudar sem recarregar a página
(invalidate de query).

### Fatia 4 · Importador do Notion (texto integral das aulas)

Hoje as aulas dos M01 a M24 têm só o **resumo** de cada seção. Escreva
`scripts/academia-importar-notion.ts`:

- lê `NOTION_TOKEN` do ambiente (eu crio a integração e compartilho o banco "Módulos da Academia
  SMQ"); nunca comite o token;
- para cada módulo com `notion_page_id`, baixa os blocos da página, quebra por heading (cada
  heading de nível 2 = uma aula, na ordem), converte para markdown limpo (listas, tabelas,
  negrito, callout vira citação `>`), remove links internos do Notion;
- casa cada seção com a aula existente pelo **título normalizado**; seção nova vira aula nova no
  fim; aula existente sem seção correspondente **não é apagada**, é listada no relatório;
- **só atualiza módulos em `rascunho`**. Módulo publicado não é tocado sem `--forcar`;
- `--dry-run` por padrão: imprime o diff por módulo (aulas criadas, atualizadas, órfãs,
  caracteres antes e depois). Só grava com `--aplicar`.

Aceite: dry-run nos 24 módulos sem erro, com relatório; nenhum módulo publicado alterado.

### Fatia 5 · Indicadores e recomendações (modo sombra)

1. `academia_calcular_indicadores(_data_ref date default current_date)`: para cada participante
   ativo e cada indicador das regras ativas, calcula valor, amostra e a **mediana do time**
   (`percentile_cont(0.5)`, só corretores com amostra ≥ mínima) e grava em
   `academia_indicadores` (upsert pela PK). Use as definições da tabela abaixo, com o SQL que você
   validou na Fatia 0.
2. `academia_gerar_recomendacoes(_data_ref date)`: para cada regra ativa, se o corretor tem
   amostra ≥ `amostra_minima` e está pior que `limiar_relativo` x mediana (na direção da regra),
   cria `academia_recomendacoes` com status = `'sombra'` se o modo for sombra, `'aberta'` se
   ativo. Não duplica (índice único parcial já existe). Pula quem já concluiu o módulo nos
   últimos 30 dias. Expira recomendação não decidida após `recomendacao_validade_dias`.
3. Agende as duas com `pg_cron` às 04:45 (depois do motor de SLA das 04:30), **só se `pg_cron`
   já estiver habilitado**. Se não estiver, me diga o que precisa.
4. Tela **Recomendações** no painel do gestor: fila com corretor, indicador, valor dele, valor do
   time, amostra, janela, módulo sugerido, botões Atribuir (prazo padrão 7 dias) e Descartar
   (motivo obrigatório). Em modo sombra, a tela mostra uma faixa "MODO SOMBRA · o corretor não
   vê nada disso".
5. Aba **Efeito**: para módulos concluídos via recomendação, indicador antes (janela que
   disparou) x depois (mesma janela contada da conclusão), com n. Com n < 5, a tela diz "indício,
   não prova".

| Indicador                     | Definição (adapte ao schema)                                                                                                     | Direção      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `tempo_primeiro_contato`      | mediana, em minutos (exibir hh:mm), entre atribuição do lead ao corretor e a 1a interação registrada dele                        | maior é pior |
| `taxa_agendamento`            | leads atribuídos na janela que **passaram por** `agendado` / leads atribuídos na janela                                          | menor é pior |
| `taxa_comparecimento`         | passaram por `visita_realizada` / passaram por `agendado`                                                                        | menor é pior |
| `taxa_visita_para_avanco`     | passaram por `proposta_enviada` ou `analise_credito` / passaram por `visita_realizada`                                           | menor é pior |
| `pct_carteira_parada`         | leads ativos da carteira sem interação há 7+ dias / carteira ativa (mesma régua da Higiene do Funil; exclua lotes de importação) | maior é pior |
| `pct_sem_proximo_passo`       | leads ativos sem tarefa ou follow-up futuro / carteira ativa                                                                     | maior é pior |
| `taxa_pasta_devolvida`        | pastas com devolução ou pendência / pastas enviadas                                                                              | maior é pior |
| `taxa_perda_por_qualificacao` | perdidos com motivo de perfil/renda depois de passar por `qualificado` / perdidos                                                | maior é pior |

Se um indicador não tiver dado confiável (ex.: `motivo_perda` vazio), **desative a regra** e me
diga. Indicador calculado sobre dado quebrado é pior do que indicador nenhum.

Aceite: 7 dias de execução em sombra com relatório diário: quantas recomendações por regra, e 5
exemplos com os números para eu julgar se fazem sentido. Eu decido quando virar `ativo`.

### Fatia 6 · Encontros, presença, certificados

- Aba **Encontros**: calendário (semana e lista), criar encontro por tipo, módulo ligado,
  facilitador, presença em 1 clique por corretor, campo "ação registrada".
- Corretor vê os próximos encontros na home da Academia.
- Certificado por nível: página imprimível (CSS de impressão, não gere PDF no servidor) com nome,
  nível, data e código de verificação.

### Fatia 7 · Gate da roleta em sombra (só leitura)

Uma view `v_academia_gate_sombra`: leads atribuídos nos últimos 30 dias a corretores **não
aptos**, por corretor, com contagem e percentual. Um card no painel da Academia com esse
número. **Não toque em nenhuma função de distribuição.** Ligar o bloqueio terá prompt próprio.

---

## 3. Como me entregar

- **Migrations reversíveis**, uma por assunto. O rollback base já existe (`99-rollback`); cada
  migration nova sua traz o próprio rollback.
- **Feature flag** para o menu Academia e para o card na home, desligáveis sem deploy.
- Para cada fatia: o que mediu, o que mudou, como provar que funcionou (passo a passo que eu
  consigo repetir), o que falta.
- Se algo depender de mim (token do Notion, aprovar lista de participantes, publicar módulo,
  habilitar extensão), diga **exatamente** o que é, onde, e o que acontece enquanto não for feito.
- Textos de interface em português do Brasil, tom direto, **sem travessão (—)**. Use vírgula,
  dois-pontos ou ponto.

## 4. Fora de escopo

Gate ativo na roleta · qualquer mensagem externa (WhatsApp, e-mail) · upload de vídeo ·
integração com Copa SMQ ou remuneração · edição do Notion · agentes do n8n. Se achar que um deles
é necessário, **me diga, não faça.**

## 5. Primeira resposta que eu quero de você

Não escreva código ainda. Responda com:

1. o mapa do terreno (0.1), incluindo se você alcança o banco do CRM;
2. as adaptações que a `01-migration-academia.sql` precisa, linha por linha;
3. para cada indicador da Fatia 5: a tabela/coluna de origem, o número atual e o controle positivo;
4. a lista de perfis separada em "parece corretor" e "parece outra coisa";
5. riscos que você enxergou e eu não;
6. as perguntas cujas respostas só eu tenho.
