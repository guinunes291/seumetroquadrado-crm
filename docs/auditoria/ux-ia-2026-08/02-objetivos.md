# Fase 2 — Declaração de objetivo por página

> Regra de ouro: uma página só existe se responde a **uma** pergunta de negócio ou habilita
> **uma** decisão. Se a pergunta não cabe numa frase, a página está errada — não a função dentro dela.
>
> As decisões já travadas por você nas 20 perguntas estão marcadas com **[DECIDIDO]**.
> As premissas que assumi sozinho estão marcadas com **[ASSUNÇÃO]** e são revisáveis.

---

## Contexto de papéis (revisado)

| Papel | Existe de fato? | Fonte |
|---|---|---|
| `corretor` | sim — persona primária de campo | — |
| `gestor` | sim | — |
| `admin` | sim (Guilherme) | — |
| `superintendente` | **papel legado, sem usuário real** **[DECIDIDO]** | sua resposta |
| correspondente/parceiro | **não usa o CRM** **[DECIDIDO]** | sua resposta |

Consequência: a Fase 5 desenha **dois** menus (corretor e gestão), não três.

---

# Fichas

## Início — `/hoje`

- **Persona primária:** ambos, com duas caras distintas (escopo `minha` × `operacao`)
- **Momento de uso:** primeira tela do dia, celular (corretor) e desktop (gestor)
- **Pergunta única que responde:** *"O que eu faço agora?"*
- **Decisão que habilita:** escolher a próxima ação sem precisar procurar
- **Objeto central:** lead (visão minha) / métrica (visão operação)
- **Frequência:** diária
- **Veredito de existência:** **MANTER**
- **Justificativa:** é a única página do sistema que responde a pergunta certa por construção.
  Mas hoje ela responde **duas** perguntas no mesmo lugar via toggle — "o que eu faço agora"
  (corretor) e "onde a operação está" (gestor). Como você **fica sempre em Operação**
  **[DECIDIDO]**, o toggle é peso morto para você e ruído de descoberta para quem vende.
  Recomendação: separar as duas caras por papel em vez de por toggle, e **fixar a ordem dos
  widgets** — ninguém personalizou **[DECIDIDO]**, então a personalização é custo sem retorno.
- **Divide-se?** Sim: `gestao-dia`, `gestao-pacing` e `gestao-atalhos` pertencem à home de
  gestão; `nba`, `missoes`, `tarefas`, `metas` à home do corretor.

## Leads — `/leads`

- **Persona primária:** ambos (corretor consulta, gestor audita)
- **Momento de uso:** desktop para trabalho em lote; celular para achar alguém
- **Pergunta única que responde:** **nenhuma** — responde a pelo menos quatro
- **Decisão que habilita:** várias, concorrentes
- **Objeto central:** lead
- **Frequência:** diária
- **Veredito de existência:** **FUNDIR COM `/atendimento`** **[DECIDIDO]**
- **Justificativa:** a página acumula (a) *"quem são meus leads?"* — lista; (b) *"em que etapa
  cada um está?"* — kanban, que **duplica `/pipeline`** (D2); (c) *"quais leads têm este
  perfil?"* — 6 filtros + visões salvas; (d) *"como eu opero N leads de uma vez?"* — 8 ações em
  massa (`leads.index.tsx:1337-1450`). São 2.071 linhas e ~20 ações competindo pela atenção no
  nível primário: a violação mais grave de Hick no sistema. Sua decisão de fundir com
  Atendimento resolve a raiz: **as filas priorizadas viram o modo padrão, e a lista com filtros
  vira um modo de consulta dentro da mesma porta.**
- **Perguntas secundárias a rebaixar:** kanban (já existe em `/pipeline`), importação
  (admin, uso raro), ações em massa de gestão (transferir, roleta, lixeira).

## Detalhe do lead — `/leads/$leadId`

