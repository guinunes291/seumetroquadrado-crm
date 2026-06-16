## Objetivo

Unificar os filtros de `/projetos` em **barra enxuta + modal "Mais filtros"** (padrão das referências) e padronizar os filtros de intervalo (**Preço, Metragem, Data de Entrega**) como **dois dropdowns "De" / "Até" com valores pré-definidos**, em vez de sliders ou inputs livres.

## Nova barra (sempre visível)

Uma única linha com 3 controles:

1. **Busca** (input com lupa) — nome, construtora, bairro, endereço.
2. **Localização** (popover) — Cidade → Região → Bairro em cascata; mostra resumo no botão.
3. **Mais filtros** (botão com ícone, badge com contador) — abre o modal.

À direita: **Limpar** (só quando há filtros). Abaixo da barra: chips de filtros ativos com `×` (já existem).

## Modal "Mais filtros"

`Dialog` com título "Mais filtros", seções separadas por divisor. Estado interno até "Aplicar".

- **Tipologia** — pílulas multi: Studio, 1, 2, 3, 4, 5+ dorms.
- **Vagas** — pílulas multi: 0, 1, 2, 3+.
- **Construtora** — lista com checkbox (busca interna se >8 itens).
- **Faixa de preço** — `RangeSelect` (De / Até), presets:
  - De: 200k, 300k, 500k, 750k, 1mi, 1,5mi, 2mi
  - Até: 300k, 500k, 750k, 1mi, 1,5mi, 2mi, 3mi, 5mi+
  - Checkbox "Incluir projetos sem preço informado".
- **Metragem (área privativa)** — `RangeSelect` (De / Até), presets:
  - De: 25m², 30m², 40m², 50m², 60m², 80m², 100m²
  - Até: 45m², 50m², 60m², 100m², 200m², 400m², 600m²+
- **Data de entrega** — `RangeSelect` (De / Até), presets gerados dinamicamente a partir do ano atual:
  - De: "Imediato", ano atual, +1, +2, +3, +4, +5
  - Até: ano atual, +1, +2, +3, +4, +5, "Sem limite"
- **Status de entrega** — pílulas multi: Lançamento, Em obras, Pronto.

Rodapé: **Limpar tudo** (ghost) / **Aplicar** (primary).

## Componente `RangeSelect` (reutilizável)

```tsx
<RangeSelect
  label="Preço"
  fromOptions={[{value: 200000, label: "R$ 200 mil"}, ...]}
  toOptions={[...]}
  value={[from, to]}
  onChange={([f, t]) => ...}
/>
```

- Dois `Select` lado a lado ("De" / "Até").
- Validação leve: se `from > to`, ajusta `to = from` ao mudar.
- Cada um aceita "Qualquer" como opção (null).
- Usado para Preço, Metragem e Data de Entrega.

## Schema / dados

- **Preço**: já existe `preco_inicial` + `parsePrecoBRL`. OK.
- **Metragem**: a coluna `area_privativa` (ou similar) provavelmente não existe ainda no `projetos`. Antes de implementar, vou **conferir o schema** e o `ProjetoRow`. Se não existir, este sub-filtro fica desabilitado com tooltip "Em breve" e a migração de coluna fica fora deste plano (peço aprovação separada).
- **Data de entrega**: idem — se só houver `entrega_status` textual (Lançamento / Em obras / Pronto) sem ano, o filtro De/Até de data fica desabilitado e mantemos só o filtro de Status. Se houver campo `previsao_entrega` ou similar, usamos o ano dele.

> Decisão pragmática: se faltar coluna, o filtro aparece desabilitado com aviso, em vez de criar dados sintéticos.

## Comportamento

- AND entre filtros, serializados em search params (sem mudança no contrato).
- Cascata Cidade→Região→Bairro continua, agora dentro do popover de Localização.
- Chips ativos cobrem todos os novos filtros (intervalo aparece como "R$ 300 mil – 750 mil", "50m² – 100m²", "2026 – 2028").

## Arquivos

- `src/components/projetos-filters.tsx` — refatorar barra + introduzir modal.
- `src/components/range-select.tsx` — novo, reutilizável.
- `src/lib/projetos.ts` — adicionar:
  - `PRECO_FROM_PRESETS`, `PRECO_TO_PRESETS`
  - `AREA_FROM_PRESETS`, `AREA_TO_PRESETS`
  - `entregaYearPresets()` helper
  - `parseAreaM2`, `parseEntregaYear` (se a coluna existir)
- `applyFilters` estendido com `areaMin/areaMax`, `entregaAnoMin/entregaAnoMax`.
- Sem mudança em `projetos.tsx`, `projeto-card.tsx`, rotas, migrations.

## Passo 0 (antes de codar)

Ler `ProjetoRow` em `src/components/projeto-card.tsx` e o tipo gerado em `types.ts` para confirmar quais colunas existem (`area_privativa`, `previsao_entrega`, etc.) e habilitar/desabilitar os sub-filtros condicionalmente.
