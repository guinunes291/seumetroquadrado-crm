# ESPEC · Academia SMQ dentro do CRM

> Versão 1 · 28/09/2026 · dono: Guilherme
> Arquivos irmãos nesta pasta: `PROMPT-CLAUDE-CODE-academia.md` (o que colar no Claude Code), `01-migration-academia.sql`, `02-seed-academia.sql`, `99-rollback-academia.sql`, `03a/03b` (teste local), `modulos.json` (os 24 módulos extraídos do Notion).

---

## 0. Em 1 minuto

A Academia deixa de ser um banco no Notion que ninguém abre e vira um **módulo do CRM**, no mesmo lugar onde o corretor trabalha o lead. Ela tem três camadas:

1. **Trilha**: 6 fases, 26 módulos, aulas, quiz e prática avaliada. O corretor evolui de nível: Iniciante, Apto, Intermediário, Especialista, Mestre SMQ.
2. **Gestão**: o gestor enxerga o time inteiro numa matriz (quem está em qual fase, quem está atrasado, que prática espera correção) e registra roleplay da reunião da manhã em 30 segundos.
3. **Ligação com a operação**: o CRM olha os números de cada corretor (tempo de primeiro contato, taxa de agendamento, comparecimento, carteira parada) e **recomenda o módulo certo** para quem está abaixo do time. Depois mede se o número melhorou.

O **selo Apto** aparece na ficha do corretor desde a v1, mas **não bloqueia a roleta** agora. O bloqueio é fase 2, depois de haver conteúdo publicado e dado real (decisão de 28/09).

---

## 1. Por que agora

O diagnóstico é seu, de setembro: cada corretor aborda, agenda, faz follow-up e vende do jeito que acha que dá certo. Já existe muito material bom, mas ele está espalhado e desconectado do trabalho:

| Onde está                               | O que tem                                                            | Problema                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Notion, banco "Módulos da Academia SMQ" | 24 módulos com objetivos, seções, prática e slides Gamma             | Todos com status "Não iniciado" desde abril. Cada módulo tem 2 páginas (duplicata). Ninguém mede quem estudou |
| Obsidian, `06 - Treinamentos`           | Onboarding de 5 dias, calendário de treinos, biblioteca de roleplays | Checklist no papel. Não há registro de quem treinou                                                           |
| Deck "Não sou conduzido. Eu conduzo."   | O método oficial de ligação (6 perguntas)                            | Não está na Academia. O M15 do Notion ensina outro método (5 momentos)                                        |
| Playbook Método Marquinhos              | As 10 regras de WhatsApp que convertem em produção                   | Idem                                                                                                          |
| CRM                                     | Os números de cada corretor                                          | Não conversam com o treinamento                                                                               |

A Academia no CRM resolve o elo que falta: **o treino passa a ser medido e a ser disparado pelo número**.

---

## 2. Decisões tomadas (28/09) e o porquê de cada uma

| Decisão                                                   | Por quê                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Escopo completo, ligado à operação**                    | Uma biblioteca de aulas sozinha é o Notion de novo, só que dentro do CRM. O que muda comportamento é a recomendação pelo número e a prática corrigida por alguém                                                                                     |
| **Selo Apto visível já; bloqueio da roleta só na fase 2** | Hoje não há nenhum módulo publicado. Travar a roleta agora deixaria corretor sem lead por falta de aula, não por falta de preparo. A config do banco **não aceita** `gate_roleta_modo = 'ativo'`: ligar exige migration nova, revisada, de propósito |
| **Sem vídeo por enquanto**                                | Aula é texto + slides Gamma + prática. O campo `url_video` já existe: quando gravar, é só colar o link. Nada precisa mudar no código                                                                                                                 |
| **Desenvolvimento via Claude Code, não Lovable**          | O prompt segue o padrão dos seus prompts de Higiene do Funil e Roletas: passo 0 de diagnóstico, fatias, rollback escrito                                                                                                                             |

### Decisões de desenho que eu tomei e você deve validar

