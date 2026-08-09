# Medição das RPCs órfãs (item 0.2 / métrica M4)

> A auditoria `ux-ia-2026-08` encontrou **55% das RPCs sem consumidor no frontend** (135 de 244) e decidiu: **medir antes de apagar** (item 3.4). "Sem consumidor no frontend" não prova "sem consumidor" — bots (Sami), n8n, MCP e a API pública chamam RPCs que nenhuma tela usa. Este roteiro diz como medir.

## O relógio

- A coleta liga quando a migration `20260808121000_pg_stat_statements.sql` chega em produção (deploy pela plataforma).
- **Data de início da janela:** registrar aqui no dia do deploy → `____-__-__`.
- Janela mínima antes de qualquer decisão: **7 dias corridos** (para cobrir o ciclo semanal da operação — plantão de fim de semana incluído).
- Só então a Onda D.5 (limpeza) pode citar este arquivo como evidência.

## Como ler (SQL Editor do Supabase, como service_role)

Chamadas de RPC via PostgREST aparecem como `SELECT * FROM public.nome_da_rpc(...)` ou `SELECT public.nome_da_rpc(...)`. A consulta abaixo agrega por função:

```sql
-- Estatística por função desde o reset (ver pg_stat_statements_info.stats_reset)
SELECT
  regexp_replace(query, '^.*?public\.([a-z0-9_]+)\(.*$', '\1') AS funcao,
  sum(calls)                                                    AS chamadas,
  round(sum(total_exec_time)::numeric, 1)                       AS ms_total,
  max(round(mean_exec_time::numeric, 2))                        AS ms_media_max
FROM extensions.pg_stat_statements
WHERE query ~* 'public\.[a-z0-9_]+\('
GROUP BY 1
ORDER BY chamadas DESC;
```

Cruzamento com a lista de órfãs da auditoria (`docs/auditoria/ux-ia-2026-08/01-inventario.md`): órfã **com** chamadas na janela = tem consumidor externo (bot/n8n/MCP/API) — **não apagar**; órfã com **zero** chamadas em 7+ dias = candidata real à remoção na Onda D.5.

```sql
-- Quando a estatística foi zerada pela última vez (início efetivo da janela):
SELECT stats_reset FROM extensions.pg_stat_statements_info;
-- Para reiniciar a janela conscientemente:
-- SELECT extensions.pg_stat_statements_reset();
```

## Cuidados

1. **Funções chamadas por outras funções não aparecem** individualmente (o statement registrado é o de fora). As `_internas` (convenção `_`) são avaliadas pela função pública que as envolve.
2. **Cron jobs** (`pg_cron`) aparecem como os statements que executam — RPC chamada só por cron conta como "com consumidor".
3. O buffer guarda os N statements mais frequentes (`pg_stat_statements.max`, default 5000) — mais que suficiente para ~265 funções; se um dia zerar, a janela recomeça (registrar).
4. A view vive no schema `extensions` e só o `service_role` deve lê-la — não expor em RPC pública.

## Registro de leituras

| Data | Janela desde | Órfãs com chamadas | Órfãs zeradas | Observação |
| ---- | ------------ | ------------------ | ------------- | ---------- |
|      |              |                    |               |            |
