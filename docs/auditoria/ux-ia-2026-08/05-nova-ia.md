# Fase 5 — Nova arquitetura de informação

> Estrutura-alvo. Cada decisão amarrada a um número da Fase 4.
> Dois papéis reais: **corretor** e **gestão** (admin + gestor). `superintendente` é legado
> sem usuário e não recebe navegação própria.

---

## 1. Menu do corretor

Organizado por intenção, não por entidade. **5 destinos + 1 de apoio.**

| # | Rótulo | Rota | Pergunta que responde |
|---|---|---|---|
| 1 | **Meu dia** | `/hoje` | "O que eu faço agora?" |
| 2 | **Atender** | `/atendimento` | "Quem eu procuro agora, nesta ordem?" |
| 3 | **Funil** | `/pipeline` | "Onde meus negócios estão parados?" |
| 4 | **Projetos** | `/projetos` | "O que eu ofereço e por quanto?" |
| 5 | **Desempenho** | `/ranking` | "Como eu estou indo?" |
| — | **Links Úteis** | `/links-uteis` | "Onde está o material da construtora?" — botão único, última posição **[DECIDIDO]** |

**`/leads` sai do menu.** Ela não é destruída: vira o **modo Consulta** dentro de Atender.
O corretor deixa de ter duas portas para o mesmo objeto (Fase 2, D1).

### Atender — três modos, uma porta

```
Atender  ─┬─ Prioridade  (padrão)  → as filas por score
          ├─ Volume                → o antigo Modo Blitz
          └─ Consulta              → a antiga lista /leads, com filtros no drawer
```

Baseado na sua definição: *"Blitz é volume, Atendimento é prioridade"* **[DECIDIDO]**.
Consulta é a terceira intensidade: buscar e operar em lote.

**Filas do modo Prioridade — de 5 para 6:**
`Novos · Responder · Follow-ups · Esfriando · **Confirmar visita** · Pasta travada`

A fila nova resolve a tarefa **#5b**, hoje INEXISTENTE. O dado já existe: a exceção
`visita_sem_confirmacao` é calculada para o painel do gestor (`painel-dia/derive.ts:12`) — falta
apenas expô-la ao corretor, que é quem pode agir.

---

## 2. Menu da gestão

| # | Rótulo | Rota | Pergunta |
|---|---|---|---|
| 1 | **Meu dia** | `/hoje` | "O que exige minha ação hoje?" |
| 2 | **Operação** | `/painel-gestor` | "Onde a operação está travando?" |
| 3 | **Distribuição** | `/distribuicao` | "O lead que entrou chegou a um corretor apto?" |
| 4 | **Dinheiro** | `/financeiro` | "O que entrou, o que aprovo e o que se paga?" |
| 5 | **Projetos** | `/projetos` | "Qual é o estoque?" |
| — | **Links Úteis** | `/links-uteis` | idem corretor |
| rodapé | **Configurações** | `/configuracoes` | "Como o CRM está configurado?" |

O gestor que também vende alterna para o menu do corretor por um seletor de perfil no rodapé —
**não** por um toggle no cabeçalho da home, que você nunca usa **[DECIDIDO]**.

### Operação — de 12 abas para 5

```
Operação ─┬─ Dia          (padrão) [DECIDIDO]  → exceções acionáveis
          ├─ Funil        Funil + Gargalos fundidos (mesmos filtros)
          ├─ Time         Performance + Leads por Corretor fundidos
          ├─ Metas        ritmo do mês
          └─ Relatórios   números do período
```

**Exceções do Painel do Dia — de 7 para 8:** acrescenta **`documentacao_travada`**, resolvendo a
tarefa **#14** (hoje INEXISTENTE para o gestor). E `analise_parada` passa a distinguir os três
estados de crédito quando a Onda 3 entregar as etapas novas.

### Dinheiro — rota nova

Absorve `/financeiro/fechamento` **+ Comissões** (hoje aba de `/ranking`) **+ aprovação de venda**
(hoje montada em `comissoes-page.tsx`). **[DECIDIDO: comissão merece lugar próprio de dinheiro]**

Resolve a tarefa **#15**: o badge de aprovações passa a apontar para a tela que aprova.
De **5 cliques com o badge mentindo** para **2**.

---

## 3. Home por perfil

### Corretor — `/hoje`

| Bloco | Por que ganhou o espaço |
|---|---|
| **Próxima melhor ação** (hero) | É a resposta literal da pergunta da página. Já existe (`widget-registry.tsx:88`) |
| **Agenda de hoje** | Compromisso tem hora marcada — custo do erro mais alto do dia |
| **Fila de missões** | O que fazer depois da NBA, já priorizado por score |
| **Tarefas & follow-ups** | O que ele deve e pode esquecer |
| **Metas do dia** | Contexto de esforço, não de decisão — última posição |