**D1. Criei a Fase 0 "Onboarding: pronto para atender" e é ela que dá o selo Apto.**
O currículo do Notion coloca Ligação (M15) nos dias 60 a 85 e WhatsApp (M14) nos dias 55 a 80. Mas o corretor novo recebe lead na primeira semana. Se "Apto" dependesse da Fase 1 inteira (mentalidade, mercado, MCMV), ele seria "apto" sem nunca ter visto o método de ligação. Então o selo Apto vem de um módulo curto, O01, com o que o corretor precisa para não queimar lead: método de ligação oficial, 10 regras de WhatsApp, regra de ouro (nunca prometer aprovação), cadência D1/D2/D3 e documentos da visita. Ele fecha com um roleplay avaliado pela rubrica das 6 saídas da ligação. Os 24 módulos continuam intactos e passam a definir os níveis seguintes.

**D2. Níveis**

| Nível         | Como chega                                                 | O que significa na operação                                                                |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Iniciante     | Entrou na Academia                                         | Ainda não passou no onboarding                                                             |
| **Apto**      | Fase 0 concluída (ou decisão manual do gestor, com motivo) | Pode atender lead. Na fase 2, é o critério da roleta                                       |
| Intermediário | Fases 0, 1 e 2                                             | Domina MCMV, crédito, simulação e FGTS                                                     |
| Especialista  | Fases 0 a 3                                                | Domina o funil comercial inteiro                                                           |
| Mestre SMQ    | Fases 4 e 5 + **validação humana**                         | Referência do time. Não é automático porque depende de resultado e postura, não só de quiz |

Nível **nunca cai sozinho**. Se você publicar um módulo novo numa fase que o corretor já concluiu, ele recebe o módulo como atribuição com prazo de 14 dias, mas mantém o selo. Motivo: tirar o Apto de 30 corretores porque você publicou uma aula nova pararia a operação.

**D3. Veteranos não refazem o onboarding para ganhar o Apto.** O gestor marca "Apto por decisão" com motivo obrigatório (ex.: "Caique, corretor pleno, vendas em 2026"). Fica registrado no histórico. Isso importa quando o bloqueio da roleta for ligado.

**D4. Prática avaliada só onde ela é observável e crítica.** 9 módulos exigem prática corrigida pelo gestor: O01, M08 (simulação), M13 (abordagem), M14 (WhatsApp), M15 (ligação), M16 (qualificação), M18 (visita), M19 (objeções), M21 (fechamento). Os outros fecham com quiz. Conta: 9 práticas x ~40 corretores espalhadas em 6 meses dá cerca de 15 correções por semana. Se todos os 24 exigissem prática, seriam 40 por semana, e a fila de correção viraria o gargalo. O roleplay da reunião da manhã conta como prática: o gestor registra ali mesmo.

**D5. Conteúdo entra como rascunho.** Os 26 módulos nascem com status `rascunho` e uma nota de revisão. O botão "Publicar" é bloqueado enquanto a nota existir. Motivo: o material é de abril, tem duplicatas e pelo menos um conflito de método (M15). Publicar sem revisão ensinaria duas formas de ligar.

**D6. O quiz é à prova de cola básica.** O gabarito nunca sai do banco antes do envio (o corretor não consegue ler a tabela de questões, só recebe a pergunta via função). Só abre depois de concluir as aulas. Nota mínima 80%. Reprovou, espera 60 minutos e tem no máximo 3 tentativas por dia. Depois do envio ele vê a correção com a explicação de cada questão, que é onde o aprendizado acontece.

---

## 3. Quem faz o quê

| Papel                                          | Na Academia                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Corretor**                                   | Estuda a trilha, faz quiz, envia prática, vê recomendações atribuídas a ele, vê seu nível e certificados. Vê só os próprios dados           |
| **Gestor / superintendente** (Dayane, Jhonata) | Vê o time todo, corrige práticas, registra roleplay, atribui módulo, decide recomendações, marca presença nos encontros, decide Apto manual |
| **Admin** (Guilherme)                          | Tudo do gestor + edita conteúdo, publica módulos, ajusta regras de recomendação e configurações                                             |

