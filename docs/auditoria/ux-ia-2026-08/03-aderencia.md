# Fase 3 — Teste de aderência das funções

> Cada função julgada contra o objetivo declarado da sua página na Fase 2.
> Vereditos: `MANTER` · `MANTER, MAS REBAIXAR` · `MOVER PARA X` · `FUNDIR COM X` · `ELIMINAR`.
> Cada veredito cita a heurística que o sustenta.

## Heurísticas usadas

| Sigla | Heurística |
|---|---|
| **H-Hick** | Nº de opções visíveis aumenta o tempo de decisão. Acima de ~7 no nível primário há problema. |
| **H-Fitts** | Ação mais frequente merece o alvo maior e mais próximo do polegar. |
| **H-Sinal** | Proporção sinal/ruído: quanto da tela muda a decisão vs. cromo e rótulo. |
| **H-Reconh** | Reconhecimento > memorização: o sistema mostra ou o usuário precisa lembrar? |
| **H-Vazio** | Estado vazio e de erro existem? Tela que só funciona com dado perfeito é tela quebrada em campo. |
| **H-Freq** | Prioridade por frequência × custo do erro — nunca por ordem alfabética ou de implementação. |

---

## `/leads` — objetivo: *nenhum único* (veredito da Fase 2: fundir com `/atendimento`)

Página com ~20 ações competindo no nível primário. É a maior violação de Hick do sistema.

| Função | Contribui? | Veredito | Destino | Heurística | Evidência |
|---|---|---|---|---|---|
| Toggle Lista/Kanban | Não — duplica `/pipeline` | **ELIMINAR** | o kanban já existe em `/pipeline` | H-Hick, D2 | `leads.index.tsx:944-961` |
| Botão "Blitz" | Sim, mas é atalho para outra rota | **FUNDIR** | vira seletor de modo Prioridade × Volume | H-Reconh | `:962-967` |
| Botão "Importar" | Não — ato de admin, uso raro | **MOVER PARA `/configuracoes`** | bloco de cadastros | H-Freq | `:969-972` |
| Botão "Novo lead" | Sim — alta frequência | **MANTER e PROMOVER** | vai para o menu de ação do FAB mobile | H-Fitts | `:975` |
| Visões salvas | Sim, para uso pesado de desktop | **MANTER, MAS REBAIXAR** | drawer de filtros | H-Hick | `:1071-1113` |
| Busca nome/email/telefone | Redundante com ⌘K global | **ELIMINAR** | ⌘K já resolve de qualquer tela | H-Reconh, D8 | `:1192` vs `command-palette.tsx:91` |
| Toggle tabela/cards | Não muda decisão nenhuma | **ELIMINAR** | — | H-Sinal | `:1215-1227` |
| 5 filtros (origem, temperatura, período, corretor, datas) | Sim, para auditoria | **MANTER, MAS REBAIXAR** | drawer | H-Hick | `:1250-1323` |
| Em massa — Registrar ligação | Sim | **MANTER** | — | H-Freq | `:1337-1353` |
| Em massa — Temperatura | Sim | **MANTER** | — | — | `:1355-1392` |
| Em massa — Follow-up | Sim | **MANTER** | — | — | `:1394` |
| Em massa — Descartar | Sim | **MANTER** | — | — | `:1397` |
| Em massa — Roleta (admin) | Não — é ato de distribuição | **MOVER PARA `/distribuicao`** | onde a roleta mora | H-Reconh | `:1407-1425` |
| Em massa — Transferir | Não — é ato de gestão | **MOVER PARA gestão** | Painel do Dia já tem transferir inline | H-Freq | `:1427` |
| Em massa — Lixeira/Restaurar | Não — é ato de qualidade | **MOVER PARA `/configuracoes`** | aba Qualidade | H-Freq | `:1430-1450` |
| Na linha — temperatura, WhatsApp, ligar | Sim — ação sem abrir registro | **MANTER** | modelo a replicar | H-Fitts | `:1597, 1699, 1710` |