- **Persona primária:** corretor
- **Momento de uso:** antes/durante/depois do atendimento, celular
- **Pergunta única:** *"O que eu preciso saber e fazer com esta pessoa?"*
- **Decisão:** qual é o próximo passo com este lead
- **Objeto central:** lead
- **Frequência:** diária, muitas vezes por dia
- **Veredito:** **MANTER**
- **Justificativa:** 6 abas (Timeline, Dados, Qualificação, Tarefas, Agendamentos,
  Documentação — `leads.$leadId.tsx:393-413`) num objeto só é defensável: é o dossiê. A rota
  já foi reduzida de 1.552 para 477 linhas. Ponto de atenção para a Fase 3: você respondeu que
  **o avanço de etapa no celular acontece pela ficha do lead** **[DECIDIDO]** — ou seja, esta
  página é o caminho real de uma das tarefas mais frequentes do dia, e precisa ser medida
  como tal na Fase 4.

## Atendimento — `/atendimento`

- **Persona primária:** corretor
- **Momento de uso:** manhã e entre atendimentos, celular
- **Pergunta única:** *"Quem eu procuro agora, nesta ordem?"*
- **Decisão:** a quem dedicar o próximo contato
- **Objeto central:** lead
- **Frequência:** diária
- **Veredito:** **MANTER e absorver `/leads`** **[DECIDIDO]**
- **Justificativa:** é a página mais bem desenhada do sistema para a persona de campo —
  classificação, dedup e contagem no banco, 5 filas com no máximo 15 cards, drawer em vez de
  navegação, realtime num canal só (`atendimento.tsx:56-73`). Tem 205 linhas contra 2.071 de
  `/leads` e faz mais pelo dia do corretor. É a candidata natural a porta única do objeto lead.

## Pipeline — `/pipeline`

- **Persona primária:** ambos
- **Momento de uso:** revisão semanal (gestor) e conferência de etapa (corretor)
- **Pergunta única:** *"Onde meus negócios estão parados?"*
- **Decisão:** o que empurrar para a próxima etapa
- **Objeto central:** lead por etapa
- **Frequência:** semanal
- **Veredito:** **MANTER, MAS REBAIXAR de 1º nível** **[ASSUNÇÃO]**
- **Justificativa:** você decidiu tirá-lo da barra de polegar **[DECIDIDO]** e disse que o
  avanço de etapa no celular acontece pela ficha do lead — ou seja, o kanban não é ferramenta
  de campo. Ele é ferramenta de revisão, e revisão é semanal. Ocupar slot de 1º nível **e** slot
  de polegar para uso semanal é gastar recurso escasso. A aba Fechamento é outra pergunta
  ("o que dá para fechar este mês?") e deveria acompanhar a visão de gestão.
- **Divide-se?** Sim: Funil (etapa) e Fechamento (previsão de receita) são perguntas distintas.

## Modo Blitz — `/blitz`

- **Persona primária:** corretor
- **Momento de uso:** bloco dedicado de prospecção, celular ou desktop
- **Pergunta única:** *"Quem eu ligo agora, sem pensar?"*
- **Decisão:** executar volume de contato sem custo de escolha
- **Objeto central:** lead
- **Frequência:** diária ou semanal, conforme rotina do corretor
- **Veredito:** **VIRAR MODO DE `/atendimento`** **[ASSUNÇÃO]**
- **Justificativa:** está vivo **[DECIDIDO]**, então não elimino. Mas a pergunta que ele responde
  é uma variante da pergunta de Atendimento — "quem eu procuro agora" com fila mais estreita e
  sem escolha. Duas rotas para a mesma intenção é o sinal D1 do inventário. Como *modo* dentro
  de Atendimento ele mantém a função e libera um slot de menu.

## Oferta Ativa — `/oferta-ativa`, `/oferta-ativa/nova`, `/oferta-ativa/$ofertaId`

- **Persona primária:** gestor cria, corretor executa
- **Momento de uso:** campanha de base fria, desktop
- **Pergunta única:** *"Que lista eu trabalho nesta campanha?"*
- **Decisão:** para quem ofertar o quê
- **Objeto central:** lista de leads segmentada
- **Frequência:** semanal a mensal
- **Veredito:** **MANTER, MAS REBAIXAR** **[ASSUNÇÃO]**
- **Justificativa:** está vivo **[DECIDIDO]**. São 1.613 linhas em 3 rotas — o terceiro maior
  bloco do sistema — para um uso que não é diário. A criação (`/nova`, admin/gestor) é ato de
  gestão; a execução é ato de corretor. Hoje as duas coisas moram no mesmo lugar, sob Leads.

