# As demais páginas no padrão Lançamento — auditoria e plano por fases

> Pedido do dono (11/10/2026), depois de ver a aba "A vez por zona": **"todas as demais
> páginas como podemos deixar nesse mesmo padrão das demais páginas? ficou mais limpo e
> fácil de encontrar dados. Do modo antigo tem muita informação espalhada em toda a
> página."** Auditoria feita em 11/10 por 15 leitores independentes sobre as 62 rotas
> autenticadas (7 leitores por módulo, contestação cruzada e síntese), contra o padrão das
> Fases 2–11 de `lancamento-2026-10.md`. **Nada aqui foi feito ainda: é o plano, para o
> dono dizer a ordem.** Nenhuma fase muda regra, contador ou RPC — só onde e com que peso
> cada coisa aparece.

> **Atualização (12/10/2026, depois das roletas por filial — #280).** O plano foi escrito
> na véspera, com as seis roletas de zona. Desde o #280 a distribuição é feita por três
> roletas de filial (Barra Funda, Liberdade, Belém) e a zona ficou no lead
> (`docs/ops/roletas-por-filial.md`). Onde a Fase 4 e a proposta de `/distribuicao` falam em
> "roleta por zona", "zona da equipe do gerente" e no grupo "Zonas" da aba Filas, leia: a
> fila de cada filial (o cartão "A vez por zona" já mostra as filiais da zona, com a "da
> vez" primeiro), o gerente abrindo na filial da equipe dele e o grupo "Filiais". O resto
> do plano — as peças, as fases, as outras páginas e as três decisões — não muda.

## 1. Resumo para o dono

Hoje 11 telas já estão no padrão novo (as portas dos 10 módulos e a aba de Comissões); das 62 que olhamos, 12 são só atalhos antigos que redirecionam e não precisam de nada, e cerca de 40 ainda têm a cara antiga — muitos quadradinhos de número com o mesmo peso, dois títulos empilhados, texto de manual na tela e botões repetidos em três lugares. O plano arruma isso em seis entregas, cada uma um pacote só. Primeiro (1 semana) construímos as peças que se repetem — o cartão com o número grande, os três números ao lado, a lateral curta, o botão 'Filtros', o menu '…' da linha — e já aplicamos nas telas que o corretor abre toda semana e custam pouco: Comissões, Minha base, Meus 65, a lista da Oferta Ativa. Depois (1,5 semana) vem o dia a dia da carteira: Kanban e Reta final, Agenda, Tarefas, Atender. Em seguida (2 semanas) a ficha do cliente — que todo mundo abre o dia inteiro e hoje repete temperatura, etapa e origem em três lugares — e a Cadência do lead novo com o painel de cobrança do gestor. A quarta entrega (2 semanas) é a sua pergunta: a roleta por zona, com a roda e a fila, vira a primeira tela da Distribuição para o admin, e cada gerente abre já na zona da equipe dele (quem atende duas zonas vê as duas); na mesma entrega, o 'Leads por corretor' vira uma lista de uma linha por pessoa, no mesmo desenho da fila que o corretor vê. A quinta (2 semanas) é placar e relatórios: Ranking sem o fundo escuro fora da TV, Relatórios com uma linha de abas só, Raio-X com as comissões no topo, Meu Funil e o Fechamento do mês. A última (3 semanas) é o que se abre de vez em quando: catálogo de projetos, Vitrine e Mapa, simuladores, Discador, Configurações, Meu perfil e as telas da Academia. Para o corretor muda o que ele vê primeiro (o número que importa e uma ação só), não o que ele faz: nenhuma regra, contador ou ordem de módulo muda, e os testes que travam esses comportamentos continuam passando. Três decisões ficam com você antes de começar: se o superintendente é gestão só-leitura no BI, se o gestor entra em Configurações → Pessoas para a própria equipe, e se o 'Ligar' da Agenda passa a discar pelo 3C Plus como na Fila.

## 2. As peças que se repetem (construir uma vez, usar em todas)

### Placar: AnelNdeM + Numero + Notas (número com dono)

**Para quê.** O desenho da Central para todo 'como estou agora': anel dourado 'N de M' e até 3 números que só acendem cor acima de zero. Hoje o mesmo X/65 aparece em anel na Fila, em texto 2xl nos Meus 65 e em prosa na Minha base — a peça acaba com o 'mesmo número em dois desenhos'.

**Onde já existe.** src/features/fila-unica/fila-cockpit.tsx — AnelDoDia (l.19), Numero (l.96) e Notas (l.161) são funções locais SEM export. Mover para src/components/ui/placar.tsx e fazer FilaCockpit/FilaCartao importarem de lá (só export, zero mudança visual: tests/central-comando-lancamento.test.tsx continua passando).

**Páginas:** pipeline (aba Fechamento); reserva; meus-65; /atendimento (Volume); /cadencia (Fila do Dia e Painel); /discador; /reativacao; /higiene-funil; financeiro/fechamento; ranking; meu-funil; /projetos-materiais; oferta-ativa.index; oferta-ativa.nova; oferta-ativa.$ofertaId; /simuladores; /presenca; leads-landing.

### CartaoPrincipal (molde do FilaCartao solto do tipo FilaUnica)

**Para quê.** Um cartão rounded-2xl com título em font-display, subtítulo, um número grande (anel ou valor), até 3 Numero ao lado, UMA ação navy e um rodapé de notas. É o 'topo que responde como estou agora' da regra 2, pronto para qualquer módulo sem copiar o JSX do FilaCartao.

**Onde já existe.** src/features/fila-unica/fila-cockpit.tsx — FilaCartao (l.251, exportado) está preso a FilaUnica + CarteiraNoCockpit; o cartão navy 'A visita' de src/features/visitas é o outro molde (variante navy). Criar src/components/ui/cartao-principal.tsx com props genéricas e deixar FilaCartao como caso especial por cima dele.

**Páginas:** pipeline (Reta final); meus-65 (placar dos 65); /discador (Sessão); /higiene-funil (Parados); financeiro/fechamento (Caixa do mês); ranking (Meta do mês); meu-funil (Onde o funil vaza); oferta-ativa.index (Sua próxima lista); oferta-ativa.nova (Leads encontrados, sticky); /simuladores (Fluxo do cliente, navy); /projetos-materiais (Prontos para a prateleira); /presenca (Hoje, corretor); /meu-perfil (quem você é); leads.$leadId (Agora); academia/progresso (Seu nível); /vitrine e /match (Fecha até R$).

### Painel lateral (um só, rounded-2xl)

**Para quê.** Os 'no máximo 3 painéis curtos' da regra 4. Hoje há dois Painel diferentes: um local e não exportado na Fila (rounded-2xl, título + sub) e um exportado no Ranking (rounded-xl, ícone + descrição + ação). Unificar num componente com titulo, sub, acao e children, e fazer os dois lugares usarem.

**Onde já existe.** src/features/fila-unica/fila-lateral.tsx — Painel (l.44, local) e Caixa (l.138, local); src/features/ranking/ranking-ui.tsx — Painel (l.161, exportado, rounded-xl). Criar src/components/ui/painel.tsx e reexportar dos dois arquivos para não quebrar imports.

**Páginas:** bolsao; /cadencia; /tarefas; /agendamentos; /reativacao; /painel-gestor e /relatorios (insights); /meu-raio-x; /distribuicao (Visão); /presenca; /configuracoes (Equipes); /meu-perfil; financeiro/fechamento; meu-funil (plano do mês); academia/gestao.index; academia/gestao.corretor.$corretorId; leads.$leadId; /vitrine (Cliente na mão); /mensagens (lista).

### VendoDeOutro ('Vendo a base de Fulano · voltar')

**Para quê.** Quando a gestão abre a tela de um corretor por ?corretor=, dizer de quem é e oferecer voltar. Responde ao 'cada gerente precisa visualizar também' sem criar tela nova.

**Onde já existe.** src/features/fila-unica/fila-unica-page.tsx l.329-340 — bloco `fila-de-outro`, JSX inline. Extrair para src/components/vendo-de-outro.tsx (nome, rótulo 'a fila/a base/os 65', link de volta).

**Páginas:** reserva; meus-65; fila (já usa, passa a importar); leads-por-corretor (origem dos links 'Ver os 65' e 'Minha base').

### SeloAoVivo

**Para quê.** O '● ao vivo' ao lado das abas, só onde o dado se atualiza sozinho (regra registrada na Fase 9).

**Onde já existe.** src/routes/_authenticated/painel-gestor.tsx l.228-237 — span inline com title; virar src/components/ui/selo-ao-vivo.tsx.

**Páginas:** /painel-gestor (aba Dia, já usa); ranking (refetch de 60 s).

### FiltrosMenu (filtros atrás de um botão com resumo em texto)

**Para quê.** Regra 5: busca visível, o resto atrás de 'Filtros (2)' com o estado resumido ('ago–out · todos · Meta Ads'). Acaba com a linha de 3 Selects acima de cada lista.

**Onde já existe.** src/components/ui/filter-bar.tsx (persistente no desktop, recolhe no celular), o drawer de Filtros da ConsultaView em src/features/atendimento/consulta-view.tsx, src/components/ui/dropdown-menu.tsx (checkbox items). Criar FiltrosMenu em src/components/ui/filtros-menu.tsx sobre Popover/DropdownMenu + contador.

**Páginas:** leads-por-corretor; leads-landing; /tarefas; /agendamentos; /painel-gestor (Funil: de/até/corretor/origem); /relatorios; /higiene-funil (os 2 switches); /projetos (catálogo); /vitrine; /mapa-lojas; /links-uteis; /match; lixeira (tipo); oferta-ativa.$ofertaId (etapa); comissoes (status/beneficiário); /distribuicao (Filas).

### AcoesLinha (menu '…' por linha)

**Para quê.** Ações secundárias de cada linha num único menu, deixando uma ação visível. Mata o 'Editar + Lixeira + Transferir sempre visíveis' em cada item.

**Onde já existe.** src/features/comissoes/comissoes-page.tsx l.90 — AcoesLinha é função local; o DropdownMenu de ações de oferta-ativa.$ofertaId (l.533-592) é o outro molde. Extrair para src/components/ui/acoes-linha.tsx (itens + item destrutivo com AlertDialog).

**Páginas:** leads-por-corretor; /tarefas; /templates; financeiro/fechamento; /metas; /links-uteis; /projetos (catálogo); /mapa-lojas; oferta-ativa.index; /configuracoes (Pessoas); duplicatas; /mensagens; leads.$leadId; academia/gestao.corretor.$corretorId; /agendamentos (remover com AlertDialog, não confirm()).

### CabecalhosDeSecao aplicado uma vez por hub

**Para quê.** Já existe e resolve de uma vez todos os 'dois títulos empilhados' e o eyebrow dourado duplicado: envolver o conteúdo das abas do hub e cada PageHeader interno vira h2 de seção com as mesmas ações. Foi o truque da Fase 8 no /financeiro.

**Onde já existe.** src/components/page-header.tsx l.10 — CabecalhosDeSecao (exportado). Não se constrói nada; é um wrapper por hub.

**Páginas:** /painel-gestor (Relatórios, Metas, Leads por corretor); /configuracoes (Corretores, Equipes, Templates, Duplicatas, Lixeira); /agendamentos (Tarefas); /cadencia (Fila do Dia, Kanban, Painel); /distribuicao (Ajustes: Política, Configurações, Auditoria); ranking (Conquistas); academia/gestao.index; /projetos/$projetoId (abas); /match (Buscador IA); academia/conteudo.$codigo (Aulas, Questões).

### Tokens de intenção no lugar de cor crua

**Para quê.** Regra 6: navy + dourado, cor só por intenção. Trocar emerald/amber/rose/slate/azul-600/aviso-500/laranja-500 e var(--chart-_) por INTENT_BADGE, text-success/warning/destructive e gold-_.

**Onde já existe.** src/lib/status-tones.ts (INTENT_BADGE, INTENT_BADGE_BORDERED), tokens gold-* e success/warning/destructive em src/styles.css. Nada a construir; é uma varredura por grep.

**Páginas:** meus-65 (ACAO_TOM); reserva; bolsao; leads-landing; duplicatas; /higiene-funil; /painel-gestor e /relatorios (SituacaoAgora, gráficos); ranking e conquistas (amber → gold); academia (emerald em 5 telas); /vitrine e /match (exito/amber); /meu-raio-x (raio-x-blocos.tsx, vale também para RaioXCorretor); /meu-funil (barras); /distribuicao.

### Regra do shell: sem wrapper de padding nem max-w próprio

**Para quê.** O shell já dá 'mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8' a toda página; as que repetem p-4 md:p-6 ou max-w-7xl ficam com padding dobrado em relação à Fila Única. É uma regra de revisão de PR, não um componente — vale pôr no README do redesign.

**Onde já existe.** src/routes/_authenticated/route.tsx l.142 (o Outlet com o padding). Página de referência: src/features/fila-unica/fila-unica-page.tsx usa só space-y-3 md:space-y-4.

**Páginas:** leads-por-corretor; /metas; /projetos (catálogo); /projetos/$projetoId; /projetos-materiais; /vitrine; /mapa-lojas; /simuladores; /simulador-amortizacao; financeiro/fechamento; /higiene-funil; as 9 rotas da Academia.

### components/mapa (GrupoFiltro, Chip, Camada, ListaLojas, menu de camadas)

**Para quê.** Vitrine e Mapa de Lojas duplicam as mesmas peças locais e o mesmo layout lista + mapa. Extrair uma vez e as duas telas ficam iguais (mapa primeiro no celular, camadas num menu no canto do mapa).

**Onde já existe.** src/routes/_authenticated/mapa-lojas.tsx (ListaLojas, GrupoFiltro/Chip/Camada locais) e src/routes/_authenticated/vitrine.tsx (cópias). Criar src/components/mapa/ e mover as páginas para src/features/vitrine e src/features/lojas.

**Páginas:** /vitrine; /mapa-lojas.

### PassosDoModulo + ProgressoObrigatorios (Academia)

**Para quê.** A linha de 5 passos da trilha (Trilha → Aula → Quiz → Prática → Certificado) e o quadro 'x de y obrigatórios' viram componentes para a tela do módulo, a ficha do corretor na gestão e o progresso — hoje só a trilha mostra.

**Onde já existe.** src/features/academia/trilha-page.tsx — TrilhaDoCorretor (l.81, função local) e o card 'Módulos obrigatórios' (l.201-216, JSX inline); regra em src/features/academia/passos-trilha.ts (passosDoModulo) e estado-modulo.ts. Precisa de fallback quando status é null (módulo nunca aberto).

**Páginas:** academia/modulo.$codigo.index; academia/gestao.corretor.$corretorId; academia/progresso; academia (trilha, passa a importar).

### Cartão 'Fecha até' + RendaCliente + adaptador do ProdutoCard

**Para quê.** Uma só pergunta de renda em todo o módulo 07 (hoje há quatro formulários: Match passo 1, BuscadorIA, SimuladorCliente da Vitrine e RendaCliente da prateleira) e um só cartão de 'compra até R$ X · faixa · parcela'.

**Onde já existe.** src/features/projetos/renda-cliente.tsx (pronto); src/features/visitas/briefing-visita.tsx — PotencialDeCreditoCard recebe { lead: LeadBriefing } e calcula por dentro: criar variante que receba PoderDeCompra (src/lib/vitrine/poder-de-compra.ts) ou ResultadoOrcamento (src/lib/orcamento.ts); src/features/projetos/produto-card.tsx recebe ItemPrateleira — escrever adaptador ProjetoRow/planilha → ItemPrateleira.

**Páginas:** /vitrine; /match; /projetos (catálogo, card enxuto).

## 3. As fases

### Fase 1 — Fundação das peças comuns + o que custa pouco e muita gente abre

- (peças) placar, CartaoPrincipal, Painel, VendoDeOutro, SeloAoVivo, FiltrosMenu, AcoesLinha — extraídos sem mudar a Fila Única
- comissoes (aba do /financeiro): filtros numa linha discreta, VendasGestaoCard atrás de 'Ver vendas', Totais no rodapé sem repetir VGV, descrição curta
- reserva (Minha base): placar no lugar da frase, chips por motivo viram filtro, aviso único de 'resgate fechado' no lugar de 50 botões, VendoDeOutro para a gestão
- meus-65: PageHeader com eyebrow, placar com o mesmo anel da Central, INTENT_BADGE no lugar de ACAO_TOM, EmptyState/QueryErrorState, VendoDeOutro
- oferta-ativa.$ofertaId: seta fora do título, 3 StatTiles, faixa verde sem emoji, chips de etapa atrás de Filtros, WhatsApp como ação da linha
- academia/modulo.$codigo.aula.$ordem: PageHeader com eyebrow explícito, StickyActionRail só no celular, sem wrapper
- /simulador-amortizacao: LeituraComercial sobe, 3 StatTiles no lugar dos 3 Kpi-eco, comparativo atrás de 'Ver comparativo'
- /projetos-materiais: um cartão 'Prontos para a prateleira N de M' no lugar de 4 tiles + progress, 'Colar lista' navy

**Por que nesta ordem.** As peças têm de existir antes de qualquer página grande; e estas sete telas são P (horas) com impacto diário — comissões é o que todo corretor abre toda semana e a gestão todo dia pelo badge; Minha base e Meus 65 são a regra dos 65 que o corretor vê todo dia; a lista da Oferta Ativa roda todo dia em campanha. Validam as peças novas em telas pequenas antes de usá-las nas grandes.

**Esforço.** M — 4 a 5 dias, um PR (~20 arquivos: 7 novos em components/ui, 8 páginas)

**Risco e o que não muda.** fila-cockpit.tsx e fila-lateral.tsx só ganham export/reexport — nenhuma mudança visual na Fila Única (tests/central-comando-lancamento.test.tsx tem de passar sem edição). Meus 65: manter os data-testid meus-65-placar/lista/linha/erro/sem-teto de tests/em-atendimento-fatia2.test.tsx e fatia5; a contagem X/65 e o tom (lotado) continuam vindo de use-em-atendimento, só muda o desenho. Minha base: a porta fechada (porta_fechada_use_lote) é regra do banco — a tela só passa a avisar antes do clique, não muda o resgate. Comissões: tests/comissoes.test.ts não trava descrição nem filtros; não mexer nos escopos dos Totais.

### Fase 2 — Carteira e agenda do corretor (o que ele abre todo dia depois da Fila)

- pipeline (+ /kanban e /radar herdam): título fixo 'Kanban', parágrafo de instrução vira sr-only, linha de 3–4 números do funil, aba Fechamento com CartaoPrincipal 'Reta final' e linha enxuta (taxa histórica em tooltip, rodapé em 'Ver como o índice é calculado')
- /agendamentos: título antes das abas no celular, 'Novo agendamento' única ação, cartão Hoje (AgendaDoDiaCard/resumoDoDia) com confirmar · validar · remarcar, lista por padrão no celular, filtros atrás de FiltrosMenu, lateral A validar / Amanhã, remoção com AlertDialog
- /tarefas (mesmo hub): 3 números Vencidas · Hoje · Esta semana, quick-add como linha navy, lista agrupada Vencidas → Hoje → Depois → Sem data, Adiar/Editar no AcoesLinha, concluídas atrás de 'Ver concluídas', lateral AgendaDeHoje
- /atendimento (+ /blitz herda): frase curta, pílula Volume/Consulta, 3 números com dono, VolumeView troca o Card pelo ProximoLeadCard da Prospecção, Consulta em EntityRow com a contagem como título
- /mensagens: frase curta, contagem 'N aguardando resposta' como título da lista, thread em flex-1, mestre-detalhe no celular com voltar, 'Marcar tratada' no menu

**Por que nesta ordem.** É o módulo 03 inteiro fora da Base de leads (já feita na Fase 4 do Lançamento): Kanban, Agenda e Tarefas têm badge na sidebar e o corretor passa neles todo dia; o Fechamento é o que o ⌘K 'Reta final' abre na segunda quinzena. O esforço é M por tela e as peças da Fase 1 já cobrem o topo de todas; /mensagens entra porque divide o módulo e as peças (EntityRow, Painel), embora seja de uso baixo até o provedor ligar.

**Esforço.** G — 1,5 semana, um PR (~15 arquivos de feature, 2 rotas)

**Risco e o que não muda.** Pipeline: o atalho ⌘K 'Reta final' (sistemas.ts:765-771) e o /radar dependem de ?tab=fechamento — manter o search param; o cartão do Kanban e o alvo de 44 px do 'Próximo passo' são decisão travada (tests/final-regressions.test.ts) e o fio de cor por coluna fica; os badges por coluna continuam como contagem, só perdem peso. Agenda: trocar tel: por useLigarLead (3C Plus) muda o que acontece ao clicar em Ligar — alinhar com o dono antes, não é regra de negócio mas é comportamento; a validação de visita (realizada/não veio) é a mesma RPC do hub. Tarefas: o quick-add grava sem data_vencimento (tarefas-page.tsx:225) — o agrupamento ganha o balde 'Sem data' em vez de mudar o insert; o badge tarefasVencidas da sidebar não muda de conta. Mensagens: tests/mensagens-central.test.ts lê agruparConversas — não mexer no derive.

### Fase 3 — Dossiê do lead e follow-up (o cliente um a um)

- leads.$leadId: PageHeader único com a acaoSugerida como ação navy, grid cartão 'Agora' (ScoreRing + próxima ação + riscos + trilha de etapas) | lateral de 3 Painel (Resumo da Sami, Contexto absorvendo LeadStatusCards e HistoricoResponsaveis, cartão situacional SDR/Análise de crédito), Timeline como corpo padrão + 6 abas, EspelhoLeadCard no menu '…', sem cores de módulo nem '← Voltar'
- /cadencia: um PageHeader 'Cadência', Fila do Dia / Kanban / Painel como títulos de seção, linha de 3–4 números da fila, LinhaDaFila com badges enxutos, lateral Etapas + Templates, Kanban nas colunas do leads-kanban-board, Painel da gestão com 3–5 números do time + TabelaCorretores como lista e Resposta/Lotes/Motor atrás de 'Ver análise'; CardFase0 (admissão) vai para a aba 'Config da régua'
- /reativacao: frase curta, 3 números (hoje · em descanso · reativados 30 d), lista em EntityRow com horários como chips, 'Em descanso' como Painel lateral

**Por que nesta ordem.** A ficha do lead é a tela mais aberta do CRM (Fila, Kanban, Agenda, SDR e Sami abrem nela) e é a nota 2 com mais 'dado em dois lugares'; a Cadência é a manhã do corretor com lead novo e o Painel da cadência é a cobrança do gestor. São dois G com muitos testes — por isso vêm depois das peças estarem provadas em duas fases, e sozinhos num PR.

**Esforço.** G — 2 semanas, um PR (~18 arquivos; se o revisor achar grande, a costura natural é dossiê de um lado e cadência + reativação do outro)

**Risco e o que não muda.** Dossiê: manter goToStage, modais, SdrLeadCard, AnaliseCreditoCard (props onRegistrarVenda/onNovaAnalise de tests/analise-credito-fluxo.test.ts), StickyActionRail com '<span>Ligar</span>/<span>WhatsApp</span>/<span>Próxima etapa</span>' e className 'pb-44 md:pb-0' (tests/responsive-design-system.test.tsx), 'target === "em_atendimento" && !gestao' e executarAcaoSugerida (tests/em-atendimento-fatia3a2.test.tsx), item value 'whatsapp' label 'WhatsApp' (tests/mensagens-central.test.ts), desfechos (fatia2) e testes do SDR — tudo mecânica que não muda. Cadência: mesmas queryKeys ['cadencia:kanban'] e followup_fila_v1; o ⌘K ?tab=painel (ATALHOS_EXTRAS) continua; a cadência de 4 etapas e 10 toques e o cálculo do Painel não mudam — só a composição; CardFase0 só muda de lugar (não de regra). Reativação: 'Em descanso' continua só leitura por decisão registrada.

### Fase 4 — Gestão na mesma visão (a pergunta do dono: a roleta por zona para admin e gerentes)

- /distribuicao: PageHeader + 'Rodar agora' única ação; 4 números com dono no lugar de 10 tiles; a 1ª aba vira grid 3fr/2fr com o FilaZonaCard (a roda e a fila por zona, igual ao painel do SDR) à esquerda e 3 Painel à direita (Filas sem ninguém apto, Últimas decisões, Exceções presas); abas em uma linha (Visão · Filas · Corretores · Exceções · Histórico · Ajustes); Filas com um seletor único no lugar de 3 níveis de abas; textos de manual fora
- /painel-gestor (hub): CabecalhosDeSecao em todas as abas, faixa 'Vendas da empresa' sai, p-6 das páginas embutidas sai; aba Time = 4 números do time + a DataTable de PerformanceView como lista única (absorve 'Em atendimento/teto' e 'perdem a vaga') + 'Regra dos 65' no fim; aba Funil = card Funil (FunilResumo) + ranking 'Onde está travando' + resto atrás de 'Ver análise completa', filtros em FiltrosMenu; MetasPage sai da rota para src/features/metas/
- leads-por-corretor: dentro da aba Time, lista compacta de corretores no molde da FilaEquipe (uma linha por pessoa com X/65, % parada, 'Ver a fila · Ver os 65 · Minha base'), 3–4 números da casa, filtros atrás de FiltrosMenu, 'Transferir N' numa barra fixa ao lado da tabela
- /metas (aba Metas & Ritmo): título de seção com um controle Out/2026 e 'Nova meta'; Ritmo reduzido a 4 números (Meta · Realizado · Projeção com farol · Faltam N ≈ X visitas); lista de metas com 'gap por corretor' fundido; apagar com confirmação
- /presenca: corretor = CheckinCard como cartão principal; gestão = 4 números + quadro por filial + lateral 'Sem check-in' e 'Em casa fora da roleta'; FiliaisConfig vai para Dialog/Configurações

**Por que nesta ordem.** Responde literalmente ao pedido ('onde consigo ter a gestão nessa mesma visão? Como admin. E cada gerente'): o FilaZonaCard já existe e está no padrão, só está escondido como 4ª de 9 abas sob 10 tiles — vira o corpo da Distribuição; e Leads por corretor é o caso mais literal de 'informação espalhada' (100–150 números antes da lista). Vem depois das telas do corretor porque gestão é menos gente, mas antes do BI porque é operação diária (exceções presas, roleta, cobrança do time).

**Esforço.** G — 2 semanas, um PR (~25 arquivos; a costura, se precisar, é distribuição + presença de um lado e painel-gestor + leads-por-corretor + metas do outro)

**Risco e o que não muda.** Distribuição: o FilaZonaCard mostra UMA zona por vez e não recorta pela equipe do gestor — para o gerente de 'Oeste e Leste' é preciso pré-marcar os chips pelas zonas da equipe (gestor-escopo) ou mostrar duas zonas lado a lado: é conteúdo novo pequeno, decidir com o dono; o motor v2, a política e as roletas não mudam; 'Rodar agora' e o token n8n continuam só admin. Painel do gestor: tests/bi-lancamento.test.tsx trava a linha de 5 abas e o selo ao vivo (ficam); /inteligencia repassa de/ate/corretor/origem — o validateSearch do hub continua lendo; o superintendente hoje passa pelo guard mas as abas o tratam como corretor (canSeeAll = admin|gestor) — é decisão de papel para o dono, não para o PR: registrar e implementar o que ele escolher. Metas: tests/metas.test.ts e metas-dia.test.ts travam a conta (pacing), não a tela; mostrar o Ritmo ao superintendente é decisão. Leads por corretor: a transferência em lote continua a mesma RPC; o limite de 2.000 vira rodapé, não some. Presença: agruparQuadro e as colunas (filiais, casa, liberado_gestao, sem_checkin) continuam, só deixam de repetir os dois grupos da lateral.

### Fase 5 — BI, placar e caixa (o que a gestão e o corretor olham para conferir)

- ranking: PageHeader 'Desempenho' + SeloAoVivo + Select de mês + 'Modo TV'; uma linha de abas (Real x Meta · Vendas · Produtividade · Conquistas); fora do Modo TV sai o .arena-header e a classe dark; CartaoPrincipal 'Meta do mês' com AnelMeta + 3 números + 'Sua posição' em dourado; pódio/lista como área principal; os 9/6/8 tiles atrás de 'Ver indicadores'; Conquistas em gold-*
- /relatorios (aba do hub): título de seção com período + corretor + PDF; 7 sub-abas viram Select 'Relatório: Resumo ▾'; topo = ResultadoHero (4 números com delta); Pipeline agora em barras (FunilResumo) no lugar de 9 cards; InsightsPanel vira Painel lateral; SituacaoAgora some; gráficos em navy + dourado
- /meu-raio-x: SeletorPeriodo nas actions, comissões sobem para o topo (5º número ou 1º painel da lateral), um gráfico só + 'Ver mês a mês', carteira no desenho do FunilResumo, paleta de raio-x-blocos.tsx (vale para RaioXCorretor)
- meu-funil: período nas actions, CartaoPrincipal 'Onde o seu funil vaza' + os 5 números 'para 1 venda', funil com FunilResumo, Painel lateral 'O que falta para bater o mês', origem e base importada atrás de 'Ver …'
- /higiene-funil: PageHeader, CartaoPrincipal 'Parados há 5+ dias' com os qualificadores + 'Pastas travadas', switches em FiltrosMenu, fila com seleção + BulkActionBar, tooltips no lugar dos parágrafos
- financeiro/fechamento: título de seção 'Fechamento', CartaoPrincipal 'Caixa do mês' com 'Pagar N aptas' navy, fila de decisão com AcoesLinha, lateral Recebíveis / Sem corretor / Integridade, tabelas atrás de 'Ver …', Conciliação sobe para 5ª aba do hub

**Por que nesta ordem.** É análise e placar: o Ranking roda na TV todo dia (impacto alto) mas é G e mexe em CSS próprio; Relatórios é reunião semanal; Raio-X e Meu Funil são a quinta-feira do corretor; Fechamento é o fim do mês. Tudo de consulta, nada que trave o atendimento — por isso depois das fases de operação, e junto porque dividem FunilResumo, Painel, SeloAoVivo e a paleta dos gráficos.

**Esforço.** G — 2 semanas, um PR (~22 arquivos + 2 CSS do ranking)

**Risco e o que não muda.** Ranking: tests/ranking-page.test.tsx trava o botão 'Modo TV' e o heading 'Meta de vendas — Setembro de 2026' (sobrevivem); o teste de HeroDesempenho em tests/ranking-views.test.tsx:367 cobre componente morto — sai junto; tests/desempenho-hub.test.ts (redirect da Copa) fica; ranking-derive, ranking-campeonato, refetch de 60 s e o portal do Modo TV não mudam; a ordem de desempate (VGV ↓, vendas) vira tooltip, não some. Meu Funil: manter data-testid por-venda-_, meu-funil-diagnostico, meu-funil-plano e role=alert (tests/meu-funil-view.test.tsx) e o onDiagnostico do MeuFunilGlobal (estudo da quinta é a mesma view). Raio-X: tests/raio-x-_.test.ts travam a conta (derive), não a tela; a paleta de raio-x-blocos.tsx também alimenta o PDF do RaioXCorretor — conferir a exportação. Relatórios: canSeeAll para superintendente é a mesma decisão da Fase 4. Fechamento: DialogAcao/TabelaVendas são locais e ficam; a trava de pagamento (apto/beneficiário) é do banco; Conciliação como 5ª aba ainda cabe numa linha (ResponsiveTabs).

### Fase 6 — Projetos, prospecção eventual, Configurações, perfil e Academia (utilitárias e admin)

- /discador: chip de status 3C Plus no cabeçalho, CartaoPrincipal 'Sessão' + 3 números do dia (KpiCard → StatTile), Atendidos como lista principal com 'Assumir e agendar' navy, histórico atrás de 'Ver histórico', parágrafos num 'Como funciona'
- leads-landing: mover para src/features/prospeccao, head na rota, título 'Captação (Landing)', 4 números, DataTable da casa com rótulos legíveis e INTENT_BADGE, filtros em FiltrosMenu
- oferta-ativa.index: CartaoPrincipal 'Sua próxima lista' + 3 números, cards enxutos com AcoesLinha, EmptyState do sistema
- oferta-ativa.nova: PageHeader sem seta, duas colunas com cartão sticky 'Leads encontrados', filtros unificados em pílulas, formulário vai para src/features/prospeccao
- bolsao: caixa explicativa vira 'Ver por quê' (texto preservado), 4 números, lista rounded-2xl com ≤2 badges, Painel 'Como o Bolsão vira carteira'
- /projetos (catálogo): título 'Catálogo completo', 3–4 números de completude, FilterBar + 'Mais filtros', card enxuto com Switch/Editar/Webhook no AcoesLinha, sem p-6
- /projetos/$projetoId: PageHeader com titleAddon, hero como cartão principal, 5 tiles descem para a aba Unidades, abas em CabecalhosDeSecao, sem p-6
- /vitrine e /mapa-lojas: components/mapa compartilhado, RendaCliente + cartão 'Fecha até', lista + mapa, FilterBar, camadas no canto do mapa, comissão só com mostrarComissao, 'Perto de mim' navy no cabeçalho
- /simuladores: frase curta, 'Exportar PDF' única ação navy, CartaoPrincipal navy 'Fluxo do cliente' com a mensal em destaque, Kpi → StatTile nas 4 abas, Regras recolhidas
- /match: página inteira — RendaCliente + cartão 'Compra até' + lista ProdutoCard com selo Cabe/Não cabe; Buscador IA sob CabecalhosDeSecao lendo a mesma renda; decidir o dono (módulo 07 ou só IA)
- /links-uteis: lista compacta por categoria (linha inteira abre e registra o acesso), AcoesLinha para admin, aba Gerenciar some
- /configuracoes (+ duplicatas, lixeira, /templates, destino de /corretores e /equipes): 6 abas numa linha, CabecalhosDeSecao em tudo, Pessoas com 'Convidar' no header e Pausar/Bloquear no AcoesLinha, Equipes como Painel lateral, Qualidade com 3 números + Duplicatas como lista + Lixeira atrás de 'Ver lixeira' com Select de tipo, Integrações um card por integração com ação real
- /meu-perfil: cartão principal (avatar, nome, estado do check-in e 'apto em N roletas' só para corretor), formulário com um Salvar, senha em Dialog, lateral Notificações · Google Agenda · Sua vez nas roletas
- academia: conteudo.index (3 números + 'Precisam de revisão' primeiro), conteudo.$codigo (checklist de publicação com a regra da RPC), modulo.$codigo.index (PassosDoModulo + 'Continuar'), quiz (ScoreRing no resultado, erradas primeiro), progresso (ProgressoObrigatorios), gestao.index (4 números clicáveis, aba Práticas some, 5 abas, lateral de 3 Painel), gestao.corretor (uma ação navy + 'Mais ações', cartão 'Onde ele está', lateral Práticas/Certificados/Histórico), certificado (só tirar o '← Progresso' e o wrapper)

**Por que nesta ordem.** São telas de uso ocasional (cadastro, catálogo, simulação, admin) ou de poucos papéis — o ganho por dia é menor que nas fases anteriores, e quase tudo aqui é 'aplicar as peças' que já existem desde a Fase 1 (CartaoPrincipal, Painel, FiltrosMenu, AcoesLinha, tokens, regra do shell). O Discador entra aqui e não antes porque só quem disca o abre e o esforço é G.

**Esforço.** G — 3 semanas, um PR por decisão do plano (~45 arquivos). É o maior e o mais mecânico; se o revisor pedir, a costura é 'Projetos + Prospecção eventual' | 'Configurações + Perfil + Academia' — mas as peças e as regras já estão fechadas, cada página é só aplicar

**Risco e o que não muda.** Discador: a sessão de discagem (iniciar/parar/um a um/automático) e as RPCs de atendidos não mudam, só a hierarquia; o token continua obrigatório. Bolsão: continua sem botão de puxar (§9 de docs/ops/bolsao-oportunidades-fatia4.md) e o texto do porquê continua existindo atrás de 'Ver por quê'. Projetos: decisões 9/10/11/14/18/22 de docs/revisao-projetos-foco.md (grade densa, comissão só gestão, banner, corredores) seguem — o catálogo ganha o card enxuto, a prateleira não muda; o webhook por projeto continua, só vai para diálogo. Vitrine/Match: a conta (poder-de-compra, orcamento) não muda; a Comissão ganha gate de papel (hoje aparece para todos — alinhar com a decisão 10). Simuladores: tests/simuladores-page.test.tsx trava abas, prefill por URL e troca de aba; simulador-amortizacao-*.test travam conta e PDF. Configurações: gate admin-only vs gestor é decisão do dono (hoje /corretores e /equipes mandam o gestor para 'Acesso restrito'); a whitelist de abas e o redirect 'follow-up' ficam. Academia: tests/academia-telas.test.tsx exige 'Falta 1 aula para liberar o quiz.', 'Aulas (1 de 2)', 'Refazer' e feedback visíveis; tests/academia-quiz.test.tsx exige '100', 'Aprovado. O módulo avança.', 'Correção' e a explicação sem clique (erradas abertas por padrão); tests/academia-gestao-hub.test.tsx exige getByText('Conteúdo') para admin (manter o link no CabecalhosDeSecao de Agora) e as abas por role 'tab' (ABAS_GESTAO e validateSearch mudam juntos); tests/academia-gate-card.test.tsx exige 'Simulação desligada' e 'de 10 leads' — manter os textos ou atualizar o teste no mesmo PR; a RPC academia_publicar_modulo cobra ≥1 aula publicada, ≥5 questões ativas e sem revisão pendente — o checklist mostra exatamente isso. Onboarding do corretor (telas de treino, chave versionada em user_preferences) não é tocado.

## 4. O que já está no padrão (não entra)

- As portas dos 10 módulos já feitas nas Fases 2–11 do Lançamento (referência do padrão, não entram no plano): /fila (Central de Comando), /prospeccao (Bases do dia + próximo lead), /leads (Base de leads, Lista/Kanban), /modo-visita, /follow-up (topo), /sdr, /projetos-foco (prateleira), /financeiro aba Comissões & Aprovação, /painel-gestor aba Dia, /academia (trilha)
- Rotas que são só redirect e herdam do destino — nada a fazer, manter para links e notificações antigas: /kanban → /pipeline; /hoje → /fila; /meu-painel → /fila; /radar → /pipeline?tab=fechamento; /dashboard e /inteligencia → /painel-gestor (com repasse de de/ate/corretor/origem); /copa → /ranking (tests/desempenho-hub.test.ts); /blitz → /atendimento?modo=volume; /corretores e /equipes → /configuracoes?tab=pessoas; /conquistas → /ranking?tab=conquistas; /relatorios e /metas → abas do hub
- comissoes (aba do /financeiro) e oferta-ativa.$ofertaId — já seguem o padrão (nota 4); os retoques de horas listados na Fase 1 são opcionais e não mudam a composição
- O cartão e as colunas do Kanban (leads-kanban-board.tsx) — recompostos na Fase 4 do Lançamento; o que falta no /pipeline é só o topo da página e a aba Fechamento
- FilaZonaCard + RodaDaFila (src/features/roletas/fila-zona-card.tsx) — já no padrão; a Fase 4 deste plano só o promove a corpo da Distribuição
- O formulário da /simulador-amortizacao (card do contrato visível + 'Calculado automaticamente' recolhido) — já segue 'essencial visível, resto atrás de Ver…'; só o topo entra na Fase 1
- academia/modulo.$codigo.quiz no estado 'respondendo' (modo foco: contador, relógio, Progress, enunciado) — está certo e não muda; só 'antes' e 'resultado' entram na Fase 6

## 5. Fora de propósito (de propósito)

- **academia/certificado.$codigo** — É um documento A4 paisagem com CSS de impressão (tudo fora de #certificado-academia fica invisível): PageHeader, placar ou lateral seriam ruído e atrapalhariam o PDF. Só dois reparos de higiene (tirar o '← Progresso' e o wrapper em tela), opcionais.
- **/modo-visita (Fase 6 do Lançamento) e o MercadoMap / LojasMap / VisualizadorPlantas dentro de /vitrine e /mapa-lojas** — São ferramenta de campo e de atendimento com o cliente no telefone: rascunho offline, ditado com consentimento, mapa com pins e plantas. O plano mexe só na moldura em volta (filtros, lista, cabeçalho); o mapa, as camadas e a ficha da visita ficam como estão.
- **Cartão do Kanban e fio de cor por etapa (leads-kanban-board.tsx), telefone/e-mail/prazos no cartão, alvo de 44 px do 'Próximo passo'** — Decisões do dono registradas na Fase 4 do Lançamento e travadas em tests/final-regressions.test.ts. O /pipeline recompõe o topo e o Fechamento; o quadro em si não muda.
- **bolsao — o 'sem botão de puxar' e o texto que explica por quê** — Decisão registrada (§9 de docs/ops/bolsao-oportunidades-fatia4.md): o Bolsão é só consulta e o lead chega pelo lote de 30. A tela entra na Fase 6 só para recompor topo e lista; a regra e o texto continuam (atrás de 'Ver por quê').
- **Contadores e seus donos (X/65, badges da sidebar, VGV no funil, conversão do mês), a ordem dos 10 módulos e a regra dos 2 menus** — O dono pediu padrão visual, não regra nova. Nenhuma fase muda como um número é contado, de onde vem (mesmas RPCs e queryKeys) nem a ordem do registro SISTEMAS_NAV (tests/sistemas.test.ts, tests/cores-modulo.test.ts). O plano só muda onde e com que peso cada número aparece.
- **CardFase0 (admissão do estoque, no Painel da cadência) e FiliaisConfig (cadastro de filiais, em /presenca)** — São ajustes raros de admin que hoje moram em telas diárias; o plano só os move (para 'Config da régua' e para Dialog/Configurações) — o formulário, as validações e as RPCs não mudam.
- **Telas de treino do onboarding do corretor (clientes fictícios)** — Por AGENTS.md: o treino prático grava só a conclusão em user_preferences com chave versionada, e trocar a versão reabre o treino para todos. Nenhuma fase toca nessas telas nem na chave; se alguma peça nova aparecer no treino, é só porque ele reaproveita a tela real.
- **Dialog de detalhe de leads-landing, DialogAcao/TabelaVendas do Fechamento, CorrecaoPratica da Academia, AgendamentoForm, RegistrarContatoDialog, LeadStageMenu/Modals** — Diálogos de trabalho que já estão 'atrás do clique' (regra 3): são densos de propósito e ficam como estão; o plano reposiciona quem os abre, não o que há dentro.

## 6. As 62 rotas, uma a uma

Nota de 0 a 4 (4 = já no padrão; 0 = só redirect ou documento). Esforço P/M/G (horas, dias, semana+).

| Rota                                             | Módulo                                                       | Nota | Esforço | Impacto | O que mais pesa                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------ | ---- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/conquistas`                                    | Nenhum (rota legada) — redireciona para /ranking?tab=conquis | 0    | P       | baixo   | A rota não é uma tela: beforeLoad faz redirect para /ranking?tab=conquistas. Nota 0 (não se aplica).                                                            |
| `/corretores`                                    | Nenhum (rota legada de compatibilidade) — redireciona para C | 0    | P       | baixo   | A rota não é uma tela: beforeLoad faz redirect para /configuracoes?tab=pessoas. Nota 0 (não se aplica).                                                         |
| `/dashboard`                                     | 09 · BI · Relatórios (redirect → /painel-gestor?tab=relatori | 0    | P       | baixo   | Rota é só redirect de compatibilidade (beforeLoad → /painel-gestor?tab=relatorios); não há tela para avaliar. A composição do destino está nas entradas 'rela…  |
| `/equipes`                                       | Nenhum (rota legada de compatibilidade) — redireciona para C | 0    | P       | baixo   | A rota não é uma tela: beforeLoad faz redirect para /configuracoes?tab=pessoas. Nota 0 (não se aplica).                                                         |
| `/hoje`                                          | Central de Comando (01) — destino do redirect (/fila); ?tab= | 0    | P       | baixo   | A rota não tem tela: a página Hoje foi retirada em 12/09/2026 e o arquivo é só um beforeLoad com redirect para /fila (ou para o Painel do Gestor na antiga ab…  |
| `/inteligencia`                                  | 09 · BI · Relatórios (redirect → /painel-gestor com tab funi | 0    | P       | baixo   | Rota é só redirect de compatibilidade (beforeLoad mapeia funil/gargalos → tab=funil, performance → tab=time, resto → tab=relatorios, preservando os filtros d…  |
| `/meu-painel`                                    | 01 · Central de Comando (redirect → /fila)                   | 0    | P       | baixo   | Rota é só redirect de compatibilidade (beforeLoad → /fila); não há tela. O destino (FilaUnicaPage: FilaCartao + FunilResumo + lista + FilaLateral) já está no…  |
| `/radar`                                         | 03 · Gestão de Carteira (redirect → /pipeline?tab=fechamento | 0    | P       | baixo   | Rota é só redirect de compatibilidade (beforeLoad → /pipeline com tab=fechamento); não há tela.                                                                 |
| `academia/certificado.$codigo`                   | Academia (Módulo 10) · documento imprimível (sem seção própr | 0    | P       | baixo   | Não se aplica: é um documento A4 paisagem com CSS de impressão (body * { visibility: hidden } fora de #certificado-academia, linhas 57–62); PageHeader, placa…  |
| `blitz`                                          | 03 · Gestão de Carteira (dominioExtra /atendimento; rota sem | 0    | P       | baixo   | Rota só de redirect (beforeLoad → /atendimento?modo=volume), sem tela própria — não se aplica ao padrão. O destino (Atender: PageHeader 'Atender' + descrição…  |
| `copa`                                           | 09 · BI · Relatórios (seção Desempenho)                      | 0    | P       | baixo   | Rota só de redirect (beforeLoad → /ranking, search {}), sem componente nem tela própria — não se aplica ao padrão. A tela de destino é avaliada na entrada 'r…  |
| `kanban`                                         | carteira (03) — redirect de compatibilidade                  | 0    | P       | baixo   | A rota não tem tela: `beforeLoad` lança `redirect({ to: "/pipeline" })`. Tudo o que renderiza é a página /pipeline — avaliada na entrada `pipeline`.            |
| `/match`                                         | carteira (Gestão de Carteira, Módulo 03) por dominioExtra —  | 1    | M       | baixo   | Dois títulos empilhados na aba Buscador IA: PageHeader 'Match Cliente ↔ Empreendimento' e, dentro da aba, o h2 'Buscador de Projetos por IA' (text-xl font-bo…  |
| `ranking`                                        | 09 · BI · Relatórios (seção Desempenho)                      | 1    | G       | alto    | Sem PageHeader: DesempenhoPage renderiza direto um <Tabs> (Ranking \| Conquistas). Não há título do módulo nem eyebrow MÓDULO 09 — é a única página do grupo s… |
| `/atendimento`                                   | Gestão de Carteira (03) — rota viva por dominioExtra, sem se | 2    | M       | medio   | PageHeader 'Atender' com descrição de manual ('As filas por prioridade agora são a Fila Única') e um botão 'Fila Única' no cabeçalho que duplica a seção da s…  |
| `/cadencia`                                      | Follow-Up (05) — seções 'Cadência (lead novo)' e 'Kanban da  | 2    | G       | alto    | Três cabeçalhos de página diferentes na mesma rota ('Fila do Dia', 'Kanban da cadência', 'Painel da cadência'), cada um com descrição longa de manual ('Cumpr…  |
| `/configuracoes`                                 | Configurações (sistema 'configuracoes', rodapé da sidebar; n | 2    | G       | medio   | 8 abas visíveis (Integrações, Gestão, Pessoas, Estoque, Campanhas, Comunicação, Qualidade, Preferências; a whitelist ainda tem 'follow-up' só para redirect) …  |
| `/discador`                                      | Prospecção (02) — seção 'Discador' (roles OPERACAO; o SDR nã | 2    | G       | medio   | Quatro blocos empilhados antes de qualquer lista: PageHeader com descrição longa, Card 'Meu 3C Plus' (ConectarTcplus — card de setup que fica sempre no topo …  |
| `/distribuicao`                                  | Prospecção (Módulo 02) — seção Distribuição; eyebrow sai 'Mó | 2    | G       | alto    | Topo com 10 StatTiles soltos em StatGrid xl:grid-cols-5 (duas linhas): Distribuídos hoje, Aguardando distribuição, Fila de exceções, Sem atendimento, Erros 2…  |
| `/meu-perfil`                                    | Nenhum módulo (nenhuma seção nem dominioExtra em sistemas.ts | 2    | M       | medio   | Sete cartões empilhados numa coluna max-w-2xl com o mesmo peso: AvatarUploadCard, CheckinCard, MinhaElegibilidadeCard, PushOptInCard, GoogleCalendarCard, 'Da…  |
| `/painel-gestor`                                 | 09 · BI · Relatórios (seção Operação — porta do módulo para  | 2    | G       | alto    | Topo do hub: logo abaixo do PageHeader 'BI · Relatórios' há a faixa 'Vendas da empresa · Mês / Ano / Total' (rounded-md border, fora do estilo rounded-2xl/bo…  |
| `/projetos (projetos.index)`                     | docs-projetos (Módulo 07 · Documentação & Projetos) — seção  | 2    | M       | baixo   | PageHeader com título antigo 'Projetos / Empreendimentos' (barra, dois nomes) e description de manual ('Catálogo de empreendimentos. Cada projeto tem seu pró…  |
| `/relatorios`                                    | 09 · BI · Relatórios (redirect → /painel-gestor?tab=relatori | 2    | G       | medio   | A rota é só redirect de compatibilidade (beforeLoad → /painel-gestor?tab=relatorios); a nota é da aba que ela abre: InsightsPanel + RelatoriosView.             |
| `/vitrine`                                       | docs-projetos (Módulo 07) — seção 'Vitrine (mapa)'; com ?lea | 2    | G       | medio   | Título 'Mapa de Mercado' diverge da sidebar ('Vitrine (mapa)') e a description é uma frase de manual de ~30 palavras.                                           |
| `academia/gestao.corretor.$corretorId`           | Academia (Módulo 10) · Gestão da Academia › ficha do correto | 2    | M       | medio   | Quatro botões de ação no PageHeader (Atribuir módulo navy, Roleplay presencial, Habilitado manual, Promover a Mestre — linhas 159–182): ação principal não é …  |
| `financeiro/fechamento`                          | 08 · Assinaturas & Comissões                                 | 2    | G       | medio   | A rota em si é só redirect para /financeiro?tab=fechamento (ok). A tela real é a aba Fechamento do hub: o hub já tem o PageHeader do módulo + CabecalhosDeSec…  |
| `leads-por-corretor`                             | bi (09 · BI · Relatórios) — seção "Operação" (/painel-gestor | 2    | M       | alto    | A rota é só redirect para `/painel-gestor?tab=time`; o conteúdo (LeadsPorCorretorPage) é o 4º bloco da aba Time, depois de SimulacaoRegra65, RevisaoRegra65 e…  |
| `leads.$leadId`                                  | Gestão de Carteira (Módulo 03) ou Prospecção (Módulo 02), re | 2    | G       | alto    | O mesmo dado em dois ou três lugares: temperatura aparece no titleAddon do PageHeader (linha 287), de novo nos chips do 'Resumo executivo' (TemperatureChip, …  |
| `/agendamentos`                                  | Gestão de Carteira (03) — seção 'Agenda' (badge agendaHoje)  | 3    | M       | alto    | No celular a TabsList Agenda/Tarefas vem antes do PageHeader; título 'Agendamentos' difere do rótulo 'Agenda' da sidebar.                                       |
| `/higiene-funil`                                 | 09 · BI · Relatórios (seção Higiene do Funil; atrás da flag  | 3    | M       | baixo   | Não usa PageHeader: HigienePage monta um <header> próprio com <h1 class='text-2xl font-semibold'> e o ícone Broom dentro do título — sem eyebrow 'Módulo 09 ·…  |
| `/links-uteis`                                   | docs-projetos (Módulo 07) — rota viva sem seção (dominioExtr | 3    | M       | baixo   | PageHeader ok (um título) mas com description de manual ('Centralize portais, tabelas, grupos e materiais de apoio para o time encontrar tudo em um lugar só.…  |
| `/mapa-lojas`                                    | docs-projetos (Módulo 07) — seção 'Mapa de Lojas'            | 3    | M       | medio   | PageHeader ok (um título, uma frase em duas orações), mas as duas ações do cabeçalho são secundárias (Link para o cliente, Tela cheia) e a ação que resolve o…  |
| `/metas`                                         | 09 · BI · Relatórios (redirect → /painel-gestor?tab=metas; o | 3    | M       | medio   | Rota é redirect, mas o arquivo contém e exporta MetasPage (importada por painel-gestor.tsx) — componente de página dentro de rota de redirect.                  |
| `/presenca`                                      | Central de Comando (Módulo 01) via dominioExtra ['/presenca' | 3    | M       | medio   | Cadastro misturado com operação: FiliaisConfig (um formulário por filial com endereço, coordenadas, raio, switch Ativa, 'Buscar pelo endereço', 'Ver no mapa'…  |
| `/projetos-materiais`                            | docs-projetos (Módulo 07) — seção 'Materiais (gestão)'       | 3    | P       | baixo   | Topo com 5 números sem dono único: 4 StatTiles (Com book, Com tabela, Com capa, Com preço — cada um com hint 'de N empreendimentos' / 'Foto do card na pratel…  |
| `/projetos/$projetoId (ficha do empreendimento)` | docs-projetos (Módulo 07) — transversal da jornada quando ab | 3    | M       | medio   | Não usa PageHeader: ProjetoHero é um hero navy com h1 próprio (fonte Sora, preço dourado, 4 chips, até 3 botões Copiar mensagem/Book/Tabela) — sem eyebrow 'M…  |
| `/reativacao`                                    | Pré-venda (SDR) (06) — seção 'Reativação' (o sistema é roles | 3    | M       | medio   | Descrição do PageHeader é manual ('…volta aqui depois da janela de descanso — com a renda e os horários já tentados à vista').                                  |
| `/simulador-amortizacao`                         | docs-projetos (Módulo 07) — rota viva sem seção (dominioExtr | 3    | P       | baixo   | Description é lista de recursos ('SAC e PRICE mês a mês, com TR, seguros, taxa de administração, fase de obra e amortização com FGTS.') e o cabeçalho tem trê…  |
| `/simuladores`                                   | docs-projetos (Módulo 07) — seção 'Simuladores'              | 3    | M       | medio   | CabecalhoSimuladores: PageHeader 'Simuladores' com description de manual em duas frases ('…As mensais contam a partir do mês do ato: cada mês sem fechar é um…  |
| `/tarefas`                                       | Gestão de Carteira (03) — seção 'Tarefas' (a rota /tarefas s | 3    | M       | medio   | A rota /tarefas é só redirect (deep-link); a tela real é a aba 'tarefas' do hub /agendamentos. No celular a linha de abas Agenda/Tarefas (TabsList md:hidden)…  |
| `academia/conteudo.index`                        | Academia (Módulo 10) · seção Conteúdo                        | 3    | P       | baixo   | Botão ghost '← Gestão' solto acima do PageHeader (linhas 83–87): a trilha do header (Módulos / Academia / Conteúdo) já faz esse caminho e 'Conteúdo' é seção …  |
| `academia/gestao.index`                          | Academia (Módulo 10) · seção Gestão da Academia              | 3    | M       | medio   | Sem placar no topo: 'quantas práticas esperam correção', 'quantas atribuições venceram', 'quantos parados há 7+ dias' só aparecem como '(N)' no título de cad…  |
| `academia/modulo.$codigo.index`                  | Academia (Módulo 10) · dentro de Minha trilha                | 3    | M       | medio   | O topo não responde 'onde estou neste módulo': a linha de 5 passos (Trilha→Aula→Quiz→Prática→Certificado) que a trilha (/academia) já mostra em TrilhaDoCorre…  |
| `academia/progresso`                             | Academia (Módulo 10) · seção Meu progresso                   | 3    | P       | baixo   | O topo não diz 'como estou agora': nível atual, próximo nível e 'x de y obrigatórios' não aparecem — estão só no card 'Módulos obrigatórios' da trilha (/acad…  |
| `bolsao`                                         | central-comando (01 · Central de Comando) — seção "Bolsão"   | 3    | P       | baixo   | Texto de manual logo abaixo do título: uma caixa com ícone Eye e 4 linhas explicando por que não há botão de puxar ("Por enquanto o Bolsão é só consulta. Pux…  |
| `duplicatas`                                     | configuracoes — bloco da aba Qualidade de /configuracoes     | 3    | P       | baixo   | A rota é só redirect para `/configuracoes?tab=qualidade`; o conteúdo (DuplicatasPage) é o 2º bloco da aba, entre SamiQQualidadeCard e LixeiraPage — três bloc…  |
| `leads-landing`                                  | prospeccao (02 · Prospecção) — seção "Captação (Landing)"    | 3    | M       | medio   | Toda a tela mora no arquivo da rota (sem componente em src/features); a rota não define `head` — a aba do navegador fica sem título.                            |
| `lixeira`                                        | configuracoes — bloco da aba Qualidade de /configuracoes     | 3    | P       | baixo   | A rota é só redirect para `/configuracoes?tab=qualidade`; o conteúdo (LixeiraPage) é o 3º bloco da aba, abaixo do SamiQ e das Duplicatas.                       |
| `meu-funil`                                      | 09 · BI · Relatórios (seção Meu Funil)                       | 3    | M       | medio   | PageHeader ok (título 'Meu Funil', frase curta, eyebrow MÓDULO 09 · BI · Relatórios automático). A rota é fina e a view é a mesma do estudo da quinta.          |
| `meus-65`                                        | central-comando (01 · Central de Comando) — seção "Meus 65"  | 3    | M       | medio   | Não usa PageHeader: é um `<header>` manual com `h1 font-display text-2xl font-semibold` — sem o eyebrow "Módulo 01 · Central de Comando", com título menor qu…  |
| `oferta-ativa.index`                             | 02 · Prospecção (seção Oferta Ativa)                         | 3    | M       | medio   | PageHeader ok (título 'Oferta Ativa', uma frase, 'Nova Lista' navy só para gestão) e abas Ativas \| Arquivadas numa linha com contadores — o cabeçalho e o men… |
| `oferta-ativa.nova`                              | 02 · Prospecção (seção Oferta Ativa)                         | 3    | M       | baixo   | O PageHeader está dentro de uma linha flex com o botão '← Voltar' (ghost icon) à esquerda: o eyebrow MÓDULO 02 · Prospecção e o título ficam deslocados para …  |
| `pipeline`                                       | carteira (03 · Gestão de Carteira) — seção "Kanban"          | 3    | M       | alto    | Título do PageHeader muda com `?fase`: "Prospecção" (fase=prospeccao), "Gestão de Carteira" (fase=carteira) ou "Kanban". Com o eyebrow automático sai "Módulo…  |
| `/mensagens`                                     | Gestão de Carteira (03) — rota viva por dominioExtra, sem se | 4    | M       | baixo   | Descrição do PageHeader é texto de manual ('em modo simulado: cada envio registra na conversa e abre o WhatsApp com o texto pronto') — o composer já diz isso…  |
| `/meu-raio-x`                                    | 09 · BI · Relatórios (seção Meu Raio-X — home do módulo para | 4    | M       | medio   | Linha solta abaixo do PageHeader mistura o SeletorPeriodo (pílula 3/6/12 meses + Personalizado) com uma frase de manual à direita: 'O seu dia, em ordem de pr…  |
| `/templates`                                     | Configurações — aba 'Comunicação' (a rota /templates só redi | 4    | P       | baixo   | Dois títulos de página empilhados: o PageHeader 'Configurações' do hub e, dentro da aba, um segundo PageHeader completo 'Templates de mensagem' (h1 de 36 px)…  |
| `academia/conteudo.$codigo`                      | Academia (Módulo 10) · seção Conteúdo (editor de módulo)     | 4    | P       | baixo   | Botão ghost '← Conteúdo' acima do PageHeader (linhas 200–204, redundante com a trilha do header).                                                               |
| `academia/modulo.$codigo.aula.$ordem`            | Academia (Módulo 10) · dentro de Minha trilha                | 4    | P       | medio   | Não usa PageHeader: tem h1 próprio 'font-display text-xl font-semibold' (linha 66, menor que o padrão 2xl/3xl) e sem o eyebrow MÓDULO 10 — é a única família …  |
| `academia/modulo.$codigo.quiz`                   | Academia (Módulo 10) · dentro de Minha trilha                | 4    | P       | baixo   | Quatro estados (antes/respondendo/confirmação/resultado) sem PageHeader/eyebrow: 'antes' e 'confirmação' têm h1 próprio 'text-xl' (linhas 155 e 193); 'result…  |
| `comissoes`                                      | 08 · Assinaturas & Comissões                                 | 4    | P       | alto    | Rota é redirect para /financeiro?tab=comissoes (ok). A aba já passou pela Fase 8: título do módulo acima, 'Comissões' como título de seção, Aprovações de ven…  |
| `oferta-ativa.$ofertaId`                         | 02 · Prospecção (seção Oferta Ativa)                         | 4    | P       | medio   | O topo já tem a forma certa: PageHeader com o nome da lista, descrição, Badge de status e TODAS as ações de gestão atrás de um '…' (Editar, Atribuir, Duplica…  |
| `reserva`                                        | central-comando (01 · Central de Comando) — seção "Minha bas | 4    | P       | medio   | O "como estou agora" está escondido em prosa: a descrição do PageHeader é `fraseDoPlacar(resumo)` — uma frase com os números (ocupadas/teto/vagas) em texto c…  |

## 7. Proposta por página

O detalhe que cada fase usa (problemas, proposta, peças). Só as rotas com nota ≤ 3 que não são redirect.

### `/conquistas` — nota 0, esforço P, impacto baixo

**Quem usa.** Ninguém chega aqui direto (grep em src: nenhum Link aponta para /conquistas); deep-links antigos. As conquistas são consulta ocasional do corretor (gamificação).

**Problemas.**

- A rota não é uma tela: beforeLoad faz redirect para /ranking?tab=conquistas. Nota 0 (não se aplica).
- No destino (hub Desempenho, fora deste grupo): as abas Ranking · Conquistas vêm ANTES de qualquer título — o padrão é o título do módulo acima das abas; a aba Ranking não usa PageHeader (o RankingPanel traz o próprio bloco de marca com h1 'Seu Metro Quadrado' + selo 'Ao vivo') e a de Conquistas tem PageHeader ('Conquistas' + 'Você desbloqueou N de M medalhas.' + ScoreRing nas actions), então o hub não tem título próprio e o cabeçalho muda de aba para aba.
- Na ConquistasPage: o ScoreRing (actions, em % com intent info/success) e o 'N de M medalhas' (descrição) dizem o mesmo número duas vezes; os cards desbloqueados usam border-amber-400/50, from-amber-400/10, bg-amber-500/15, text-amber-700/amber-300 hard-coded (fora do monocromático navy + dourado — os tokens gold existem); grade de até 4 colunas de cards iguais sem hierarquia além do opacity-70 nos bloqueados.
- [revisão] Precisado que a aba Ranking não é 'sem cabeçalho': o RankingPanel tem um bloco de marca próprio (h1 'Seu Metro Quadrado' + 'Ao vivo'), o que reforça o problema de cabeçalho trocando por aba. Peça 'AnelDoDia' é função local de fila-cockpit.tsx (não exportada); ScoreRing (ui/score-ring.tsx) e Medal (ranking/medal.tsx) são exportados.

**Proposta.** Nada a fazer na rota. No destino (quando o grupo do BI for avaliado): PageHeader 'Desempenho' (ou o do módulo) acima das abas, e os cabeçalhos de aba com CabecalhosDeSecao; em Conquistas, um só 'como estou': o anel dourado 'N de M' como cartão/linha de topo (sem repetir na descrição), a grade de medalhas como área principal, amber trocado pelos tokens gold.

**Peças:** CabecalhosDeSecao (page-header.tsx); ScoreRing (ui/score-ring.tsx, exportado) para o 'N de M' dourado; AnelDoDia (fila-cockpit.tsx) é local e precisaria ser exportado; Medal (features/ranking/medal.tsx, exportado).

### `/corretores` — nota 0, esforço P, impacto baixo

**Quem usa.** Ninguém chega aqui direto (grep em src: nenhum Link/navigate aponta para /corretores); só deep-links antigos. O conteúdo é usado pelo admin algumas vezes por semana (convites, telefone, papel, equipe).

**Problemas.**

- A rota não é uma tela: beforeLoad faz redirect para /configuracoes?tab=pessoas. Nota 0 (não se aplica).
- O destino tem um defeito de acesso: CorretoresPage suporta gestor (escopo da própria equipe via gestor-escopo, colunas em modo leitura), mas ConfiguracoesPage devolve 'Acesso restrito' para quem não é admin — um gestor que abre /corretores cai numa tela bloqueada.
- Os problemas de composição do conteúdo (PageHeader 'Corretores' empilhado sob o 'Configurações', faixa de aviso de telefone, busca, DataTable de 9 colunas com Pausar/Bloquear inline, bloco de manual 'Como funcionam os papéis') estão avaliados na entrada de /configuracoes.

**Proposta.** Nada a fazer na rota (manter o redirect). Se a gestão de pessoas pelo gestor for desejada, o destino precisa deixar de ser admin-only ou o redirect precisa apontar para uma tela que o gestor alcance. A recomposição do conteúdo está na proposta de /configuracoes (Pessoas).

**Peças:** CorretoresPage (DataTable) como lista principal da aba Pessoas; CrmInviteDialog (components/crm-invite-dialog.tsx, exportado) como ação única do header.

### `/equipes` — nota 0, esforço P, impacto baixo

**Quem usa.** Ninguém chega aqui direto (grep em src: nenhum Link aponta para /equipes); deep-links antigos. O conteúdo (criar equipe, trocar gestor) é raro — admin, algumas vezes por mês.

**Problemas.**

- A rota não é uma tela: beforeLoad faz redirect para /configuracoes?tab=pessoas. Nota 0 (não se aplica).
- No destino, EquipesPage é o SEGUNDO PageHeader da mesma aba (space-y-10 abaixo de CorretoresPage): a aba Pessoas mostra três títulos de página empilhados — Configurações (h1), Corretores (h1), Equipes (h1) — com o botão 'Nova equipe' (DialogTrigger, só podeCriar = admin) no terceiro cabeçalho, bem abaixo da dobra.
- Gestor também bloqueado no destino (admin-only), embora EquipesPage permita ao gestor editar a própria equipe.
- [revisão] Peça 'Painel (fila-lateral.tsx)' conferida: existe, mas é função local não exportada — reaproveitar exige exportar ou copiar. O restante bate com o código.

**Proposta.** Nada a fazer na rota. No destino (ver /configuracoes): Equipes vira painel lateral curto da aba Pessoas (nome · gestor · membros, 'Nova equipe' como ação do painel) com CabecalhosDeSecao, em vez de uma segunda página empilhada.

**Peças:** EquipesPage (DataTable + Dialog) reduzido a um painel lateral no molde do Painel de fila-lateral.tsx (função local — exportar antes); CabecalhosDeSecao (page-header.tsx).

### `/match` — nota 1, esforço M, impacto baixo

**Quem usa.** Todos os papéis pelo ⌘K ('Match IA' em ATALHOS_EXTRAS) e pelo dossiê do lead; botão 'Match IA' no Catálogo (gestão). Saiu da sidebar no corte 2026-08-30 — uso ocasional.

**Problemas.**

- Dois títulos empilhados na aba Buscador IA: PageHeader 'Match Cliente ↔ Empreendimento' e, dentro da aba, o h2 'Buscador de Projetos por IA' (text-xl font-bold) com tile de ícone e parágrafo explicativo (BuscadorIA) — exatamente o que o padrão proíbe. Título com '↔' e sem o nome do módulo; o eyebrow sairá 'Módulo 03 · Gestão de Carteira' para uma tela de catálogo.
- Aba 'Match financeiro' é um wizard de 3 passos (stepper Cliente → Orçamento → Match) para um formulário de 3 campos (renda, FGTS, entrada) + 2 switches (36 meses, dependente): a conta só aparece no passo 2, como 10 Info tiles do mesmo peso (Faixa, Parcela estimada, Taxa, Renda consultada, Financiamento, Subsídio, FGTS, Entrada e mais dois) — sem 3–5 números com dono.
- Passo 3: card com 'Teto base' + Slider de ajuste 80–120% + switch 'Mostrar imóveis fora do segmento' (controles técnicos no mesmo peso da lista), depois a parede ProjetosFilters e a lista.
- Ação repetida: o formulário renda/FGTS/entrada/36 meses/dependente existe aqui no passo 1, de novo dentro do BuscadorIA ('Pré-qualificação do cliente (APROVE 2026)' com 3 Inputs + 2 Switches), na Vitrine (SimuladorCliente) e na prateleira (RendaCliente) — quatro versões da mesma pergunta; o 'Match financeiro' entrega o que /projetos-foco já faz com '✓ Só o que cabe'.
- Cards de resultado com Badge default/destructive 'Cabe/Não cabe', folga em text-exito-600/text-destructive, 'Saldo construtora (total)'/'% construtora' — cor e detalhe técnico fora do navy + dourado.
- [revisão] Contagem de Info tiles corrigida de 11 para 10 (conferido no passo 2). Refutado o 'page sem padding próprio consistente (space-y-6 solto)': o shell já dá o padding a toda página, e 'space-y-6' sem padding próprio é justamente o certo (é o que a Fila Única faz) — removido do problema 5. Nota 1 e esforço M mantidos: a página inteira muda, mas quase tudo é reaproveitado (RendaCliente, ProdutoCard, FilterBar, lib/orcamento).

**Proposta.** Página inteira. Um PageHeader 'Match' com uma frase ('O que cabe no bolso do cliente — pela conta ou pela descrição.') e decidir o dono: ou a rota passa para dominioExtra de docs-projetos (eyebrow Módulo 07) ou o Match financeiro some e /projetos-foco (que já tem '✓ Só o que cabe') é a resposta, ficando /match = Buscador IA. Se ficar: sem stepper — o topo é a linha RendaCliente (chips de renda + campo + 'Só o que cabe' dourado + contagem) e UM cartão principal 'Compra até R$ X · Faixa 2 · parcela ~R$ Y' no desenho do PotencialDeCreditoCard do Modo Visita (variante que receba o ResultadoOrcamento de calcularOrcamento, já que o original recebe LeadBriefing), com FGTS/entrada/switches atrás de 'Ajustar o cliente' e os 10 números atrás de 'Ver a conta'; a lista vem logo abaixo como ProdutoCard com selo Cabe/Não cabe (como a prateleira), filtros numa FilterBar com chips; slider e 'fora do segmento' num popover 'Ajustes'. Aba IA dentro de CabecalhosDeSecao (some o h2/tile/parágrafo), textarea + exemplos + 'Buscar' navy; a pré-qualificação lê a mesma linha de renda do topo (zero segundo formulário); resultados na mesma lista com chip de pontuação. Abas 'Pela conta · Pela descrição' em uma linha.

**Peças:** RendaCliente (src/features/projetos/renda-cliente.tsx); PotencialDeCreditoCard (src/features/visitas/briefing-visita.tsx) — recebe { lead: LeadBriefing }; reaproveitar o desenho via variante/adaptador; ProdutoCard (src/features/projetos/produto-card.tsx) com selo cabe/não cabe — recebe ItemPrateleira: ProjetoRow precisa de adaptador; FilterBar (src/components/ui/filter-bar.tsx); CabecalhosDeSecao (src/components/page-header.tsx); BuscadorIA (src/components/match/buscador-ia.tsx) — só a parte de busca e resultados; calcularOrcamento / avaliarAderencia (src/lib/orcamento.ts); StatTile x3, EmptyState, QueryErrorState (src/components/ui).

### `ranking` — nota 1, esforço G, impacto alto

**Quem usa.** Toda a operação, diariamente — é o placar ao vivo do time (refetchInterval 60 s) e roda na TV do escritório no Modo TV; gestão acompanha meta x real. O corretor recebe o snapshot em escopo 'individual' e vê um recorte menor.

**Problemas.**

- Sem PageHeader: DesempenhoPage renderiza direto um <Tabs> (Ranking | Conquistas). Não há título do módulo nem eyebrow MÓDULO 09 — é a única página do grupo sem o cabeçalho da identidade Lançamento.
- Dois títulos de página empilhados na prática: dentro da aba Ranking, a 'arena' (RankingExperience) desenha um header próprio (.arena-header) com logo, <h1>Seu Metro Quadrado</h1>, selo 'Ao vivo', subtítulo 'Desempenho do time · período', relógio, última leitura, som e botão Modo TV; e a aba Conquistas monta OUTRO <PageHeader title='Conquistas'> (h1) sem CabecalhosDeSecao.
- Três níveis de menu: sidebar 'Desempenho' → abas Ranking/Conquistas → TabsList da arena (Real x Meta | Vendas | Produtividade) — quebra a regra dos 2 menus.
- Tema escuro forçado dentro do CRM claro: o contêiner leva `ranking-arena smq-refined dark` com paleta própria (--arena-bg #051220 e --color-gold-300…600 redefinidos em ranking-refined.css, --arena-bg #070e1c em ranking-campeonato.css) — contraria o 'monocromático navy + dourado' do shell e a própria decisão de desempenho-v4.md ('Segue o tema do CRM (claro por padrão) … Modo TV opcional').
- Números sem hierarquia (escopo operação/equipe): a visão Real x Meta tem Painel Meta (BarraMeta) + Painel Atingimento (AnelMeta) + 'Indicadores do mês' com 9 StatTiles + Top vendedores + 'VGV — realizado × meta' + 'Vendas por corretor'; Vendas tem 6 StatTiles + pódio + ranking + conversão da carteira + tabela + Gestores & equipes; Produtividade tem 8 StatTiles + pesos + pódio + ranking + composição + tabela. É o caso-texto de '8+ StatTiles soltos'.
- Linha arena-context com 5 itens de pesos iguais: Select de mês, 'VGV do time', 'Sua posição', rótulo de escopo ('Desempenho da operação · hh:mm SP') e botão de atualizar — e o VGV do time repete o tile de VGV da visão.
- Texto de manual na tela: rodapé 'VGV ↓ · desempate por vendas · empates compartilham posição. Aprovações e estornos pelo mês de efetivação em São Paulo. Atualização a cada 60s.' e o parágrafo da ConversaoCarteira ('eventos independentes não formam uma taxa de conversão').
- Conquistas: ScoreRing como `actions` do PageHeader e grade de cards âmbar (border-amber-400/50, bg amber, Badge amber) — cor fora da paleta navy/dourado dos tokens.
- [revisão] Composição e contagens conferidas (9/6/8 <StatTile> por grep; classe `dark` em ranking-page.tsx:520; rodapé em 741-747; amber em conquistas-page.tsx:142-159). Nuance que faltava: para o CORRETOR (snapshot.escopo === 'individual') as visões Vendas e Produtividade caem no ramo individual de RankingRefinado — um Painel 'Seu resultado no mês' com 5–7 StatTiles e 'Sua posição' vira 'Ver análise'. Os 6/8 tiles + pódio + tabelas são a tela da gestão; a do corretor é menor, mas igualmente sem cartão principal.
- [revisão] Peça corrigida: o selo '● ao vivo' NÃO está em dia-topo.tsx — é um <span> inline em src/routes/_authenticated/painel-gestor.tsx (linhas 228-237), não exportado; precisa virar componente antes de ser reaproveitado. Sobre os testes: tests/ranking-page.test.tsx trava o botão 'Modo TV' e o heading 'Meta de vendas — Setembro de 2026' (sobrevivem); o heading 'Seu Metro Quadrado' em tests/ranking-views.test.tsx:367 testa HeroDesempenho (ranking-ui.tsx:80), que nenhuma tela importa — é componente morto, pode sair junto com o teste.

**Proposta.** Página inteira, mantendo os cálculos (ranking-derive, ranking-campeonato) e o Modo TV. (1) PageHeader único 'Desempenho' (eyebrow automático MÓDULO 09 · BI · Relatórios) com a frase 'O placar do mês, ao vivo: meta, vendas e produtividade.' e o selo '● ao vivo' (extrair o span de painel-gestor.tsx para um componente) ao lado das abas; ações do cabeçalho: Select do mês + botão 'Modo TV'. (2) Uma linha de abas só: Real x Meta | Vendas | Produtividade | Conquistas (some o nível Ranking/Conquistas; CabecalhosDeSecao para o cabeçalho de Conquistas). (3) Fora do Modo TV, retirar o .arena-header e a classe `dark`: a página segue o tema do CRM, cartões rounded-2xl border-border-subtle; o header de marca, o letreiro e o tema escuro ficam exclusivos do Modo TV (portal em tela cheia, já existe). (4) Topo = um cartão principal no molde do FilaCartao: 'Meta de {mês}' com o AnelMeta grande (atingimento %), três números (Vendas, VGV, dias úteis restantes/projeção) e 'Sua posição: 4º' como a vez em dourado; para gestão o mesmo cartão com o escopo (operação/equipe); para o corretor (escopo individual) o mesmo cartão com 'Seu resultado' no lugar da posição. (5) Lista principal logo abaixo = ListaRanking/pódio da visão aberta. (6) Os 9/6/8 StatTiles descem para 'Ver indicadores do mês' no fim (StatGrid colapsável) e os painéis de análise (VGV real × meta por corretor, composição da pontuação, tabela completa, Gestores & equipes) ficam atrás de 'Ver análise' / já no AnaliseCorretor (drawer). (7) Some o rodapé explicativo e o parágrafo da conversão (viram tooltip/hint de uma linha). (8) Conquistas: PageHeader de seção com 'N de M medalhas' na frase; cards nos tokens (gold-*) em vez de amber. Travar com tests/ranking-page.test.tsx (seletores do botão Modo TV e do heading da meta continuam) e apagar o teste de HeroDesempenho em ranking-views.test.tsx junto com o componente.

**Peças:** PageHeader + CabecalhosDeSecao; ResponsiveTabs (uma linha); selo '● ao vivo' de src/routes/_authenticated/painel-gestor.tsx (span inline, extrair para componente); FilaCartao como molde do cartão 'Meta do mês'; AnelMeta, BarraMeta, ListaRanking, Painel (ranking-ui.tsx, todos exportados); Podium (podium.tsx) / MolduraPodio (ranking-ui.tsx) / Medal (medal.tsx); Classificacao e AnaliseCorretor (campeonato-views.tsx); RankingExperience em modo TV (portal + roteiro, manter); StatGrid com 3–5 tiles; RelogioAoVivo (ranking-ui.tsx).

### `/atendimento` — nota 2, esforço M, impacto medio

**Quem usa.** Corretor que quer desovar a carteira um lead por vez (Volume) e gestão/corretor que busca alguém sem sair do atendimento (Consulta). Uso diário moderado — sem menu, só ⌘K/barra mobile.

**Problemas.**

- PageHeader 'Atender' com descrição de manual ('As filas por prioridade agora são a Fila Única') e um botão 'Fila Única' no cabeçalho que duplica a seção da sidebar.
- Não há 'como estou agora': o topo do modo Volume é só um Badge 'N de M' + texto de atalhos + barra de progresso.
- VolumeView é um Card max-w-4xl com informação espalhada: nome, 3 badges (etapa, temperatura, SLA), 4 InfoLine, Separator, 'Perfil financeiro' com 3 InfoTile, Observações, ResumoIA, botão primário full-width 'Registrar contato', segundo botão full-width (próxima ação), 3 botões outline (Ligar/WhatsApp/Agendar) e Anterior/Próximo no rodapé — ações repetidas em três lugares e sem hierarquia.
- VolumeView reimplementa o que ProximoLeadCard (Prospecção, já no padrão) faz: campos do primeiro contato + Ligar/WhatsApp/Registrar. Além disso, 'Ligar' aqui abre tel: em vez de useLigarLead (3C Plus) — comportamento diferente da Prospecção e da Fila Única.
- Tablist de modos é um bloco custom (rounded-lg border bg-muted/40) em vez do controle segmentado/pílula usado nas outras telas.
- ConsultaView está perto do padrão (busca + botão Filtros com drawer + lista), mas as linhas são rounded-md border p-2 (não o cartão rounded-2xl/border-border-subtle) e a contagem ('N leads · página x de y') é um text-xs discreto, não um título de seção com o número como dono.
- [revisão] Conferido no código: a composição descrita bate e a nota 2 está justa. Acrescentado: o ícone 'Ligar' da linha da ConsultaView também é <a href="tel:"> (consulta-view.tsx:1046), não useLigarLead — o desvio do 3C Plus vale para os dois modos, não só para o Volume.
- [revisão] Peças: 'Numero' em fila-cockpit.tsx é função interna SEM export (linha 96) — reaproveitar exige exportá-la ou usar StatTile; os grupos por bucket (BUCKET_LABEL/BUCKET_HINT) moram em features/fila-unica/derive.ts, não na página.

**Proposta.** Um PageHeader 'Atender' com frase curta ('Um lead por vez, a carteira inteira — ou busque alguém.'); tirar a frase de manual; manter o botão 'Fila Única' só como link discreto. Pílula Volume/Consulta em uma linha. TOPO do Volume: uma linha de 3 números com dono — 'N na carteira · X com SLA estourado · Y sem contato há 5+ dias' (StatGrid com 3 StatTile; ou exportar o Numero do FilaCockpit) com o '3 de 42' dentro. ÁREA DE TRABALHO: trocar o Card do Volume pelo ProximoLeadCard (temperatura + etapa, '1 de N', nome, seis campos, Ligar via useLigarLead, WhatsApp, Registrar contato como ação primária única em navy); mudar etapa/Agendar/Abrir dossiê vão para o LeadStageMenu + menu '…'; Observações e ResumoIA descem atrás de 'Ver resumo' (Collapsible); atalhos de teclado viram linha discreta com Kbd, escondida no celular como na Prospecção. Consulta: manter busca + Filtros (drawer) + 'Abrir em Meus Leads'; linha vira EntityRow no cartão padrão, Ligar passa a useLigarLead e a contagem vira título de seção.

**Peças:** ProximoLeadCard (features/prospeccao/proximo-lead-card.tsx); useLigarLead (hooks/use-ligar-lead.ts); LeadStageMenu; RegistrarContatoDialog; LeadPeekDrawer; StatGrid/StatTile (components/ui/stat-tile.tsx, 3 tiles); Numero (fila-cockpit.tsx — interno, exportar antes de reaproveitar); EntityRow (components/ui/entity-card.tsx); TemperatureChip; Kbd (components/ui/kbd.tsx).

### `/cadencia` — nota 2, esforço G, impacto alto

**Quem usa.** Corretor toda manhã (Fila do Dia é a lista de lead novo que vence hoje); Kanban para ver onde está cada cliente; admin/gestor/superintendente no Painel da cadência para cobrar o time.

**Problemas.**

- Três cabeçalhos de página diferentes na mesma rota ('Fila do Dia', 'Kanban da cadência', 'Painel da cadência'), cada um com descrição longa de manual ('Cumprir a cadência até o fim não conta como perda — deixar vencer, sim.'); o título 'Fila do Dia' não bate com o rótulo da sidebar 'Cadência (lead novo)'.
- Botões de navegação no cabeçalho (Kanban ↔ Fila do Dia) repetem a seção que a sidebar já oferece — é um terceiro menu; só 'Painel da cadência' precisa de porta no cabeçalho porque não é seção (teto de 6 seções, comentário em cadencia.tsx:220).
- Fila do Dia não tem 'como estou agora': o topo é uma linha de texto 'N para hoje' + Badge 'X atrasados'. Nenhuma lateral no desktop.
- O Kanban usa colunas rounded-lg border bg-muted/30 e CardDoKanban com até 4 badges (prazo, Reativado, Lote, Só e-mail) — fora do cartão rounded-2xl/border-border-subtle e com peso igual em tudo; as contagens por etapa já são mostradas em CadenciaEtapas (followup-topo.tsx:111) a partir da mesma queryKey ['cadencia:kanban'].
- Painel da cadência (gestão) é a 'informação espalhada' em estado puro: seis Cards empilhados (TabelaCorretores com 8 colunas, TabelaEtapas, BlocoReativacao com 8 números do mesmo peso em grade 2x4, CardLotesProspeccao, CardFase0 admin com inputs + 2 tabelas, TabelaMotor), cada um com CardTitle + CardDescription longa; sem topo que responda 'quem está devendo hoje'; a admissão do estoque (ação de admin) está misturada a um painel de leitura.
- LinhaDaFila já cumpre 'ação primária única' (acaoPrimaria alterna Liguei/WhatsApp), mas cada card carrega até 4 badges (Reativado, Lote, Atrasado, Só e-mail) + rótulo de progresso + 3 botões — ainda pesado no celular.
- [revisão] Nota baixada de 3 para 2: pela régua, 3 é 'recompor o topo' com a lista preservada, mas aqui duas das três visões exigem recompor a lista também — o Painel inteiro (seis cards → topo + tabela principal + 'Ver análise', CardFase0 sai da rota) e os cards/colunas do Kanban —, além de colapsar três PageHeaders num só. O próprio esforço G do colega contradizia a nota 3. A Fila do Dia sozinha seria 3.
- [revisão] Peças conferidas: CabecalhosDeSecao, CadenciaEtapas/ReguaDeToques, StatGrid/StatTile, FilaEquipe, DiaTopo/ExcecaoItem (features/gestao/painel-dia/), Accordion/Collapsible e a coluna do leads-kanban-board existem. 'Numero' (fila-cockpit.tsx:96) e 'Painel' (fila-lateral.tsx:44) são funções internas sem export — exportar antes de reaproveitar. A aba 'Config da régua' do Follow-Up (admin) existe no registro (sistemas.ts), então o destino proposto para o CardFase0 é real.

**Proposta.** Um PageHeader só, 'Cadência' (eyebrow MÓDULO 05 · Follow-Up) com uma frase ('Lead novo até responder: liga, manda WhatsApp, registra.'); Fila do Dia, Kanban e Painel viram títulos de seção (CabecalhosDeSecao); tirar os botões Kanban/Fila do Dia do cabeçalho (sidebar já faz) e manter só 'Painel da cadência' como link discreto para gestão. TOPO da fila: uma linha de 3–4 números com dono — 'N para hoje · X atrasados · Y vencem hoje · Z na cadência' (StatGrid, ou Numero do FilaCockpit exportado; atrasados em vermelho, hoje em âmbar só acima de zero) — ou reaproveitar CadenciaEtapas em versão compacta. LISTA: LinhaDaFila continua como lista principal; badges secundários (Lote, Reativado) viram texto na linha de meta; 'Só e-mail' fica. LATERAL desktop (≤3 painéis): 'Etapas' (CadenciaEtapas compacta) e 'Templates da etapa' (texto que vai no WhatsApp). KANBAN: colunas no painel cinza-claro com título em Sora e contagem simples (padrão do leads-kanban-board), card enxuto nome · empreendimento · prazo. PAINEL (gestão): topo = 3–5 números do time (fazer hoje, atrasados, cumprimento %, taxa de resposta, reativados 30 d) em StatGrid; lista principal = TabelaCorretores ordenada por atrasados (padrão FilaEquipe: 'a mesma fila vista pelo gestor'); Resposta por etapa, Lotes e Motor descem atrás de 'Ver análise' (Accordion); BlocoReativacao reduz a 3 números + link 'Ver reativação' (/reativacao); CardFase0 (admissão do estoque) sai do painel e vai para a aba 'Config da régua' do Follow-Up (admin). Todas as CardDescription longas viram tooltip no título da seção.

**Peças:** CabecalhosDeSecao (components/page-header.tsx); CadenciaEtapas e ReguaDeToques (followup-topo.tsx); StatGrid/StatTile; Numero (fila-cockpit.tsx — interno, exportar antes); Painel (fila-lateral.tsx — interno, exportar antes); FilaEquipe (fila-equipe.tsx, tabela do gestor); DiaTopo/ExcecaoItem (features/gestao/painel-dia) como padrão de 'exceções' para o painel; Accordion/Collapsible (components/ui); coluna do leads-kanban-board (rounded-xl bg-muted/50, título font-display).

### `/configuracoes` — nota 2, esforço G, impacto medio

**Quem usa.** Admin, algumas vezes por semana: Pessoas (convite, telefone, papel, equipe) e Estoque (leads sem dono) são as abas vivas; Campanhas/Qualidade/Comunicação são consulta ocasional; Integrações e Preferências quase nunca.

**Problemas.**

- 8 abas visíveis (Integrações, Gestão, Pessoas, Estoque, Campanhas, Comunicação, Qualidade, Preferências; a whitelist ainda tem 'follow-up' só para redirect) em TabsList h-auto flex-wrap — quebra em duas linhas; a sidebar só expõe 3 delas.
- Títulos empilhados sem CabecalhosDeSecao: a aba Pessoas renderiza CorretoresPage (PageHeader 'Corretores') e EquipesPage (PageHeader 'Equipes') com space-y-10 — três h1 na mesma tela; a aba Qualidade empilha SamiQQualidadeCard + DuplicatasPage (PageHeader 'Detector de duplicatas') + LixeiraPage (PageHeader 'Lixeira' + TabsList próprio por tabela) — dois títulos de página e um 2º nível de abas dentro da aba.
- Qualidade abre com 7 StatTiles do SamiQ (Conversas, Corretores ativos, Fallback, Aprovação, Latência p95, Erros de ferramenta, Custo/Tokens — beira o '8+ soltos') antes de qualquer lista.
- Integrações: dois dos três cards (API pública & Webhooks, WhatsApp Z-API) são só CardDescription longa + badge 'Ativo' estático, sem ação — apenas o GoogleCalendarCard tem estado real e ação (Conectar/Desconectar + switch de espelho). Preferências: um card só linka 'Abrir meu perfil' e o outro descreve o sino sem ação — texto de manual, aba quase vazia.
- Em Pessoas: faixa vermelha de aviso de telefone + busca + DataTable de 9 colunas (Nome, E-mail, Telefone, Discador, Equipe, Zonas, Papel, Distribuição, Conta) com botões inline Pausar/Ativar e Bloquear/Liberar com o mesmo peso em cada linha; o bloco 'Como funcionam os papéis' (lista de 4 itens) é manual dentro da tela; a ação principal 'Convidar' (CrmInviteDialog) fica no 2º cabeçalho, não no da página.
- Descrição do PageHeader longa ('Integrações, cadastros e preferências do CRM — a estrutura que sustenta a operação.') e nenhuma ação no header da página.
- Acesso: CorretoresPage e EquipesPage têm lógica para gestor (escopo da própria equipe, editar a própria equipe), mas a rota bloqueia não-admin — os redirects /corretores e /equipes levam o gestor a 'Acesso restrito'.
- Cards no Card padrão (rounded-xl, border-border), CardTitle text-base sem font-display; ícones text-info (azul) nos títulos de card — cor fora do navy + dourado.
- [revisão] Corrigido 'Integrações e Preferências são cards de texto sem ação': o GoogleCalendarCard tem estado e ação reais; só os outros dois cards de Integrações são estáticos. Peça 'Painel (fila-lateral.tsx)' é função local não exportada.

**Proposta.** Topo: PageHeader 'Configurações' + frase curta ('Pessoas, estoque e integrações da conta.'); sem placar de números — é configuração, não 'como estou agora' — ou, no máximo, uma linha de 3 pendências com dono (sem telefone · contas pendentes · leads no estoque sem dono), cada uma levando à aba certa. Abas em UMA linha (≤6): Pessoas · Estoque · Campanhas · Comunicação · Qualidade · Integrações — 'Gestão' entra como seção de Integrações (ou 'Conta') e 'Preferências' some (os dois cards são links para Meu perfil, que já está no menu da pessoa). Pessoas: CorretoresPage como lista principal com CabecalhosDeSecao (sem o h1), 'Convidar' como ação única no header da página quando a aba é Pessoas, a faixa de telefone vira a pendência do topo, Pausar/Bloquear vão para um menu '…' por linha, 'Como funcionam os papéis' vira tooltip no select de papel; Equipes vira painel lateral curto (nome · gestor · membros, 'Nova equipe'). Qualidade: 3 números do SamiQ + Duplicatas como lista; Lixeira atrás de 'Ver lixeira' (e as abas de tabela viram Select). Integrações: um card por integração com estado real e uma ação (Conectar/Ver), sem parágrafos — o GoogleCalendarCard já é o modelo. Cartões rounded-2xl/border-border-subtle, títulos font-display, ícones sem text-info. Decidir o gate: ou a rota aceita gestor com as abas que ele pode ver (Pessoas da própria equipe), ou os redirects legados apontam para outro lugar.

**Peças:** CabecalhosDeSecao (page-header.tsx) para Corretores, Equipes, Templates, Duplicatas, Lixeira; StatGrid com 3 tiles (EstoquePage já usa exatamente 3 StatTiles; SamiQ reduzido a 3); Painel (fila-lateral.tsx, função local — exportar) para Equipes e para a lateral de pendências; DataTable + EmptyState (já usados); CrmInviteDialog como ação única do header; GoogleCalendarCard (uma vez só — hoje repete em Meu perfil; é o único card de Integrações com estado e ação).

### `/discador` — nota 2, esforço G, impacto medio

**Quem usa.** Corretor nos dias de prospecção sobre o Bolsão (sessão de discagem, atendidos, rediscar); gestão olha o histórico de chamadas de todos. Uso diário para quem disca, ocasional para a gestão.

**Problemas.**

- Quatro blocos empilhados antes de qualquer lista: PageHeader com descrição longa, Card 'Meu 3C Plus' (ConectarTcplus — card de setup que fica sempre no topo mesmo conectado, com agente/campanha/token e formulário de token), Card 'Sessão de discagem' e depois as abas — a 'informação espalhada' que o dono reclama.
- 'Como estou agora' está escondido: os KPIs do dia (Chamadas hoje, Atendidas, Perdidas) só aparecem dentro da aba 'Histórico de chamadas' (DiscadorCentral), não no topo da página; e o 4º KpiCard ('Meu 3C Plus') repete o status que o card ConectarTcplus já mostra acima — mesmo dado em dois lugares.
- KpiCard é uma cópia local do StatTile (discador-page.tsx:476; o próprio stat-tile.tsx cita KpiCard como o que substitui).
- Pelo menos seis parágrafos de manual dentro da tela: descrição do cabeçalho, 'A fila do discador é o Bolsão…' (sessão parada), dois parágrafos no estado rodando, o texto do cockpit um a um, o parágrafo de abertura dos Atendidos ('Esses leads não são seus…') e o aviso do token no card Meu 3C Plus.
- SessaoDiscagem no estado parado: 'Iniciar agora' (navy) fica numa linha própria, mas logo abaixo, numa mesma linha separada por border-t, misturam-se a ação secundária ('Discar um a um'), um Checkbox ('Discar automático ao avançar') e um link de texto 'Parar campanha em andamento'; no estado rodando os quatro números (na fila · discados · atenderam · na sua carteira) ficam dentro do CardTitle em texto corrido.
- Cada card de Atendidos tem 3 botões do mesmo tamanho numa linha — 'Assumir e agendar' já é o único em navy (Ligar e Registrar contato são outline), mas vem por último e sem hierarquia de tamanho; o cockpit um a um tem 4 botões (Ligar navy + Registrar/Assumir/Próximo outline).
- Histórico = DataTable de 7 colunas (8 para gestão) com busca + 2 Selects inline, abaixo de 4 KpiCards — análise/histórico no meio da tela, não no fim.
- [revisão] Corrigidos dois fatos: (a) em Atendidos o 'Assumir e agendar' JÁ é o único botão navy (atendidos-discador.tsx:905, sem variant = default; os outros dois são outline) — o problema é o peso igual de tamanho e a ordem, não a cor; (b) no estado parado 'Iniciar agora' não divide linha com os secundários — está sozinho, e a mistura é na linha de baixo. Nota 2 e esforço G mantidos.
- [revisão] Peças: FilaCartao é exportado, mas AnelDoDia (fila-cockpit.tsx:19) e Numero (fila-cockpit.tsx:96) são internos sem export, assim como Painel (fila-lateral.tsx:44) — exportar antes de reaproveitar.

**Proposta.** PageHeader 'Discador' com frase curta ('Ligue para o Bolsão. Quem atende entra na sua carteira.') e, no lugar do card de setup, um chip de status no cabeçalho ('3C Plus · conectado' / 'não conectado' em âmbar) que abre o formulário do token num Popover/Sheet — o card de aviso só aparece quando não há token ou campanha. TOPO em duas colunas como a Central: à esquerda o cartão 'Sessão' (padrão FilaCartao: título, estado, os 3 números da sessão 'na fila · atenderam · na sua carteira' como Numero exportado, e UMA ação — 'Iniciar agora' em navy quando parada, 'Parar' quando rodando; 'um a um', o checkbox de discar automático e 'Mais leads' vão para o menu '…'); à direita os 3 números do dia (chamadas · atendidas · perdidas) em StatGrid, removendo o 4º KpiCard duplicado e trocando KpiCard por StatTile. LISTA principal logo abaixo: Atendidos ('quem disse alô') com 'Assumir e agendar' em navy como primeira ação e Ligar/Registrar contato como ícones/outline menores; 'Já ganharam dono' atrás de 'Ver encerrados (N)'. Histórico de chamadas (DataTable + filtros atrás de 'Filtros') desce para o fim atrás de 'Ver histórico' ou fica como 2ª aba em uma linha. Todos os parágrafos explicativos viram um único 'Como funciona' (Collapsible) ou tooltips.

**Peças:** FilaCartao (fila-cockpit.tsx, exportado); AnelDoDia / Numero (fila-cockpit.tsx — internos, exportar antes); StatGrid/StatTile (components/ui/stat-tile.tsx); Painel (fila-lateral.tsx — interno, exportar antes); EntityRow; DataTable (manter); useLigarLead; RegistrarContatoDialog; NotaAtendidoDialog (atendidos-discador.tsx); Popover/Sheet para o token; Collapsible/Accordion.

### `/distribuicao` — nota 2, esforço G, impacto alto

**Quem usa.** Admin e gestores todo dia: exceções presas, montar/pausar fila, e — pedido explícito do dono (11/10) — ver quem é o próximo da vez por zona na mesma visão do SDR. Superintendente consulta.

**Problemas.**

- Topo com 10 StatTiles soltos em StatGrid xl:grid-cols-5 (duas linhas): Distribuídos hoje, Aguardando distribuição, Fila de exceções, Sem atendimento, Erros 24h, Aptos·Plantão, Aptos·Marquinhos, Aptos·Landing, Parados (régua de horas), % médio trabalhado — a regra é 3–5 números com dono.
- O mesmo número em dois lugares: 'Aptos · Plantão/Marquinhos/Landing' das tiles repete o '{aptos} aptos de {ativos} ativos' dos 9 RoletaSaudeCard da aba Visão Geral (6 zonas de ZONA_ROLETAS + 3 de sistema); 'Próximo da vez' do RoletaSaudeCard repete a aba A vez por zona.
- 9 abas para o admin (Visão Geral, Filas, Corretores, A vez por zona, Exceções, Histórico, Política, Configurações, Auditoria) em TabsList h-auto flex-wrap — quebra em duas linhas; viola 'abas em no máximo uma linha'.
- Aba Filas tem TRÊS níveis de abas empilhados: abas da página → Tabs de grupo (Zonas/Sistema/Campanhas/SDR, com contagem) → Tabs de fila (uma por roleta, flex-wrap, com badges 'inativa'/'equipe fixa') → depois FilaPropriedades (Card 'Propriedades da fila') + PlacarRoletaSdrCard (admin, só na fila do SDR) + RoletaTab (parágrafo + 'Escoar estoque' + 'Incluir corretor' + tabela).
- Descrição do PageHeader é um parágrafo ('Toda a configuração da distribuição num lugar só: filas (zonas, sistema, base e campanhas), corretores, exceções, histórico, política do motor v2 e regras — tudo auditável.'), não UMA frase curta.
- Duas ações no header com o mesmo peso: 'Sincronizar token n8n' (técnica, rara) ao lado de 'Rodar agora' (a ação real).
- Texto de manual dentro da tela em quase toda aba: DESCRICAO_GRUPO (tab-filas), parágrafo de abertura do RoletaTabPadrao (4 variantes por fila) e do MarquinhosSimpleTab, parágrafo de TabCorretores, parágrafo de TabVez, parágrafo de TabExcecoes ('Leads que a roleta não conseguiu distribuir. Reprocessar…'), rodapé 'Acesso somente leitura…'/'Como gestor, você monta…' do command-center, os hints de cada setting e o rodapé 'Repasse SLA vazio = …' em TabConfiguracoes.
- A resposta ao pedido do dono ('onde a gestão vê a mesma visão da roleta por zona?') existe — TabVez monta o FilaZonaCard — mas está escondida como 4ª de 9 abas, abaixo das 10 tiles; o admin/gerente não a encontra ao abrir a tela.
- Tiles clicáveis (Fila de exceções → aba, Erros 24h → aba, Aptos → aba) duplicam a navegação das abas; ação repetida em vários lugares.
- Cartões no Card padrão (rounded-xl, border-border) e CardTitle text-sm sem font-display; nada do rounded-2xl/border-border-subtle do padrão. Visão Geral é uma grade de 9 cartões pequenos com o mesmo peso — exatamente a 'informação espalhada'.
- Política (admin) é um Card 'Motor v2' com a flag em caixa âmbar + 4 Cards de settings em grid + 1 Card lg:col-span-2 (roleta do SDR semanal) + Card 'Outras chaves'; Configurações (admin) são 2 Cards de settings + 2 tabelas em Card (Roletas — funcionamento / Origens — roleta e tempos); Auditoria são 2 SectionHeader + 2 DataTables — tudo com peso de aba de primeira linha, embora seja ajuste raro.
- [revisão] Contagem de abas corrigida por papel: 9 só para admin; gestor e superintendente veem 7 (Política e Configurações são isAdmin) e não têm nenhuma ação no header (somenteLeitura = !isAdmin esconde os dois botões). Acrescentei TabExcecoes à lista de texto de manual (tem parágrafo de abertura e um 4º TabsList Abertas/Todas) e detalhei a composição real de Política (6 Cards + 'Outras chaves', não 'aviso + 6 Cards').
- [revisão] Observação sobre o pedido do dono ('Zona Oeste e Leste', 'Zona Oeste e Sul'): o FilaZonaCard mostra UMA zona por vez (chips com a última escolhida em localStorage) e não recorta pela equipe do gestor — o gerente que atende duas zonas alterna chips. É limitação de conteúdo, não só de composição; a proposta de pôr o card como corpo da Visão não resolve isso sozinha.

**Proposta.** Topo: PageHeader 'Central de Distribuição' + frase curta ('Quem recebe o próximo lead de cada zona — e por quê.'); ação principal única 'Rodar agora' (navy); 'Sincronizar token n8n' vai para um menu '…' ou para a aba de ajustes. Linha de 4 números com dono: Aguardando distribuição · Exceções (badge, leva à aba) · Parados além do tempo (fundir 'Sem atendimento' + 'Parados (régua de horas)') · Distribuídos hoje; 'Erros 24h' vira uma linha discreta só quando > 0; os três 'Aptos · X' e o '% médio trabalhado' saem do topo (moram na fila correspondente). Área principal da 1ª aba (desktop, grid 3fr/2fr como o painel do SDR): à esquerda o FilaZonaCard com a roda e a fila por zona — é isso que o admin e cada gerente pediram para ver, na mesma visão da Pré-venda (considerar chips de zona pré-marcados pela região da equipe do gestor, ou duas zonas lado a lado); à direita, lateral com no máximo 3 painéis curtos: 'Filas sem ninguém apto' (os RoletaSaudeCard reduzidos a uma lista de só quem está em vermelho), 'Últimas decisões (24h)' (lista curta + 'Ver histórico') e 'Exceções presas' (top 3 + 'Ver todas'). A aba 'A vez por zona' deixa de existir (virou o corpo da Visão). Abas em UMA linha (≤6): Visão · Filas · Corretores · Exceções · Histórico · Ajustes — onde Ajustes (admin) reúne Política, Configurações e Auditoria como seções com CabecalhosDeSecao (ou Auditoria vira 'Ver auditoria' no fim do Histórico). Aba Filas: substituir os dois níveis de abas internas por um seletor único de fila (Select/combobox agrupado por Zonas/Sistema/Campanhas/SDR, ou uma lista lateral de filas com contagem), e a fila escolhida ocupa a área principal com um só cabeçalho de seção (nome da fila + 'Incluir corretor' como ação única; 'Escoar estoque' no menu); DESCRICAO_GRUPO e o parágrafo do RoletaTab viram tooltip no título. Textos de manual (TabCorretores, TabVez, TabExcecoes, rodapé somente leitura) somem; o modo somente leitura se mostra pelos controles desabilitados. Cartões rounded-2xl + border-border-subtle, títulos font-display; cor só por intenção (vermelho/âmbar acima de zero), dourado só no 1º da vez.

**Peças:** FilaZonaCard + RodaDaFila (exportados) de src/features/roletas/fila-zona-card.tsx — já no padrão, vira o corpo da Visão; ListaDaVez é função local do mesmo arquivo (precisa exportar para usar fora); Painel (fila-lateral.tsx) para os 3 painéis laterais — é função LOCAL não exportada; exportar ou copiar o bloco (há um Painel exportado em features/ranking/ranking-ui.tsx, mas é outro componente); CabecalhosDeSecao (page-header.tsx, exportado) para os títulos de Política/Configurações/Auditoria dentro de Ajustes; StatGrid com 4 StatTiles (exportados em ui/stat-tile.tsx) para a linha de números; os blocos 'Numero' do FilaCartao (fila-cockpit.tsx) são função local não exportada; Lista 'Últimas decisões do motor (24h)' de TabVisaoGeral (reduzida) — hoje é JSX inline dentro de TabVisaoGeral, não um componente; extrair; RoletaSaudeCard (tab-visao-geral.tsx, função local) reduzido a uma linha por fila em vermelho; SectionHeader (ui/section-header.tsx) + DataTable (Histórico/Auditoria) como estão; FilaEquipe (fila-unica/fila-equipe.tsx, exportado) como referência de 'a mesma fila, vista pelo gestor'; PlacarRoletaSdrCard e FilaPropriedades (exportados) permanecem dentro da fila escolhida.

### `/meu-perfil` — nota 2, esforço M, impacto medio

**Quem usa.** Todo papel, ocasionalmente: trocar foto, telefone, senha. O corretor passa aqui também para o check-in e para ver se está apto nas roletas, mas isso já tem porta própria (/presenca, faixa de check-in, 'Sua vez nas roletas' na Central).

**Problemas.**

- Sete cartões empilhados numa coluna max-w-2xl com o mesmo peso: AvatarUploadCard, CheckinCard, MinhaElegibilidadeCard, PushOptInCard, GoogleCalendarCard, 'Dados pessoais', 'Alterar senha' — a 'informação espalhada' em forma pura; no desktop o resto da largura fica vazio (sem lateral).
- Operação do dia (check-in de hoje, aptidão nas roletas) misturada com cadastro (bio, cargo, senha) sem hierarquia; a descrição ('Atualize seus dados de cadastro e senha.') não diz que a tela tem operação.
- Mesma peça em dois lugares: CheckinCard inteiro repete /presenca; GoogleCalendarCard repete Configurações → Integrações; MinhaElegibilidadeCard responde a mesma pergunta de MinhasPosicoesRoletas (Central de Comando) com outro formato.
- Nenhuma ação principal: 'Salvar alterações' e 'Atualizar senha' vivem em cards diferentes, no fim da coluna; o Salvar fica abaixo de cinco cards que não são o formulário.
- Card padrão (rounded-xl) e CardTitle text-base sem font-display; o CheckinCard recebe border-primary/30 para se destacar — destaque por cor em vez de por hierarquia.
- CheckinCard e MinhaElegibilidadeCard aparecem para TODO papel aqui (sem gate), enquanto /presenca os esconde para gestão sem papel de corretor ('Gestão sem papel de corretor não entra em roleta — não tem o que marcar'): a RPC presenca_minha_v1 só exige autenticação, então admin, gestor, superintendente e SDR veem 'Onde você está trabalhando hoje?' no próprio perfil.
- [revisão] Nota rebaixada de 3 para 2: pela régua, 3 é 'recompor o topo', mas a tela não tem topo nem lista — são sete cards iguais, e a própria proposta refaz cartão principal + área principal + lateral (topo + lista). Acrescentado o problema do CheckinCard/MinhaElegibilidadeCard sem gate por papel (conferido em meu-perfil.tsx vs. presenca.tsx). Peça 'Painel' é função local não exportada.

**Proposta.** Topo: PageHeader 'Meu perfil' + frase curta ('Quem você é no CRM e o que libera a sua roleta hoje.'); cartão principal com avatar (AvatarUploadCard compactado: foto + 'Trocar'), nome/cargo/papel e, só para corretor, duas linhas de estado: o check-in de hoje ('Barra Funda desde 09:12 · Trocar' → /presenca, ou o botão 'Fazer check-in' quando falta) e 'Apto em 3 de 5 roletas' (resumo de MinhaElegibilidadeCard, 'Ver' abre os motivos). Área principal logo abaixo: o formulário 'Dados pessoais' com um único 'Salvar' como ação principal; 'Alterar senha' atrás de botão (Dialog). Lateral no desktop (≤3 painéis curtos, estilo Painel da fila-lateral): Notificações push (PushOptInCard em uma linha + botão), Google Agenda (estado + Conectar), e 'Sua vez nas roletas' (MinhasPosicoesRoletas, que já existe; só corretor) no lugar do MinhaElegibilidadeCard completo. No celular empilha com o cartão principal primeiro e o formulário em seguida. O CheckinCard completo não precisa repetir aqui — a linha de estado leva a /presenca — e some para quem não é corretor, como já faz /presenca.

**Peças:** Painel (fila-lateral.tsx, função local — exportar ou copiar) para Notificações, Google Agenda e roletas; MinhasPosicoesRoletas (roletas/minhas-posicoes-card.tsx, exportado) no lugar de MinhaElegibilidadeCard; CheckinCard (só como linha de estado + link, ou inline quando falta check-in); AvatarUploadCard, PushOptInCard, GoogleCalendarCard (exportados; compactados); CabecalhosDeSecao (page-header.tsx) para 'Dados pessoais'.

### `/painel-gestor` — nota 2, esforço G, impacto alto

**Quem usa.** Gestão (admin, gestor, superintendente). A aba Dia é diária (home do BI para gestão e única que se atualiza sozinha); Funil e Time entram na ronda semanal; Metas & Ritmo no fechamento do mês. Atenção: o superintendente passa pelo guard do hub, mas dentro das abas Relatórios e Metas é tratado como não-gestão (ver problemas).

**Problemas.**

- Topo do hub: logo abaixo do PageHeader 'BI · Relatórios' há a faixa 'Vendas da empresa · Mês / Ano / Total' (rounded-md border, fora do estilo rounded-2xl/border-border-subtle) que repete 'Vendas no mês' do DiaTopo e 'Vendas' do ResultadoHero da aba Relatórios — o mesmo número em três lugares.
- Regra dos 2 menus quebrada: TabsList do hub (Dia, Relatórios, Funil, Time, Metas & Ritmo) + segunda TabsList de 7 sub-abas dentro de RelatoriosView (Resumo, Vendas, Atividades, Aprovações, Time, Corretores, SDR) + terceira TabsList Coorte/Snapshot dentro de FunilView. Três linhas de abas empilhadas; 'Time' existe nos dois níveis com conteúdo diferente.
- Títulos empilhados, nenhum via CabecalhosDeSecao: PageHeader 'BI · Relatórios' → SectionHeader 'Inteligência / O que os números estão dizendo' (InsightsPanel) → PageHeader 'Relatórios' (com Select de corretor + PeriodFilter nas actions); na aba Metas outro PageHeader 'Metas'; na aba Time outro PageHeader 'Leads por Corretor'.
- Aba Time é a mais espalhada: SimulacaoRegra65 (h2 + parágrafo longo + ControleRegra65 + UltimaRodada + 4 StatTiles + Table de 8 colunas + 2 parágrafos) → RevisaoRegra65 (h2 + parágrafo + select de mês + 4 StatTiles + Table de 11 colunas + parágrafo-manual) → PerformanceView (linha de texto + 2 botões + DataTable de 12 colunas + rodapé explicativo) → LeadsPorCorretorPage (PageHeader próprio com wrapper p-6, grade de CorretorCard por corretor com 4–7 linhas de ícone+texto cada, Card de filtros com Input/Select/Select + DataTable + diálogo de transferência). Quatro tabelas com a mesma primeira coluna 'Corretor', 8 StatTiles e N cards com o mesmo peso; nenhuma lista é 'a' lista.
- Aba Funil: FunilView empilha Card de aviso de cobertura, Card 'Funil da coorte', Card 'Coortes mensais' (Table de 9 colunas), Card 'Tempo por etapa', Card 'Vendas por semana' (LineChart da mesma métrica das 12 semanas do DiaTopo, só que no período filtrado); GargalosView acrescenta Card 'Onde está travando', Card 'Heatmap corretor × etapa' (com Select de métrica no título) e Card 'Motivos de perda' — 8 cards iguais sem hierarquia e sem 'Ver …'.
- Texto de manual e referência interna dentro da tela: 'Baseline = 3 meses anteriores ao período…', 'corretor filtrado vs time — comparação por taxa de passagem (#10)' e 'corretor filtrado vs média do time (#10)' em CardTitle (número de tarefa vazando para o usuário), 'Sinalizações vs média do time (amostra mínima 5 leads)…', 'Passe o mouse em …', 'Toque é contato real…' (RevisaoRegra65), 'Sem dado suficiente: … camada metrics (migrations da Fase A)…'.
- Filtros analíticos (Input de, Input até, Select corretor, Select origem) ocupam uma linha inteira acima do conteúdo da aba Funil em vez de ficarem atrás de um botão/menu com resumo em texto.
- MetasPage e LeadsPorCorretorPage trazem wrapper 'p-6' próprio: dentro da aba o conteúdo fica com padding duplo em relação às abas Dia e Funil.
- Cor fora do navy+dourado: SituacaoAgora usa border-laranja-500/bg-vermelho-500 (aliases de orange/red em src/styles.css, fora dos tokens de intent); StatTiles de Metas com intent info/warning/success decorativos; gráficos da aba Relatórios e do Raio-X em var(--chart-1/2/3); a linha 'Vendas por semana' do FunilView em var(--success) (verde).
- MetasPage mora no arquivo de rota src/routes/_authenticated/metas.tsx (rota de redirect) e é importada pelo hub — componente de página dentro de rota.
- [revisão] Problema que faltava: os três PageHeader internos (Relatórios, Metas, Leads por Corretor) não estão sob CabecalhosDeSecao, então cada um renderiza como h1 COM o eyebrow automático 'Módulo 09 · BI · Relatórios' (EyebrowDoModulo: título ≠ título do módulo) — o eyebrow dourado aparece duas vezes na mesma tela nessas abas, além do título duplicado.
- [revisão] Problema que faltava: o guard do hub aceita superintendente (podeVer = admin|gestor|superintendente), mas RelatoriosView e InsightsPanel calculam canSeeAll = isAdmin || isGestor — o superintendente abre a aba Relatórios e vê 'Sua performance' (escopo do próprio id, sem as sub-abas Time/Corretores) e insights do próprio recorte; MetasPage só mostra o PacingPanel para canManage (admin/gestor). O papel que o hub admite não é o que as abas reconhecem.
- [revisão] Corrigido o item 'Vendas por semana': não é cópia das 12 semanas do DiaTopo (lá é janela fixa de 12 semanas, aqui é o período filtrado), é a mesma métrica em outra janela — apagar continua razoável, mas o motivo é 'mesma métrica em dois lugares', não 'gráfico repetido'. Corrigido também o item de cor: FunilView/GargalosView não usam var(--chart-*); o LineChart usa var(--success).
- [revisão] Peças: 'Painel' (fila-lateral.tsx) e 'Kpi' (dia-topo.tsx) existem mas são funções privadas do módulo (não exportadas) — precisam ser extraídas/exportadas antes de reaproveitar; 'ExcecaoItem' mora em src/features/gestao/painel-dia/excecao-item.tsx e 'BulkActionBar' em src/components/ui/bulk-action-bar.tsx (ambos exportados), não em painel-dia-view.tsx; o diálogo de transferência do Painel do Dia é inline, não é componente. RaioXCorretor NÃO está 'já no padrão': tem a mesma composição do Meu Raio-X (StatGrid 4 + 4 Cards iguais + gráficos em var(--chart-*)) e entra no mesmo ajuste de paleta/hierarquia.

**Proposta.** Manter o PageHeader 'BI · Relatórios' e a linha única de 5 abas com o selo 'ao vivo' (já no padrão e travado em tests/bi-lancamento.test.tsx). Tirar a faixa 'Vendas da empresa' (o mês já está no DiaTopo; Ano/Total viram hint de um tile em Relatórios > Resumo). Envolver o conteúdo de todas as abas em CabecalhosDeSecao, como a Fase 8 fez em /financeiro: 'Relatórios', 'Metas & Ritmo' e qualquer cabeçalho interno viram h2 de seção com as mesmas actions (some o segundo eyebrow); remover o p-6 das páginas embutidas. Alinhar o papel: ou o hub deixa de aceitar superintendente, ou RelatoriosView/InsightsPanel/MetasPage passam a tratar superintendente como gestão só-leitura (canSeeAll inclui, canManage não) — hoje ele vê 'Sua performance' dentro do painel da gestão. Aba Funil: topo = um card 'Funil' com as barras da coorte e a 'maior perda' em destaque (reaproveitar FunilResumo/resumoDoFunil de funil-derive.ts), Coorte/Snapshot vira pílula nas actions do título de seção; filtros de/até/corretor/origem atrás de um botão 'Filtrar' (Popover) com o resumo em texto ('ago–out · todos · Meta Ads'); lista principal = o ranking 'Onde está travando' com 'Ver leads'; Coortes mensais, Tempo por etapa, Heatmap e Motivos de perda descem para uma seção colapsada 'Ver análise completa'; apagar 'Vendas por semana' (mesma métrica do DiaTopo); '(#10)' e 'Baseline = …' viram tooltip. Aba Time: topo = uma linha de 4 números do time no mês (vendas, VGV, conversão média, corretores acima do teto dos 65 — de mediasDoTime + totaisRegra65); lista principal = a DataTable de PerformanceView absorvendo as colunas 'Em atendimento / teto' e 'perdem a vaga' da SimulacaoRegra65 (uma tabela por corretor, não quatro) com 'Ver carteira' (→ /leads?corretor=) por linha; SimulacaoRegra65 (com o ControleRegra65 do admin) e RevisaoRegra65 descem como seção 'Regra dos 65' no fim, parágrafos viram hint/tooltip; LeadsPorCorretorPage sai da aba — os CorretorCards duplicam as linhas do ranking e a transferência em lote já existe em /leads e no Painel do Dia (BulkActionBar). O drill RaioXCorretor recebe os mesmos ajustes do Meu Raio-X (paleta navy+dourado em raio-x-blocos.tsx, um gráfico só, tabela atrás de 'Ver mês a mês'). Abas Relatórios e Metas: ver as entradas 'relatorios' e 'metas'. Mover MetasPage para src/features/metas/metas-page.tsx. Antes de reaproveitar, exportar/extrair Painel (fila-lateral) e Kpi (dia-topo) para componentes compartilhados.

**Peças:** CabecalhosDeSecao (src/components/page-header.tsx, exportado) — mesmo truque da Fase 8 no /financeiro; StatGrid/StatTile (src/components/ui/stat-tile.tsx, exportados) para a linha de números do time; Kpi de dia-topo.tsx existe mas é privado — exportar se for a escolha; FunilResumo (fila-funil-resumo.tsx, exportado) + resumoDoFunil (funil-derive.ts, exportado) para o funil com 'maior perda'; DataTable (components/ui/data-table, exportado) de PerformanceView como lista única da aba Time; RaioXCorretor (exportado) como drill — precisa do mesmo ajuste de paleta/hierarquia do Meu Raio-X; AtualizadoEm (inteligencia/atualizado-em.tsx, exportado); Painel de fila-lateral.tsx — existe, mas é função privada: extrair/exportar antes de usar; ExcecaoItem (painel-dia/excecao-item.tsx) + BulkActionBar (components/ui/bulk-action-bar.tsx), ambos exportados, como modelo de lista com ação em lote; totaisRegra65 (regra-65/derive.ts) / mediasDoTime (performance-derive.ts), ambos exportados.

### `/projetos (projetos.index)` — nota 2, esforço M, impacto baixo

**Quem usa.** Só gestão (RequireRole PAPEIS_CATALOGO = admin, gestor, superintendente; corretor é redirecionado para /projetos-foco). Edição (Novo/Importar/Editar/ativo/webhook) só admin (canManage = isAdmin); gestor e superintendente veem só 'Match IA' no cabeçalho. Uso ocasional: cadastro e manutenção de empreendimento, não é tela do dia.

**Problemas.**

- PageHeader com título antigo 'Projetos / Empreendimentos' (barra, dois nomes) e description de manual ('Catálogo de empreendimentos. Cada projeto tem seu próprio webhook para receber leads externos.') — a sidebar chama de 'Catálogo completo'.
- Três ações no cabeçalho para o admin (Match IA outline, Importar projetos outline, Novo projeto navy) — o Match IA é link para /match, nem é desta tela.
- Topo não responde 'como estou agora': nenhum número (ativos, inativos, sem book/tabela, sem preço); só uma linha de texto pequena 'N projetos de M · X inativos' depois dos filtros.
- ProjetosFilters é uma parede de filtros (busca + cidade/região/bairro/zonas/construtoras/tipo/dorms/suítes/vagas/status/fontes/preço/área/entrega) aberta acima do primeiro resultado, não atrás de menu.
- ProjetoCard mistura catálogo com operação de admin no mesmo peso: Switch 'Ativo' + botão Editar no topo do card, badge de slug em mono, link 'Ver detalhes →' duplicando o link do nome, e um bloco 'Webhook' sanfonado com token/revelar/copiar/regenerar + texto 'POST JSON: nome, telefone…' dentro do card — informação espalhada por card.
- Cards em Card (rounded-xl border-border) e não no cartão do padrão (rounded-2xl border-border-subtle).
- Wrapper 'p-6 space-y-6' próprio por cima do contêiner do shell (route.tsx já dá 'mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8'): a página fica com padding dobrado em relação à Fila Única, que usa só 'space-y-3 md:space-y-4'.
- [revisão] Composição conferida no código e bate; corrigido o problema do wrapper: não é 'p-6 em vez do espaçamento do shell', é p-6 SOMADO ao do shell (padding dobrado). Acrescentada a nuance de papel: gestor/superintendente veem uma ação só. Nota 2 mantida (topo sem número + lista com card pesado e parede de filtros).

**Proposta.** Topo: PageHeader 'Catálogo completo' (eyebrow automático 'Módulo 07 · Documentação & Projetos') com uma frase ('Todos os empreendimentos da casa, ativos ou não, e o que falta em cada um.'); uma linha de 3–4 números com dono (Ativos · Inativos · Sem book ou tabela · Sem preço, via completudeProjeto de lib/projetos-completude, o mesmo que a tela de Materiais já conta); 'Novo projeto' como única ação navy, 'Importar' e 'Match IA' num menu '…'. Lista: FilterBar com busca primária + chips (construtora, zona, status) e o resto dos filtros atrás de um Collapsible 'Mais filtros' (a FilterBar só recolhe no celular — no desktop ela é persistente); contagem como resultsLabel; grade de 3–4 colunas com card enxuto (nome, construtora, local, dorms/m²/entrega, 'A PARTIR DE' + preço, Book · Tabela numa linha) — Switch ativo, Editar e Webhook vão para um menu '…' do card (webhook abre em diálogo próprio ou na aba Comercial da ficha). Some: slug mono, 'Ver detalhes →' (o card inteiro abre a ficha), texto de webhook na description, wrapper p-6 (deixar o shell espaçar).

**Peças:** FilterBar (src/components/ui/filter-bar.tsx) — persistente no desktop, recolhível só no celular; o 'resto dos filtros' precisa de Collapsible (src/components/ui/collapsible.tsx); StatTile / StatGrid com 3–4 tiles (src/components/ui/stat-tile.tsx); ProdutoCard variante 'lista' (src/features/projetos/produto-card.tsx) — recebe ItemPrateleira, não ProjetoRow: precisa de adaptador; ou ProjetoCard enxuto; completudeProjeto / descreveFaltando (src/lib/projetos-completude.ts); EmptyState, QueryErrorState, SectionHeader (src/components/ui); DropdownMenu '…' por card (src/components/ui/dropdown-menu.tsx).

### `/relatorios` — nota 2, esforço G, impacto medio

**Quem usa.** Gestão, na reunião semanal e no fechamento: resumo executivo, vendas/atividades nominais, aprovações e folha do SDR. O corretor não chega aqui (o guard do hub redireciona para /), apesar de RelatoriosView ter um modo 'Sua performance' — modo que, hoje, é o que o superintendente vê (canSeeAll = admin|gestor).

**Problemas.**

- A rota é só redirect de compatibilidade (beforeLoad → /painel-gestor?tab=relatorios); a nota é da aba que ela abre: InsightsPanel + RelatoriosView.
- Dois cabeçalhos antes do conteúdo: SectionHeader 'Inteligência / O que os números estão dizendo' (InsightsPanel, grid de GlassCard glass-panel — superfície fora do padrão rounded-2xl/border-border-subtle) e PageHeader 'Relatórios' com Select de corretor + PeriodFilter nas actions, ambos abaixo do PageHeader 'BI · Relatórios' do hub. Não usa CabecalhosDeSecao — e por isso o PageHeader 'Relatórios' imprime um segundo eyebrow 'Módulo 09 · BI · Relatórios'.
- Segunda linha de abas com 7 sub-abas (Resumo, Vendas, Atividades, Aprovações, Time, Corretores, SDR) — a 'Time' daqui e a 'Time' do hub têm o mesmo nome e conteúdo diferente.
- Sub-aba Resumo abre com 19 caixas de número de mesmo peso antes de qualquer gráfico: ResultadoHero (4 StatTiles) + ProducaoPeriodo (6 StatTiles) + PipelineAgora (9 cards clicáveis em grid lg:grid-cols-9) — e SituacaoAgora entre eles (2 cards com border-laranja-500/bg-vermelho-500, aliases de orange/red fora dos tokens de intent).
- Mesmo número em vários lugares: 'Vendas' e 'VGV' do ResultadoHero repetem a faixa 'Vendas da empresa' do hub e os KPIs do DiaTopo; SituacaoAgora ('parados há 30 min', 'sem corretor') repete as Exceções da aba Dia; 'Funil do período' e 'Motivos de perda' repetem a aba Funil (os próprios cards têm AbaLink 'análise completa' para lá).
- Botão ExportarPdfButton solto num flex justify-end acima dos tiles, longe das actions do cabeçalho.
- Rótulos de seção como <p class='text-xs'> com explicação longa no lugar de título: 'Produção do período (cada atividade na data em que aconteceu)', 'Pipeline agora (estoque por etapa — foto de hoje, não segue o filtro de período)'.
- Gráficos (SerieChart, MotivosChart) em var(--chart-*), não em navy/dourado.
- [revisão] Problema que faltava: RelatoriosView e InsightsPanel usam canSeeAll/corretor = isAdmin || isGestor, mas o hub deixa o superintendente entrar — para esse papel a aba vira 'Sua performance' com escopo do próprio id (sem Time/Corretores/SDR) e insights vazios. Decidir: superintendente é gestão só-leitura (canSeeAll true) ou não entra no hub.
- [revisão] Peças: 'Painel de fila-lateral.tsx' e 'Kpi de dia-topo.tsx' existem mas não são exportados (funções privadas); PipelineEtapaPainel é privado de relatorios-view.tsx (serve dentro do mesmo arquivo, não como peça compartilhada). O resto (CabecalhosDeSecao, StatGrid/StatTile, FunilResumo, PeriodFilter) está exportado como descrito.

**Proposta.** Dentro do hub, 'Relatórios' vira título de seção (CabecalhosDeSecao) com período (pílula curta), corretor (Select) e 'Exportar PDF' nas actions. As 7 sub-abas saem da TabsList: Resumo passa a ser o conteúdo da aba; Vendas, Atividades, Aprovações, Time (renomear 'Vendas por corretor'), Corretores e SDR viram um Select 'Relatório: Resumo ▾' ao lado do período (ou uma linha discreta de links) — o hub fica com uma linha de abas só. Topo do Resumo = uma linha de 4 números com delta (Leads, Vendas, VGV, Ticket médio — o ResultadoHero já faz isso; Ano/Total da empresa entram como hint de Vendas). ProducaoPeriodo deixa de ser 6 tiles e vira uma linha compacta de 6 números pequenos num card só. Lista/área principal = 'Pipeline agora' em barras por etapa com contagem (desenho do FunilResumo / Snapshot do FunilView) com a expansão nominal ao clicar, no lugar dos 9 cards; InsightsPanel vira painel lateral 'O que os números dizem' (extrair o Painel de fila-lateral para componente compartilhado, 3 insights + 'Ver mais') ao lado do pipeline, em Card comum em vez de GlassCard. Descem para o fim: Evolução no período (um gráfico), Origem que vende, Motivos de perda. SituacaoAgora some (deixar o link 'ver exceções do dia' para a aba Dia). Cores: cards de alerta com intent do tema; gráficos em navy + dourado. Fechar a régua de papel: canSeeAll = admin|gestor|superintendente (leitura), canManage = admin|gestor.

**Peças:** CabecalhosDeSecao (exportado); ResultadoHero (privado em relatorios-view.tsx — StatGrid 4 com delta) como a linha do topo; FunilResumo (fila-funil-resumo.tsx, exportado) para o pipeline em barras; Painel de fila-lateral.tsx — privado; extrair/exportar para os insights; StatTile compacto (stat-tile.tsx) para a linha de produção; Kpi de dia-topo.tsx é privado; PeriodFilter (period-filter.tsx, exportado) / SeletorPeriodo (raio-x-blocos.tsx, exportado) como pílula nas actions; PipelineEtapaPainel (privado em relatorios-view.tsx — expansão nominal já existente, reaproveitável dentro do arquivo).

### `/vitrine` — nota 2, esforço G, impacto medio

**Quem usa.** Todos os papéis (SDR incluso). Corretor em atendimento ('cliente na mão'): monta shortlist, manda book/tabela/mensagem. Uso frequente mas não diário para todos.

**Problemas.**

- Título 'Mapa de Mercado' diverge da sidebar ('Vitrine (mapa)') e a description é uma frase de manual de ~30 palavras.
- Antes da área de trabalho (mapa) há quatro blocos empilhados do mesmo peso: SimuladorCliente (h2 próprio 'Cliente na mão', 4 CampoValor — renda, FGTS, entrada, reforço anual — 2 toggles — dependente, carteira +3 anos — bloco Resumo com chips de faixa, linha de composição, dois boxes Teto 'Fecha até'/'Cenário otimista, até' e disclaimer), caixa de filtros (busca, Valor até, Ordenar + três linhas de chips Zona/Situação/Dorms), banner âmbar de erro da planilha, linha de controles (3 switches de camada + 'Enquadrar resultados' + 'Abrir em tela cheia' como links de texto). No celular são várias telas até o mapa.
- Sem hierarquia de número: 'N empreendimentos · X fecham com o cliente · Y só na planilha' é texto pequeno abaixo do mapa; o número-chave ('Fecha até R$') está dentro do Resumo do simulador.
- Ações repetidas: 'Só quem fecha' (switch nos controles) × 'Ordenar: Quem fecha primeiro' (select) × badge de enquadramento no card; Comparar com dois rótulos ('Comparar/Selecionado' na lista, 'Adicionar/Sim' na tabela); 'Enquadrar resultados' e 'Abrir em tela cheia' como links de texto soltos.
- Card da lista com 4 Fato tiles (Disponibilidade, Comissão, Renda mínima, Entrega) — Comissão aparece para qualquer papel (sem checagem de papel no código), enquanto a prateleira só mostra comissão para gestão (decisão 10 de docs/revisao-projetos-foco.md: 'Só gestor e admin'); badges coloridos por situação (exito/aviso/celeste) e borda âmbar (border-l-amber-400) no hover/selecionado — cor fora do navy + dourado.
- GrupoFiltro, Camada e ChipRow/Chip duplicados entre vitrine.tsx e mapa-lojas.tsx; toda a UI mora no arquivo de rota, não em features/.
- Wrapper 'space-y-4 p-4 md:p-6' próprio por cima do padding que o shell já dá (padding dobrado).
- [revisão] Composição conferida linha a linha e bate (4 campos + 2 toggles, Comissão sem gate de papel, dois rótulos de Comparar, peças locais duplicadas); acrescentado o wrapper dobrado. Nota 2 e esforço G mantidos — é topo + lista + extração para features/ e components/mapa.

**Proposta.** Topo: PageHeader 'Vitrine' (ou renomear a seção para 'Mapa de Mercado' — um nome só) com uma frase ('Quem fecha com esse cliente, no mapa.'); a linha de renda no padrão da prateleira (RendaCliente: chips de renda + campo livre + '✓ Só quem fecha' dourado + contagem 'X fecham de N') e, ao lado, UM cartão principal 'Fecha até R$ X · Faixa 2 · parcela ~R$ Y' no desenho do PotencialDeCreditoCard do Modo Visita (que recebe LeadBriefing — aqui precisa de uma variante que receba o PoderDeCompra do simulador); FGTS/entrada/reforço/dependente/carteira ficam atrás de 'Ajustar o cliente' e a composição + cenário otimista + disclaimer atrás de 'Ver a conta'. Área de trabalho: lista à esquerda (380px) + mapa à direita como já faz o Mapa de Lojas, mapa primeiro no celular; filtros numa FilterBar (busca primária, chips Zona/Situação/Dorms; Valor até e Ordenar recolhidos); camadas (Zonas/Metrô), Enquadrar e Tela cheia num menu de camadas no canto do mapa; um só rótulo 'Comparar' e a pílula Lista/Tabela da Base de leads. Card = ProdutoCard (A PARTIR DE + preço, Book · Tabela · Enviar) com selo 'Fecha' dourado/'Não fecha' em texto; comissão só com mostrarComissao (gestão). Mover GrupoFiltro/Camada/Chip para um components/mapa compartilhado com /mapa-lojas e a página para features/vitrine; some o wrapper p-4/p-6.

**Peças:** RendaCliente (src/features/projetos/renda-cliente.tsx); PotencialDeCreditoCard (src/features/visitas/briefing-visita.tsx) — recebe { lead: LeadBriefing } e calcula por dentro: reaproveitar o desenho, não o componente como está (precisa de variante/adaptador); ProdutoCard com mostrarComissao (src/features/projetos/produto-card.tsx) — recebe ItemPrateleira: itens da planilha precisam de adaptador; FilterBar (src/components/ui/filter-bar.tsx); layout lista+mapa e ListaLojas de mapa-lojas.tsx (ListaLojas é função local da rota, não exportada — extrair primeiro); VitrineShortlist, VitrinePanel, EnviarVitrineDialog, MercadoMap (mantêm); Painel da fila-lateral (src/features/fila-unica/fila-lateral.tsx, função local não exportada — extrair) para a lateral 'Cliente na mão' no desktop; pílula Lista/Kanban da Base de leads (leads.index.tsx, botões aria-pressed).

### `academia/gestao.corretor.$corretorId` — nota 2, esforço M, impacto medio

**Quem usa.** Gestor/admin ao olhar um corretor específico (semanal, ou quando algo vence/para).

**Problemas.**

- Quatro botões de ação no PageHeader (Atribuir módulo navy, Roleplay presencial, Habilitado manual, Promover a Mestre — linhas 159–182): ação principal não é única e duas delas são raras (habilitado manual, promoção a Mestre).
- Botão ghost '← Time' solto acima do header (linhas 150–154; a trilha e a sidebar já levam à Gestão).
- Sem 'como está agora' além da frase da description ('Nível · x de y obrigatórios · na trilha desde'): atrasados, dias sem atividade e o passo em que ele parou não aparecem como números; a linha de 5 passos que a trilha do próprio corretor mostra (TrilhaDoCorretor) não é reaproveitada na visão da gestão.
- Cinco Cards de peso igual em grid 2 colunas (Atribuições abertas, Práticas, Módulos publicados em col-span-2, Histórico de nível, Certificados) — 'informação espalhada': a lista que importa (Módulos com estado, atrasados primeiro) vem no meio, e histórico/certificados (análise) têm o mesmo destaque.
- Listas internas em texto solto (p/div com text-sm) sem cartão padrão; padding dobrado (wrapper p-4 md:p-6).
- [revisão] Nota 3 → 2: a proposta refaz o topo (ação única + cartão principal 'Onde ele está'), a lista (Módulos absorve Atribuições, reordenada) e cria uma lateral — os cinco Cards atuais somem. Pela régua isso é 'recompor topo + lista' = 2. Esforço M continua honesto (uma tela, hooks já existentes).
- [revisão] TrilhaDoCorretor não é exportada (função local em trilha-page.tsx): precisa virar componente compartilhado antes; ficha.modulos já é AcademiaModuloStatusRow[], então continueDeOndeParou e passosDoModulo funcionam direto sem adaptação. 'Painel (fila-lateral.tsx)' não existe como export — o Painel exportado é o de ranking-ui.tsx.

**Proposta.** Topo: PageHeader (nome + SeloOrigem no titleAddon, description 'Nível · na trilha desde') com UMA ação navy 'Atribuir módulo' e as demais num DropdownMenu 'Mais ações' (Roleplay presencial, Habilitado manual, Promover a Mestre — este desabilitado com o motivo quando não é Especialista). Cartão principal 'Onde ele está': a linha de 5 passos (componente extraído de TrilhaDoCorretor) para o módulo em andamento (continueDeOndeParou(ficha.modulos) + passosDoModulo) + 3 números com dono: obrigatórios concluídos x/y, módulos atrasados (text-destructive se > 0), dias sem atividade. Lista principal: 'Módulos' com estado (ROTULO_ESTADO), atrasados primeiro, atribuição aberta/vencida marcada na própria linha (funde o card 'Atribuições abertas'). Lateral desktop com 3 Painel curtos (ranking-ui): 'Práticas' (últimas 3 + status; 'Corrigir' quando pendente), 'Certificados' (links), 'Histórico de nível' (3 últimas, 'Ver tudo'). Remover '← Time' e o wrapper de padding.

**Peças:** passosDoModulo (passos-trilha.ts) + componente extraído de TrilhaDoCorretor (trilha-page.tsx); estadoDoModulo / ROTULO_ESTADO / continueDeOndeParou (estado-modulo.ts); SeloOrigem (aba-time.tsx) / origemDoSelo (derivacao.ts); Painel (src/features/ranking/ranking-ui.tsx); DropdownMenu (components/ui/dropdown-menu.tsx) para 'Mais ações'; CorrecaoPratica (modo roleplay, mantém); StatusBadge, CabecalhosDeSecao.

### `financeiro/fechamento` — nota 2, esforço G, impacto medio

**Quem usa.** Admin e gestor, diariamente no fechamento do mês (o hub abre nesta aba para a gestão: `podeFechamento ? 'fechamento' : 'comissoes'`). Corretor e superintendente não veem a aba.

**Problemas.**

- A rota em si é só redirect para /financeiro?tab=fechamento (ok). A tela real é a aba Fechamento do hub: o hub já tem o PageHeader do módulo + CabecalhosDeSecao (Fase 8), mas a FechamentoPage ainda se intitula 'Financeiro · Fechamento' — prefixo redundante sob o título 'Assinaturas & Comissões'.
- FechamentoPage envolve tudo em <div className='p-4 md:p-6'>: padding duplicado dentro do hub (também nos estados de loading e erro), a seção fica deslocada em relação ao título do módulo e às outras abas.
- Terceiro nível de menu: dentro da aba do hub há um segundo <Tabs> com 5 abas (Fila de decisão, Recebíveis, Vendas sem corretor, Integridade, Conciliação). Sidebar → abas do hub → sub-abas quebra a regra dos 2 menus.
- Topo sem dono claro: StatGrid com 4 StatTiles (Em aberto, Travado por recebimento, Apto a pagar, Pago no mês) em que dois tiles carregam avisos âmbar de duas linhas dentro do hint ('+N sem venda vinculada — ver Integridade', 'aguardando beneficiário'); a aba Conciliação repete outro StatGrid de 4 tiles — 8 números com o mesmo peso espalhados em duas abas.
- A lista principal (fila de decisão) tem 4 ações por linha (Pagar, corrigir beneficiário, cancelar, histórico) sempre visíveis — ações secundárias fora de menu; a ação de lote só aparece quando há seleção.
- Aba Integridade = grade de N <Card> pequenos (título + badge + descrição) com o mesmo peso, mais tabela de órfãos com texto explicativo de três linhas ('Fora da fila de pagamento — provável resíduo…') — texto de manual dentro da tela.
- Sem lateral: Recebíveis e Vendas sem corretor são tabelas inteiras escondidas em abas, quando o que a gestão precisa ver de relance é 'quantas vendas ainda não receberam' e 'quantas vendas estão sem corretor'.
- Botão Histórico global no cabeçalho de seção compete com a ação principal (pagar). Os <Card> da Integridade usam o Card padrão (rounded-xl border-border) e a Conciliação usa caixas `rounded-md border` genéricas — nada em rounded-2xl.
- [revisão] Corrigido o problema dos cartões: as tabelas da fila, dos recebíveis e dos órfãos JÁ usam `rounded-xl border border-border-subtle` (linhas 311, 491 e 604 de fechamento-page.tsx) — a borda genérica está só nos <Card> da Integridade e nas caixas `rounded-md border` da Conciliação. O colega generalizou; o resto da composição confere linha a linha (PageHeader 'Financeiro · Fechamento' na linha 182, p-4 md:p-6 nas linhas 160/171/180, 5 TabsTrigger nas linhas 257-263, 4 StatTiles com hints âmbar nas linhas 206-254, outro StatGrid de 4 em conciliacao-tab.tsx 263-292).
- [revisão] Peças: DialogAcao (linha 666) e TabelaVendas (linha 589) existem mas são funções locais do próprio arquivo; AcoesLinha da ComissoesPage (comissoes-page.tsx:90) e o Painel de fila-lateral.tsx também são locais e não exportados — servem de molde, não de import. O Painel exportado é o de ranking-ui.tsx:161.

**Proposta.** Topo: título de seção só 'Fechamento' (CabecalhosDeSecao já existe) com a referência do mês na frase curta; tirar o p-4/p-6 interno (inclusive nos estados de loading/erro). Um cartão principal no molde do FilaCartao ('Caixa do mês · referência X'): número grande = Apto a pagar (R$ e qtd), três números ao lado (Em aberto, Travado por recebimento, Pago no mês) com a cor só acendendo acima de zero, e UMA ação navy 'Pagar N aptas' (abre o DialogAcao de lote já existente). Os avisos âmbar dos hints viram uma linha discreta abaixo do cartão ('+3 sem venda vinculada · 2 aguardando beneficiário'). Lista principal logo abaixo = Fila de decisão (busca numa linha discreta; checkbox + Pagar visível; corrigir beneficiário / cancelar / histórico atrás de um '…' no molde do AcoesLinha da ComissoesPage). Lateral no desktop com 3 painéis curtos (molde do Painel de fila-lateral ou o Painel exportado de ranking-ui): Recebíveis (N vendas · R$, 'Ver'), Vendas sem corretor (N, 'Definir'), Integridade (N alertas vermelhos). As tabelas de Recebíveis, Sem corretor e Integridade descem para o fim da página atrás de 'Ver recebíveis' / 'Ver vendas sem corretor' / 'Ver integridade' (âncoras, como o 'Ver funil' da Central). Conciliação (importar extrato, outro trabalho) sobe para a linha de abas do hub como 5ª aba (hoje são 4: Fechamento, Comissões & Aprovação, Tiers, DRE — ainda cabe em uma linha) e deixa de ser sub-aba. Histórico global vai para o menu de ações da seção. Some o texto explicativo da tabela de órfãos (vira hint de uma linha).

**Peças:** FilaCartao (fila-cockpit.tsx, exportado — molde do cartão principal com número grande + 3 números + ação; preso ao tipo FilaUnica, então copiar a forma); StatGrid com 3 tiles (stat-tile.tsx); Painel (ranking-ui.tsx, exportado) ou o molde do Painel local de fila-lateral.tsx (3 painéis curtos); CabecalhosDeSecao / PageHeader; AcoesLinha da ComissoesPage (função local, molde do menu '…' com DropdownMenu); DialogAcao e TabelaVendas (funções locais de fechamento-page.tsx, mantidas); ConciliacaoTab inteira (vira aba do hub); EmptyState; ResponsiveTabs do hub.

### `leads-por-corretor` — nota 2, esforço M, impacto alto

**Quem usa.** Gestão (admin/gestor; `canManage = isAdmin || isGestor` barra o superintendente com a mensagem "Apenas gestores e administradores", embora /painel-gestor o deixe entrar). Uso semanal/diário para ver a carteira de cada corretor e transferir leads em lote — é a resposta ao "gestão na mesma visão" que o dono pediu.

**Problemas.**

- A rota é só redirect para `/painel-gestor?tab=time`; o conteúdo (LeadsPorCorretorPage) é o 4º bloco da aba Time, depois de SimulacaoRegra65, RevisaoRegra65 e PerformanceView (`space-y-10`) — a aba vira uma página longa de 4 blocos com pesos iguais.
- Dois títulos empilhados: o hub já tem o PageHeader "BI · Relatórios" e LeadsPorCorretorPage renderiza outro PageHeader completo ("Leads por Corretor" + descrição + ação) sem CabecalhosDeSecao (painel-gestor.tsx não envolve a aba nele) — e ainda embrulha tudo em `p-6 space-y-6`, somando padding ao da aba.
- "Informação espalhada" literal: uma grade `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` com um CorretorCard POR CORRETOR (mais o "Sem corretor", tracejado), cada card com até 9 números no caminho normal (badge em tratativa, texto da tratativa, fundo, +N acima do teto, sem próximo passo, parados + %, em prospecção, ganhos, perdidos, redistribuições 7d) em ícones de 4 cores (azul-600, verde-600, warning, destructive, aviso-600) — com 15–20 corretores são 100–150 números sem hierarquia antes da lista.
- Duas notas de texto entre o cabeçalho e a grade (limite de 2.000 leads, só quando truncado; "N leads ainda sem primeiro contato — isso é prospecção, não carteira" com link).
- Filtros todos expostos no CardHeader da tabela: busca + Select de escopo + Select de status + botão "Limpar" (que só limpa a seleção de corretor, não os filtros), mais o título do card com sufixo explicativo ("· só o que está em tratativa (prospecção fica em Prospecção)").
- A ação principal (Transferir N leads) aparece em DOIS lugares: no PageHeader só quando há seleção — longe da tabela onde a seleção acontece, e no celular some da vista — e como ícone ghost ArrowsLeftRight em CADA linha (coluna `acoes`), que seleciona o lead e abre o diálogo.
- Card/CardHeader/CardTitle do shadcn em vez de cartão rounded-2xl border-border-subtle; a tabela fica dentro de um Card com título próprio (terceiro nível de cabeçalho).
- [revisão] Corrigido o número por card: o colega contou 5 (total, em atendimento, aguardando, ganhos, perdidos), que é só o fallback sem a RPC `leads_stats_por_corretor`; com `useCarteiraStats` o card mostra até 9 linhas. Acrescentado que a transferência também é ação por linha (ícone ghost), não só no cabeçalho, e que "Limpar" não limpa filtros. Em "peças": FilaEquipe só tem "Ver a fila" (e "Abrir higiene" na linha sem dono) — "Ver os 65"/"Minha base" seriam links novos; o DataTable mora em src/components/ui/data-table/ (pasta), não em data-table.tsx. Impacto subido para alto: é a tela que responde ao "gestão na mesma visão" do dono e é o caso mais literal de "informação espalhada" do grupo.

**Proposta.** Dentro da aba Time, o bloco vira seção com CabecalhosDeSecao ("Leads por corretor", uma frase) e perde o `p-6`. Topo: uma linha de 3–4 números da casa com dono (em tratativa · parados · sem corretor · em prospecção — este último com o link "Trabalhar em Prospecção" como hint), via StatGrid. A grade de CorretorCards vira UMA lista compacta de corretores (uma linha por pessoa: nome, total, em tratativa, % parada com o tom da carteira, X/65) — o mesmo desenho de FilaEquipe ("a mesma fila, vista pelo gestor": tabela rounded-2xl border-border-subtle), acrescentando às ações da linha "Ver os 65" (/meus-65?corretor=) e "Minha base" (/reserva?corretor=) ao lado do "Ver a fila" que já existe; clicar na linha filtra a tabela abaixo. Tabela: busca à esquerda, escopo e status atrás de um menu "Filtros" (ou pílula Em tratativa · Parados · Todos numa linha só), sem título de card; a nota do limite vira rodapé da tabela. Ação principal: "Transferir N" numa barra fixa que aparece ao lado da tabela quando há seleção (navy), não no cabeçalho; o ícone por linha vira item do menu "…" da linha. Alternativa de maior ganho: unir este bloco e PerformanceView numa lista de corretores só (ambos respondem "como está cada pessoa", como o próprio comentário da aba diz).

**Peças:** CabecalhosDeSecao (src/components/page-header.tsx); FilaEquipe (src/features/fila-unica/fila-equipe.tsx) como modelo de "lista do time" — hoje só com "Ver a fila"; os links para os 65 e a base seriam novos; StatGrid + StatTile (3–4 tiles); DataTable com seleção (src/components/ui/data-table/, já usada); carteira-stats.ts (tomDaCarteira, pctParada, excedente, semPassoVivo) para os números por corretor; ContadorEmAtendimento (src/features/em-atendimento/contador-chip.tsx) aceita `corretorId` para o X/65 por linha.

### `leads.$leadId` — nota 2, esforço G, impacto alto

**Quem usa.** Todos os papéis, muitas vezes por dia: é a ficha do cliente que a Fila Única, o Kanban, a Agenda, o SDR e a Sami abrem.

**Problemas.**

- O mesmo dado em dois ou três lugares: temperatura aparece no titleAddon do PageHeader (linha 287), de novo nos chips do 'Resumo executivo' (TemperatureChip, linha 392) e de novo no card 'Status' de LeadStatusCards (junto com a etapa, que também já está no titleAddon); origem está na description e no card 'Origem'; última interação está como 'Nd sem contato' no resumo e no card 'Última interação'; a 'próxima etapa' tem dois botões por tamanho de tela (acaoSugerida do Resumo executivo no desktop, 'Próxima etapa' do StickyActionRail no celular) mais a trilha 'Etapas do funil' sempre.
- Ação principal não é única: o PageHeader carrega cinco no desktop (Ligar, Registrar contato, Match IA, WhatsApp, Editar dados; no celular ficam Registrar contato e Editar), o Resumo executivo mais duas ('Perguntar à Sami', 'Gerar resumo') e o botão da acaoSugerida — todos com peso parecido.
- Antes de chegar à área de trabalho (abas) há até oito blocos empilhados de peso igual: Card Resumo executivo, Card Etapas do funil, SdrLeadCard (só com sdr_id ou quando o SDR pode pegar), EspelhoLeadCard (admin), AnaliseCreditoCard (na etapa ou com dados), HistoricoResponsaveisCard (gestão, Card sem margem inferior — cola no bloco seguinte), e os 3 LeadStatusCards. A Timeline (o histórico que o corretor lê antes de ligar) fica abaixo da dobra.
- LeadStatusCards é a definição de 'informação espalhada': três cartões pequenos (Status / Origem / Última interação) com o que o header já diz, cada um com um CardTitle próprio.
- Cor por módulo contra o monocromático: ícone Target em 'text-modulo-central' no Resumo executivo (linha 385); SdrLeadCard com 'border-modulo-sdr/30' e badge 'bg-modulo-sdr/15 text-modulo-sdr' (linhas 112–117).
- Texto de manual dentro da tela: ResumoIA ('A Sami lê o histórico do lead e resume em três linhas o que importa antes do próximo contato. Clique em "Gerar resumo".'); SdrLeadCard com parágrafos explicando posse e roleta; EmptyState da aba WhatsApp explicando webhook.
- Link '← Voltar para leads' acima do PageHeader (linhas 274–279, redundante com a trilha do header).
- Sete abas (Timeline, WhatsApp, Dados, Qualificação, Tarefas, Agendamentos, Documentação) — uma linha, mas no teto; a Timeline é o conteúdo padrão e não precisaria ser aba.
- Aba Qualificação é uma pilha de 7 blocos de mesmo peso (PerfilClienteCard, LeadObjecoes, SimuladorFinanciamento, 3 botões full-width de atalho, EmpreendimentoRecomendado).
- [revisão] Corrigido 'três botões de próxima etapa': o do Resumo executivo é 'hidden md:flex' e o StickyActionRail é md:hidden, então nunca são três ao mesmo tempo — são dois por tamanho de tela, mais a trilha. E a etapa NÃO se repete nos chips do Resumo executivo (só a temperatura); a etapa repete no card Status de LeadStatusCards.
- [revisão] 'Validar contra tests/final-regressions.test.ts' estava errado: esse teste não lê o dossiê (o alvo de 44 px é do card Kanban). Quem lê leads.$leadId.tsx é: tests/responsive-design-system.test.tsx (exige '<StickyActionRail', '<span>Ligar</span>', '<span>WhatsApp</span>', '<span>Próxima etapa</span>' e className="pb-44 md:pb-0"), tests/em-atendimento-fatia3a2.test.tsx ('target === "em_atendimento" && !gestao' e 'executarAcaoSugerida'), tests/analise-credito-fluxo.test.ts ('<AnaliseCreditoCard' com onRegistrarVenda/onNovaAnalise para contrato_fechado/analise_credito) e tests/mensagens-central.test.ts ('value: "whatsapp", label: "WhatsApp"'). Mais os testes de desfechos (em-atendimento-fatia2) e do SDR.
- [revisão] 'Painel (fila-lateral.tsx)' não é exportado; o Painel do design system está em src/features/ranking/ranking-ui.tsx. LEAD_STATUS_BADGE_TONE vem de src/lib/leads.ts (já importado na rota).

**Proposta.** Recompor topo + lista, mantendo toda a mecânica (goToStage, modais, SDR, análise de crédito, StickyActionRail e as strings que os testes cobram). PageHeader único: nome + TemperatureChip + Badge da etapa no titleAddon, uma linha de contato na description (telefone · e-mail · empreendimento · origem · no funil há N dias), e UMA ação navy = a acaoSugerida da etapa (executarAcaoSugerida; ou 'Registrar contato'); Ligar, WhatsApp, Editar, Match IA e 'Perguntar à Sami' viram uma linha discreta de botões-ícone/outline ou menu '…'. Tirar o '← Voltar para leads'. Grid desktop [cartão principal | lateral]: cartão principal 'Agora' com ScoreRing + 'Próxima melhor ação' + chips de risco só do que não está no header (Nd sem contato, docs pendentes, SLA/transferência vindos de LeadStatusCards) + a trilha de etapas compacta (os 7 passos + DesfechosEmAtendimento quando em_atendimento + 'Marcar como perdido' no fim); nada de repetir temperatura/etapa. Lateral com no máximo 3 Painel (ranking-ui): (1) 'Resumo da Sami' (ResumoIA sem o parágrafo de manual, botão 'Gerar'), (2) 'Contexto' (origem+campanha, última interação, corretor atual e 'Já passou por …' em uma linha — absorve LeadStatusCards e o HistoricoResponsaveisCard, com 'Ver histórico de responsáveis' abrindo o restante para a gestão), (3) o cartão situacional, um por vez e só quando há ação: SdrLeadCard (enxuto, sem cor de módulo, frases curtas) ou AnaliseCreditoCard (mantendo as props que analise-credito-fluxo.test.ts cobra). EspelhoLeadCard (admin) sai do fluxo e vai para o menu '…' → 'Espelho do lead' (dialog). Área de trabalho logo abaixo: Timeline (nota rápida + histórico) como corpo padrão, e as outras seis como abas de uma linha (WhatsApp · Dados · Qualificação · Tarefas · Agendamentos · Documentação; manter o item value 'whatsapp' label 'WhatsApp'). Na Qualificação, 'Perfil do cliente' e objeções primeiro; simulador e atalhos (planilha, fluxo, Vitrine) atrás de 'Simular e comparar'. No celular, StickyActionRail já tem a forma certa (Ligar, WhatsApp, Próxima etapa) e fica, com o 'pb-44 md:pb-0'; a lateral empilha depois da timeline. Remover LeadStatusCards e as cores de módulo. Validar contra responsive-design-system, em-atendimento-fatia2/3a2, analise-credito-fluxo, mensagens-central e os testes do SDR.

**Peças:** PageHeader com titleAddon (já em uso); ScoreRing, TemperatureChip, Badge + LEAD_STATUS_BADGE_TONE (src/lib/leads.ts); Painel (src/features/ranking/ranking-ui.tsx) para a lateral de 3 painéis; StickyActionRail (já em uso); DesfechosEmAtendimento e a trilha de etapas atual (reaproveitar o <ol> dos 7 passos, só mudando o contêiner); ResumoIA, AnaliseCreditoCard, SdrLeadCard (mantidos, só reposicionados); SlaBadge / TransferSlaBadge (absorver de LeadStatusCards); LeadPeekDrawer (features/leads/lead-peek-drawer.tsx) como referência de 'ficha compacta' para o painel Contexto; DropdownMenu para o menu '…'.

### `/agendamentos` — nota 3, esforço M, impacto alto

**Quem usa.** Corretor todo dia (visitas e follow-ups marcados); gestão com filtro por corretor para ver a agenda do time.

**Problemas.**

- No celular a TabsList Agenda/Tarefas vem antes do PageHeader; título 'Agendamentos' difere do rótulo 'Agenda' da sidebar.
- Cabeçalho com três grupos de ação do mesmo peso: botão 'Modo Visita' (outline), pílula Calendário/Lista e 'Novo agendamento' (navy) — no celular quebra em duas linhas.
- Não existe 'como estou agora': o primeiro bloco abaixo do título é um Card de controles (◀ mês ▶, Hoje, Select de corretor, Select de status). Nenhum número de visitas hoje / sem confirmação / a validar — embora resumoDoDia e classificarAgenda (agenda-do-dia.ts) já calculem exatamente isso para o hub e para a lateral da Fila.
- A área de trabalho é a grade mensal (AgendaCalendar, células min-h-[110px] em 7 colunas) — no celular fica inutilizável; a lista (AgendaTimeline) só aparece ao trocar a pílula.
- A página só permite ABRIR o compromisso para editar (Dialog); confirmar, validar visita (realizada/não veio) e remarcar — que existem em AgendaDoDiaCard (hub) e na lateral da Fila — não estão na própria Agenda.
- Grade e lista usam rounded-xl; descrição 'Visitas, reuniões e follow-ups da sua agenda.' é redundante com o título.
- Sem lateral no desktop.
- [revisão] Conferido no código: composição e nota 3 batem. Acrescentados dois problemas que faltavam: (a) remover um agendamento no dialog de edição usa confirm() nativo (agendamentos.tsx:379) — mesmo desvio apontado nos Templates; (b) a Linha do AgendaDoDiaCard liga por <a href="tel:"> (AtalhoIcone), não por useLigarLead — se o card virar o topo da Agenda, alinhar com a Fila/Prospecção.
- [revisão] Peças conferidas: AgendaDoDiaCard, useAgendaDoDia, resumoDoDia/classificarAgenda, ValidarVisitaSheet, RemarcarDialog, AgendamentoForm, Timeline e FilterBar existem. 'Painel' em fila-lateral.tsx é interno sem export; AgendaDeHoje é exportado.

**Proposta.** PageHeader 'Agenda' com frase curta ('Suas visitas e compromissos, e o que falta confirmar.'); título antes das abas no celular. Uma única ação principal no cabeçalho: 'Novo agendamento' (navy). 'Modo Visita' vira o link do cartão do dia; Calendário/Lista vira pílula discreta na linha do mês. TOPO: cartão 'Hoje' reaproveitando AgendaDoDiaCard/useAgendaDoDia (visitas de hoje com estado confirmada / sem confirmação / validar e as ações confirmar · validar · remarcar · ligar/WhatsApp/rota, com Ligar trocado para useLigarLead) — ou, mais simples, 3 números com dono via resumoDoDia: 'Visitas hoje · Sem confirmação · A validar'. ÁREA DE TRABALHO: no desktop a grade mensal; no celular a lista (AgendaTimeline) por padrão, começando em hoje; a navegação do mês vira uma linha discreta ('◀ outubro de 2026 ▶ · Hoje') e os filtros (corretor para gestão, status) vão atrás de 'Filtros'. LATERAL desktop (≤3 painéis): 'A validar' (visitas passadas sem desfecho) e 'Amanhã' (prévia) — ambos já vêm de classificarAgenda em agenda-do-dia.ts. Dialog de edição continua; remoção passa a AlertDialog.

**Peças:** AgendaDoDiaCard / useAgendaDoDia / resumoDoDia / classificarAgenda (features/agenda); AgendaDeHoje (fila-lateral.tsx, exportado); Painel (fila-lateral.tsx — interno, exportar antes); ValidarVisitaSheet; RemarcarDialog; AgendamentoForm; AgendaTimeline (Timeline); StatGrid/StatTile (3); FilterBar; AlertDialog; useLigarLead.

### `/higiene-funil` — nota 3, esforço M, impacto baixo

**Quem usa.** Gestão na ronda semanal de carteira parada e pastas com documento pendente: admin e gestor operam, superintendente vê; corretor não entra. Atrás de feature flag (flag off → redirect para /).

**Problemas.**

- Não usa PageHeader: HigienePage monta um <header> próprio com <h1 class='text-2xl font-semibold'> e o ícone Broom dentro do título — sem eyebrow 'Módulo 09 · BI · Relatórios', sem font-display, tamanho menor que o padrão; wrapper 'p-4 md:p-6' próprio.
- Topo com 4 StatTiles de mesmo peso (Leads vivos, Parados, Nunca tocados, Relógio de escrita em lote) quando só 'Parados' é o número que a página responde; os outros três são qualificadores dele. Cada tile traz hint-manual ('Sem MOVIMENTO no sistema — não é o mesmo que sem contato', 'Problema de distribuição, não de corretor', 'Importação/migração — não é abandono').
- Card de aviso com border-aviso-500/bg-aviso-500 (alias de amber em src/styles.css, fora dos tokens de intent) e parágrafo longo explicando 'escrita em lote', mais a linha 'Medido em … A base se move durante o dia (distribuição a cada 5 min, rotinas de SDR e follow-up diárias).' — texto de manual.
- Filtros (2 Switch 'Incluir escrita em lote' / 'Incluir nunca tocados') numa caixa bordada bg-muted/30 ocupando uma linha inteira entre os números e a lista.
- Tabs 'Fila de ação' / 'Pastas travadas' com ícone em cada TabsTrigger; cada aba começa com um parágrafo explicativo antes da tabela ('… ordenados por peso da fase: crédito e visita primeiro, porque é onde está o dinheiro.').
- Listas em Table de 7 colunas (FilaAcao: Prio, Dias, Lead, Fase, Corretor, O que fazer, Abrir; PastasTravadas: Dias, Lead, Fase, Corretor, Docs, O que falta, Abrir) com StatusBadge hue por status (cor por etapa) — sem seleção nem transferência em lote, que o Painel do Dia já tem para o mesmo tipo de lead.
- Nenhuma ação principal única visível: a única ação é 'Abrir' repetida em cada linha.
- [revisão] Peças: 'Numero de fila-cockpit.tsx' é função privada (não exportada); FilaCartao está exportado mas é específico da fila (anel dos 65, 'Atender agora') — serve de modelo visual, não de componente pronto. ExcecaoItem (painel-dia/excecao-item.tsx) e BulkActionBar (components/ui/bulk-action-bar.tsx) existem e estão exportados, mas o diálogo de transferência do Painel do Dia é inline em painel-dia-view.tsx (não é peça) e a linha da higiene tem forma diferente (Prio/Dias/Fase/O que fazer) — reaproveitar ExcecaoItem exige uma variante, não é plug. EmptyState e QueryErrorState já são usados aqui, conferido.
- [revisão] Nota 3 mantida, mas a proposta de trocar as Tables por feed é opcional: pela régua o que está fora é o topo (sem PageHeader, 4 tiles iguais, aviso, texto, caixa de filtros); a Table é 'a' lista e pode ficar, ganhando seleção + Transferir (BulkActionBar) e perdendo o 'Abrir' repetido. Esforço M continua honesto só se o feed for feito; só o topo + seleção é P/M.

**Proposta.** PageHeader 'Higiene do Funil' + 'O que está parado e custando dinheiro hoje.' (eyebrow automático). Topo = um cartão principal no molde do FilaCartao: o número grande 'Parados há 5+ dias' com os três qualificadores em linha (sem corretor · nunca tocados · em lote, acendendo cor só acima de zero), o aviso dos 20% de lote virando uma frase curta sob o número e 'medido às 14:02' via AtualizadoEm; ao lado, um segundo número 'Pastas travadas' com 'N de venda assinada' em vermelho — 2 números com dono, não 4 tiles. Os dois Switch viram itens de um menu 'Filtrar ▾' (DropdownMenu com checkbox) nas actions do título de seção, com o estado resumido em texto. Tabs em uma linha sem ícones (ou as duas listas empilhadas com CabecalhosDeSecao, já que são só duas). Lista principal = a fila de ação com seleção e BulkActionBar (Transferir, Abrir no /leads) — mantendo a Table se o feed de ExcecaoItem exigir variante nova; prioridade e dias viram o selo da linha, 'o que fazer' a segunda linha. Parágrafos explicativos viram tooltip no título da seção. Trocar border-aviso-500 pelo intent warning do tema.

**Peças:** PageHeader (page-header.tsx, exportado); FilaCartao (fila-cockpit.tsx, exportado) como modelo visual do número principal com qualificadores; Numero é privado; ExcecaoItem (painel-dia/excecao-item.tsx) + BulkActionBar (components/ui/bulk-action-bar.tsx), exportados — o diálogo de transferência do Painel do Dia é inline, precisa ser extraído; AtualizadoEm (inteligencia/atualizado-em.tsx, exportado); CabecalhosDeSecao para as duas listas; EmptyState / QueryErrorState (já usados aqui).

### `/links-uteis` — nota 3, esforço M, impacto baixo

**Quem usa.** Todos os papéis para abrir portais/tabelas/grupos (consulta ocasional); admin cadastra e vê o relatório de acessos (canManage = isAdmin).

**Problemas.**

- PageHeader ok (um título) mas com description de manual ('Centralize portais, tabelas, grupos e materiais de apoio para o time encontrar tudo em um lugar só.'); 'Novo link' navy no cabeçalho (admin) está certo.
- Cada link é um Card pesado (ícone + título, descrição em 2 linhas, URL crua em texto, badge Inativo, e um botão outline 'Abrir link' flex-1) — ação repetida em todo item, quando o item inteiro deveria ser o link; grade md:grid-cols-2 lg:grid-cols-3 de cards para o que é uma lista.
- Abas Catálogo (N) · Gerenciar · Acessos (admin): 'Gerenciar' é a mesma lista em Table (Título, Categoria, URL, Status, Ações) com toggle/editar/excluir — duplica o catálogo só para dar ações ao admin.
- Cabeçalhos de categoria em h2 ad-hoc (text-sm font-semibold) com Badge de contagem (não SectionHeader); busca + Select de categoria soltos acima; wrapper <div> sem espaçamento vertical (as abas encostam no PageHeader).
- [revisão] Composição conferida e bate (card com 'Abrir link' flex-1, três abas, h2 ad-hoc, <div> nu). Esforço subido de P para M: a mudança é a lista inteira (card → linha clicável que registra o acesso, '…' por linha com editar/desativar/excluir) e a remoção da aba Gerenciar num arquivo de 747 linhas — não é ajuste de topo. Nota 3 mantida: o topo é quase ok, o que pesa é a lista.

**Proposta.** Manter PageHeader 'Links Úteis' com uma frase curta ('Portais, tabelas e grupos do time, num lugar só.') e 'Novo link' navy (admin). Lista compacta: por categoria um SectionHeader e linhas divide-y (título · descrição curta, ícone de link externo à direita) — a linha inteira abre o link e registra o acesso; admin ganha '…' por linha (editar, desativar, excluir) e a aba 'Gerenciar' some. Busca + chips de categoria numa FilterBar discreta. 'Acessos' continua como segunda aba (ou 'Ver acessos' no fim) com a Table de hoje. Wrapper com 'space-y-4/6' como as demais páginas.

**Peças:** SectionHeader (src/components/ui/section-header.tsx) / CabecalhosDeSecao (src/components/page-header.tsx); FilterBar (src/components/ui/filter-bar.tsx) para busca + chips; DropdownMenu '…' por linha (src/components/ui/dropdown-menu.tsx); linhas divide-y do Painel da fila-lateral / ListaLojas (ambas funções locais não exportadas — copiar o padrão); Table de acessos e LinkFormFields (mantêm, no mesmo arquivo); EmptyState, QueryErrorState (src/components/ui).

### `/mapa-lojas` — nota 3, esforço M, impacto medio

**Quem usa.** Todos os papéis, SDR incluso (quem agenda visita precisa do stand). Corretor/SDR com o cliente no telefone: 'qual o stand mais perto?'. Uso frequente em atendimento.

**Problemas.**

- PageHeader ok (um título, uma frase em duas orações), mas as duas ações do cabeçalho são secundárias (Link para o cliente, Tela cheia) e a ação que resolve o caso de uso — 'Perto de mim' — é um botão h-8 outline (vira navy só depois de ativo, 'Ordenado por distância ×') perdido na linha de controles do mapa.
- Caixa de filtros alta antes do mapa: busca + linha de chips de Construtora (com ponto colorido e contagem) + Metragem (input + select de tolerância + Limpar + uma segunda linha de chips de metragens) + chips de Região — cinco linhas de controle no celular antes do primeiro stand.
- Linha de controles do mapa (switches Zonas de SP e Metrô/CPTM, Perto de mim, 'Enquadrar resultados' em texto) repete o desenho da Vitrine com peças locais duplicadas (GrupoFiltro, Camada, Chip).
- Cada item da lista tem 4 ações visíveis (Como chegar, WhatsApp, Copiar, Plantas (N)) além do chip dourado 'planta mais próxima' e obs — ações repetidas em todo item.
- Cor por construtora nos pontos (legenda do mapa, justificável) e banner âmbar de erro da planilha — fora do monocromático, mas é dado, não decoração.
- Wrapper 'space-y-4 p-4 md:p-6' próprio por cima do padding que o shell já dá (padding dobrado).
- A área de trabalho já está certa: lista (minmax(300px,380px)) + mapa lado a lado, mapa primeiro no celular (order-1/order-2), cabeçalho da lista com 'N de M stands · mais perto primeiro'.
- [revisão] Composição conferida e bate; precisado que 'Perto de mim' fica navy quando ativo (o problema é a posição, não a cor); acrescentado o wrapper dobrado. Nota 3 e esforço M mantidos.

**Proposta.** Topo: manter PageHeader 'Mapa de Lojas' com uma frase; 'Perto de mim' vira a ação navy do cabeçalho (com estado 'Ordenado por distância ×'); 'Link para o cliente' e 'Tela cheia' num menu '…'. Filtros numa FilterBar: busca primária + chips Construtora e Região visíveis; metragem como um campo compacto na barra (tolerância só aparece com valor) e os chips de metragens no recolhido. Camadas (Zonas/Metrô) e Enquadrar num menu de camadas no canto do mapa, compartilhado com a Vitrine. Lista: o cabeçalho 'N de M stands · mais perto primeiro' já é o 'como estou agora'; item com Como chegar + WhatsApp visíveis e Copiar/Plantas atrás de '…'. Extrair GrupoFiltro/Chip/Camada para components/mapa junto com a Vitrine; some o wrapper p-4/p-6.

**Peças:** FilterBar (src/components/ui/filter-bar.tsx); ListaLojas e o grid lista+mapa (já no padrão; função local da rota — exportar/extrair para reaproveitar na Vitrine); LojasMap (src/components/lojas/lojas-map.tsx), VisualizadorPlantas (local em mapa-lojas.tsx) — mantêm; DropdownMenu '…' para secundárias (src/components/ui/dropdown-menu.tsx); linhas divide-y do Painel da fila-lateral (função local, não exportada) para os itens.

### `/metas` — nota 3, esforço M, impacto medio

**Quem usa.** Gestão: admin e gestor cadastram/editam metas no início do mês (canManage) e são os únicos que veem o PacingPanel (ritmo, projeção, cálculo reverso, gap por corretor); o superintendente vê só o StatGrid de realizado e a lista de metas, sem ritmo.

**Problemas.**

- Rota é redirect, mas o arquivo contém e exporta MetasPage (importada por painel-gestor.tsx) — componente de página dentro de rota de redirect.
- Segundo PageHeader 'Metas' (+ descrição + Select mês + Select ano + botão 'Nova meta' com Dialog) empilhado sob o PageHeader 'BI · Relatórios' do hub, com wrapper 'p-6 space-y-6' próprio (padding duplo dentro da aba). Não usa CabecalhosDeSecao — e por isso imprime um segundo eyebrow 'Módulo 09 · BI · Relatórios'.
- Mesmo número em dois lugares: PacingPanel (Card 'Ritmo do mês') mostra o tile 'Realizado' com 'N vendas · N visitas' no hint, e logo abaixo um StatGrid de 4 StatTiles 'realizado em mês/ano' repete Vendas, VGV e Visitas (mais Atendimentos).
- Topo com 8 tiles (4 do PacingPanel + 4 do StatGrid) + a caixa do cálculo reverso + a Table 'gap por corretor' (6 colunas) antes da lista de metas, que é o objeto da tela.
- A lista de metas (ScoreRing + escopo + Badge mês + 4 barras de Progress por meta + Editar / Trash em ghost) fica num Card genérico no fim; apagar não pede confirmação (deleteMutation.mutate direto no onClick).
- Cor decorativa: StatTiles com intent info/warning/success por métrica; Badge default/destructive no título do PacingPanel.
- [revisão] Corrigido 'quem_usa': o PacingPanel só renderiza para canManage (admin/gestor) — o superintendente não 'acompanha ritmo, projeção e gap', ele vê só o StatGrid de realizado e a lista. Se a aba vira 'Metas & Ritmo' com o ritmo no topo, decidir se superintendente passa a ver o PacingPanel em modo leitura.
- [revisão] Peças: SemaforoDot é função privada de pacing-panel.tsx (não exportada); ScoreRing (components/ui/score-ring.tsx) e StatGrid/StatTile estão exportados. Composição e nota conferem com o código; esforço M mantido.

**Proposta.** 'Metas & Ritmo' vira título de seção (CabecalhosDeSecao) com um único controle de mês/ano ('Out/2026 ▾') e 'Nova meta' navy nas actions. Topo = o card 'Ritmo do mês' do PacingPanel reduzido a 4 números com dono claro — Meta, Realizado (vendas e visitas no hint), Projeção com o farol, 'Faltam N vendas ≈ X visitas · Y leads' (o cálculo reverso vira o quarto número/hint); apagar o segundo StatGrid. Mostrar esse topo também ao superintendente (leitura), já que a aba se chama Ritmo. Lista principal = as metas do mês (a lista atual com ScoreRing e barras, já boa) com o escopo Global/Equipe/Corretor como chip, Editar/Apagar num menu '…' da linha (apagar com confirmação); a Table 'gap por corretor' do PacingPanel se funde nessa lista quando a meta é por corretor (uma linha por corretor com meta, realizado, projeção, gap e farol) e sai da parte de cima. 'Trimestre (Σ meses)' desce para uma linha discreta no fim. Mover MetasPage para src/features/metas/metas-page.tsx e deixar a rota só com o redirect; exportar SemaforoDot se a lista for usá-lo.

**Peças:** CabecalhosDeSecao (exportado); StatGrid/StatTile do PacingPanel (4 tiles com farol via semaforo); ScoreRing (components/ui/score-ring.tsx, exportado) + Progress da lista de metas; SemaforoDot (pacing-panel.tsx) — privado, exportar se for usado fora do painel; DropdownMenu (components/ui) para o menu '…' por linha.

### `/presenca` — nota 3, esforço M, impacto medio

**Quem usa.** Corretor todo dia de manhã (a faixa CheckinPendenteBanner e 'Sua vez nas roletas' levam aqui); gestão todo dia para ver quem está em cada filial e quem ficou de fora da roleta.

**Problemas.**

- Cadastro misturado com operação: FiliaisConfig (um formulário por filial com endereço, coordenadas, raio, switch Ativa, 'Buscar pelo endereço', 'Ver no mapa', Salvar) está na mesma tela do quadro do dia, abaixo dele, para admin e gestor — é ajuste raro com o peso de um bloco diário.
- Texto de manual dentro da tela: o parágrafo de FiliaisConfig ('Coordenadas: use Buscar pelo endereço… no Google Maps, clique com o botão direito na porta da loja…') e o rodapé do CheckinCard ('Na filial, o celular informa a localização só no momento do check-in… Em casa, a localização nunca é pedida.'), mais a linha 'Conta as vendas assinadas em … e aprovadas no CRM (sem distrato).' da RegraDasVendas.
- O título de seção 'Presença de hoje' é um h2 ad-hoc (não CabecalhosDeSecao/SectionHeader); no corretor a página é um Card só, sem cartão principal nem hierarquia de 'como estou agora'.
- O número 'Sem check-in' aparece na StatTile e de novo como contagem (StatusBadge) da coluna 'sem_checkin' do quadro (mesmo número em dois lugares); idem 'No plantão (filiais)' vs. soma das colunas de filial, e 'Em casa, fora da roleta' vs. a coluna 'casa'.
- Quem é admin e também corretor vê CheckinCard + quadro + FiliaisConfig empilhados — três blocos grandes com o mesmo peso.
- 'Encerrar presença' é um botão ghost escondido no rodapé do card; o estado atual do check-in está numa caixa colorida (INTENT_BADGE_BORDERED) sem a cara navy/dourado do padrão.
- Cartões no Card padrão (rounded-xl); CardTitle text-sm/text-base sem font-display; sem lateral no desktop — o quadro ocupa a largura inteira com colunas (filiais + casa + 'liberado_gestao' + sem_checkin) de cartões pequenos em md:grid-cols-2 xl:grid-cols-3.
- [revisão] Impacto rebaixado de 'alto' para 'medio': para o corretor a tela já é um card só (não é 'informação espalhada'), e a parte da gestão já tem 4 números com dono + lista — o ganho real (tirar FiliaisConfig do fluxo, lateral, títulos) é de arrumação, não de achar dado. Acrescentei a coluna 'liberado_gestao' do quadro (agruparQuadro), que a proposta original esquecia, e corrigi as peças: Coluna/LinhaCorretor e Painel são funções locais não exportadas.

**Proposta.** Topo: PageHeader 'Check-in' + a frase curta por papel que já existe. Corretor: o CheckinCard vira o cartão principal (como 'A visita' do Modo Visita): título 'Hoje', a situação em uma linha ('Barra Funda · desde 09:12' ou 'Sem check-in'), as opções (filiais ativas + Em casa) como a grade atual, a régua '2 de 3 vendas em setembro' numa linha, 'Encerrar presença' como ação secundária visível; a nota sobre GPS vira tooltip/ícone no botão da filial. Gestão: manter a linha de 4 números (StatGrid com Na roleta · No plantão · Em casa fora da roleta · Sem check-in — já é 3–5 com dono) e logo abaixo o quadro por filial como lista principal (colunas de filial + Em casa + Liberado pela gestão); no desktop, lateral com 2 painéis curtos: 'Sem check-in' (a lista de quem cobrar, com a ação 'Confirmar no plantão') e 'Em casa, fora da roleta' — e as colunas do quadro deixam de repetir esses dois grupos. FiliaisConfig sai do fluxo: vira 'Filiais' nas ações do header (abre Dialog/Sheet) ou uma seção de Configurações; o parágrafo de instrução vira o texto de ajuda do campo. Título de seção com CabecalhosDeSecao; cartões rounded-2xl/border-border-subtle; verde/âmbar só quando há o que cobrar.

**Peças:** CheckinCard (exportado; manter, só recompor como cartão principal); StatGrid com os 4 StatTiles de PresencaQuadro (já no número certo); Coluna/LinhaCorretor de presenca-quadro.tsx (funções locais — exportar) para a lista por filial; Painel (fila-lateral.tsx, função local — exportar ou copiar) para 'Sem check-in' e 'Em casa, fora da roleta'; CabecalhosDeSecao (page-header.tsx) / SectionHeader (ui/section-header.tsx); MinhasPosicoesRoletas (roletas/minhas-posicoes-card.tsx, exportado; link de volta: 'o que o check-in libera'); FiliaisConfig inteiro (exportado), movido para Dialog/Configurações.

### `/projetos-materiais` — nota 3, esforço P, impacto baixo

**Quem usa.** Admin e gestor (RequireRole allow admin/gestor, redirect para /projetos-foco), quando chega material novo das construtoras — preenchimento em lote de book/tabela/capa/preço. Uso ocasional (semanal, não diário).

**Problemas.**

- Topo com 5 números sem dono único: 4 StatTiles (Com book, Com tabela, Com capa, Com preço — cada um com hint 'de N empreendimentos' / 'Foto do card na prateleira' / 'Ou marcado como sob consulta') e, embaixo, uma Progress + frase 'N de M prontos para a prateleira (zona conhecida e book ou tabela). Os demais ficam só no catálogo.' — o número que importa (prontos/faltam) é o menor e vem depois dos quatro.
- Description longa de manual ('Book, tabela, capa e preço de cada projeto. É daqui que a prateleira do corretor se alimenta — o que falta aqui não aparece lá.') e hints em cada tile.
- Duas ações outline no cabeçalho (Colar lista, Ver a prateleira) e nenhuma navy; a ação principal (Salvar) só existe na barra fixa do rodapé, que aparece quando há edição — correto, mas o cabeçalho fica sem ação visível.
- Em cada linha: nome, local, chip de score com tooltip, botão Plantas, link Ficha + 4 campos — denso mas é a mesa de trabalho; cabeçalho de grupo é h2 ad-hoc com estrela dourada + Badge de contagem.
- Wrapper 'space-y-6 p-6 pb-24' próprio por cima do padding e do pb-24 que o shell já dá (padding e reserva do BottomNav dobrados).
- [revisão] Composição conferida e bate. Nota baixada de 4 para 3: a própria proposta recompõe o topo (trocar 4 tiles + Progress por um cartão 'N de M' e reordenar as ações), e pela régua 'recompor o topo' é 3, não 'ajustes pequenos'. Acrescentado o wrapper dobrado. Esforço P mantido — é só o topo; a lista fica.

**Proposta.** Topo: PageHeader 'Materiais dos empreendimentos' + uma frase ('Book, tabela, capa e preço — o que falta aqui não chega à prateleira.'); trocar os 4 tiles + progress por UM cartão 'Prontos para a prateleira: 32 de 50' (anel/Progress, no padrão 'N de M' do FilaCartao) com a linha dos quatro faltantes como números pequenos invertidos para o trabalho ('Sem book 12 · Sem tabela 8 · Sem capa 20 · Sem preço 3'), sem hints. 'Colar lista' como ação navy do cabeçalho (é a porta do trabalho em lote), 'Ver a prateleira' outline. Busca + switch 'Só os que faltam algo' numa FilterBar discreta. Grupos com SectionHeader. A barra fixa de Salvar/Descartar fica como está. Some o wrapper p-6/pb-24 (o shell já faz isso).

**Peças:** Progress (src/components/ui/progress.tsx) + padrão de anel 'N de M' (AnelDoDia em src/features/fila-unica/fila-cockpit.tsx, função local não exportada — extrair) ou StatTile único; StatTile x4 em versão compacta sem hint (src/components/ui/stat-tile.tsx); FilterBar (src/components/ui/filter-bar.tsx) para busca + switch; SectionHeader (src/components/ui/section-header.tsx) para os grupos por construtora; EmptyState / QueryErrorState já usados; LinhaMaterial, CampoUrl, CampoPreco, ColarListaDialog (mantêm).

### `/projetos/$projetoId (ficha do empreendimento)` — nota 3, esforço M, impacto medio

**Quem usa.** Todos os papéis: o corretor chega pela prateleira, Match e Vitrine ('abrir ficha') durante o atendimento; gestão/admin para espelho de vendas, comercial e campanha em foco (canManage = admin). Frequência média.

**Problemas.**

- Não usa PageHeader: ProjetoHero é um hero navy com h1 próprio (fonte Sora, preço dourado, 4 chips, até 3 botões Copiar mensagem/Book/Tabela) — sem eyebrow 'Módulo 07' e com cabeçalho diferente de todas as outras telas; enquanto o projeto carrega aparece um PageHeader 'Projeto / Gestão completa do empreendimento' que depois é trocado pelo hero (dois cabeçalhos diferentes para a mesma tela, um atrás do outro).
- Logo abaixo do hero, 5 StatTiles de unidades (Total, Disponíveis, Reservadas, Vendidas, VGV disponível) com o mesmo peso do hero — para o corretor, que raramente tem espelho cadastrado, são cinco zeros antes da ficha.
- Mesmo número em dois lugares: 'A partir de' e entrega aparecem no hero (preço grande + chip) e de novo na ProjetoFichaTecnica (10 InfoLines: Metragem, Dorms/Suítes, Vagas, Preço a partir de, Status entrega, Tipo extra, Status do preço, Zona SMQ, Endereço, Fonte).
- Na aba Unidades a barra tem toggle Grade/Tabela + busca + select de status + 'Nova unidade' na mesma linha; na aba Comercial o ProjetoComercial traz CardHeader/CardTitle próprio (título de aba, não de seção).
- Botão 'Projetos' (voltar) dentro do hero duplica a trilha do header.
- Wrapper 'p-6 space-y-6' próprio por cima do padding que o shell já dá (padding dobrado, igual ao Catálogo).
- [revisão] Composição conferida e bate; precisado que os dois cabeçalhos são sequenciais (fallback de carregamento → hero), não simultâneos; contagem das 10 InfoLines conferida; acrescentado o wrapper p-6 dobrado, que faltava. Nota 3 e esforço M mantidos.

**Proposta.** Topo: PageHeader com o nome do empreendimento, titleAddon com chips (construtora, 'Em foco' dourado) e description 'bairro · zona · entrega' — o eyebrow automático dá 'Módulo 07 · Documentação & Projetos'; o hero navy vira o cartão principal 'como estou agora' do produto: 'A PARTIR DE' + preço, renda mínima, disponíveis (um número só, dos stats) e a linha Book · Tabela · Copiar mensagem de venda (ação principal). Os 5 StatTiles descem para o topo da aba Unidades como 3–4 números (Disponíveis · Reservadas · Vendidas · VGV) — número de estoque fica com quem gere estoque. Ficha técnica continua como seção (SectionHeader) sem repetir preço/entrega. Abas (Unidades · Comercial · Histórico · Projeto em foco) dentro de CabecalhosDeSecao para que CardHeader/CardTitle do Comercial vire título de seção; toolbar de Unidades: Grade/Tabela como pílula, busca+status numa linha discreta, 'Nova unidade' única ação navy. Some: botão 'Projetos' do hero (a trilha já leva), PageHeader de fallback 'Gestão completa do empreendimento' (vira Skeleton), wrapper p-6.

**Peças:** PageHeader com titleAddon (src/components/page-header.tsx, padrão do dossiê do lead); ProjetoHero como cartão principal (manter visual, tirar o h1); StatTile x3–4 (src/components/ui/stat-tile.tsx); ProjetoFichaTecnica + SectionHeader (já no padrão de seção); CabecalhosDeSecao (src/components/page-header.tsx) para os cabeçalhos das abas; linha Book · Tabela · Enviar do ProdutoCard (src/features/projetos/produto-card.tsx); pílula Lista/Kanban da Base de leads (leads.index.tsx, botões aria-pressed) para Grade/Tabela.

### `/reativacao` — nota 3, esforço M, impacto medio

**Quem usa.** SDR, diariamente, para tentar de novo quem cumpriu a cadência sem responder (fila secundária ao discador); gestão acompanha. Corretor nunca vê (recusa explicada).

**Problemas.**

- Descrição do PageHeader é manual ('…volta aqui depois da janela de descanso — com a renda e os horários já tentados à vista').
- Sem 'como estou agora': nenhum número no topo (para trabalhar hoje · em descanso · reativados), embora acionaveis.length e em_descanso.length já estejam carregados e fetchPainelReativacao tenha os 30 dias para a gestão. Os números de reativação hoje vivem em BlocoReativacao do Painel da cadência (8 tiles), não aqui.
- Dois Cards com CardTitle + CardDescription longas de manual ('Maior renda primeiro. As faixas de horário já gastas aparecem na linha…', 'Somente leitura… não dá para antecipar, e é de propósito') — explicação dentro da tela.
- Linha do acionável acumula: nome, badge 'prioridade N', badge de tentativas, linha de meta (empreendimento · faixa · 'na fila desde dd/mm hh:mm'), linha 'Horários já tentados: …' e 2 botões — a ação primária ('Reativado') já é única em navy, o resto tem peso igual.
- Cards no Card padrão (rounded-xl border-border, card.tsx:10) com ícones duotone no título, fora do cartão rounded-2xl/border-border-subtle com título em font-display; linhas internas em rounded-lg border p-4; sem lateral no desktop.
- [revisão] Composição e nota 3 conferidas. Esforço corrigido de P para M: a proposta cria um topo de 3 números (com dado novo da gestão via fetchPainelReativacao), reescreve a linha do acionável em EntityRow com chips de horário, move 'Em descanso' para painel lateral no desktop e Collapsible no celular — recompõe topo e lista, não é ajuste de horas.
- [revisão] Peças: StatGrid/StatTile, CabecalhosDeSecao, EntityRow, Collapsible e fetchPainelReativacao existem; 'Numero' (fila-cockpit.tsx) e 'Painel' (fila-lateral.tsx) são internos sem export — exportar antes.

**Proposta.** PageHeader 'Reativação' com frase curta ('Quem cumpriu a cadência sem responder, de volta para uma nova tentativa.'). TOPO: linha de 3 números com dono — 'Para trabalhar hoje · Em descanso · Reativados (30 d)' (StatGrid com 3 StatTile; o terceiro só para gestão via fetchPainelReativacao, para o SDR mostrar 'próximo elegível em …'). LISTA principal: 'Para trabalhar hoje' como título de seção (CabecalhosDeSecao) com a regra 'maior renda primeiro' em tooltip; linha = EntityRow com nome, faixa de renda e empreendimento numa linha, horários já tentados como chips (manhã · tarde · noite riscados quando usados), 'Reativado' em navy e 'Sem retorno' como outline/ícone; 'prioridade N' e tentativas viram texto da meta. 'Em descanso' deixa de ser um Card igual ao de trabalho: no desktop vira painel lateral (Painel da fila-lateral exportado, 4 linhas + '+N'), no celular desce atrás de 'Ver em descanso (N)'. Dialog 'Marcar como reativado' continua.

**Peças:** StatGrid/StatTile (3); Numero (fila-cockpit.tsx — interno, exportar antes); Painel (fila-lateral.tsx — interno, exportar antes); CabecalhosDeSecao; EntityRow; Collapsible; fetchPainelReativacao (painel-client.ts) para os 30 dias da gestão.

### `/simulador-amortizacao` — nota 3, esforço P, impacto baixo

**Quem usa.** Todos os papéis; corretor depois da aprovação de crédito (dossiê abre com ?financiamento/?taxa/?prazo/?sistema/?renda/?avaliacao). Uso ocasional, de consulta.

**Problemas.**

- Description é lista de recursos ('SAC e PRICE mês a mês, com TR, seguros, taxa de administração, fase de obra e amortização com FGTS.') e o cabeçalho tem três ações (Fluxo das construtoras outline, Copiar resumo outline, Exportar PDF dropdown navy).
- Formulário à esquerda: o card 'Dados do financiamento (do contrato)' (border-primary/40) visível e, abaixo, um Collapsible 'Calculado automaticamente' (fechado por padrão) que já guarda os outros 4 cards (Correção e renda, Seguros e taxas, fase de obra, Amortização extra) — o formulário JÁ segue a regra 'essencial visível, resto atrás de Ver…'.
- No Resumo, os 3 Kpi do topo (Valor do financiamento, Juros ao mês, Correção do saldo) são eco do formulário ao lado — o mesmo número em dois lugares — enquanto o que o cliente pergunta (1ª parcela SAC × PRICE, renda mínima, total pago) está como linhas de uma tabela comparativa de 15 itens com ícones de dica.
- 'Leitura para o cliente' (LeituraComercial, a frase que o corretor usa) está no FIM da aba Resumo, depois da tabela; Kpi local em vez de StatTile.
- Abas Resumo · Planilha mês a mês · Gráficos estão certas (uma linha, indicator); disclaimer de três linhas no fim; wrapper 'mx-auto max-w-7xl' redundante com o do shell.
- [revisão] Refutado o problema 2 do colega ('5 Cards empilhados com o mesmo peso'): o código já recolhe 4 dos 5 cards num Collapsible fechado por padrão (useState(false)), e a proposta de 'virar seções recolhidas' já está feita — removida da proposta. Tabela comparativa tem 15 linhas, não 14. Esforço baixado de M para P: o que sobra é o topo (description/ações), subir a LeituraComercial, trocar 3 Kpi por 3 StatTiles e esconder a tabela atrás de 'Ver comparativo'. Nota 3 mantida (topo ainda precisa ser recomposto).

**Proposta.** Topo: PageHeader 'Planilha de amortização' com uma frase ('SAC ou PRICE, mês a mês, para o contrato do cliente.'); 'Exportar PDF' única ação navy (mantém o menu resumido/completo), 'Copiar resumo' outline pequena e 'Fluxo das construtoras' numa linha discreta. Resultado: a LeituraComercial sobe como cartão principal e abaixo dela 3 StatTiles que respondem ao cliente (1ª parcela SAC | PRICE · Renda mínima · Total pago); a tabela comparativa de 15 linhas fica como segundo bloco ou atrás de 'Ver comparativo completo'; Planilha e Gráficos seguem como abas. Formulário: fica como está (card do contrato visível, 'Calculado automaticamente' recolhido) — some só o eco dos 3 Kpi. Disclaimer numa linha; remover o wrapper max-w-7xl redundante.

**Peças:** StatTile (src/components/ui/stat-tile.tsx, substitui Kpi local); LeituraComercial (existente no mesmo arquivo, só muda de posição); Tabs com indicator (já usado); Collapsible (src/components/ui/collapsible.tsx — já usado no formulário) para o comparativo; DropdownMenu do Exportar PDF (mantém); testes tests/simulador-amortizacao-estado.test.ts e tests/simulador-amortizacao-pdf.test.ts travam a conta e o PDF, não a tela.

### `/simuladores` — nota 3, esforço M, impacto medio

**Quem usa.** Todos os papéis; corretor em atendimento (fluxo de pagamento da construtora, argumento de urgência), também aberto do dossiê com ?projeto/?valor/?renda/?financiamento/?subsidio/?fgts/?parcela. Uso frequente desde 2026-10-11.

**Problemas.**

- CabecalhoSimuladores: PageHeader 'Simuladores' com description de manual em duas frases ('…As mensais contam a partir do mês do ato: cada mês sem fechar é uma mensal a menos.') e três ações (Planilha de amortização outline, Copiar para WhatsApp outline, Exportar PDF navy) + a linha de abas das 4 construtoras com logo (Vibra, Direcional, Longitude, Mundo Apto — uma linha, ok).
- Coluna de resultado empilha 7–8 blocos do mesmo peso: AvisoRegras, Alertas, card Resumo (4 Kpi + bullets + nota), QuantoCustaEsperar (frase + tabela), Composição, Comprometimento (3 Kpi), Cronograma (tabela) e parágrafo de disclaimer — o número que o corretor fala ('19x R$ 2.000') é um Kpi 'destaque' entre quatro, não o cartão principal.
- Kpi é peça local (pecas.tsx: rounded-lg, text-lg, border-primary/40 no destaque) em vez do StatTile do design system — cada simulador (Vibra, Mundo Apto, Longitude) repete a grade 'sm:grid-cols-2 xl:grid-cols-4' de Kpis.
- Coluna da esquerda com 4 cards de formulário (Empreendimento, Banco, Negociação, Regras) — CardRegras (ajustes do preset, uso raro) ocupa a primeira coluna com o mesmo peso do formulário do cliente.
- Wrapper 'mx-auto max-w-7xl' redundante: o shell já envolve o conteúdo no mesmo max-w-7xl com padding — não falta padding, sobra um contêiner.
- [revisão] Corrigido o problema 5: o colega disse 'sem o padding das demais páginas', mas route.tsx já dá 'mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8' a toda página; o wrapper é redundante, não deficiente. Contagem de blocos da coluna de resultado ajustada (AvisoRegras + Alertas + 5 cards + disclaimer). Nota 3 e esforço M mantidos.

**Proposta.** Topo: PageHeader 'Simuladores' com uma frase ('O fluxo de pagamento de cada construtora, com as regras dela.'); a explicação do 'mês do ato' vai para o card 'Quanto custa esperar'; 'Exportar PDF' única ação navy, 'Copiar para WhatsApp' outline pequena e 'Planilha de amortização' num menu/linha discreta. Abas das construtoras ficam (uma linha). Resultado: UM cartão principal 'Fluxo do cliente' (navy, como 'A visita' do Modo Visita) com a mensal em destaque ('19x R$ 2.000 · mar/26 a set/27') e três números com dono (Ato · Chaves · Total à construtora) em StatTile, com Copiar/PDF no rodapé do cartão; 'Quanto custa esperar' logo abaixo com acento dourado (é 'a vez' do argumento); Composição, Comprometimento e Cronograma descem para abas Resumo · Cronograma ou atrás de 'Ver mês a mês'; Alertas continuam acima do resultado; disclaimer numa linha. CardRegras recolhido ('Regras da Vibra · ajustar') abaixo do formulário, com o AvisoRegras como linha dentro dele. Trocar Kpi por StatTile nas quatro abas. Remover o wrapper max-w-7xl redundante.

**Peças:** CabecalhoSimuladores (src/features/simuladores/pecas.tsx — manter, encurtar description e ações); StatTile no lugar de Kpi (src/components/ui/stat-tile.tsx); Numero / AnelDoDia do FilaCartao (src/features/fila-unica/fila-cockpit.tsx, funções locais não exportadas — extrair) para o padrão de número com dono; cartão navy 'A visita' do Modo Visita (src/features/visitas) para o cartão principal; Tabs com indicator como na Planilha de amortização (src/components/ui/tabs.tsx); Alertas (pecas.tsx) e Collapsible (src/components/ui/collapsible.tsx) para as regras; testes tests/simuladores-page.test.tsx travam abas, prefill e troca de aba — a recomposição não pode mexer nisso.

### `/tarefas` — nota 3, esforço M, impacto medio

**Quem usa.** Corretor (badge tarefasVencidas na sidebar) e gestão, que vê e atribui tarefas de todos. Uso diário, mas secundário à Fila Única e à Agenda.

**Problemas.**

- A rota /tarefas é só redirect (deep-link); a tela real é a aba 'tarefas' do hub /agendamentos. No celular a linha de abas Agenda/Tarefas (TabsList md:hidden) é renderizada ANTES do PageHeader — a aba vem acima do título.
- PageHeader 'Tarefas' com frase genérica ('Centralize follow-ups e atividades do seu funil.').
- Topo = 4 StatTiles do mesmo peso (Pendentes, Em andamento, Atrasadas, Concluídas hoje) — 'Em andamento' e 'Concluídas hoje' são vaidade, não decisão; falta a ordem do dia (vencidas · hoje · esta semana).
- Um Card único empilha: quick-add (input + botão), busca + 2 Selects de filtro inline, e a lista; os filtros ficam sempre visíveis em vez de atrás de menu.
- Duas formas de criar com o mesmo peso: 'Nova tarefa' (navy no cabeçalho, abre dialog de 7–8 campos) e o quick-add com botão 'Adicionar' (outline).
- Cada linha carrega 4 badges (status, prioridade, tipo, Atrasada) + descrição + linha de meta (vence, lead, corretor) + botão Adiar + botão Editar — muitos blocos pequenos de peso igual; a lista é ordenada por vencimento mas não agrupada (vencidas/hoje/próximas).
- Concluídas ficam na mesma lista (riscadas), só filtráveis por Select.
- [revisão] Conferido no código: composição e nota 3 batem (o esqueleto da linha — círculo de concluir + título + meta + ações — se mantém; o trabalho é o topo, o agrupamento e enxugar badges). Acrescentado um detalhe que a proposta precisa prever: o quick-add cria a tarefa SEM data_vencimento (tarefas-page.tsx:225), então o agrupamento Vencidas → Hoje → Depois precisa de um balde 'Sem data' ou o quick-add passa a sugerir 'hoje'.
- [revisão] Peças: BUCKET_LABEL/BUCKET_HINT moram em features/fila-unica/derive.ts (a página só os consome); 'Painel' em fila-lateral.tsx é interno sem export; AgendaDeHoje é exportado.

**Proposta.** PageHeader 'Tarefas' com frase curta ('O que você combinou fazer, na ordem do vencimento.'), título antes das abas no celular. TOPO: 3 números com dono — 'Vencidas · Para hoje · Esta semana' (StatGrid com 3 StatTile; vencidas em vermelho só acima de zero). AÇÃO PRINCIPAL única: o quick-add como a linha navy de criar ('Adicionar tarefa… Enter', com vencimento padrão hoje); o dialog completo vira '+ detalhes' ao lado. LISTA principal agrupada como a Fila Única (ponto + rótulo + contagem + dica): Vencidas → Hoje → Depois → Sem data; linha = círculo de concluir + título + UMA linha de meta (vence · lead · corretor para gestão); prioridade como ponto colorido à esquerda, tipo como texto, status implícito pelo grupo; Adiar e Editar num único menu '…'. Busca e filtros (status, tipo, corretor para gestão) atrás de um botão 'Filtros' com contador (FilterBar/Sheet como na ConsultaView). Concluídas descem atrás de 'Ver concluídas (N)'. LATERAL desktop: AgendaDeHoje (fila-lateral) — tarefas e visitas são o mesmo dia.

**Peças:** StatGrid/StatTile (3); grupos por bucket (BUCKET_LABEL/BUCKET_HINT em fila-unica/derive.ts); AgendaDeHoje (fila-lateral.tsx, exportado); Painel (fila-lateral.tsx — interno, exportar antes); FilterBar (components/ui/filter-bar.tsx); EntityRow; DropdownMenu; useUndoableMutation (já usado).

### `academia/conteudo.index` — nota 3, esforço P, impacto baixo

**Quem usa.** Só o admin, quando prepara ou revisa módulos (esporádico, não é rotina diária).

**Problemas.**

- Botão ghost '← Gestão' solto acima do PageHeader (linhas 83–87): a trilha do header (Módulos / Academia / Conteúdo) já faz esse caminho e 'Conteúdo' é seção da sidebar (sistemas.ts, flag academia_gestao); é linha a mais no topo.
- A description do PageHeader mistura o placar com texto de manual: '{publicados} de {total} módulos publicados · {comRevisao} com revisão pendente. Só admin edita.' — os dois únicos números da tela ficam escondidos numa frase, e 'Só admin edita' é explicação dentro da tela.
- Não há 'como estou agora': o trabalho do admin (módulos com revisao_pendente ou revisar_em vencido) está diluído dentro das listas por fase, com o mesmo peso de um módulo publicado e em dia.
- LinhaModulo usa 'rounded-lg border' e cores literais (text-amber-700 / dark:text-amber-400) em vez de cartão rounded-2xl border-border-subtle e tokens warning/destructive.
- Título de fase é um h2 'text-sm font-semibold' igual ao de qualquer seção — sem CabecalhosDeSecao/font-display.
- Wrapper próprio 'p-4 md:p-6' por cima do 'px-4 py-6 md:px-8 md:py-8' que o shell (_authenticated/route.tsx, linha 142) já dá ao Outlet: padding dobrado em relação às páginas Lançamento (vale para todas as 9 rotas da Academia).
- [revisão] Nota 4 → 3: a própria lista de problemas diz que o topo não responde 'como estou agora' (critério 2) e a proposta recompõe o topo (tira botão, troca description, cria linha de 3 números e reordena a lista com 'Precisam de revisão' primeiro). Pela régua isso é 'recompor o topo' = 3, não 'ajustes pequenos'. Composição e demais problemas conferem com o código.
- [revisão] StatGrid é 'sm:grid-cols-2 xl:grid-cols-4': com 3 tiles sobra uma célula vazia no desktop — passar className='xl:grid-cols-3' (ou usar um grid próprio de 3).

**Proposta.** Topo: tirar o '← Gestão' (trilha do header basta) e deixar a description curta ('Módulos por fase: o que está no ar, o que precisa de revisão.'). Abaixo do header, UMA linha de 3 números com dono — Publicados · Rascunhos · Revisão pendente/vencida — em StatGrid (className xl:grid-cols-3) com 3 StatTile (o terceiro em intent danger quando > 0, clicável rola até a lista). Lista principal: primeiro a seção 'Precisam de revisão' (revisao_pendente ou revisar_em < hoje), depois as fases; cada seção com CabecalhosDeSecao. Cartões padrão rounded-2xl border-border-subtle, revisão em text-warning. Remover o wrapper p-4 md:p-6.

**Peças:** StatGrid + StatTile (components/ui/stat-tile.tsx; 3 tiles com className de 3 colunas); CabecalhosDeSecao (page-header.tsx); StatusBadge; EmptyState / QueryErrorState; diasAte/dataBr (academia/formato.ts).

### `academia/gestao.index` — nota 3, esforço M, impacto medio

**Quem usa.** Gestor e admin, diariamente quando a Academia está ligada (corrigir práticas, cobrar atribuições, decidir recomendações, marcar presença nos encontros).

**Problemas.**

- Sem placar no topo: 'quantas práticas esperam correção', 'quantas atribuições venceram', 'quantos parados há 7+ dias' só aparecem como '(N)' no título de cada seção DENTRO da aba Agora — a página abre com o PageHeader e já cai nas abas.
- O mesmo número/lista em dois lugares: a fila de usePraticasPendentes é renderizada na aba Agora ('Práticas para corrigir') e de novo na aba Práticas, com o mesmo botão 'Corrigir' e o mesmo CorrecaoPratica.
- Description do PageHeader é texto de manual: 'Abre no que precisa de ação. Você vê só a sua equipe; ninguém age sobre si mesmo.'
- 7 abas (6 para gestor) na única linha permitida: Agora · Práticas · Time · Participantes · Recomendações · Efeito · Encontros — no teto da regra dos 2 menus; 'Efeito' é análise (antes/depois) e 'Participantes' é cadastro.
- Explicações longas dentro da tela: CardGate ('Simulação desligada. Ligada, mostra quanto dos leads…', 'Só leitura: a Academia mostra o selo e não bloqueia a roleta') no fim da aba Agora; Alert 'MODO SOMBRA · o corretor não vê nada disso' com duas frases na aba Recomendações; EmptyStates com instruções de SQL ('Rode o SQL da gestão da Academia no editor do Lovable Cloud').
- Na aba Recomendações, 'Últimos 7 dias, por regra' é uma grade de Cards caseiros, um por regra (grid lg:grid-cols-4; p text-lg tabular-nums) — StatTiles reinventados, sem hierarquia com a fila 'Para decidir' logo abaixo.
- Ações secundárias espalhadas e desalinhadas por aba: 'Conteúdo' no header, 'Registrar roleplay presencial' ao lado de um parágrafo (Práticas), 'Calcular agora' ao lado de um h2 (Recomendações), 'Novo encontro' ao lado de um ToggleGroup (Encontros), filtro+busca+inscrição em lote (Participantes).
- Cores literais (emerald-700/400 na matriz da aba Time, linha 37) e listas em 'rounded-lg border' (parados, participantes) fora do cartão padrão; padding dobrado (wrapper p-4 md:p-6).
- [revisão] 'Painel (fila-lateral.tsx)' não existe como peça: lá o Painel é `function` local, não exportada. O Painel exportado é o de src/features/ranking/ranking-ui.tsx (titulo, icone, descricao, acao, children; rounded-xl border-border-subtle). Peças corrigidas.
- [revisão] Testes nomeados (o colega só disse 'atenção'): tests/academia-gestao-hub.test.tsx exige `getByText('Conteúdo')` para admin e as abas por role 'tab' — tirar o botão 'Conteúdo' do header quebra o teste (mover o link para o CabecalhosDeSecao de uma aba ou atualizar o teste); tests/academia-gate-card.test.tsx exige o texto 'Simulação desligada' (admin) e 'de 10 leads' contendo '3' (gestor) ao renderizar CardGate — resumir o gate a uma linha muda esses textos. A reorganização das abas também mexe em ABAS_GESTAO (abas.ts, validateSearch da rota).
- [revisão] Nota 3 mantida: a lista de trabalho (aba Agora) fica como está; o que se recompõe é o topo (placar + header) e a linha de abas. Esforço M é honesto para 9 arquivos + 2 testes.

**Proposta.** Topo: PageHeader ('Gestão da Academia', frase curta: 'Quem precisa de correção, cobrança ou um empurrão hoje.') sem o botão 'Conteúdo' (já é seção da sidebar; manter o link no CabecalhosDeSecao de Agora para o admin, ou ajustar academia-gestao-hub.test.tsx). Logo abaixo, UMA linha de 4 StatTile com dono: Práticas a corrigir (usePraticasPendentes) · Atribuições vencidas (useAtribuicoesAbertas + diasAte) · Parados 7+ dias (semAtividade) · Para decidir (recomendações sombra/abertas) — cada tile clicável leva à seção/aba. Área de trabalho = a aba Agora como lista única de ação (corrigir / cobrar / chamar), e a aba Práticas deixa de repetir a fila: some, e o botão 'Registrar roleplay' vai para o cabeçalho da seção de práticas em Agora. Abas reduzidas a uma linha folgada: Agora · Time · Recomendações · Encontros · Participantes (admin); 'Efeito' vira seção no fim de Recomendações atrás de 'Ver efeito das recomendações' (atualizar ABAS_GESTAO e o validateSearch). Em Recomendações, os cards por regra viram StatTile e o Alert MODO SOMBRA vira um Badge 'Sombra' no título de seção com tooltip. CardGate desce para o fim de Agora atrás de 'Ver gate da roleta' (ou para Configurações da Academia), com uma linha de resumo (resumoDoGate) e o toggle — mantendo os textos que academia-gate-card.test.tsx cobra ou atualizando o teste. Lateral desktop (máx. 3 Painel de ranking-ui): 'Próximos encontros' (useProximosEncontros, já usado na trilha), 'Gate da roleta' (uma linha + toggle), 'Modo das recomendações'. Cada aba abre com CabecalhosDeSecao carregando a ação secundária à direita (Novo encontro, Calcular agora, Inscrever). Tokens no lugar de emerald; remover wrapper de padding.

**Peças:** StatGrid + StatTile (clicáveis, intent por contagem); Painel (src/features/ranking/ranking-ui.tsx) para a lateral de 3 painéis; CabecalhosDeSecao; resumoDoGate / semAtividade / tempoDeEspera (derivacao.ts); useProximosEncontros (gestao-client.ts) como na trilha-page; CorrecaoPratica (dialog, mantém); StatusBadge, EmptyState, QueryErrorState.

### `academia/modulo.$codigo.index` — nota 3, esforço M, impacto medio

**Quem usa.** Todo participante da trilha, várias vezes por semana enquanto estuda um módulo; é a porta de cada aula, quiz e prática.

**Problemas.**

- O topo não responde 'onde estou neste módulo': a linha de 5 passos (Trilha→Aula→Quiz→Prática→Certificado) que a trilha (/academia) já mostra em TrilhaDoCorretor não aparece aqui — a página começa com o Card 'objetivo_principal' (texto) e a lista 'Ao final você vai saber' (texto de curso) antes do trabalho.
- Cinco seções empilhadas com o mesmo peso (objetivo, objetivos, Aulas, Quiz, Prática), todas com h2 'text-sm font-semibold' — números sem hierarquia ('Aulas (2 de 5)' é o único placar e está num título de seção).
- Ação principal não é única: 'Fazer o quiz' (navy) e 'Enviar prática' (navy) competem, mais 'Voltar' no header; a próxima coisa a fazer (próxima aula pendente) não tem botão.
- 'Voltar' como action do PageHeader (linhas 78–82) é redundante com a trilha do header.
- Lista de aulas em 'rounded-lg border' com CheckCircle em text-emerald-600 literal (linha 122); critérios da rubrica e descrição da prática ('Você vai ser avaliado em…') são explicação longa sempre visível, e o formulário de prática nem depende do quiz aprovado (só de ultimaPratica não ser pendente/aprovada).
- Padding dobrado (wrapper p-4 md:p-6).
- [revisão] TrilhaDoCorretor NÃO é exportada (é `function` local em trilha-page.tsx, linha 81): não há peça pronta para reaproveitar — a proposta exige extrair o componente. O que já é reaproveitável de verdade é passosDoModulo (passos-trilha.ts) e a classe CIRCULO/linha dourada como referência. E useModulo entrega `status` possivelmente null (módulo nunca aberto): passosDoModulo precisa de um fallback (aulas_feitas = aulasFeitas.size, quiz/prática = false).
- [revisão] Faltou o aviso de testes: tests/academia-telas.test.tsx ('tela do módulo') exige o texto 'Falta 1 aula para liberar o quiz.' à vista, o botão 'Fazer o quiz' desabilitado, o título 'Aulas (1 de 2)' e, com prática avaliada, 'Refazer' e o feedback visíveis sem clique. Esconder Quiz/Prática em resumo de uma linha ou mover 'x de y aulas' para a description quebra esses quatro testes — ajustar os testes junto com a tela.

**Proposta.** Topo: PageHeader (título do módulo, description 'CÓDIGO · Fase N · x de y aulas') sem 'Voltar'. Cartão principal logo abaixo = a linha de 5 passos de TrilhaDoCorretor, extraída de trilha-page.tsx para um componente PassosDoModulo (recebe o AcademiaModuloStatusRow ou um objeto derivado de aulas/aulasFeitas quando status é null) com o passo atual em dourado e UM botão 'Continuar' que leva ao próximo passo real (primeiraAulaPendente → aula; aulas feitas → quiz; quiz aprovado e exige_pratica → rola até a prática; concluído → certificado). Área de trabalho: a lista de aulas em cartões padrão com check em text-success. Quiz e Prática viram seções com CabecalhosDeSecao, só a seção do passo atual expandida; a outra fica num resumo de uma linha com StatusBadge, mas mantendo o motivo do quiz trancado e o feedback da prática visíveis (os testes cobram). 'Sobre este módulo' (objetivo principal, 'Ao final você vai saber', critérios da rubrica) desce para o fim atrás de um Accordion 'Ver objetivos e critérios'. Remover o wrapper de padding. Atualizar tests/academia-telas.test.tsx.

**Peças:** passosDoModulo (passos-trilha.ts) + extrair TrilhaDoCorretor de trilha-page.tsx para componente compartilhado; primeiraAulaPendente / estadoDoModulo (estado-modulo.ts); motivoQuizTrancado (já exportada em modulo-page.tsx); CabecalhosDeSecao; StatusBadge; Accordion (components/ui/accordion.tsx, como na trilha).

### `academia/progresso` — nota 3, esforço P, impacto baixo

**Quem usa.** Participante, consulta ocasional (ver certificado, conferir subida de nível).

**Problemas.**

- O topo não diz 'como estou agora': nível atual, próximo nível e 'x de y obrigatórios' não aparecem — estão só no card 'Módulos obrigatórios' da trilha (/academia). A página abre direto em 'Certificados' (lista vazia para quase todo mundo).
- Duas seções de mesmo peso ('Certificados' e 'Histórico'), ambas com h2 text-sm; o histórico de nível (análise) tem o mesmo destaque que os certificados.
- '← Trilha' como action do PageHeader (linhas 42–49) duplica a trilha do header e a seção da sidebar.
- Cartões: certificados em Card genérico e histórico em 'li rounded-lg border' — dois estilos de cartão na mesma página; código de verificação em font-mono como destaque à direita (peso de número sem ser número).
- Padding dobrado (wrapper p-4 md:p-6).
- [revisão] useProgresso (DadosProgresso) devolve SÓ {certificados, historico}: nível, próximo nível e obrigatórios não estão nesta query. O cartão 'Seu nível' exige chamar useTrilha aqui também (mesma chave de cache da trilha, então sem custo extra se o corretor veio de lá) ou estender useProgresso. E o card 'Módulos obrigatórios' é JSX inline dentro de TrilhaPage (linhas 201–216), não um componente: precisa ser extraído antes de 'reaproveitar'.

**Proposta.** Topo: PageHeader ('Meu progresso', uma frase) sem 'Trilha'. Cartão principal 'Seu nível': nível atual em font-display, 'Próximo nível: X', barra Progress de obrigatórios concluídos — extrair o card 'Módulos obrigatórios' de trilha-page.tsx para um componente (ProgressoObrigatorios) alimentado por useTrilha (resumo.nivel, proximoNivel, concluídos/obrigatórios) e usá-lo nas duas telas — e, quando houver certificado, 'Último certificado: Nível · data · Abrir'. Lista principal: Certificados (um cartão padrão por certificado, 'Abrir' como única ação). Histórico de nível desce para o fim, compacto (uma linha por mudança), atrás de 'Ver histórico' quando passar de 5. Remover wrapper de padding.

**Peças:** Card 'Módulos obrigatórios' + Progress da trilha-page.tsx (extrair para componente); useTrilha (academia-client.ts) para nível e obrigatórios; proximoNivel / ROTULO_NIVEL (niveis.ts); CabecalhosDeSecao; EmptyState; StatusBadge.

### `bolsao` — nota 3, esforço P, impacto baixo

**Quem usa.** Consulta ocasional de gestão e SDR (a rota não barra o SDR de propósito, embora a Central seja OPERACAO no menu e a seção não apareça para ele). O corretor quase não abre: recebe do Bolsão pelo lote de 30 da Prospecção. Sem botão de puxar por decisão registrada (§9 de docs/ops/bolsao-oportunidades-fatia4.md) — a tela é deliberadamente só leitura.

**Problemas.**

- Texto de manual logo abaixo do título: uma caixa com ícone Eye e 4 linhas explicando por que não há botão de puxar ("Por enquanto o Bolsão é só consulta. Puxar lead… regra de comissão… quem puxa lead parado há mais de 7 dias fica com a venda inteira…") — viola a regra 6 e empurra a lista para baixo.
- Sem "como estou agora": os números vêm em prosa (`frasePlacar(resumo, busca)` + "A casa tem N sem dono com telefone.") numa linha de texto cinza entre a busca e a lista; não há 3–5 números com dono.
- Lista em `rounded-lg border border-border-subtle bg-surface` (padrão é rounded-2xl bg-card); cada linha carrega até 4 badges (com o SDR em `text-info`, origem, sinal, frieza) com `text-success`/`text-warning` — cor de temperatura sem token de intenção.
- Nenhuma ação principal (intencional) — mas a tela também não diz o que fazer com o que se vê (ex.: levar para a Prospecção/lote).
- Busca em uma div flex com `sm:flex-row` sem nada ao lado — layout de linha vazia.
- [revisão] Corrigida a descrição da lista (ela já tem border-border-subtle; o desvio é só raio e fundo) e acrescentado o `text-info` do badge "com o SDR". Em "peças": Painel e Caixa de fila-lateral.tsx NÃO são exportados (só AgendaDeHoje, ComoAFilaSeMantem, OQueASamiFaz e FilaLateral) — exportar antes de reutilizar.

**Proposta.** PageHeader "Bolsão de oportunidades" com uma frase ("A base da casa sem dono — matéria-prima do discador e da pré-venda."). A caixa explicativa some; fica uma linha discreta "Só consulta por enquanto · Ver por quê" (Popover/Collapsible com o texto atual, que precisa continuar existindo por decisão do documento). Topo: StatGrid de 3–4 tiles com dono — sem dono com telefone (diagnóstico) · recentes (<30d) · com o SDR · esquecidos — a partir de `resumoBolsao` + `useBolsaoDiagnostico`. Área principal: busca + lista rounded-2xl; sinal e frieza continuam, mas frieza vira só um tom no texto "parado há N dias" e os badges caem para no máximo 2 por linha. Lateral desktop (opcional, 1 painel): "Como o Bolsão vira carteira" com as caixas Pré-venda → Lote de 30 → Fila, exportando `Caixa`/`Painel` de fila-lateral. Ação única visível: "Montar lote na Prospecção" (link, outline) para corretor; gestão sem ação.

**Peças:** StatGrid + StatTile (3–4 tiles); resumoBolsao (bolsao/derive.ts) / useBolsaoDiagnostico (bolsao/use-bolsao.ts) — já existem; Painel e Caixa (fila-lateral.tsx) existem mas NÃO são exportados — exportar para o painel lateral de fluxo; EmptyState / QueryErrorState (já usados); INTENT_BADGE para sinal/frieza.

### `duplicatas` — nota 3, esforço P, impacto baixo

**Quem usa.** Admin (o código deixa gestor mesclar, mas /configuracoes redireciona quem não é admin). Uso ocasional — higiene de cadastro.

**Problemas.**

- A rota é só redirect para `/configuracoes?tab=qualidade`; o conteúdo (DuplicatasPage) é o 2º bloco da aba, entre SamiQQualidadeCard e LixeiraPage — três blocos independentes empilhados com `space-y-10`.
- Título empilhado: renderiza um PageHeader completo ("Detector de duplicatas" + descrição) dentro de um hub que já tem o título "Configurações" — sem CabecalhosDeSecao.
- Sem "como estou agora": nenhuma contagem no topo (quantos grupos, quantos leads envolvidos); a lista de GrupoCard começa direto.
- Cada grupo é um Card com CardHeader (ícone + chave em `font-mono` + badge) e, dentro, uma caixa verde "Lead-base (mais antigo)" (`bg-success/10 border-success/30`) e uma caixa por duplicata com botão "Mesclar no base" — ação repetida em cada linha, com peso igual ao conteúdo.
- Emoji no título do estado vazio ("Nenhuma duplicata encontrada. 🎉").
- [revisão] Composição e nota conferem. Em "peças": `Numero` de fila-cockpit.tsx não é exportado — para a linha de contagens, StatGrid/StatTile é o que existe pronto.

**Proposta.** Trocar o PageHeader por CabecalhosDeSecao (título "Duplicatas", uma frase curta). Topo: uma linha com 2–3 números (grupos · leads envolvidos · por telefone/por e-mail) — StatGrid com StatTile. Lista: um cartão rounded-2xl border-border-subtle por grupo, cabeçalho em uma linha (chave + "N leads"), lead-base marcado só com um selo (sem caixa verde), e UMA ação "Mesclar todos no base" por grupo (navy) com o desfazer por linha atrás de "…". Tirar o emoji. Opcional: unir Duplicatas e Lixeira numa só seção "Qualidade dos dados" com abas internas (regra dos 2 menus já cobre: Configurações → Qualidade → uma linha de abas).

**Peças:** CabecalhosDeSecao; StatGrid + StatTile (src/components/ui/stat-tile.tsx); EmptyState (já usado); INTENT_BADGE (src/lib/status-tones.ts) para o selo do lead-base.

### `leads-landing` — nota 3, esforço M, impacto medio

**Quem usa.** Admin e gestor durante campanhas de Meta Ads (leads que chegam da landing externa via webhook, tabela `leads_landing`, separada do funil). Consulta diária em campanha, esporádica fora dela. A seção é `roles: ["admin","gestor"]` só no menu — a rota em si não tem guarda de papel.

**Problemas.**

- Toda a tela mora no arquivo da rota (sem componente em src/features); a rota não define `head` — a aba do navegador fica sem título.
- Título da página ("Leads Landing") não é o nome da seção na sidebar e na trilha ("Captação (Landing)"), e a descrição fala em "webhook público" — jargão técnico na frase do cabeçalho.
- Sem "como estou agora": o topo é a linha de filtros; o único número é "N de M" em texto cinza à direita. Não há novos de hoje, em contato, ganhos — embora os dados já estejam no array carregado.
- Filtros todos expostos: busca + 3 Selects (status, tipo, faixa) numa linha, com rótulos crus do banco ("lead_form", "lead_simulacao", "em_contato") inclusive nos badges — a regra 5 pede filtros atrás de menu/linha discreta e a regra 6 pede texto de tela, não chave de banco.
- Lista é uma `Table` crua em `rounded-md border` (não o cartão rounded-2xl do padrão) com 9 colunas — no celular não cabe; não usa o DataTable da casa (que tem `hideBelow` e estado vazio/erro padronizados).
- Cores por status com classes fora dos tokens (`bg-azul-500/15 text-azul-600`, `bg-aviso-500/15`, `bg-perigo-500/15`), diferentes do INTENT_BADGE usado no resto.
- Nota de truncamento (1.000 registros) como parágrafo de 11px entre filtros e tabela.
- Ação principal inexistente na lista: mudar status só no Dialog; WhatsApp como ícone ghost por linha. O Dialog de detalhe tem 3 seções em grid de 2 colunas (Contato, Simulação com 11 campos, Marketing com 7 utms) — denso, mas é detalhe, aceitável atrás do clique.
- [revisão] Acrescentado o descompasso título × nome da seção ("Leads Landing" vs "Captação (Landing)") e o jargão na descrição; corrigido o caminho do DataTable (src/components/ui/data-table/data-table.tsx, exportado por index.ts). O resto confere com o código.

**Proposta.** Mover a tela para `src/features/prospeccao/leads-landing-page.tsx` e dar `head` à rota. PageHeader "Captação (Landing)" (eyebrow "Módulo 02 · Prospecção", mesmo nome da sidebar) com uma frase ("O que a landing mandou, antes de virar lead da casa."). Topo: StatGrid de 4 tiles com dono — chegaram hoje · novos sem contato · em contato · ganhos (contados do próprio array; `hint` com o período). Linha de trabalho: busca à esquerda + um menu "Filtros" (status, tipo, faixa) à direita, e a contagem "N de M" como sufixo discreto; a nota de 1.000 vira rodapé da tabela. Lista: DataTable da casa (colunas Recebido, Nome, WhatsApp, Renda/Faixa, Status, com `hideBelow` para Região/Tipo no celular), rótulos legíveis ("Formulário", "Simulação", "Em contato") e INTENT_BADGE para o status; clique na linha abre o Dialog (mantido). Ação principal única na linha: WhatsApp como ícone + "Mudar status" num Select pequeno direto na linha (hoje só no Dialog).

**Peças:** PageHeader; StatGrid + StatTile (4 tiles); DataTable + DataTableColumnHeader (src/components/ui/data-table/) com `hideBelow`; INTENT_BADGE (status-tones.ts) para status; EmptyState / QueryErrorState (já usados); o Dialog de detalhe atual (fica como está).

### `lixeira` — nota 3, esforço P, impacto baixo

**Quem usa.** Admin, raramente (restaurar um registro excluído nos 90 dias).

**Problemas.**

- A rota é só redirect para `/configuracoes?tab=qualidade`; o conteúdo (LixeiraPage) é o 3º bloco da aba, abaixo do SamiQ e das Duplicatas.
- Terceiro título de página na mesma aba: PageHeader completo "Lixeira" sem CabecalhosDeSecao, empilhado sob "Configurações" e "Detector de duplicatas".
- Segunda linha de abas dentro de uma aba: Tabs com 6 gatilhos (Leads, Empreendimentos, Unidades, Agendamentos, Tarefas, Interações — `LIXEIRA_TABELAS`) `flex-wrap h-auto` — no celular quebra em 2–3 linhas, ferindo a regra dos 2 menus (Configurações → Qualidade → mais uma linha de abas).
- Rótulo redundante: SectionHeader com `eyebrow="Lixeira"` (cinza `text-xs text-muted-foreground`, não dourado) + "N registros excluídos" dentro de uma página que já se chama Lixeira — um quarto nível de cabeçalho dizendo o mesmo nome.
- Sem número de topo; a contagem só aparece por tabela, depois de escolher a aba (cada aba faz a própria consulta, limite 200).
- [revisão] Corrigido: o eyebrow do SectionHeader não é dourado (é `text-muted-foreground`), então o problema é redundância de título, não uso indevido do eyebrow de módulo. Em "peças": os chips de motivo da ReservaPage existem, mas não são clicáveis — servem só como desenho; DataTable mora em src/components/ui/data-table/ (pasta).

**Proposta.** CabecalhosDeSecao ("Lixeira", frase: "Excluídos ficam 90 dias; restaure daqui."). Trocar as 6 abas por um Select/pílula discreta "Tipo: Leads ▾" ao lado da busca, ou carregar as 6 contagens de uma vez e mostrar UMA linha de chips "Leads 12 · Agendamentos 3 · …" (clicável) acima de uma única DataTable. Tirar o SectionHeader; a contagem vai para a linha de chips. Manter DataTable e o Restaurar com Desfazer (já no padrão de ação por linha, outline).

**Peças:** CabecalhosDeSecao; DataTable (src/components/ui/data-table/, já usada); useUndoableMutation (src/hooks/use-undoable-mutation.ts, já usado); a linha de chips por motivo da ReservaPage (agruparReservaPorMotivo) como desenho de contagem — hoje não clicável.

### `meu-funil` — nota 3, esforço M, impacto medio

**Quem usa.** Corretor, toda quinta-feira no estudo obrigatório (MeuFunilGlobal, Dialog max-w-5xl, bloqueante) e quando quiser reabrir; a RPC recorta por auth.uid, então gestão vê o próprio recorte.

**Problemas.**

- PageHeader ok (título 'Meu Funil', frase curta, eyebrow MÓDULO 09 · BI · Relatórios automático). A rota é fina e a view é a mesma do estudo da quinta.
- Topo em três blocos antes da lista: (1) linha com uma frase explicativa ('Dos leads que você recebeu nos últimos N dias, quantos chegaram…') + ToggleGroup de período, que funciona como segunda descrição; (2) DiagnosticoCard (Card border-primary/40 bg-primary/5 com eyebrow 'Onde o seu funil vaza', foco, motivo e dica 'Como atacar hoje'); (3) MatematicaDaVenda com <h2> + frase + 5 cartões 'para 1 venda'. Três níveis de explicação antes de aparecer o funil.
- Hierarquia de títulos mista: MatematicaDaVenda usa <h2 font-display> de seção, os demais blocos usam CardTitle (div) dentro de Card — pesos diferentes para seções irmãs.
- Sem lateral: 'O que falta para bater o mês' (PlanoDoMesCard, com Input de meta e tabela) é o bloco de ação e fica perdido no meio, depois do funil.
- Análise e histórico no mesmo peso da área de trabalho: ConversaoPorOrigem (tabela de 8 colunas) e BaseImportadaCard (Card tracejado com descrição de quatro linhas, 6 mini-cards, parágrafo e outra tabela de 8 colunas) ocupam metade da página; mais o rodapé explicativo de três linhas ('Etapas acumuladas…').
- FunilPorEtapa desenha o próprio funil (barras bg-primary/80 + PassagemLinha) quando a Central já tem o FunilResumo no padrão do vídeo (barra centrada, queda por etapa, venda em dourado).
- [revisão] Composição conferida bloco a bloco em meu-funil-view.tsx (ordem na linha 118-139: Diagnostico → Matematica → FunilPorEtapa → Plano → ConversaoPorOrigem → BaseImportada → rodapé). Peças conferidas: FunilResumo (fila-funil-resumo.tsx:89) e resumoDoFunil (funil-derive.ts:387) existem e são exportados; o Painel de fila-lateral.tsx NÃO é exportado (usar o de ranking-ui.tsx ou extrair). Faltou dizer: tests/meu-funil-view.test.tsx trava os data-testid `por-venda-*`, `meu-funil-diagnostico`, `meu-funil-plano` e o role=alert — a recomposição precisa manter esses ids. Nota 3 e esforço M mantidos.

**Proposta.** Recompor o topo e descer a análise, preservando a mesma view no diálogo da quinta: (1) ToggleGroup de período vai para `actions` do PageHeader; a frase explicativa some (a descrição já diz o que é). (2) Um cartão principal navy/dourado no molde do FilaCartao: 'Onde o seu funil vaza' com o foco em destaque (dourado = 'a vez'), o motivo em uma frase, e ao lado a linha dos 5 números 'para 1 venda' (StatGrid 5) — diagnóstico e matemática viram um bloco só (mantendo os data-testid). (3) Área de trabalho logo abaixo = funil por etapa, reaproveitando o FunilResumo/resumoDoFunil da Central (mesma leitura visual: contagem, queda na chegada, venda em dourado, 'maior perda' = o foco do diagnóstico). (4) Lateral no desktop (Painel): 'O que falta para bater o mês' com o input de meta e as 3 linhas do plano; no celular empilha logo após o funil. (5) Conversão por origem e Base importada descem para o fim atrás de 'Ver por origem' / 'Ver base importada', com a descrição da base cortada para uma frase e o rodapé explicativo virando tooltip no título do funil. Dentro do MeuFunilGlobal (Dialog max-w-5xl) a lateral empilha — manter o onDiagnostico. Travar em tests/meu-funil-view.test.tsx.

**Peças:** PageHeader (já); FilaCartao (molde do cartão de diagnóstico); FunilResumo + resumoDoFunil (fila-funil-resumo.tsx / funil-derive.ts, exportados); StatGrid com 5 tiles (MatematicaDaVenda já é essa linha); Painel (ranking-ui.tsx, exportado) ou molde do Painel local de fila-lateral (lateral do plano do mês); Table das origens (manter, atrás de 'Ver…'); ToggleGroup de período.

### `meus-65` — nota 3, esforço M, impacto medio

**Quem usa.** Corretor, diário/semanal com a regra dos 65 ligada (o chip X/65 do topo leva aqui; escolhe quem fica nas vagas). Gestão abre os 65 de um corretor em leitura via `?corretor=` (Painel do Gestor, aba Time). SDR é redirecionado para /sdr. Conta sem papel de corretor cai num card "Esta conta não tem teto".

**Problemas.**

- Não usa PageHeader: é um `<header>` manual com `h1 font-display text-2xl font-semibold` — sem o eyebrow "Módulo 01 · Central de Comando", com título menor que o das outras telas do módulo (36px) e uma descrição longa de duas frases.
- O placar é um Card com texto corrido em uma linha ("37/65 em atendimento · 12 escolhidos · Minha base: 44 · Lotado: para pôr mais um, libere uma vaga") — o MESMO X/65 que a Fila Única mostra no anel dourado, aqui em `text-2xl` sem anel: o mesmo número em dois desenhos.
- Parágrafo de manual entre o placar e a lista ("A regra está em modo sombra… A escolha não segura o relógio: sem ligação ou WhatsApp registrado em N dias, o lead desce para a Minha base mesmo escolhido.").
- Cores fora dos tokens: `ACAO_TOM` usa emerald/amber/rose/slate do Tailwind cru (e o aviso "Lotado" em `text-rose-700`), não INTENT_BADGE/status-tones; cartões em `Card` (border padrão) e lista `rounded-xl border bg-card`, não rounded-2xl border-border-subtle.
- Checkbox + rótulo "Manter" em cada linha com o mesmo peso do nome — ação repetida 65 vezes; não há ação principal única.
- Estados de erro/sem dado são 4 Cards de texto diferentes (erro, sem RPC, sem teto, lista vazia) em vez de EmptyState/QueryErrorState.
- Gestão vendo outro corretor: o título vira "Os 65 do corretor" sem dizer QUAL corretor nem oferecer "voltar" (a Fila faz isso com `fila-de-outro`).
- [revisão] Composição confere. Esforço subido de P para M: são 7 frentes (PageHeader, placar novo sobre um AnelDoDia que precisa ser exportado, lista, tokens, estados, gestão), e a tela tem `data-testid` cobertos por tests/em-atendimento-fatia2.test.tsx e fatia5.test.tsx (meus-65-placar, meus-65-lista, meus-65-linha, meus-65-erro, meus-65-sem-teto) que precisam acompanhar.

**Proposta.** PageHeader "Meus 65" (eyebrow automático "Módulo 01 · Central de Comando") com uma frase ("Quem fica nas suas vagas de Em atendimento. Marque quem você quer manter."); gestão: "Vendo os 65 de <nome> · voltar" como na Fila. Topo: um cartão no estilo FilaCartao/FilaCockpit — anel "37 de 65" (mesmo desenho da Central) + 3 números com dono (escolhidos · ficam · perdem vaga, contados de `linhas` por `acao`) e a nota "lotado — entra um, sai um" como linha de Notas quando `tomContador === "lotado"`. O parágrafo do relógio vira um hint de uma linha no cabeçalho da lista ("Escolhido sem toque em N dias desce do mesmo jeito") ou tooltip no rótulo "Manter". Lista como área principal (rounded-2xl, border-border-subtle): posição, nome, projeto · dias sem toque · prazo; o pill de ação com INTENT_BADGE (success/warning/danger/neutral); "Manter" vira um toggle discreto à direita (checkbox sem rótulo repetido, rótulo no cabeçalho da coluna). Erros via QueryErrorState e EmptyState, preservando os `data-testid` dos testes. Sem lateral (a Central já tem a dela).

**Peças:** PageHeader (sem eyebrow custom — o automático já resolve); FilaCockpit / FilaCartao (exportados); AnelDoDia, Numero e Notas (fila-cockpit.tsx) NÃO são exportados — exportar ou criar um `PlacarDos65` sobre eles — mesmo anel da Central; INTENT_BADGE (src/lib/status-tones.ts) no lugar de ACAO_TOM; AvisoViradaRegra65 (src/features/em-atendimento/aviso-virada.tsx, já usado); ContadorEmAtendimento (contador-chip.tsx) continua sendo a porta; EmptyState / QueryErrorState; o bloco `fila-de-outro` da FilaUnicaPage para a gestão.

### `oferta-ativa.index` — nota 3, esforço M, impacto medio

**Quem usa.** Corretor trabalha as listas atribuídas a ele durante uma campanha (semanal, por campanha); admin/gestor criam, duplicam, arquivam e dividem listas (eventual). SDR não vê (seção gated por OPERACAO em sistemas.ts).

**Problemas.**

- PageHeader ok (título 'Oferta Ativa', uma frase, 'Nova Lista' navy só para gestão) e abas Ativas | Arquivadas numa linha com contadores — o cabeçalho e o menu já estão no padrão.
- Não responde 'como estou agora': não há cartão principal nem linha de números — a página abre direto na grade de ListaCard; o corretor não vê quantos leads ainda faltam contatar hoje nem qual lista atacar primeiro.
- ListaCard é cartão artesanal (`bg-card border rounded-xl`, sem border-border-subtle/rounded-2xl) com dois Progress, dois rótulos com tooltip em title, percentuais, data e ações em texto-link (Duplicar/Arquivar ou Restaurar/Excluir, só para gestão) — ações secundárias soltas em cada card em vez de menu '…'; o card inteiro é clicável mas sem ação principal visível ('Trabalhar lista').
- Estado vazio artesanal (div tracejada com Megaphone e dois parágrafos) em vez do EmptyState do design system (que a própria página já usa na aba Arquivadas); rodapé 'Você vê apenas as listas atribuídas a você' é texto de manual.
- Segunda barra do Progress 'Avançados' em bg-verde-500 — segunda cor no card sem significado de estado (duas barras com o mesmo peso).
- [revisão] Corrigida a frase sobre a cor: `verde-500` É um token do design system (`--color-verde-500` em src/styles.css:54, alias de green), não cor 'fora dos tokens'; o problema real é usar o verde semântico de sucesso numa segunda barra de progresso sem estado. Resto da composição confere (ListaCard nas linhas 103-212, vazio artesanal 262-279, rodapé 319-323). Nota 3 e esforço M mantidos.

**Proposta.** Recompor o topo: abaixo do PageHeader, um cartão principal 'Sua próxima lista' (a lista ativa com mais leads não contatados: nome, 'N de M contatados' em anel dourado como no FilaCartao, e a ação navy 'Trabalhar lista' que abre o detalhe já filtrado em Não contatados) ao lado de uma linha de 3 números com dono: listas ativas · leads a contatar · avançados na campanha. A grade de listas vira a área de trabalho logo abaixo (cards rounded-2xl border-border-subtle, uma barra só — contatados — com 'N/M', 'avançados' como número pequeno, ações atrás de '…' DropdownMenu como no detalhe). Arquivadas continua como 2ª aba (atende à regra) ou vira 'Ver arquivadas' no fim. EmptyState do sistema no vazio; some a frase de rodapé para o corretor (a descrição do PageHeader já diz 'suas listas').

**Peças:** PageHeader (já); FilaCartao (molde do cartão 'Sua próxima lista' com anel N de M); ProximoLeadCard da Prospecção (src/features/prospeccao/proximo-lead-card.tsx — referência de 'o próximo a atacar'); StatGrid com 3 StatTiles; DropdownMenu de ações da lista (já existe no detalhe $ofertaId); EmptyState (já usado na aba Arquivadas); ResponsiveTabs/Tabs (manter 2 abas); Progress.

### `oferta-ativa.nova` — nota 3, esforço M, impacto baixo

**Quem usa.** Só admin e gestor, ao montar ou duplicar uma campanha (eventual, algumas vezes por mês). Corretor recebe EmptyState 'Acesso restrito'.

**Problemas.**

- O PageHeader está dentro de uma linha flex com o botão '← Voltar' (ghost icon) à esquerda: o eyebrow MÓDULO 02 · Prospecção e o título ficam deslocados para a direita da seta, fora do alinhamento das outras páginas. Título sem frase curta.
- Toda a página (dados da lista + 'Filtros de leads' + preview + rodapé de botões) é um único `bg-card border rounded-xl p-6` — o componente de página é a própria rota (não há feature), 471 linhas.
- O 'como estou agora' do formulário — a contagem ao vivo 'N leads encontrados · Ex: nomes' — fica no FIM do cartão, depois de seis blocos de filtro; quem ajusta Zona precisa rolar até embaixo para ver o efeito.
- Texto de manual em três lugares: 'Define quem será o dono desta lista. Não filtra os leads — use os filtros abaixo…', 'Filtra leads pelos projetos cadastrados nessas zonas (inclui projetos vindos por importação)', e o EmptyState de acesso restrito com três frases.
- Filtros com dois estilos no mesmo formulário: Status e Origem em Checkbox + label, Temperatura e Zona em pílulas bg-primary; Projetos numa caixa rolável de `max-h-60` (240 px) com busca própria.
- Mensagem de validação ('Dê um nome com pelo menos 2 caracteres…') aparece como texto solto acima dos botões; ação principal 'Criar Lista' navy ok, mas 'Cancelar' repete o 'Voltar' do topo.
- [revisão] Corrigido '60 px': `max-h-60` do Tailwind é 15rem = 240 px (linha 371). Resto confere (seta + PageHeader nas linhas 181-187, cartão único 190, textos 244/326/168, Checkbox 259/294 vs pílulas 277/314, preview 413-443, validação 449-454, Cancelar 457).
- [revisão] Esforço corrigido de P para M: a proposta move 470 linhas da rota para uma feature, cria layout em duas colunas com cartão sticky, unifica quatro filtros de dois estilos em pílulas e refaz o cabeçalho — não é ajuste pequeno, mesmo sem tocar na lógica. A nota 3 vale pela régua (recompor o topo), ainda que a tela seja um formulário de uso eventual.

**Proposta.** Recompor o topo e a lateral, sem mexer na lógica: PageHeader normal (título 'Nova lista' / 'Duplicar lista', frase 'Escolha os filtros; a contagem atualiza sozinha.', link discreto '← Oferta Ativa' acima do eyebrow ou como primeira ação) — tirar a seta da linha do título. Layout em duas colunas no desktop: à esquerda, o formulário em duas seções com títulos de seção (Dados da lista · Filtros); à direita, um cartão sticky 'Leads encontrados' com o número grande (anel/contador como no FilaCartao), os 5 nomes de exemplo e o botão navy 'Criar lista' — no celular esse cartão empilha primeiro e os botões ficam no rodapé. Unificar os filtros multi-escolha em pílulas (Status, Temperatura, Origem, Zona) e manter Projetos com busca. Cortar os três textos explicativos (viram placeholder/hint de uma linha). Mover o formulário para src/features/prospeccao/oferta-nova-form.tsx para a rota ficar fina como as demais.

**Peças:** PageHeader; FilaCartao (molde do cartão de contagem com número grande + ação); chips de pílula da renda-cliente.tsx (src/features/projetos/renda-cliente.tsx:74, rounded-full) para os multi-filtros; EmptyState; Painel (ranking-ui.tsx, exportado) ou molde do Painel local de fila-lateral (cartão lateral); QueryErrorState / Skeleton já usados.

### `pipeline` — nota 3, esforço M, impacto alto

**Quem usa.** Corretor e gestão, diário (o quadro é a seção Kanban da Carteira; a mesma KanbanBoard também é a pílula Kanban de /leads). A aba Fechamento é usada pelo corretor/gestor sobretudo na segunda quinzena: /radar redireciona para `/pipeline?tab=fechamento` e o atalho "Reta final (fechamento do funil)" do ⌘K (ATALHOS_EXTRAS em sistemas.ts) abre `/pipeline?tab=fechamento&fase=carteira` — ou seja, a variante de título "Gestão de Carteira" é exatamente a que o atalho mais usado abre.

**Problemas.**

- Título do PageHeader muda com `?fase`: "Prospecção" (fase=prospeccao), "Gestão de Carteira" (fase=carteira) ou "Kanban". Com o eyebrow automático sai "Módulo 03 · Gestão de Carteira" acima de um título "Prospecção" — módulo e título se contradizem; e `fase=carteira` repete o título de /leads ("Gestão de Carteira") numa segunda tela (e é o que o atalho Reta final do ⌘K abre).
- Texto de manual dentro da tela: KanbanBoard abre com o parágrafo "Arraste os cards entre as colunas. Pelo teclado ou toque, use o menu…" (`#kanban-instructions`), ocupando a linha mais nobre do topo ao lado do "VGV no funil" e da busca.
- Topo do Funil não responde "como estou agora": há só o "VGV no funil" (texto dourado `text-xs`, e só quando o snapshot v3 traz `vgv`) e a busca; os sinais do funil (vencidos, sem ação, parados 7+ dias) estão espalhados como 3 badges de 10px no cabeçalho de CADA coluna, mais VGV e "conv. %" por coluna — número sem hierarquia, repetido ~10 vezes.
- Aba Fechamento (FechamentoView): GlassCard com glow + ícone Flag + "N com sinal forte" E logo abaixo 3 Cards (alta/média/baixa) — o mesmo número (alta) aparece em dois lugares; GlassCard (`rounded-xl glass-panel shadow-elev-2`) e ScoreRing são uma família visual diferente dos cartões rounded-2xl/border-border-subtle do padrão.
- Terceiro título empilhado: sob o PageHeader "Kanban" e a aba "Fechamento", a GlassCard ainda traz um título próprio em `font-display text-lg` ("Reta final do mês" / "Modo Fechamento") com frase — cabeçalho de aba que deveria ser título de seção (CabecalhosDeSecao).
- Cada linha do Fechamento carrega 3 badges (etapa, Calibrado/Heurístico, docs) + a pílula do nível (alta/média/baixa) + 2 linhas de texto explicativo ("Taxa histórica observada da etapa: … entradas; horizonte de N dias" ou "Amostra histórica: X de Y entradas maduras; o índice ainda é heurístico…") + 3 botões — explicação longa por item.
- Rodapé do Fechamento é um parágrafo de manual ("O índice de 0–100 ordena sinais de foco e não é uma probabilidade…").
- Cores fora do navy+dourado: GlassCard `text-info` no Flag (primeira quinzena), `text-success` no botão WhatsApp, `bg-warning/15` nos badges de doc — e o fio da coluna por etapa (decisão travada da Fase 4, fica).
- O cartão do Kanban em si JÁ está no padrão (Fase 4: cartão enxuto, coluna cinza, contagem simples) — o problema é só o topo da página e a aba Fechamento.
- [revisão] Acrescentado o terceiro título empilhado (GlassCard com título próprio dentro da aba) e a pílula de nível como 4º chip da linha; conferido que o atalho ⌘K "Reta final" fixa `fase=carteira` (sistemas.ts:765-771) e que /radar redireciona com `tab=fechamento`. Em "peças", Numero/Notas de fila-cockpit.tsx NÃO são exportados (só FilaCockpit e FilaCartao) — reaproveitar exige exportá-los.

**Proposta.** Topo: um PageHeader fixo "Kanban" (eyebrow automático "Módulo 03 · Gestão de Carteira") com UMA frase ("Arraste a etapa; o Fechamento ordena o fundo do funil."), sem trocar o título por fase — a fase vira um filtro discreto (pílula "Tudo · Prospecção · Carteira") ao lado da busca, ou some (a seção Kanban já abre o quadro completo por decisão de 2026-09-11); o atalho "Reta final" do ⌘K continua funcionando porque só depende de `tab`. Abas Funil | Fechamento continuam em uma linha (ResponsiveTabs) e o cabeçalho de cada aba vira título de seção com CabecalhosDeSecao. Funil: o parágrafo "Arraste os cards…" vira `sr-only` (mantém `aria-describedby`) e o resto da linha fica só busca à direita; acima do quadro uma linha de 3–4 números com dono (VGV no funil · follow-ups vencidos · sem próxima ação · parados 7+ dias, somados do snapshot) — os badges por coluna ficam, mas como contagem simples ao lado do nome. Fechamento: substituir GlassCard + 3 Cards por um cartão principal no estilo FilaCartao ("Reta final · N dias para fechar o mês", o número grande = sinal forte, os três números alta/média/baixa lado a lado e a ação "Trabalhar os fortes" que desce até a lista) — exportando Numero/Notas de fila-cockpit.tsx ou copiando o desenho; lista continua como área de trabalho principal, mas cada linha fica com nome + etapa + índice (ScoreRing) + 1 linha de fatores, e a frase de taxa histórica vai para o `title`/tooltip do badge Calibrado; o parágrafo final vira "Ver como o índice é calculado" (Collapsible). Ação principal única: no Funil é "Novo lead" (já existe em /leads) ou nenhuma; no Fechamento, WhatsApp/Ligar continuam por linha como ícones, "Abrir" vira o clique na linha.

**Peças:** PageHeader + CabecalhosDeSecao (src/components/page-header.tsx); FilaCartao (exportado) como modelo do cartão da Reta final; Numero e Notas (fila-cockpit.tsx) existem mas NÃO são exportados — exportar antes de reutilizar; StatGrid + StatTile com 3–4 tiles (src/components/ui/stat-tile.tsx) para a linha de números do Funil; ResponsiveTabs (já usada); KanbanBoard já no padrão Fase 4 — só tirar o parágrafo de instrução; computeStageMetrics/formatVgvCompact (stage-metrics.ts) para somar os números do topo; ScoreRing (src/components/ui/score-ring.tsx) continua nas linhas.

### `/mensagens` — nota 4, esforço M, impacto baixo

**Quem usa.** Corretor que quer ver a conversa de WhatsApp de cada lead num lugar só. Modo simulado (cada envio abre o wa.me) e sem menu — uso baixo até o provedor ligar.

**Problemas.**

- Descrição do PageHeader é texto de manual ('em modo simulado: cada envio registra na conversa e abre o WhatsApp com o texto pronto') — o composer já diz isso no placeholder.
- Sem 'como estou agora': a contagem de conversas aguardando resposta (que agruparConversas já calcula por conversa e a sidebar mostra como badge) não aparece como título da lista.
- Lista de conversas em botões rounded-md border p-2 e thread num Card com altura fixa h-[60vh] — fora dos tokens (rounded-2xl, border-border-subtle) e a thread não usa a altura disponível.
- No celular a grade (md:grid-cols-[…]) empilha lista e thread: o corretor rola a lista inteira para chegar à conversa e não tem 'voltar'.
- EmptyState com descrição de 3 linhas explicando o webhook (Fase 7a) — manual dentro da tela.
- Cabeçalho da thread tem dois botões do mesmo peso ('Marcar tratada' outline e 'Abrir lead' ghost) — aceitável, mas 'Marcar tratada' caberia num menu.
- [revisão] Composição e nota 4 conferidas. Esforço corrigido de P para M: mestre-detalhe no celular (lista + thread em Sheet/Drawer com voltar), thread em flex-1 ocupando a viewport e lista em EntityRow não cabem em 'ajustes de horas' — é um dia de trabalho. 'Painel' em fila-lateral.tsx é interno sem export.

**Proposta.** Ajustes pequenos de composição, mas com a lateral/celular refeita: frase curta no PageHeader ('A conversa de WhatsApp de cada lead, num lugar só.'), a nota do modo simulado vira tooltip do botão Enviar. Título da lista com a contagem como dono ('N aguardando resposta · M conversas', o mesmo número do badge da sidebar, sem tile duplicado). Lista em EntityRow no cartão padrão; conversa selecionada em navy claro (bg-accent) e contador em ponto vermelho. Thread em cartão rounded-2xl que ocupa a altura da viewport (flex-1) com o composer fixo embaixo; 'Abrir lead' continua ghost e 'Marcar tratada' vai para o menu '…' do cabeçalho da thread. No celular: lista primeiro e a thread abre em Drawer/Sheet de tela cheia com voltar (mestre-detalhe). EmptyState com uma frase.

**Peças:** EntityRow (components/ui/entity-card.tsx); Painel (fila-lateral.tsx — interno, exportar antes) como cartão de lista; BolhasThread / ComposerConversa (já compartilhados com a ficha); Drawer/Sheet (components/ui) para o celular; agruparConversas (mensagens/derive.ts) para a contagem do título; Badge/ponto de pendência do hub.

### `/meu-raio-x` — nota 4, esforço M, impacto medio

**Quem usa.** Corretor (home do BI para ele): consulta semanal/mensal dos próprios números, comissões e exportação do relatório; gestor que abre vê os dele. Sem gate de papel de propósito — o recorte é do banco.

**Problemas.**

- Linha solta abaixo do PageHeader mistura o SeletorPeriodo (pílula 3/6/12 meses + Personalizado) com uma frase de manual à direita: 'O seu dia, em ordem de prioridade, está na Fila Única.' — texto que não pertence à tela.
- Depois dos 4 StatTiles vêm 4 Cards com o mesmo peso (Minha evolução, Minha carteira agora, Onde eu mais perco, Minhas comissões) e nenhum 'Ver …'; 'Minha evolução' empilha 2 gráficos recharts (ResultadoMensalChart, EsforcoMensalChart) + TabelaMensal + linha de trimestres com '(base do escalonamento de comissão)'.
- Linha explicativa 'Comparação: N meses vs. os N meses imediatamente anteriores.' sob os tiles repete o deltaLabel que cada StatTile já mostra.
- Gráficos em var(--chart-1/2/3) e var(--success) — fora do monocromático navy + dourado; a barra da carteira (bg-primary/70) não destaca nada, diferente do FunilResumo.
- 'Minhas comissões' (o número que mais importa ao corretor) é o último card; o rótulo do período ({labelJanela}: '3 meses', '6 meses', '12 meses' ou o intervalo personalizado) repete em 3 títulos de card.
- Botão 'Relatório PDF' com dropdown que repete 'Relatório PDF' como primeiro item.
- [revisão] Corrigido: o sufixo dos títulos não é o literal '(6 meses)', é '({labelJanela})', dinâmico pelo SeletorPeriodo — o problema (período repetido em 3 títulos quando já está no seletor) continua valendo.
- [revisão] Esforço P → M: a proposta mexe em composição (lateral curta ou 5º número, comissões no topo, carteira no desenho do FunilResumo, um gráfico só + 'Ver mês a mês') e troca a paleta de raio-x-blocos.tsx, que também é usada pelo RaioXCorretor da gestão (800 linhas, com PDF) — não é ajuste de uma tarde. Nota 4 mantida: o PageHeader e os 4 tiles com delta já respondem 'como estou agora'; o que falta é hierarquia no corpo.

**Proposta.** Manter o PageHeader (o eyebrow 'Módulo 09 · BI · Relatórios' já sai sozinho) e os 4 StatTiles com delta — é o 'como estou agora'. Mover o SeletorPeriodo para as actions do cabeçalho ao lado do PDF (o dropdown fica só com 'Planilha .xlsx') e apagar a frase da Fila Única e a linha 'Comparação: …'. Subir 'Minhas comissões' para o topo: ou como 5º número da linha (pagas / em aberto com 'detalhe →'), ou como primeiro painel de uma lateral curta (Painel de fila-lateral extraído para componente compartilhado: Comissões · Carteira agora · Onde eu mais perco), deixando à esquerda 'Minha evolução' com um gráfico só (Resultado mensal, barras navy + linha dourada) e a TabelaMensal atrás de 'Ver mês a mês'. Carteira agora com o desenho do FunilResumo (barra centrada por etapa com contagem). Tirar o '({labelJanela})' dos títulos — o período está no cabeçalho. A troca de paleta em raio-x-blocos.tsx vale também para o RaioXCorretor da gestão (mesma composição, mesmos blocos).

**Peças:** PageHeader com actions (já usado); StatGrid/StatTile com delta (já usado); Painel de fila-lateral.tsx — privado; extrair/exportar para a lateral curta; FunilResumo (fila-funil-resumo.tsx, exportado) para a carteira em barras; ResultadoMensalChart / TabelaMensal (raio-x-blocos.tsx, exportados) com paleta navy+dourado; SeletorPeriodo (raio-x-blocos.tsx, exportado) nas actions.

### `/templates` — nota 4, esforço P, impacto baixo

**Quem usa.** Admin, ocasionalmente, para cadastrar e editar modelos de WhatsApp/e-mail/SMS. Tela utilitária de configuração.

**Problemas.**

- Dois títulos de página empilhados: o PageHeader 'Configurações' do hub e, dentro da aba, um segundo PageHeader completo 'Templates de mensagem' (h1 de 36 px) — exatamente o caso que CabecalhosDeSecao resolveu no Financeiro (Fase 8), mas configuracoes.tsx não envolve as abas por ele.
- Abaixo disso ainda há um terceiro nível de título: SectionHeader eyebrow 'Comunicação' + 'Modelos disponíveis (N)'.
- Descrição do cabeçalho é manual ('Use {{nome}}, {{primeiro_nome}}, {{projeto}} e {{corretor}} como variáveis').
- A linha de abas do hub Configurações tem 8 abas com flex-wrap — no celular quebra em duas linhas (regra dos 2 menus pede uma linha); problema do hub, não só desta aba.
- Cards dos templates são o Card padrão com ícones Editar/Lixeira sempre visíveis e remoção por confirm() nativo.
- Sem filtro por canal nem busca — fica inviável quando passar de ~10 modelos.
- [revisão] Corrigido um detalhe de fato: o segundo PageHeader NÃO tem eyebrow — numeroDoModulo exclui 'configuracoes' (sistemas.ts:733) e o ModuloAtualProvider entrega null sem número, então EyebrowDoModulo não renderiza. O problema real é o h1 duplicado em tamanho de página, não o eyebrow. Nota 4 e esforço P mantidos; papel admin confirmado (configuracoes.tsx gate !isAdmin).

**Proposta.** Ajustes pequenos: envolver o conteúdo das abas de Configurações em CabecalhosDeSecao (o 'Templates de mensagem' vira título de seção h2, com 'Novo template' à direita) e remover o SectionHeader 'Modelos disponíveis'; a ajuda das variáveis vai para o placeholder/tooltip do campo Conteúdo (já existe o exemplo no placeholder). Lista em cartões rounded-2xl/border-border-subtle com o menu '…' (editar, desativar, remover com AlertDialog) e chips de canal (WhatsApp · E-mail · SMS · Interno) como filtro em uma linha quando houver muitos. No hub: reduzir as 8 abas a uma linha (agrupar ou usar ResponsiveTabs) — fora do escopo desta aba, mas é o que faz a tela quebrar no celular.

**Peças:** CabecalhosDeSecao (components/page-header.tsx); EntityCard (components/ui/entity-card.tsx); AlertDialog (components/ui/alert-dialog.tsx); ResponsiveTabs (components/ui/responsive-tabs.tsx); DropdownMenu.

### `academia/conteudo.$codigo` — nota 4, esforço P, impacto baixo

**Quem usa.** Só o admin, ao escrever/editar aulas e questões de um módulo (esporádico).

**Problemas.**

- Botão ghost '← Conteúdo' acima do PageHeader (linhas 200–204, redundante com a trilha do header).
- O topo não diz se o módulo está pronto para publicar: as três condições que a RPC academia_publicar_modulo cobra (migration 20261002120000, linhas 1006–1009: ao menos 1 aula publicada, ao menos 5 questões ativas, sem revisão pendente) só aparecem quando o admin clica 'Publicar' e recebe o Alert 'Não publicou'. A description lista 'Versão · N aulas · N questões ativas' sem dizer se bastam.
- Texto de manual dentro da aba Questões: 'O quiz sorteia até 10 das questões ativas. Para publicar, são pelo menos 5.'
- Ações secundárias 'Nova aula' e 'Nova questão' ficam em 'flex justify-end' dentro de cada aba, cada uma com alinhamento diferente da outra (uma sozinha, outra ao lado do texto) — nem no cabeçalho de seção nem no header.
- Alert 'Revisão pendente' com botão 'Marcar como revisado' empurra as abas para baixo; cores literais emerald-700/400 na alternativa correta (linha 360).
- Padding dobrado (wrapper p-4 md:p-6 por cima do padding do shell).
- [revisão] A regra de aulas da RPC é 'publique ao menos 1 aula' (n_aulas < 1 recusa), não 'todas as aulas publicadas': o checklist proposto como '4/4 aulas publicadas ✓' ensinaria uma regra que o banco não cobra. O item certo é 'N aulas publicadas (mínimo 1)'.
- [revisão] 'questaoValida' não serve para o contador: ela recebe QuestaoForm (precisaria de questaoParaForm por questão) e a RPC conta só `ativa`, que a página já calcula em `ativas` (linha 150). Tirada das peças; o checklist usa `ativas >= 5`.

**Proposta.** Manter PageHeader único (código · título, StatusBadge no titleAddon, 'Publicar' como única ação navy). Trocar a description por um checklist de publicação de 3 itens inline com a mesma regra da RPC ('3 aulas publicadas ✓ (mínimo 1) · 7 questões ativas ✓ (mínimo 5) · revisão pendente ✗') — assim o Alert de revisão vira um item do checklist com a ação 'Marcar como revisado' ao lado, e o motivo da recusa aparece antes do clique. Abas Aulas/Questões continuam (2, uma linha); cada aba abre com CabecalhosDeSecao ('Aulas' + botão 'Nova aula' à direita, 'Questões' + 'Nova questão'); a regra do sorteio vira hint do botão/tooltip. Alternativa correta em text-success. Tirar o '← Conteúdo' e o wrapper de padding.

**Peças:** CabecalhosDeSecao; StatusBadge; Alert (só para o erro de publicação); mensagemDaGestao (mensagens.ts) para o texto de cada item recusado; ResponsiveTabs (já em uso).

### `academia/modulo.$codigo.aula.$ordem` — nota 4, esforço P, impacto medio

**Quem usa.** Participante da trilha, a cada aula (uso frequente enquanto estuda).

**Problemas.**

- Não usa PageHeader: tem h1 próprio 'font-display text-xl font-semibold' (linha 66, menor que o padrão 2xl/3xl) e sem o eyebrow MÓDULO 10 — é a única família de telas da Academia com cabeçalho fora do padrão.
- Botão ghost '← {modulo.titulo}' acima do título (linhas 57–64; a trilha do header já leva ao módulo).
- Barra inferior caseira ('sticky bottom-0 mt-6 … border-t bg-background/95 backdrop-blur', linha 150) visível em todos os tamanhos, em vez de um componente do design system.
- Cartões de fallback ('Vídeo em breve', 'Os slides abrem fora do CRM') em Card genérico; 'Próxima' em variant secondary.
- Padding dobrado (wrapper p-4 md:p-6).
- [revisão] Removido 'Verde literal (emerald) no ícone de concluída': não existe `emerald` em aula-page.tsx — o CheckCircle do botão só troca o weight (fill/regular) e o botão vira outline quando feita. Problema inexistente.
- [revisão] StickyActionRail (components/ui/sticky-action-rail.tsx) é `fixed`, `mobileOnly` por padrão (md:hidden) e posicionada acima do BottomNav (bottom = safe-area + 4.75rem): serve para o celular, mas no desktop a aula precisa manter uma linha de botões normal no fim do texto (ou passar mobileOnly={false}, que faria a barra flutuar fixa sobre o conteúdo). A proposta foi ajustada.

**Proposta.** Trocar o h1 por PageHeader com eyebrow explícito (eyebrow='Módulo 10 · {modulo.titulo} · Aula N de M') e title = aula.titulo, description = duração; tirar o '← módulo'. Conteúdo (embed/vídeo/markdown) continua sendo o corpo — é tela de leitura, sem placar nem lateral. Ações: 'Concluí esta aula' (navy, única) + 'Próxima' (outline): no celular no StickyActionRail (padrão mobileOnly), no desktop numa linha de botões ao fim do texto (sem sticky caseiro). Remover wrapper de padding. Nada mais: é um leitor, não um painel.

**Peças:** PageHeader com prop eyebrow; StickyActionRail (components/ui/sticky-action-rail.tsx) — só celular; Markdown (academia/markdown.tsx); EmptyState.

### `academia/modulo.$codigo.quiz` — nota 4, esforço P, impacto baixo

**Quem usa.** Participante, uma vez por módulo (ou nas retentativas).

**Problemas.**

- Quatro estados (antes/respondendo/confirmação/resultado) sem PageHeader/eyebrow: 'antes' e 'confirmação' têm h1 próprio 'text-xl' (linhas 155 e 193); 'resultado' nem título tem — abre direto no botão de voltar e no Card.
- Botão ghost '← {módulo}' solto no topo dos estados 'antes' e 'resultado' (linhas 61–68, 75, 154).
- Resultado usa Card com borda literal 'border-emerald-600/50' / 'border-destructive/50' (linha 76), ícone text-emerald-600 e nota em texto 2xl — não reaproveita o ScoreRing que o CRM já tem para 'número com anel'.
- Correção: lista de Cards de mesmo peso para todas as questões, acertos e erros misturados, com emerald-700/400 na alternativa correta (a análise poderia começar pelos erros).
- Padding dobrado (wrapper p-4 md:p-6).
- [revisão] 'AnelDoDia' não é exportado (é `function` local em fila-cockpit.tsx): a peça real é ScoreRing (components/ui/score-ring.tsx, exportado). Tirado das peças.
- [revisão] Faltou o aviso de testes: tests/academia-quiz.test.tsx ('o resultado mostra nota, correção e explicação') espera, logo após 'Enviar agora', os textos '100', 'Aprovado. O módulo avança.', 'Correção' e a explicação da questão visíveis sem clique. 'Ver correção' atrás de Accordion fechado quebra o teste — abrir por padrão (ou só recolher as acertadas) ou atualizar o teste. ScoreRing arredonda e grampeia 0–100 e mostra o número dentro do anel: o '100' continua na tela.

**Proposta.** Estado 'antes de começar' e 'resultado' com PageHeader ('Quiz · {módulo}', eyebrow automático) e sem '← voltar'; o estado 'respondendo' fica propositalmente sem cabeçalho (é o 'modo foco' do quiz: contador, relógio, Progress, enunciado) — isso está certo e não muda. Resultado: um cartão principal com ScoreRing (nota) + 'x de y certas · mínimo z' + a frase ('Aprovado. O módulo avança.'), botão único 'Voltar ao módulo' (navy) ou 'Refazer'; a correção vem abaixo com título 'Correção', erradas primeiro e acertadas recolhidas num Accordion 'Ver as que acertou' (a explicação das erradas fica visível, como o teste exige). Tokens success/destructive no lugar de emerald. Remover wrapper de padding.

**Peças:** PageHeader; ScoreRing (components/ui/score-ring.tsx); Progress (já em uso); StatusBadge; Accordion para as questões acertadas.

### `reserva` — nota 4, esforço P, impacto medio

**Quem usa.** Corretor, algumas vezes por semana (buscar um cliente que saiu da carteira e trazê-lo quando há vaga; o resgate pelo corretor está fechado desde 28/09 — o banco devolve `porta_fechada_use_lote` — então hoje é sobretudo consulta). Gestão abre a base de um corretor em leitura via `?corretor=`. SDR é redirecionado para /sdr.

**Problemas.**

- O "como estou agora" está escondido em prosa: a descrição do PageHeader é `fraseDoPlacar(resumo)` — uma frase com os números (ocupadas/teto/vagas) em texto corrido, em vez de 3–5 números com dono. É o mesmo X/65 do anel da Fila Única, num desenho diferente.
- Abaixo, uma linha de chips por motivo ("N sem passo", "N sem movimento", "N sem conversa", "N sem vaga") com peso igual e sem título — pequenos blocos soltos; não filtram a lista.
- Ação do cabeçalho "Ir para a Fila Única" (outline) é navegação, não a ação da página; a ação real ("Trazer") se repete em cada linha e fica desabilitada sempre que não há vaga (`podeResgatar = !corretorId && vagas > 0`), com o motivo só no `title`; quando há vaga o botão fica ativo mas, com o resgate fechado desde 28/09, cada clique falha num toast ("porta_fechada_use_lote") — 50 botões que prometem o que o banco recusa.
- Gestão vendo outro corretor (`?corretor=`): nada na tela diz de quem é a base nem oferece "voltar" — só o botão Trazer some (a Fila faz isso com o bloco `fila-de-outro`).
- Cartão da lista em `rounded-xl` (padrão é rounded-2xl); chips de motivo com `border-destructive/40 text-destructive` e `text-warning` — cores de intenção, aceitáveis, mas sem tokens INTENT_BADGE.
- No geral a tela já é "um header + uma lista": a composição está perto do padrão.
- [revisão] Corrigido o problema do "Trazer": a porta fechada NÃO desabilita o botão (só a falta de vaga desabilita); ela aparece como erro depois do clique. Promovida a problema a ausência de "Vendo a base de X · voltar" (estava só na proposta). Em "peças": AnelDoDia e Numero de fila-cockpit.tsx não são exportados — exportar os dois, não só o anel.

**Proposta.** Manter PageHeader "Minha base" com frase curta e fixa ("O que é seu antes de Em atendimento. Busque e traga de volta quando houver vaga."); mover "Ir para a Fila Única" para um link de texto. Topo: um cartão compacto no estilo FilaCockpit (anel X de 65 + 3 números: vagas livres · na base · precisam de passo) ou uma StatGrid de 3–4 tiles com `resumoCarteira` — um lugar só para o número, igual ao da Central. Os chips por motivo descem para logo acima da lista e viram filtro clicável (categoria), com a contagem. Lista continua a área principal (rounded-2xl, border-border-subtle); "Trazer" fica só na linha e, enquanto a porta estiver fechada (ou sem vaga), vira um aviso ÚNICO acima da lista ("Resgate fechado desde 28/09 — clientes novos chegam pelo lote de 30") em vez de 50 botões que falham ou ficam cinza. Gestão vendo outro corretor: linha "Vendo a base de X · voltar" como em /fila (`fila-de-outro`).

**Peças:** FilaCockpit (exportado); AnelDoDia e Numero (fila-cockpit.tsx) existem mas NÃO são exportados — exportar para o placar; StatGrid + StatTile como alternativa; resumoCarteira / agruparReservaPorMotivo / fraseDoPlacar (carteira-ativa/derive.ts) já calculam tudo; ContadorEmAtendimento (contador-chip.tsx) para o X/65; TemperatureChip, EmptyState, QueryErrorState (já usados); INTENT_BADGE (status-tones.ts) para os chips de motivo; o bloco `fila-de-outro` da FilaUnicaPage (fila-unica-page.tsx:329-340) para a gestão.