Corretor **não vê** o progresso dos colegas. Mesma lógica da Higiene do Funil: ranking de estudo exposto muda o clima do time e não é uma decisão para o sistema tomar sozinho. Se quiser ranking na Copa SMQ, é decisão sua depois.

---

## 4. A trilha

| Fase                  | Módulos                        | Prazo sugerido | Prática avaliada                  |
| --------------------- | ------------------------------ | -------------- | --------------------------------- |
| 0 · Onboarding        | O01                            | dia 5          | O01                               |
| 1 · Fundação          | M01 a M04                      | dias 7 a 14    | nenhuma                           |
| 2 · Domínio Técnico   | M05 a M09                      | dias 21 a 50   | M08                               |
| 3 · Domínio Comercial | M10 a M21 (+ P01 complementar) | dias 55 a 150  | M13, M14, M15, M16, M18, M19, M21 |
| 4 · Alta Performance  | M22, M23                       | recorrente     | nenhuma                           |
| 5 · Excelência        | M24                            | recorrente     | nenhuma                           |

Prazos contados do `inicio_trilha` de cada corretor. Usei o fim do período de cada módulo no banco do Notion (ex.: M15 "Dias 60 a 85" vira prazo no dia 85), porque é o cronograma mais recente. Ele não bate com a tabela de fases do índice (que diz Fase 2 = dias 31 a 90). Ver decisão pendente P3.

**Regra de conclusão de um módulo** = todas as aulas publicadas marcadas + quiz aprovado + prática aprovada (se exigida).

**Regra de conclusão de uma fase** = todos os módulos obrigatórios **publicados** da fase concluídos, e a fase precisa ter pelo menos 1 módulo publicado. Sem essa segunda condição, no dia 1, com tudo em rascunho, o time inteiro viraria Especialista automaticamente (testei esse caso).

**Conteúdo técnico expira.** M04 a M09 falam de regra Caixa/MCMV (o M04 cita a atualização CCFGTS de 24/03/2026). Esses módulos nascem com `revisar_em` = hoje + 90 dias, e o painel avisa quando vencer. Aqui entra bem o agente `vigia-regras-mcmv`: quando ele detectar regra nova, o módulo afetado ganha nota de revisão.

---

## 5. Ligação com a operação

### 5.1 Recomendação por indicador

Todo dia, depois do fechamento, o CRM calcula para cada corretor uma lista de indicadores numa janela (7, 30, 60 ou 90 dias), compara com a **mediana do time** na mesma janela e, se o corretor estiver pior que o limiar e tiver amostra suficiente, gera uma recomendação de módulo.

| Regra | Indicador                                          | Dispara quando           | Módulo                      | Amostra mínima |
| ----- | -------------------------------------------------- | ------------------------ | --------------------------- | -------------- |
| R01   | Tempo para primeiro contato (hh:mm)                | 1,5x a mediana do time   | M13 Abordagem inicial       | 8 leads        |
| R02   | Taxa de agendamento                                | abaixo de 70% da mediana | M15 Ligação e agendamento   | 15 leads       |
| R03   | Comparecimento (agendado que virou visita)         | abaixo de 70%            | M14 (protocolo D-2/D-1/D+0) | 8 agendamentos |
| R04   | Visita que avança para proposta ou análise         | abaixo de 70%            | M18 Visita                  | 8 visitas      |
| R05   | % da carteira parada 7+ dias                       | 1,5x a mediana           | M20 Follow-up               | 20 leads       |
| R06   | % de leads sem próximo passo                       | 1,5x a mediana           | M11 Funil                   | 20 leads       |
| R07   | Pasta devolvida por documento                      | 1,5x a mediana           | M21 Pasta e fechamento      | 5 pastas       |
| R08   | Perda por perfil não qualificado depois de avançar | 1,5x a mediana           | M16 Qualificação            | 8 perdas       |

**Exemplo de como aparece para o gestor (nome e números ilustrativos):**

> **Corretor A** · taxa de agendamento 9% nos últimos 30 dias (time: 21%, amostra 64 leads) → sugerido **M15 Ligação e agendamento**. [Atribuir com prazo 7 dias] [Descartar, com motivo]