**Contagem de Hick:** 11 controles no nível primário do cabeçalho + barra de filtros, mais 8 em
massa quando há seleção. Teto saudável: ~7.

---

## `/atendimento` — objetivo: *"Quem eu procuro agora, nesta ordem?"*

A página com melhor aderência do sistema. Nenhuma função é eliminada.

| Função | Contribui? | Veredito | Heurística | Evidência |
|---|---|---|---|---|
| 5 filas por score (novos, responder, followups, esfriando, docs) | Sim — é o objetivo | **MANTER** | H-Freq | `atendimento.tsx:37-43` |
| Teto de 15 cards por fila, contagem sobre a carteira inteira | Sim — limita Hick sem mentir o total | **MANTER** | H-Hick | `:56-58` |
| `LeadPeekDrawer` no card | Sim — detalhe sem perder a fila | **MANTER — padrão a replicar** | H-Reconh | `:15` |
| WhatsApp direto do card | Sim | **MANTER** | H-Fitts | `:14` |
| Realtime nas 3 tabelas em 1 canal | Sim — a fila não mente | **MANTER** | — | `:73` |
| Fallback v3→v2 | Sim — degrada sem quebrar | **MANTER** | H-Vazio | `:60-68` |

**Lacuna:** as 5 filas cobrem *responder, cobrar, reaquecer e destravar pasta* — mas **não há
fila de "visita para confirmar"**, embora `visita_sem_confirmacao` exista como exceção do lado
do gestor (`painel-dia/derive.ts:12`). O corretor não tem onde ver o que precisa confirmar.
**Achado:** adicionar 6ª fila. Ver tarefa #5 da Fase 4.

---

## `/painel-gestor` — objetivo: *seis perguntas numa página*

| Aba | Pergunta que responde | Veredito | Heurística |
|---|---|---|---|
| **Dia** | "Que exceção exige minha ação hoje?" | **MANTER — é o núcleo** | H-Freq |
| **Relatórios** | "Como foi o período?" | **MANTER** | — |
| **Funil** | "Como está a distribuição por etapa?" | **FUNDIR COM Gargalos** | H-Hick |
| **Gargalos** | "Onde acumula?" | **FUNDIR COM Funil** | H-Hick |
| **Time** | "Quem está bem e quem caiu?" | **MANTER** | — |
| **Metas & Ritmo** | "Vamos bater o mês?" | **MANTER** | — |
| **Leads por Corretor** | "Quantos leads cada um tem?" | **FUNDIR COM Time** | H-Hick, D4 |
| Pessoas (Corretores + Equipes) | cadastro | **MOVER PARA `/configuracoes`** | H-Freq |
| Estoque | cadastro | **MOVER PARA `/configuracoes`** | H-Freq |
| Campanhas | cadastro | **MOVER PARA `/configuracoes`** | H-Freq |
| Comunicação (Templates) | cadastro | **MOVER PARA `/configuracoes`** | H-Freq |
| Qualidade (Duplicatas + Lixeira) | manutenção | **MOVER PARA `/configuracoes`** | H-Freq |

Funil e Gargalos respondem a **duas metades da mesma pergunta** e compartilham exatamente o mesmo
conjunto de filtros (`painel-gestor.tsx:192`) — o único par de abas do sistema que se comporta
como uma só. Leads por Corretor é um recorte de Time (D4).

**Resultado: 12 abas → 5** (Dia · Funil & Gargalos · Time · Metas · Relatórios).

### Funções dentro da aba Dia

