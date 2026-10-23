# Achados do último scan de segurança (23/10/2026, 18:08 UTC) — nada aplicado

Total: 28 achados do banco — 14 críticos, 13 alertas, 1 informativo. Nenhum está marcado como ignorado (nenhum tem registro de ignorar nem motivo). Os scanners de código, conectores e MCP não trouxeram achados nesta rodada.

## Críticos (14)

| # | Objeto | O que está exposto | Quem explora | Proposta |
|---|---|---|---|---|
| 1 | tabela `bkp_f085_arquivadas_20260731` (2.033 linhas: lead_id, status_anterior, arquivado_em) | Sem proteção por linha; anon e logados têm SELECT **e DELETE** (conferido) | **Anônimo** com a chave pública | Apagar a cópia antiga, ou travar (SQL A) |
| 2 | `scripts_vendas` | Leitura de todos os scripts | Qualquer logado | Manter leitura para membro ativo (SQL B) |
| 3 | `comissao_tier_regras` | Regras/percentuais de comissão por tier | Qualquer logado | Manter (corretor precisa ver o tier) — SQL B |
| 4 | `objecoes` | Banco de objeções | Qualquer logado | SQL B |
| 5 | `equipes` | Lista de equipes e gestores | Qualquer logado | SQL B |
| 6 | `unidades` | Estoque/unidades e preços | Qualquer logado | SQL B |
| 7 | `metas` | Metas de todos | Qualquer logado, inclusive de outra equipe | Decidir: restringir a gestor + o próprio, ou manter (ranking usa) |
| 8 | `cadencia_config` | Configuração da cadência | Qualquer logado | SQL B (sem tocar no conteúdo) |
| 9 | `projetos` | Empreendimentos | Qualquer logado | SQL B — catálogo usado por todos |
| 10 | `configuracao_pontuacao` | Pontos da gamificação | Qualquer logado | SQL B |
| 11 | `vendas_construtora_avulsa` | Construtoras avulsas de venda | Qualquer logado | SQL B |
| 12 | `zonas_bairros` | Mapa bairro→zona | Qualquer logado | SQL B |
| 13 | `zonas_roletas` | Zona→roleta | Qualquer logado | SQL B |
| 14 | `historico_precos` | Histórico de preços | Qualquer logado | SQL B |

Leitura: o único crítico realmente perigoso é o nº 1. Os nºs 2–14 são "regra USING (true) para logado": nenhum anônimo lê, e são tabelas de catálogo/configuração usadas pelas telas. O risco real é só uma conta bloqueada ou pendente que ainda tenha sessão ler esses dados.

## Alertas (13) e informativo (1)

- **`roletas` — o mais importante entre os alertas:** qualquer logado lê a coluna `webhook_token`. Com o token, alguém consegue mandar leads falsos pelo webhook público de qualquer roleta (incluindo a da 3C Plus). Proposta: SQL C.
- Configuração/catálogo com leitura para qualquer logado: `app_flags`, `copa_selecoes`, `projeto_foco`, `copa_participantes`, `copa_config_pontos`, `copa_fases`, `higiene_regra_fase`, `copa_edicao`, `copa_confrontos`, `higiene_config`, `copa_config_premios`. São intencionais (Copa, flags, higiene). Proposta: SQL B ou marcar como ignorado, com motivo.
- Arquivos `avatars`: qualquer logado baixa qualquer foto de perfil. É intencional (fotos aparecem no ranking): ignorar, com motivo.
- Info, `projetos-plantas`: qualquer pessoa lista os arquivos de plantas. É material público de venda: ignorar, com motivo.

## SQL proposto (para aprovar)

```sql
-- A) backup exposto (preferido: apagar, após confirmar que não é mais usado)
DROP TABLE public.bkp_f085_arquivadas_20260731;
-- alternativa se precisar guardar:
-- REVOKE ALL ON public.bkp_f085_arquivadas_20260731 FROM anon, authenticated;
-- ALTER TABLE public.bkp_f085_arquivadas_20260731 ENABLE ROW LEVEL SECURITY;

-- B) padrão para cada tabela de catálogo (exemplo scripts_vendas)
DROP POLICY "scripts_select_all_auth" ON public.scripts_vendas;
CREATE POLICY "scripts_select_membro_ativo" ON public.scripts_vendas
  FOR SELECT TO authenticated USING (public.is_active_member(auth.uid()));
-- repetir trocando tabela/política para os itens 3–14 e os de catálogo

-- C) token das roletas só para admin
REVOKE SELECT (webhook_token) ON public.roletas FROM authenticated;
-- o botão "Token" passa a ler via função admin-only:
CREATE FUNCTION public.roleta_webhook_token(_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT webhook_token FROM public.roletas
   WHERE id = _id AND public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.roleta_webhook_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_webhook_token(uuid) TO authenticated;
```

Observações técnicas: antes do C, é preciso trocar o `select('*')` das roletas no app, porque a revogação por coluna quebra quem pede `*`. A assinatura de `is_active_member` deve ser conferida antes do B. Os achados ignorados por motivo de negócio seriam marcados com explicação.

## Ordem sugerida
1. A (backup aberto a anônimo) — urgente.
2. C (tokens de roleta), junto com o ajuste do botão Token.
3. B nas tabelas de catálogo; ignorar, com motivo, Copa/flags/avatars/plantas.
4. Decidir `metas` (restringir ou manter).