## Captação (Landing) — `/leads-landing`

- **Persona primária:** gestor/admin
- **Momento de uso:** conferência de entrada de campanha
- **Pergunta única:** *"O que chegou da landing e está sem dono?"*
- **Decisão:** distribuir ou descartar o que entrou
- **Objeto central:** lead de origem landing
- **Frequência:** diária para quem cuida de tráfego; rara para o resto
- **Veredito:** **VIRAR ABA DE `/distribuicao`** **[ASSUNÇÃO]**
- **Justificativa:** a pergunta dela é a pergunta da Distribuição, restrita a uma origem. Está
  hoje sob **Leads** (menu do corretor) sendo uma tela que corretor não pode ver
  (`app-sidebar.tsx:78`) — item de gestão ocupando espaço no mundo do corretor.

## Agenda & Tarefas — `/agendamentos`

- **Persona primária:** corretor
- **Momento de uso:** início do dia e antes de sair para visita, celular
- **Pergunta única:** *"O que eu tenho marcado e o que eu devo?"*
- **Decisão:** organizar o dia; confirmar visita
- **Objeto central:** agendamento + tarefa
- **Frequência:** diária
- **Veredito:** **MANTER, e PROMOVER no mobile** **[ASSUNÇÃO]**
- **Justificativa:** responde bem a duas metades da mesma pergunta (compromisso e dever) e as
  separa em duas abas (`:78-79`) — aceitável. O problema não é a página, é o acesso: hoje ela
  está a 3 toques no celular (hambúrguer → Atendimento → Agenda & Tarefas). Você escolheu a
  **busca** para o slot livre da barra **[DECIDIDO]**, então a agenda precisa de outra solução —
  proposta na Fase 5.

## Modo Visita — `/modo-visita`

- **Persona primária:** corretor
- **Momento de uso:** no estande, com cliente na frente
- **Pergunta única:** *"Como registro este atendimento sem perder o cliente de vista?"*
- **Decisão:** capturar o atendimento presencial
- **Objeto central:** visita
- **Frequência:** dias de plantão
- **Veredito:** **MANTER** **[DECIDIDO — está vivo]**
- **Justificativa:** é a única superfície pensada para uso com cliente presente. Uso
  concentrado em dias específicos, não diário — não precisa de slot permanente, precisa de
  acesso rápido no dia certo.

## Projetos — `/projetos` e `/projetos/$projetoId`

- **Persona primária:** corretor
- **Momento de uso:** durante o atendimento, celular, com cliente perguntando preço
- **Pergunta única:** *"O que eu ofereço e por quanto?"*
- **Decisão:** qual unidade apresentar e a que preço
- **Objeto central:** projeto/empreendimento
- **Frequência:** diária
- **Veredito:** **MANTER, e PROMOVER no mobile** **[ASSUNÇÃO]**
- **Justificativa:** munição comercial de uso diário que **não está na barra de polegar**. A
  ficha do projeto já foi tratada como munição (hero com preço, mapa de disponibilidade por
  bloco/andar). O gargalo é chegar nela em campo — a medir na Fase 4.

## Vitrine — `/vitrine`

- **Persona primária:** corretor
- **Momento de uso:** ao mandar opções para o cliente no WhatsApp
- **Pergunta única:** *"O que eu mando para este cliente ver?"*
- **Decisão:** montar e enviar uma seleção
- **Objeto central:** projeto (recorte compartilhável)
- **Frequência:** semanal
- **Veredito:** **MANTER como filho de Projetos**
- **Justificativa:** pergunta distinta de "o que eu ofereço e por quanto" (é sobre *enviar*,
  não sobre *consultar*), e já vive rebaixada como subitem. Correto onde está.

## Links Úteis — `/links-uteis`

- **Persona primária:** corretor
- **Momento de uso:** quando precisa do material da construtora
- **Pergunta única:** *"Onde está o book/tabela/sistema da construtora X?"*
- **Decisão:** abrir o material certo
- **Objeto central:** material de apoio
- **Frequência:** semanal
- **Veredito:** **VIRAR ABA DE `/projetos`** **[ASSUNÇÃO]**
- **Justificativa:** o objeto é o mesmo (empreendimento/construtora) e a pergunta é vizinha.
  Hoje é filho de **Início**, o que quebra a associação mental: material de projeto vive fora
  do mundo de projetos. Nota: essa aba **já existiu** em `/projetos` e foi promovida a página
  (`links-uteis.tsx:3-6`) — antes de reverter, quero saber por que foi promovida. **[DÚVIDA]**