Ordem **fixa** — ninguém personalizou **[DECIDIDO]**. Sai o toggle Operação × Minha, sai o botão
de personalização: dois controles no cabeçalho da tela mais aberta do sistema, com uso zero.

### Gestão — `/hoje`

| Bloco | Por que ganhou o espaço |
|---|---|
| **O que exige ação hoje** (hero) | As exceções acionáveis, com transferir in-line |
| **Ritmo do mês** | Pacing: dá para bater? |
| **Aprovações pendentes** | **Novo.** Hoje só existe como badge no menu; vira bloco com ação direta |
| **Radar de risco** | Leitura de risco agregada |

---

## 4. Mapa de-para completo

Nenhuma rota atual fica sem destino.

### Rotas vivas

| Rota atual | Destino | Tipo |
|---|---|---|
| `/hoje` | `/hoje` | mantém, conteúdo por papel |
| `/leads` | `/atendimento?modo=consulta` | **redirect** |
| `/leads/$leadId` | `/leads/$leadId` | mantém — deep link estável para WhatsApp |
| `/atendimento` | `/atendimento` | mantém, ganha 3 modos e 6ª fila |
| `/blitz` | `/atendimento?modo=volume` | **redirect** |
| `/oferta-ativa` | `/atendimento?modo=oferta` (execução) | **redirect** |
| `/oferta-ativa/nova` | `/painel-gestor?tab=campanhas` | **redirect** (criação é gestão) |
| `/oferta-ativa/$ofertaId` | mantém | deep link da lista |
| `/leads-landing` | `/distribuicao?tab=landing` | **redirect** |
| `/pipeline` | `/pipeline` | mantém só o Funil |
| `/pipeline?tab=fechamento` | `/financeiro?tab=fechamento` | **redirect** |
| `/agendamentos` | `/agendamentos` | mantém; ganha acesso pelo FAB |
| `/modo-visita` | `/modo-visita` | mantém — deep link do dia de plantão |
| `/projetos`, `/projetos/$id` | mantêm | promovidos no mobile |
| `/vitrine` | mantém, filho de Projetos | — |
| `/links-uteis` | mantém — **promovido a 1º nível** | **[DECIDIDO]** |
| `/ranking` | mantém Ranking + Competição + Conquistas | — |
| `/ranking?tab=comissoes` | `/financeiro?tab=comissoes` | **redirect** |
| `/painel-gestor` | mantém, 5 abas | — |
| `/painel-gestor?tab=pessoas\|estoque\|campanhas\|comunicacao\|qualidade` | `/configuracoes?tab=…` | **redirect** |
| `/painel-gestor?tab=funil\|gargalos` | `/painel-gestor?tab=funil` (fundidas) | **redirect** |
| `/painel-gestor?tab=leads-corretor` | `/painel-gestor?tab=time` (fundida) | **redirect** |
| `/distribuicao` | mantém, ganha aba landing | — |
| `/financeiro/fechamento` | `/financeiro?tab=fechamento` | **redirect** |
| `/match` | mantém fora do menu **[DECIDIDO]** — **entra no ⌘K** | — |
| `/meu-perfil`, `/configuracoes` | mantêm no rodapé | — |

### Rotas que já são redirect

Os 17 redirects atuais **continuam funcionando** — passam a apontar para os destinos novos onde
o destino mudou (`/comissoes` → `/financeiro?tab=comissoes`, `/radar` → `/financeiro?tab=fechamento`,
`/kanban` → `/pipeline`, os demais inalterados).

**Rotas eliminadas: zero.** Toda URL que hoje abre alguma coisa continua abrindo.

---

## 5. Padrões de navegação a adotar

| Padrão | Onde aplicar | Resolve |
|---|---|---|
| **Busca global com atalho** | já existe (⌘K). **Levar para a barra de polegar** no lugar de Pipeline **[DECIDIDO]**. Incluir `/match` nos resultados | #1 (alvo ruim), #4 (descoberta) |
| **Menu de ação no FAB** | o FAB dourado deixa de ser só SamiQ e abre: *Registrar contato · Novo lead · SamiQ* **[DECIDIDO]** | **#2: de 4 para 2 cliques** |
| **Drawer em vez de página** | o `LeadPeekDrawer` do Atendimento (`atendimento.tsx:15`) vira o padrão: abre em Consulta, no Funil e nos widgets da home | #1, #8 |
| **Ação in-line na lista** | avançar etapa direto do card, sem abrir o dossiê — o Painel do Dia já faz isso com Transferir (`painel-dia-view.tsx:335`) | **#3: de 4 para 3** |
| **Ação em massa** | onde já existe em `/leads`, preservar no modo Consulta; acrescentar em Confirmar visita (confirmar N de uma vez) | #5b |
| **Deep link estável** | `/leads/$leadId` e `/projetos/$projetoId` — nunca mudam de forma, coláveis no WhatsApp | — |
| **Comparação lado a lado** | Relatórios e Funil por corretor: mostrar período/corretor **contra** a referência, não no lugar dela | **#10 e #11, hoje impossíveis** |