Por que comparar com a mediana do time e não com um número fixo: o mercado oscila (campanha fraca, lançamento novo) e todo mundo cai junto. Comparar com o time isola o que é do corretor. Por que amostra mínima: com 5 leads, 1 agendamento a mais muda a taxa de 20% para 40%. É a mesma lógica da roleta ponderada (amostra mínima 8).

**As regras da casa valem aqui** (estão no prompt):

- Estado do lead se lê em "passou por" (`bool_or` no histórico), não no último status. "Agendou" = passou por `agendado`, mesmo que hoje esteja em `analise_credito`.
- Lote de importação (timestamps idênticos) fica fora do cálculo.
- Controle positivo antes de afirmar zero. Exemplo concreto: hoje o MCP do CRM devolve **0 agendamentos e 0 vendas** para agosto e setembro inteiros, com 2.532 leads novos no mesmo período. Isso é instrumento quebrado, não realidade. Se o motor de recomendação usar esse caminho, ele recomenda M15 para o time inteiro.

**Três modos**, como o motor de SLA:

- `sombra` (padrão): gera as recomendações, só o gestor vê, ninguém é notificado. Serve para você olhar 7 a 14 dias e ver se as sugestões fazem sentido.
- `ativo`: gestor decide cada recomendação (atribuir ou descartar). **Nada é atribuído ao corretor sem um humano clicar.** O descarte exige motivo, e isso ensina onde a regra erra.
- `desligado`.

### 5.2 Medir se funcionou

Para cada módulo concluído por recomendação, o painel mostra o indicador **antes** (janela que disparou) e **depois** (mesma janela, contada da conclusão). Exemplo: "M15 concluído por 6 corretores via recomendação: taxa de agendamento média 11% antes, 17% depois (n=6)". Com poucos casos é indício, não prova, e a tela diz isso. É a regra "medir antes de mexer" aplicada ao treinamento.

### 5.3 Selo Apto na operação

- **v1**: selo "Apto" / "Não apto" na ficha do corretor, na lista de participantes da roleta e no painel da Academia. Informativo.
- **Fase 2 (modo sombra)**: uma view mostra quantos leads foram atribuídos a corretores não aptos nos últimos 30 dias. É o número que você olha antes de decidir ligar o bloqueio. Não toca na função de distribuição.
- **Fase 2 (ativo)**: fora deste escopo. Vai ter prompt próprio, porque mexe em `distribuir_lead_ponderado`, que está no ar e fazendo dinheiro.

### 5.4 Encontros presenciais

O calendário do Obsidian vira registro: roleplay diário, maratona de objeções semanal, crédito quinzenal, revisão mensal, treinamento com construtora (como o da Cury). Cada encontro tem facilitador, módulo ligado, presença e o campo "ação registrada" (a regra "todo treino gera 1 ação"). Presença no encontro não conclui módulo sozinha; roleplay avaliado ali, sim.

---

## 6. Modelo de dados (resumo)

Tudo prefixado `academia_`, nada existente é alterado. SQL completo em `01-migration-academia.sql`.

| Tabela                                                                           | Para quê                                                                                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `academia_config`                                                                | Nota mínima, tempo do quiz, modo da recomendação, modo do gate (só `desligado`/`sombra`)                       |
| `academia_fases`                                                                 | As 6 fases e o nível que cada uma libera                                                                       |
| `academia_modulos`                                                               | 26 módulos: objetivos, carga, prazo, prática, rubrica, Gamma, status, versão, nota de revisão, data de revisão |
| `academia_aulas`                                                                 | Aulas de cada módulo (texto, slides, vídeo, prática, material)                                                 |
| `academia_questoes`                                                              | Banco de questões. **Invisível para o corretor**                                                               |
| `academia_participantes`                                                         | Quem está na Academia, início da trilha, nível, override de Apto                                               |
| `academia_progresso_aulas`, `academia_tentativas`, `academia_praticas`           | O que cada corretor fez                                                                                        |
| `academia_atribuicoes`                                                           | Módulo atribuído com prazo (pelo gestor, por recomendação, ou por módulo novo)                                 |
| `academia_indicadores`, `academia_regras_recomendacao`, `academia_recomendacoes` | O motor de recomendação                                                                                        |
| `academia_encontros`, `academia_presencas`                                       | Calendário de treinos                                                                                          |
| `academia_certificados`, `academia_niveis_historico`                             | Trilha de auditoria do nível                                                                                   |

