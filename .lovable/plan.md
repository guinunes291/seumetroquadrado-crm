## Objetivo

Substituir a página `/ranking` atual pela experiência "Performance TV" inspirada no `PerformanceTV.tsx` enviado: um painel ao vivo, com tema escuro, animações e três visões (Real x Meta, VGV/Vendas, Produtividade), pronto para uso em TV.

## Stack e adaptações

- A referência usa `trpc`, `wouter` e dados como `dashboardPerformance.getData`, `ranking.getCompleto`, `relatoriosGestor.showRate`. No nosso projeto não existem essas APIs.
- Substituir por **`useQuery` + Supabase client** consultando as tabelas que já temos: `leads`, `lead_status_transitions`, `agendamentos`, `interacoes`, `metas`, `profiles`, `equipes`.
- Reaproveitar `src/lib/metas.ts` (cálculos de KPIs) e `PONTUACAO` já existente em `ranking.tsx`.
- Manter o arquivo único `src/routes/_authenticated/ranking.tsx` (rota já existente).

## Escopo do que será construído

### Header sticky
- Logo + título "Performance ao Vivo" + badge AO VIVO pulsante.
- Tabs: **Real x Meta** · **VGV / Vendas** · **Produtividade**.
- Relógio ao vivo + última atualização.
- Botões: Auto-rotação (30s), Refresh manual, Fullscreen.
- Filtros: seletor de Mês/Ano (Real x Meta) ou Período (Hoje/Semana/Mês/Ano), seletor de Equipe (admin/gestor).

### Componentes auxiliares (mesmo arquivo)
- `useCountUp` (animação numérica).
- `LiveClock`.
- `KPICard` (com variantes, count-up, delta vs período anterior).
- `GaugeChart` (SVG 270° para % atingimento da meta).
- `MetaProgressBanner` (barra full-width com milestones 25/50/75/100).
- `PodiumVisual` (top 6 em pódio com badges 👑🥈🥉🎯).
- `RankingLateral` (lista rolável com posições e setas sobe/desce).
- `FunilConversao` (Leads → Agendamentos → Visitas → Contratos com taxas).
- `EvolucaoMensalChart` e `AtingimentoMensalChart` (barras simples por mês).
- `CorretoresMetaViz` (gráfico/tabela toggle: faturamento × meta por corretor).
- `SalesTickerBanner` (faixa inferior com vendas correndo).
- `MetaAtingidaOverlay` (confete quando bate 100%).

### Aba "Real x Meta"
- Banner com % atingimento.
- 3 colunas: Gauge + métricas (Realizado/Meta/Gap/Tendência), evolução do ano, KPIs do mês.
- Linha extra: Evolução faturamento x meta + Corretores meta viz.

### Aba "VGV / Vendas"
- Grade de 8 KPIs: Meta, Faturamento, % Realizado, Gap, Tendência, Contratos, Ticket Médio, Corretores.
- Pódio + ranking lateral por VGV.

### Aba "Produtividade"
- Grade de KPIs: Pontos, Ligações, WhatsApp, Agendamentos, Visitas, Documentação, Vendas.
- Pódio por pontuação + ranking lateral.
- Funil de conversão.
- Tabela completa com heat-map por coluna.

## Dados (queries Supabase reais)

1. **Leads no período** — count + por corretor.
2. **Transições** (`lead_status_transitions`) — vendas (`contrato_fechado`), análises (`analise_credito`), visitas realizadas.
3. **Agendamentos** — totais e realizados (show rate).
4. **Interações** (`interacoes`) — separar `tipo='ligacao'` e `tipo='whatsapp'`.
5. **Metas** (`metas`) — VGV individual e total do mês.
6. **Profiles** — nome/foto dos corretores; filtro opcional por `equipe_id`.

`VGV total` = soma de `lead.valor_negociado` para leads com transição `contrato_fechado` no período (ou usar `leads.valor_negociado` agregado por status atual como fallback enquanto não há campo de venda dedicado).

Pontuação por corretor segue o `PONTUACAO` já existente (5/2/15/25/35/80).

## Comportamentos

- Refresh automático a cada 5 min + botão manual.
- Auto-rotação alternando entre as 3 abas a cada 30s (toggle).
- Fullscreen real via `requestFullscreen()`.
- Animação count-up nos KPIs.
- Tracking de mudança de posição: comparar snapshot anterior e mostrar ▲/▼.

## Fora do escopo (não implementar agora)

- Modal drill-down por corretor (substituível por link para `/leads-por-corretor` ou ficha).
- Configuração de metas inline (já existe rota `/metas`).
- Show Rate detalhado (somente o agregado simples).
- Distratos/VGV líquido (não temos coluna específica).

## Entregáveis

- `src/routes/_authenticated/ranking.tsx` reescrito (componentes auxiliares no mesmo arquivo para manter o padrão atual).
- Sem migrações novas — usa schema existente.
