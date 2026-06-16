## Pontuações da Copa por semana + bônus (W.O. e finais)

Hoje a tabela `copa_pontuacoes` só tem contagens (`agendamentos/visitas/analise/vendas`). O documento legado especifica um campo extra **`total`** para guardar bônus (W.O. +10, campeão +10, vice +7, 3º +5, 4º +3). Vou portar esse modelo e atualizar o ranking para somar tudo.

### 1) Migration (schema + RPC)
- `ALTER TABLE public.copa_pontuacoes ADD COLUMN total integer NOT NULL DEFAULT 0;`
- Atualiza `public.copa_ranking(_edicao_id)` para somar `SUM(copa_pontuacoes.total)` por corretor ao `total` final (mantendo o cálculo atual de ag/vis/an/ve × pesos). Ranking passa a ser:
  `CRM_pts + Manual_pts (ag/vi/an/ve × pesos) + Σ total (bônus/semanais)`

### 2) Dados — gravar via insert (limpa e reinsere semanas 1 e 2)
`DELETE FROM copa_pontuacoes WHERE edicao_id = <Copa SMQ 2026> AND semana IN (1,2);`

**Semana 1** (campo `total` = pontos da semana):
- Bruno 10 · Mônica 0 · Juliana 0 · Maria Clara 11 · Letícia Brandão 16 · Luis Veras 7 · Geovane 10 · Valkyria 0 · Graziele 38 · Letícia Castro 21 · Jefferson 117 · Jessica 28
- Andrew 0 (não listado)
- **Bônus W.O. semana 1**: Andrew **+10** (linha separada `observacao = 'W.O.'`) — conforme confronto pos 1000 da fase de grupos
- "Seu Metro Quadrado" (participante placeholder ativo): 0

**Semana 2** (`total` = pontos da semana):
- Andrew 14 · Bruno 11 · Juliana 1 · Graziele 10 · Jefferson 1 · Jessica 1
- Maria Clara 0 (`observacao = 'folga'`) · Geovane 0 (`observacao = 'folga'`)
- Demais: 0 (Mônica, Letícia Brandão, Luis Veras, Valkyria, Letícia Castro, Seu Metro Quadrado)

### 3) Verificação
- `SELECT * FROM copa_ranking('a0000000-0000-4000-8000-000000000001')` deve listar (somando S1+S2+W.O.):
  - Jefferson 118 · Graziele 48 · Jessica 29 · Letícia Castro 21 · Bruno 21 · Letícia Brandão 16 · Andrew 24 (0+14+10 W.O.) · Maria Clara 11 · Geovane 10 · Luis Veras 7 · Juliana 1 · Mônica 0 · Valkyria 0.
- Página `/copa` reflete automaticamente (já consome `copa_ranking`).

### Observações
- Bônus de fim (campeão/vice/3º/4º) **não** são lançados agora — entram na semana 13 quando a copa terminar.
- Se preferir tratar o `total` informado como contagem por categoria (e não como bônus consolidado), me avise a quebra ag/vi/an/ve por corretor/semana.