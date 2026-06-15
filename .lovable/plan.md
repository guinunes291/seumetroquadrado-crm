# Reescrita do Dashboard

Reaproveitar a estrutura visual e a divisão em camadas do `Dashboard.tsx` enviado, adaptando ao stack TanStack + Supabase. Todas as métricas vêm de RPCs (resolve o teto de 1000 linhas e dá performance com 33k+ leads).

## Arquitetura

- **Página única** `src/routes/_authenticated/dashboard.tsx` com bifurcação:
  - Gestor/Admin/Superintendente → visão completa do time
  - Corretor → visão pessoal (mesmo layout, escopo do `auth.uid()`)
- **Carregamento em tiers** (igual ao original) para evitar pico de queries:
  - Tier 1 (imediato): KPIs principais
  - Tier 2 (+300ms): leads parados, métricas por corretor
  - Tier 3 (+800ms): histórico 14d, funil, motivos de perda
  - Tier 4 (+1500ms): tabelas detalhadas (redistribuições, ranking estendido)
- Cada bloco em um componente próprio em `src/features/dashboard/sections/`.

## Filtros (topo)

Substituir o seletor Mês/Ano atual por:
- Preset: Hoje · Ontem · Esta semana · Semana passada · Este mês · Mês passado · 30 dias · 90 dias · Ano · Todo o período · Custom (range com `Calendar`)
- Checkbox "Ocultar sem corretor" (gestor)
- Tudo controlado via `useSearch` da rota para virar URL compartilhável

## Blocos a implementar

### Pacote essencial
1. **KPIs por status** — 8 cards clicáveis (`Aguardando, Em atendimento, Agendado, Visita realizada, Análise crédito, Contrato fechado, Perdido, Total`) + card de destaque com Vendas/Conversão. Clique navega para `/leads?status=...`.
2. **Ranking do mês/período** — top 10 corretores por vendas → visitas → leads (já parcialmente existe).
3. **Gráfico histórico 14 dias** — linha com leads recebidos, agendamentos, visitas, contratos por dia.
4. **Funil de vendas** — visual (Novo → Em atendimento → Agendado → Visita → Análise → Fechado) com %.

### Operacional
5. **Situação Agora** — alertas em tempo real (refetch 2 min):
   - Leads aguardando > 30 min sem contato
   - Leads sem corretor (não distribuídos)
   - Agendamentos próximos (1h)
   - Tarefas atrasadas
6. **Painel de redistribuições** — logs de `distribution_log` por período (hoje/semana/mês) com motivo.

### Analítico
7. **Métricas por corretor** — tabela consolidada (leads, agendamentos, visitas, análise, fechados, conversão), ordenável.
8. **Motivos de perda** — bar chart top 10 categorias do campo `motivo_perdido`.

## Visão do Corretor

Mesmos componentes, mas:
- KPIs filtrados por `corretor_id = auth.uid()`
- Ranking → mostra "Minha posição vs Top 3"
- Sem Situação Agora do time; troca por "Meus leads urgentes" (sem interação > 30 min)
- Sem redistribuições

## Backend (uma migration única)

Criar funções SQL `SECURITY DEFINER` com check de role embutido:

```text
public.dashboard_kpis(_di timestamptz, _df timestamptz, _corretor uuid DEFAULT NULL)
  → jsonb { total, aguardando, em_atendimento, agendado, visita, analise, fechado, perdido, vgv }

public.dashboard_serie_diaria(_di, _df, _corretor)
  → TABLE (dia date, leads int, agendamentos int, visitas int, vendas int)

public.dashboard_funil(_di, _df, _corretor)
  → TABLE (etapa text, quantidade int)

public.dashboard_metricas_por_corretor(_di, _df)
  → TABLE (corretor_id, nome, leads, agendamentos, visitas, analise, fechados, conversao)
  → reaproveita lógica de copa_ranking

public.dashboard_motivos_perda(_di, _df, _corretor)
  → TABLE (motivo text, quantidade int)

public.dashboard_leads_urgentes(_corretor uuid DEFAULT NULL, _min_minutos int DEFAULT 30)
  → TABLE (lead_id, nome, telefone, corretor_id, minutos_parado)

public.dashboard_redistribuicoes(_di, _df)
  → TABLE (data, lead_id, lead_nome, corretor_anterior, corretor_novo, motivo)
```

Todas com `GRANT EXECUTE TO authenticated`. As que retornam dados globais checam `has_role(auth.uid(), 'gestor'|'admin'|'superintendente')`; quando `_corretor` é informado e é diferente de `auth.uid()`, exigem role de gestor.

## Frontend — arquivos

```text
src/routes/_authenticated/dashboard.tsx          # orquestrador, filtros, tiers
src/features/dashboard/
  hooks/useDashboardFilters.ts                   # presets + range
  hooks/useDashboardData.ts                      # wrappers de useQuery por RPC
  sections/KpiGrid.tsx
  sections/RankingCard.tsx
  sections/SerieHistorica.tsx                    # recharts LineChart
  sections/FunilVendas.tsx
  sections/SituacaoAgora.tsx
  sections/LeadsUrgentesList.tsx
  sections/MetricasPorCorretorTable.tsx
  sections/MotivosPerdaChart.tsx                 # recharts BarChart
  sections/PainelRedistribuicoes.tsx
  components/KpiCard.tsx
  components/PeriodFilter.tsx
```

Cada `useQuery` com `staleTime: 30s`, `refetchInterval: 60s` (2 min para Situação Agora). `enabled` controlado pelo `loadStage`.

Recharts já está no projeto.

## Ordem de execução

1. Migration com as 7 RPCs.
2. `useDashboardFilters` + `PeriodFilter` + reescrita do header da rota.
3. `KpiGrid` + `useDashboardData.useKpis` (tier 1) — primeira tela já útil.
4. `RankingCard` + `SerieHistorica` + `FunilVendas` (tier 2/3).
5. `SituacaoAgora` + `LeadsUrgentesList` + `PainelRedistribuicoes`.
6. `MetricasPorCorretorTable` + `MotivosPerdaChart`.
7. Variante do corretor (mesmos componentes, props com `corretorId`).

## Fora de escopo

- VGV/contratos detalhados (não há tabela de contratos modelada).
- Edição de contrato, anexos, criação de contrato (componentes do CRM antigo).
- Performance semanal por equipe (não há tabela `equipes` ligada a metas semanais ainda).