| Função | Veredito | Heurística | Evidência |
|---|---|---|---|
| 7 tipos de exceção com drill-through | **MANTER — melhor ferramenta de gestão do sistema** | H-Freq | `painel-dia/derive.ts:9-15` |
| Transferir corretor inline | **MANTER — modelo de ação in-line** | H-Fitts | `painel-dia-view.tsx:335-358` |
| Exportar XLSX | **MANTER, MAS REBAIXAR** (menu "mais") | H-Sinal | `:292` |
| Gerar resumo semanal | **MANTER, MAS REBAIXAR** | H-Freq | `:126-133` |
| Estado vazio "Nenhuma exceção agora" | **MANTER** | H-Vazio | `:175` |

**Lacuna grave:** os 7 tipos de exceção são `sla_estourado`, `parado`, `followup_vencido`,
`visita_sem_confirmacao`, `visita_sem_registro`, `analise_parada`, `sem_corretor`.
**Não existe exceção de documentação.** O gestor não tem onde ver as pastas travadas de toda a
operação — só o corretor vê a fila da própria carteira (`atendimento.tsx:42`). Ver tarefa #14.

---

## `/hoje` — objetivo: *"O que eu faço agora?"*

| Função | Contribui? | Veredito | Heurística | Evidência |
|---|---|---|---|---|
| Widget NBA "Próxima melhor ação" | Sim — é o objetivo literal | **MANTER — é o hero** | H-Freq | `widget-registry.tsx:88` |
| Widgets `missoes`, `tarefas`, `hoje-agenda`, `metas` | Sim | **MANTER** | — | `:89-92` |
| Widget `radar`, `produtividade` | Leitura, não ação | **MANTER, MAS REBAIXAR** | H-Sinal | `:94-95` |
| Widgets de gestão (`gestao-dia`, `gestao-pacing`, `gestao-atalhos`) | Sim, mas para outra persona | **SEPARAR por papel** | H-Sinal | `:71-87` |
| Toggle Operação × Minha | Não — você fica sempre em Operação | **ELIMINAR** | H-Sinal, H-Hick | `hoje.tsx:113-126` |
| Personalizar widgets (ocultar/reordenar) | Não — ninguém usou | **ELIMINAR** | H-Sinal | `:127` |
| `AsyncBoundary` da equipe do gestor | Sim — evita "tudo em dia" falso | **MANTER** | H-Vazio | `:132-144` |

O comentário do próprio código explica por que a `AsyncBoundary` existe: sem ela, a falha ao
carregar a equipe faria a tela inteira mostrar zeros e parecer "tudo em dia" (`hoje.tsx:132-136`).
É o melhor tratamento de estado-de-erro do repositório e deve virar padrão.

---

## `/ranking` — objetivo: *duas perguntas incompatíveis*

| Função | Veredito | Heurística | Evidência |
|---|---|---|---|
| Abas Ranking · Competição · Conquistas | **MANTER** — mesma pergunta (posição relativa) | — | `ranking.tsx:95-97` |
| Aba **Comissões** | **MOVER PARA `/financeiro`** | H-Reconh | `:98` |
| **Aprovar venda pendente** (`PendingSalesApproval`) | **MOVER PARA `/financeiro`** | H-Reconh | montado em `features/comissoes/comissoes-page.tsx` |

**Achado grave — o badge aponta para o lugar errado.** O contador de aprovações é exibido no item
**Gestão** da sidebar (`app-sidebar.tsx:120`), mas a tela que aprova a venda está montada dentro
de `comissoes-page.tsx`, ou seja, em **Desempenho → Comissões**. O sistema avisa num lugar e
esconde a ação em outro, dentro da página de gamificação. Você confirmou que aprovar venda é
tarefa sua — então este é um loop de trabalho quebrado, não um detalhe de organização.

---

## `/pipeline` — objetivo: *"Onde meus negócios estão parados?"*

| Função | Veredito | Heurística | Evidência |
|---|---|---|---|
| Kanban drag-and-drop | **MANTER no desktop** — você confirmou que no celular avança pela ficha | H-Fitts | `pipeline.tsx:44` |
| Aba Fechamento | **MOVER PARA gestão** — é previsão de receita, não etapa | H-Reconh | `:46` |