Escrita do corretor **só por função** (RPC), nunca direto na tabela. Motivo: é o que impede alguém de marcar a própria prática como aprovada ou gravar nota 100 direto pelo console do navegador.

---

## 7. Telas

### Corretor · menu "Academia"

1. **Minha trilha** (home): nível atual e barra até o próximo, card "Continue de onde parou", **tarefas atribuídas com prazo** no topo (com o motivo: "atribuído pela Dayane: sua taxa de agendamento está abaixo do time"), as 6 fases com o status de cada módulo, próximo encontro presencial.
2. **Módulo**: objetivo, o que você vai conseguir fazer, lista de aulas com check, slides, prática, botão do quiz (desabilitado até concluir as aulas, com o porquê).
3. **Aula**: texto em markdown, slides Gamma embutidos, botão "Concluí esta aula" e "Próxima".
4. **Quiz**: uma questão por tela, cronômetro discreto, resultado com a correção comentada.
5. **Prática**: instrução + campo de texto ou link, status (aguardando, aprovada, refazer com o feedback do gestor).
6. **Meu progresso**: certificados por nível, histórico.

Mais: um card pequeno na home do CRM, "Sua próxima aula", para a Academia aparecer onde o corretor já está.

### Gestor · menu "Gestão > Academia"

Princípio igual ao da Higiene do Funil: **abre no que precisa de ação, não no gráfico.**

1. **Agora**: práticas esperando correção (a fila mais importante), recomendações novas, atribuições vencidas, corretores sem atividade há 7+ dias na trilha.
2. **Time**: matriz corretor x fase (percentual concluído em cada fase), nível, selo Apto, atrasados, última atividade. Clique no corretor abre a ficha dele na Academia.
3. **Recomendações**: fila com o número do corretor, o do time, a amostra e o módulo sugerido. Aba "Efeito" com antes e depois.
4. **Encontros**: calendário, criar encontro, marcar presença em 1 clique, registrar roleplay com a rubrica.
5. **Conteúdo** (admin): lista de módulos com status e nota de revisão, editor de aulas e questões, "Marcar como revisado", "Publicar".
6. **Configuração** (admin): nota mínima, tempo do quiz, modo da recomendação, regras.

Protótipo clicável das duas visões: artifact "Academia SMQ · protótipo".

---

## 8. Conteúdo: o estado real e o que precisa de você

A carga inicial (`02-seed-academia.sql`) traz: 6 fases, 26 módulos (O01 + M01 a M24 + P01), 181 aulas, 136 questões com a resposta certa distribuída entre as 4 posições, 8 regras de recomendação.

**Sobre o texto das aulas:** cada seção do Notion virou uma aula, mas com o **resumo** da seção, não o texto integral (a extração do texto completo foi bloqueada no meio do caminho). O prompt inclui uma fatia que resolve isso direito: um script que lê as páginas do Notion pela API (usando o `notion_page_id` gravado em cada módulo) e preenche o texto integral das aulas. Vantagem extra: quando você atualizar o Notion, roda o script de novo. O O01 e a aula oficial do M15 já estão com texto completo.

**Achados na extração que dependem de você:**

1. **M15 ensina outro método de ligação** ("5 momentos") que conflita com o "Eu conduzo" oficial. Inseri a aula oficial como primeira aula do M15 e 3 questões do método no quiz. Decida se as aulas antigas saem.
2. **M02 tem duas versões** (3 responsabilidades x 4 funções).
3. **M11** precisa bater com os status reais do CRM (a versão antiga do Notion tinha 13 etapas em outra ordem).
4. **M17 e M18** repetem os 7 passos da visita. **M14 e M20** repetem os 8 tipos de follow-up.
5. **Todos os 24 módulos têm página duplicada** no Notion (a do índice é a mais antiga). Usei a do banco.
6. **P01 (Treinamento Prático)** está incompleto no Notion: termina no meio de uma tabela e não tem a parte de documentação.