---

## 6. Nomenclatura

Regra: o rótulo descreve o **resultado que o usuário quer**, na língua do time. Nenhum conceito
do domínio foi renomeado — lead, pasta, funil, repescagem, corretor e roleta ficam como estão.

| Nome atual | Nome proposto | Motivo |
|---|---|---|
| Início | **Meu dia** | "Início" descreve posição no menu; "Meu dia" descreve o conteúdo |
| Leads | *(sai do menu)* | virou modo Consulta de Atender |
| Atendimento | **Atender** | verbo, não substantivo abstrato: o menu diz o que se faz |
| Modo Blitz | **Volume** (modo) | "Blitz" exige aprender o que é; "Volume" é sua própria definição |
| Pipeline | **Funil** | o time fala "funil". "Pipeline" é jargão importado |
| Gestão | **Operação** | "Gestão" é o papel de quem olha; "Operação" é o objeto olhado |
| Financeiro · Fechamento | **Dinheiro** | é como se fala. Abriga fechamento, comissões e aprovações |
| Desempenho / Ranking | **Desempenho** | unificar: hoje a sidebar diz "Desempenho" e a página diz "Ranking" (D10) |
| Oferta Ativa | **Oferta Ativa** | mantido — é nome do time, não jargão de CRM |
| Radar | *(já eliminado)* | virou Modo Fechamento; o redirect fica |
| Análise de crédito | **Em Análise / Aprovada / Reprovada** | três estados reais **[DECIDIDO]** — Onda 3 |

---

## 7. Wireframes das 5 telas mais importantes

### 7.1 Corretor — celular, `/hoje`

```
┌──────────────────────────────────────┐
│ ☰            🔍 buscar          🔔    │
├──────────────────────────────────────┤
│ Bom dia, Guilherme                   │
│ ┌──────────────────────────────────┐ │
│ │ ★ PRÓXIMA MELHOR AÇÃO            │ │
│ │   Ligar para Maria Silva          │ │
│ │   quente · 3d sem contato         │ │
│ │   [ Ligar ]  [ WhatsApp ]         │ │  ← ação no card, sem abrir lead
│ └──────────────────────────────────┘ │
│ AGENDA DE HOJE            2           │
│  09h Visita — Res. Vista Verde       │
│  14h Retorno — João P.  [confirmar]  │  ← resolve #5b
│ MISSÕES                   7  →       │
│ TAREFAS                   3  →       │
│ METAS DO DIA          ▓▓▓░░ 60%      │
├──────────────────────────────────────┤
│  ☀️        👥       ⊕      🎧      🔍  │
│ Meu dia   Leads   AÇÃO  Atender Buscar│
└──────────────────────────────────────┘
        ↑ FAB abre: Registrar contato · Novo lead · SamiQ
```

Pipeline sai da barra **[DECIDIDO]**; Buscar entra **[DECIDIDO]**; o FAB vira menu de ação
**[DECIDIDO]**.

### 7.2 Corretor — celular, `/atendimento`

```
┌──────────────────────────────────────┐
│ Atender                              │
│ ( Prioridade )  Volume   Consulta    │  ← 3 modos, 1 porta
├──────────────────────────────────────┤
│ ⚡ NOVOS                    3        │
│ 💬 RESPONDER                8        │
│ ┌──────────────────────────────────┐ │
│ │ Ana Costa      quente · 2d       │ │
│ │ Res. Bela Vista                   │ │
│ │ [WhatsApp] [Contato] [Etapa ▾]   │ │  ← etapa in-line: #3 de 4 → 3
│ └──────────────────────────────────┘ │
│ ⏰ FOLLOW-UPS               5        │
│ 🧊 ESFRIANDO                12       │
│ 📅 CONFIRMAR VISITA         2        │  ← FILA NOVA: #5b
│ 📁 PASTA TRAVADA            4        │
└──────────────────────────────────────┘
```