## Desempenho — `/ranking`

- **Persona primária:** corretor (ranking, conquistas) e gestor (comissões)
- **Momento de uso:** conferência de posição e de dinheiro
- **Pergunta única que responde:** **duas incompatíveis** — *"como eu estou contra o time?"* e
  *"quanto eu vou receber?"*
- **Decisão:** competir × conferir remuneração
- **Objeto central:** corretor (métrica) e comissão (dinheiro)
- **Frequência:** semanal (ranking), mensal (comissões)
- **Veredito:** **DIVIDIR — Comissões sai para destino próprio** **[DECIDIDO]**
- **Justificativa:** 1.799 linhas com 4 abas onde a aba de dinheiro está dentro de gamificação.
  Você respondeu que comissão merece um lugar próprio de dinheiro. Ranking, Competição e
  Conquistas compartilham a mesma pergunta (posição relativa) e podem continuar juntos.

## Gestão — `/painel-gestor`

- **Persona primária:** gestor/admin
- **Momento de uso:** revisão diária (aba Dia) e análise semanal
- **Pergunta única que responde:** **pelo menos seis**
- **Decisão:** onde intervir
- **Objeto central:** varia por aba — time, funil, meta, lead, cadastro
- **Frequência:** diária (Dia) a rara (abas admin)
- **Veredito:** **DIVIDIR — bloco admin sai para `/configuracoes`** **[DECIDIDO]**
- **Justificativa:** 12 abas numa `TabsList` que quebra linha (`:196-210`) é o maior ponto de
  concentração do sistema. Você usou todas as quatro famílias na última semana **[DECIDIDO]** —
  então nenhuma é morta —, mas Pessoas, Estoque, Campanhas, Comunicação e Qualidade são
  **configuração e cadastro**, não gestão de operação: mudam raramente, não geram decisão
  diária, e ocupam metade do hub que você abre todo dia. Movidas para `/configuracoes`
  (hoje 145 linhas, já admin-only), a Gestão cai de 12 para 7 abas.
  A aba padrão continua **Dia** **[DECIDIDO]**.
- **Pendências internas:** as abas `pessoas` e `qualidade` empilham **duas páginas cada**
  (`:301-305, 322-326`) — cada uma responde duas perguntas dentro de uma aba só.

## Distribuição — `/distribuicao`

- **Persona primária:** gestor/admin
- **Momento de uso:** quando um lead cai e ninguém pega
- **Pergunta única:** *"O lead que entrou chegou a um corretor apto?"*
- **Decisão:** intervir na roleta ou realocar manualmente
- **Objeto central:** lead em trânsito
- **Frequência:** diária
- **Veredito:** **MANTER**
- **Justificativa:** pergunta única e clara, papel único, uso diário. É uma das páginas mais
  bem definidas do sistema — e você acrescentou "ver leads parados na roleta" à lista de
  tarefas a medir **[DECIDIDO]**, o que confirma que a pergunta dela é real.

## Financeiro · Fechamento — `/financeiro/fechamento`

- **Persona primária:** admin/gestor
- **Momento de uso:** fechamento do mês
- **Pergunta única:** *"O que entrou e o que se paga este mês?"*
- **Decisão:** aprovar e liquidar
- **Objeto central:** venda + comissão
- **Frequência:** mensal
- **Veredito:** **MANTER, e absorver Comissões de `/ranking`** **[DECIDIDO]**
- **Justificativa:** você decidiu que comissão precisa de um lugar próprio de dinheiro. Este
  já é o lugar de dinheiro. Juntar resolve o D-10 sem criar rota nova.

## Match IA — `/match`

- **Persona primária:** corretor
- **Momento de uso:** ao qualificar poder de compra ou buscar empreendimento por descrição
- **Pergunta única:** *"Qual empreendimento serve para este cliente?"*
- **Decisão:** o que apresentar
- **Objeto central:** projeto × lead
- **Frequência:** eventual
- **Veredito:** **MANTER SÓ COMO DEEP LINK** **[DECIDIDO]**
- **Justificativa:** sua decisão. Faz sentido apenas no contexto de um lead ou projeto, não como
  destino autônomo. Fica como está — mas a Fase 3 vai apontar que ele **também está fora do
  ⌘K**, o que é diferente de "fora do menu": não há nenhuma forma de encontrá-lo por busca.

