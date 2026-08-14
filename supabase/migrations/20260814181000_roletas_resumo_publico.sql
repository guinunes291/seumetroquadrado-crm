-- ============================================================================
-- ROLETAS — RESUMO PÚBLICO (Fatia 1 / Passo 2: o sinal)
--
-- Alimenta o novo GET /api/public/roletas: uma leitura por roleta com a
-- contagem de corretores APTOS AGORA (via _elegibilidade_roleta, a fonte
-- única de aptidão). É o número que teria denunciado a F-085 em 15 minutos:
-- roleta ativa com corretores_aptos=0 precisa gritar, não sortear no vazio.
--
-- Segurança: NÃO expõe webhook_token (só o boolean tem_token). Execução
-- restrita a service_role — o endpoint público autentica por X-API-Key
-- (escopo leads:read) antes de chamar.
--
-- Liga/desliga sem deploy: distribuicao_settings.endpoint_roletas_ativo
-- ('true'/'false' — o endpoint devolve 503 explícito quando desligado;
-- degradação explícita, nunca silêncio).
--
-- ROLLBACK: UPDATE distribuicao_settings SET valor='false'::jsonb
--           WHERE chave='endpoint_roletas_ativo';  (endpoint passa a 503)
--           DROP FUNCTION public.roletas_resumo_publico();  (remoção total)
-- ============================================================================

INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('endpoint_roletas_ativo', 'true'::jsonb,
   'Liga/desliga o GET /api/public/roletas (503 quando false). Kill switch sem deploy.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.roletas_resumo_publico()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'slug', r.slug,
    'nome', r.nome,
    'tipo', r.tipo,
    'ativo', r.ativo,
    'projeto_id', r.projeto_id,
    'tem_token', (r.webhook_token IS NOT NULL),
    'participantes_ativos', (
      SELECT count(*) FROM public.roleta_participantes rp
      WHERE rp.roleta_id = r.id AND rp.ativo
    ),
    'corretores_aptos', (
      SELECT count(*) FROM public._elegibilidade_roleta(r.slug) e WHERE e.apto
    )
  ) ORDER BY r.tipo, r.slug), '[]'::jsonb)
  FROM public.roletas r;
$$;

REVOKE ALL ON FUNCTION public.roletas_resumo_publico() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.roletas_resumo_publico() TO service_role;