### 7.3 Corretor — celular, projeto (tarefa #6)

```
FAB → "Projetos"  ou  🔍 → nome do projeto        ← 2 toques (era 4)
┌──────────────────────────────────────┐
│ ← Residencial Vista Verde            │
│ [capa]      A partir de R$ 189.000   │
│ MCMV F2 · 2 quartos · 42m²           │
│ ┌──────────────────────────────────┐ │
│ │  💰 TABELA DE PREÇOS      ▾      │ │  ← primeira dobra, não terceira
│ │  Bloco A · 12º · 42m² · R$ 195k  │ │
│ └──────────────────────────────────┘ │
│ [ Enviar no WhatsApp ]  [ Simular ]  │
└──────────────────────────────────────┘
```

### 7.4 Gestão — desktop, `/hoje`

```
┌─────────────┬────────────────────────────────────────────────┐
│ Meu dia   ● │  Bom dia, Guilherme                            │
│ Operação    │ ┌────────────────────────────────────────────┐ │
│ Distribuição│ │ ⚠ O QUE EXIGE AÇÃO HOJE              23    │ │
│ Dinheiro  ③ │ │ SLA estourado      4  → [Transferir]       │ │
│ Projetos    │ │ Parados +15d       9  → [Ver]              │ │
│ Links Úteis │ │ Visita s/ confirmar 3 → [Cobrar]           │ │
│             │ │ Pasta travada      5  → [Ver]     ← NOVO   │ │
│             │ │ Sem corretor       2  → [Distribuir]       │ │
│             │ └────────────────────────────────────────────┘ │
│             │ ┌──────────────────┐ ┌──────────────────────┐ │
│             │ │ RITMO DO MÊS     │ │ APROVAÇÕES      3    │ │
│             │ │ 62% · faltam 8d  │ │ Venda R$ 210k        │ │
│             │ │ ▓▓▓▓▓▓░░░░       │ │ [Aprovar] [Ver]  ←#15│ │
│             │ └──────────────────┘ └──────────────────────┘ │
│ ⚙ Config    │                                                │
└─────────────┴────────────────────────────────────────────────┘
```

O badge de aprovações deixa de ser um número que aponta para o lugar errado e vira um bloco
com a ação dentro.

### 7.5 Gestão — desktop, `/painel-gestor?tab=funil`

```
Operação
[ Dia ] [ Funil ] [ Time ] [ Metas ] [ Relatórios ]        ← 5 abas (eram 12)

De [01/06] até [31/08]   Corretor [ João ▾ ]   Origem [ Todas ▾ ]

  ETAPA                    JOÃO        MÉDIA DO TIME        ← comparação: #10
  Aguardando atendimento     12  ▓▓▓      8  ▓▓
  Aguardando retorno          9  ▓▓      11  ▓▓▓
  Em atendimento             15  ▓▓▓▓     9  ▓▓
  Agendado                    4  ▓        7  ▓▓     ⚠ abaixo
  Visita realizada            2  ▓        6  ▓▓     ⚠ abaixo
  Em análise                  3  ▓        3  ▓
  ├ Aprovada                  1           2                  ← Onda 3
  └ Reprovada                 1           1
  Venda                       1           2

  ⚠ GARGALO: João converte 27% de agendado→visita (time: 61%)   ← Gargalos fundido
```

Funil e Gargalos numa aba só, e a média do time ao lado do corretor em vez de no lugar dele.

---

## 8. Ganho projetado

| Tarefa | Hoje | Depois | Como |
|---|---|---|---|
| #2 Registrar interação | 4 | **2** | menu de ação no FAB |
| #3 Avançar etapa | 4 | **3** | ação in-line no card de Atender |
| #6 Tabela de preços | 4 | **2** | Projetos no FAB + busca na barra |
| #5a Agendar visita | 5 | **3** | agenda pelo FAB |
| #5b Confirmar visita | ⛔ | **2** | 6ª fila de Atender |
| #15 Aprovar venda | 5 | **2** | bloco na home de gestão + rota Dinheiro |
| #14 Pastas travadas | ⛔ | **2** | 8ª exceção do Painel do Dia |
| #10 Funil vs média | 4 + ⛔ | **3** | coluna de comparação |
| #11 KPI vs anterior | 2 + ⛔ | **2** | comparação lado a lado |
| #13 Parados há X dias | 3 (X fixo) | **3** (X livre) | filtro parametrizável |

**Menu de 1º nível:** corretor 5+1 (era 5, mas com `/leads` duplicando `/atendimento`);
gestão 5+1+rodapé (era 6). **Abas de Operação: 12 → 5.**