**Achado de domínio:** o kanban monta `LEAD_STATUS_ORDER` (`lib/leads.ts:24-33`), que **não
inclui `novo` nem `aguardando_corretor`** — os dois status que você confirmou receberem lead.
O funil, que existe para mostrar onde os negócios estão, **não mostra os que acabaram de chegar**.

E `analise_credito` é uma coluna só para os três estados reais da operação (Em Análise, Aprovada,
Reprovada) — dentro dessa coluna, um negócio liberado e um negócio morto são visualmente idênticos.

---

## Demais páginas — resumo

| Página | Função | Veredito | Heurística |
|---|---|---|---|
| `/blitz` | fila corrida + badges de SLA | **FUNDIR** — vira modo "Volume" de Atendimento | H-Reconh |
| `/oferta-ativa` | criação de campanha (`/nova`, admin/gestor) | **MOVER PARA gestão** | H-Freq |
| `/oferta-ativa` | execução da lista | **MANTER** como modo do corretor | — |
| `/leads-landing` | lista de leads da landing | **MOVER PARA `/distribuicao`** como aba | H-Reconh |
| `/projetos/$projetoId` | grade × tabela de unidades com preço | **MANTER** — munição comercial | H-Freq |
| `/agendamentos` | abas Agenda e Tarefas | **MANTER** | — |
| `/agendamentos` | **confirmar visita** | **NÃO ENCONTRADO** — só `marcar_presenca` no Modo Visita | H-Freq |
| `/match` | abas Financeiro e IA | **MANTER fora do menu**, mas **incluir no ⌘K** | H-Reconh |
| `/configuracoes` | 3 abas atuais + 5 herdadas = 8 | **AGRUPAR** em Integrações / Cadastros / Qualidade | H-Hick |

---

## Estados vazios e de erro

Verificados por amostragem. O sistema está **acima da média** aqui — o redesign tratou isso.

| Página | Vazio | Erro | Evidência |
|---|---|---|---|
| `/hoje` | sim ("Todos os widgets estão ocultos") | sim, isolado por widget + boundary da equipe | `hoje.tsx:145-150, 137-144` |
| `/atendimento` | sim | sim, com fallback de versão | `:60-68` |
| `/blitz` | sim ("Sua fila está vazia") | sim | `blitz.tsx:290, 319` |
| `/leads` | sim (vazio com CTA) | sim | `leads.index.tsx` |
| Painel do Dia | sim ("Nenhuma exceção agora") | sim | `painel-dia-view.tsx:159, 175` |
| `/agendamentos` | — | sim | `agendamentos.tsx:338` |
| `/match` | sim ("Nenhum empreendimento no match") | sim | `match.tsx:346, 447` |

**Nenhuma lacuna crítica de estado vazio/erro encontrada.** Este não é um problema do sistema.

---

## Ranking das violações, por gravidade

1. **`/leads` com ~20 ações no nível primário** — H-Hick. Resolvido pela fusão com Atendimento.
2. **Badge de aprovação aponta para Gestão; a ação está em Desempenho → Comissões** — loop quebrado.
3. **`novo` e `aguardando_corretor` fora do kanban** — o funil não mostra quem acabou de chegar.
4. **`analise_credito` como etapa única** — aprovado e reprovado indistinguíveis.
5. **Gestor não tem visão de pastas travadas** — a exceção de documentação não existe no Painel do Dia.
6. **Corretor não tem fila de visita a confirmar** — a exceção existe só do lado do gestor.
7. **12 abas em `/painel-gestor`** — H-Hick. Resolvido pela saída do bloco admin e pela fusão Funil+Gargalos.
8. **Toggle de escopo e personalização de widgets na `/hoje`** — H-Sinal. Dois controles que ninguém usa ocupando o cabeçalho da tela mais aberta do sistema.