Cada um desses já está escrito como nota de revisão no módulo, e o botão Publicar mostra a nota.

---

## 9. Ordem de entrega (fatias)

| Fatia | O que entrega                                                | Valor no dia                                |
| ----- | ------------------------------------------------------------ | ------------------------------------------- |
| 0     | Diagnóstico do repo e do banco, só leitura                   | Saber onde plugar sem quebrar               |
| 1     | Migration + seed + testes de RLS                             | Base pronta, invisível ao corretor          |
| 2     | Telas do corretor + card na home                             | Onboarding O01 rodando com novos corretores |
| 3     | Painel do gestor: Agora, Time, correção de prática, Conteúdo | Dayane e Jhonata acompanham e corrigem      |
| 4     | Importador do Notion (texto integral)                        | Aulas completas                             |
| 5     | Motor de indicadores e recomendações em **sombra**           | Você valida as sugestões por 7 a 14 dias    |
| 6     | Encontros, presença, roleplay, certificados, aba Efeito      | Calendário de treino vira dado              |
| 7     | View do gate em sombra                                       | O número para decidir o bloqueio da roleta  |

Paralelo a isso, do seu lado: revisar e publicar primeiro o **O01** e a **Fase 1**. Sem conteúdo publicado, as telas ficam vazias.

---

## 10. Como saber se deu certo (90 dias)

| Métrica                                                         | Meta sugerida                                            |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| Corretores ativos com selo Apto (por trilha ou decisão)         | 100%                                                     |
| Corretor novo: dias da entrada até o Apto                       | até 7                                                    |
| Corretores com atividade na Academia na semana                  | 70%                                                      |
| Práticas corrigidas em até 48h                                  | 90%                                                      |
| Recomendações decididas (atribuída ou descartada) em até 3 dias | 90%                                                      |
| Indicador depois x antes, nos módulos por recomendação          | melhora em pelo menos 2 dos 3 indicadores com mais casos |

---

## 11. Riscos

| Risco                                                     | Como o desenho se protege                                                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Academia vazia no lançamento                              | Publicar O01 e Fase 1 antes de anunciar ao time                                                                                              |
| Gestor não corrige prática e o corretor trava             | Só 9 módulos exigem prática; fila "Agora" abre nisso; métrica de 48h                                                                         |
| Recomendação errada queima a credibilidade                | Modo sombra primeiro; humano decide cada uma; descarte com motivo                                                                            |
| Indicador com dado quebrado (ex.: MCP com 0 agendamentos) | Controle positivo obrigatório na Fatia 5; amostra mínima                                                                                     |
| Conteúdo desatualizado de MCMV                            | `revisar_em` nos módulos técnicos + aviso no painel                                                                                          |
| Corretor cola no quiz                                     | Gabarito só no banco, aulas antes, intervalo e limite diário. Não é à prova de tudo, e nem precisa: a prática avaliada é o filtro de verdade |
| Quebrar o que está no ar                                  | Nada existente é alterado; roleta fora de escopo; rollback em 1 arquivo                                                                      |

---

## 12. Decisões pendentes (só você responde)

- **P1.** Aprovar a Fase 0 (O01) como critério do Apto, no lugar da Fase 1.
- **P2.** M15: tirar as aulas do método antigo ou manter como contexto?
- **P3.** Qual cronograma vale: o do índice por fase (Fase 3 = dias 91 a 180) ou o do banco por módulo (usado no seed)?
- **P4.** Quem entra na Academia: os 46 perfis do CRM incluem `docs-bot`, "Seu Metro Quadrado" (admin), SDR e pelo menos um perfil com e-mail `.local`. A lista de participantes precisa ser confirmada por você, não inferida.
- **P5.** Quem corrige prática: só Dayane e Jhonata, ou corretor Especialista também pode (mentoria)?
- **P6.** A Copa SMQ ganha ponto por módulo concluído? (Recomendo não na v1: mistura aprendizado com competição antes de o hábito existir.)