## Meu perfil — `/meu-perfil`

- **Persona:** todos · **Frequência:** rara
- **Pergunta única:** *"Meus dados e minha senha estão certos?"*
- **Veredito:** **MANTER no rodapé** — já está corretamente rebaixado.

## Configurações — `/configuracoes`

- **Persona:** admin · **Frequência:** rara
- **Pergunta única:** *"Como o CRM está configurado?"*
- **Veredito:** **MANTER e EXPANDIR** — recebe as 5 abas admin de `/painel-gestor` **[DECIDIDO]**.
  Passa de 3 para 8 abas; a Fase 5 precisa agrupá-las (integrações × cadastros × qualidade).

## Rotas públicas — `/`, `/auth`, `/reset-password`, `/vitrine-publica`

- **Veredito:** **MANTER** — fora do escopo desta auditoria de navegação interna.

---

# Consolidado dos vereditos

| Veredito | Páginas |
|---|---|
| **MANTER** | `/hoje`, `/leads/$leadId`, `/atendimento`, `/distribuicao`, `/vitrine`, `/modo-visita`, `/meu-perfil`, públicas |
| **MANTER, MAS REBAIXAR** | `/pipeline`, `/oferta-ativa` |
| **MANTER E PROMOVER (mobile)** | `/projetos`, `/agendamentos` |
| **FUNDIR** | `/leads` → `/atendimento` · Comissões de `/ranking` → `/financeiro` |
| **VIRAR ABA/MODO DE** | `/blitz` → modo de Atendimento · `/leads-landing` → aba de Distribuição · `/links-uteis` → aba de Projetos |
| **DIVIDIR** | `/painel-gestor` (bloco admin → `/configuracoes`) · `/ranking` (Comissões sai) |
| **MANTER FORA DO MENU** | `/match` |
| **ELIMINAR** | nenhuma página. As candidatas naturais (Blitz, Oferta Ativa, Modo Visita, Match) foram confirmadas vivas por você. |

**Nenhuma página foi eliminada.** O problema deste sistema não é excesso de páginas mortas —
é **excesso de portas para os mesmos objetos** e **concentração de perguntas diferentes na
mesma tela**.

---

# Dúvidas que preciso responder antes da Fase 3

Sete, dentro do teto de oito.

1. **As 5 etapas fora do funil** (`novo`, `aguardando_corretor`, `qualificado`,
   `proposta_enviada`, `pos_venda`) ainda recebem lead? E falta alguma etapa do processo
   comercial que o CRM não modela? *(você pediu para revisar comigo — bloqueia a Fase 4)*
2. **`/links-uteis` já foi aba de `/projetos` e foi promovida a página** (`links-uteis.tsx:3-6`).
   Por quê? Se foi por dificuldade de achar, devolvê-la a aba repete o erro.
3. **`/oferta-ativa`**: quem cria a campanha e quem executa? Se são pessoas diferentes, a
   criação vai para gestão e a execução fica com o corretor.
4. **`/blitz` × `/atendimento`**: qual a diferença na cabeça do corretor? Se ele não souber
   dizer em uma frase, viram um só.
5. **`gestao_metricas`, `leads_search_v2` e ~28 outras RPCs sem tela**: foram construídas para
   telas que não vieram, ou substituídas? Quero saber se elimino ou se conecto.
6. **Aprovação de venda**: você não marcou "aprovar venda pendente" entre as tarefas a medir,
   mas existe `pending-sales-approval.tsx` e a RPC `aprovar_venda`. Não é tarefa sua?
7. **Badge de "aprovações" no menu Gestão** (`app-sidebar.tsx:120`): se aprovar venda não é
   tarefa medida, esse badge está cobrando algo que ninguém trata?

---

**Status:** Fases 1 e 2 entregues. Parado para sua revisão, conforme combinado **[DECIDIDO]**.
Fases 3 a 6 e o sumário executivo entram depois do seu aval.
