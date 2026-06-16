## Objetivo

1. Apagar toda a base de empreendimentos (902 projetos atuais).
2. Reestruturar a tabela `projetos` para os 21 campos do CSV `Empreendimentos_Consolidado_Junho2026.csv`.
3. Atualizar importador e filtros para usar os campos estruturados (faixa de metragem, faixa de dorms, suítes, tipo extra, faixa de vagas, sob consulta, status, mês/ano de entrega, fonte).

> Leads existentes que apontam para projetos atuais terão `projeto_id` setado para `NULL` (FK já é `ON DELETE SET NULL`). Histórico de interações e mudanças de status não é afetado.

## Mudanças no banco (1 migração)

**Limpeza**
- `DELETE FROM unidades;`
- `DELETE FROM projetos;` (FK em leads vira NULL automaticamente)

**Novos campos em `public.projetos`** (todos nullable, sem mexer nos antigos `tipologia`, `vagas`, `preco_inicial`, `entrega_status` — passam a ser legacy / preenchidos pelo importador como string consolidada para retrocompatibilidade da UI atual):

| Coluna                | Tipo      | Origem CSV              |
|-----------------------|-----------|-------------------------|
| `logradouro`          | text      | Logradouro              |
| `numero`              | text      | Numero                  |
| `metragem_min`        | numeric   | Metragem_Min            |
| `metragem_max`        | numeric   | Metragem_Max            |
| `dorms_min`           | smallint  | Dorms_Min               |
| `dorms_max`           | smallint  | Dorms_Max               |
| `suites`              | smallint  | Suites                  |
| `tipo_extra`          | text      | Tipo_Extra (multivalor) |
| `vagas_min`           | smallint  | Vagas_Min               |
| `vagas_max`           | smallint  | Vagas_Max               |
| `vagas_observacao`    | text      | Vagas_Observacao        |
| `preco_a_partir`      | numeric   | Preco_a_partir_R$       |
| `sob_consulta`        | boolean   | Sob_Consulta (Sim/Não)  |
| `status_entrega`      | text      | Status (Pronto/Obras/Lançamento) |
| `mes_entrega`         | smallint  | Mes_Entrega             |
| `ano_entrega`         | smallint  | Ano_Entrega             |
| `fonte`               | text      | Fonte                   |

Índices: `idx_projetos_status_entrega`, `idx_projetos_preco_a_partir`, `idx_projetos_ano_entrega`, `idx_projetos_cidade`, `idx_projetos_bairro`.

## Importador (`src/components/import-projetos-dialog.tsx` + `src/lib/projetos-import.functions.ts`)

- **Auto-detecção fixa** dos 21 headers do CSV (separador `;`, UTF-8 BOM). Mantém o passo de mapeamento para CSVs alternativos.
- Parse numérico robusto (vírgula/ponto, vazio → null).
- `Sob_Consulta`: "Sim" → true, "Nao"/"Não"/vazio → false.
- Construtora + Empreendimento ainda determinam o slug (dedup).
- Preenche campos legacy a partir dos novos:
  - `tipologia` = `"{dorms_min}-{dorms_max} dorms · {metragem_min}-{metragem_max} m²"` (para a UI atual continuar mostrando algo).
  - `vagas` = string "min-max" ou `vagas_observacao`.
  - `preco_inicial` = `preco_a_partir` formatado em BRL ou "Sob consulta".
  - `entrega_status` = `status_entrega` + (se houver) " · {MM/AAAA}".

## Filtros (`src/components/projetos-filters.tsx` + `src/lib/projetos.ts`)

Reescrever para usar as colunas estruturadas:

- **Localização**: Cidade → Região/Zona → Bairro (mantém, mas usando os campos diretos).
- **Faixa de preço**: usa `preco_a_partir`. Checkbox "Incluir sob consulta" (default ligado).
- **Faixa de metragem**: dois sliders/range `metragem_min`–`metragem_max` (sobreposição de intervalos).
- **Dormitórios**: pílulas 1, 2, 3, 4+ (match se `dorms_min ≤ N ≤ dorms_max`).
- **Suítes**: pílulas 0, 1, 2, 3+.
- **Tipo extra**: pílulas multi (Studio, Compacto MCMV, Garden, Penthouse, Duplex, +Loja, HIS/HMP, Comercial), separadas por vírgula no campo.
- **Vagas**: pílulas 0, 1, 2, 3+ (range min-max). Checkbox "Incluir Sem vaga / Consultar".
- **Status entrega**: pílulas Pronto / Em obras / Lançamento.
- **Ano de entrega**: range min-max (presets do ano corrente até +5).
- **Incorporadora**: multi com busca (já existe).
- **Fonte**: pílulas multi (Tabelao, etc.) — opcional, escondido se só existir 1 valor.

Chips ativos e botão "Limpar" continuam funcionando.

## Card / detalhe do projeto

Atualizar `src/components/projeto-card.tsx` e `src/routes/_authenticated/projetos.$projetoId.tsx` para exibir os campos novos (metragem min–max, dorms min–max + suítes, tipo extra como badges, vagas min–max + observação, preço "A partir de {BRL}" ou "Sob consulta", entrega "MM/AAAA · {status}"). Sem mudança de layout grande — só substituir os campos consolidados pelos estruturados.

## O que NÃO muda

- Tabela `unidades` (só zera os dados; estrutura fica).
- Webhook por projeto / token / leads / distribuição.
- Roteamento, autenticação, copa, dashboard.

## Confirmação antes de rodar

A migração apaga **todos** os 902 projetos. Os leads não são deletados — só perdem o vínculo com projeto. OK seguir?
