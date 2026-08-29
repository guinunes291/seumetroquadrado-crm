-- ---------------------------------------------------------------------------
-- 2026-08-27 — criar_roleta_campanha enxerga o pgcrypto (search_path)
--
-- Bug reportado no painel (Nova campanha): "function gen_random_bytes(integer)
-- does not exist". A função (20260827100000) fixa SET search_path = public,
-- mas no Supabase o pgcrypto vive no schema extensions — a criação da função
-- passa (o corpo não é validado), o erro só estoura na EXECUÇÃO. Nem o replay
-- nem a prod executavam a função ao aplicar, então passou batido nos dois.
--
-- Fix: search_path = public, extensions (portátil: harness e Supabase têm o
-- pgcrypto em extensions — scripts/db-harness/00-roles.sql espelha isso).
-- Corpo idêntico ao de 20260827100000. A sanidade agora EXECUTA a função
-- (cria e apaga uma campanha de fumaça) para o replay pegar regressão de
-- runtime, não só de assinatura.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.criar_roleta_campanha(
  _nome text,
  _slug text DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL,
  _equipe_fixa boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _caller uuid := auth.uid();
  _base text;
  _slug_final text;
  _n int := 1;
  _linha jsonb;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF btrim(COALESCE(_nome, '')) = '' THEN
    RAISE EXCEPTION 'nome obrigatorio';
  END IF;

  IF _projeto_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = _projeto_id) THEN
    RAISE EXCEPTION 'projeto inexistente';
  END IF;

  -- Mesma regra de slug que vivia no cliente, agora no servidor (sem
  -- depender de unaccent: translate cobre os acentos do pt-BR).
  _base := left(
    btrim(regexp_replace(
      translate(lower(btrim(COALESCE(_slug, _nome))),
                'áàâãäéèêëíìîïóòôõöúùûüçñ',
                'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9]+', '-', 'g'), '-'),
    60);
  IF _base = '' THEN
    RAISE EXCEPTION 'slug invalido';
  END IF;

  _slug_final := _base;
  WHILE EXISTS (SELECT 1 FROM public.roletas r WHERE r.slug = _slug_final) LOOP
    _n := _n + 1;
    _slug_final := left(_base, 56) || '-' || _n;
  END LOOP;

  INSERT INTO public.roletas
    (slug, nome, descricao, ativo, criterio_participacao, exigir_presenca,
     tipo, equipe_fixa, projeto_id, webhook_token)
  VALUES
    (_slug_final, btrim(_nome),
     CASE WHEN _equipe_fixa
       THEN 'Campanha de equipe fixa — leads caem sempre neste time, sem corte por zona.'
       ELSE 'Campanha criada pela Central de Distribuição.' END,
     true, 'manual', true, 'campanha', COALESCE(_equipe_fixa, false), _projeto_id,
     encode(gen_random_bytes(24), 'hex'));

  SELECT to_jsonb(r) INTO _linha FROM public.roletas r WHERE r.slug = _slug_final;

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES ('roletas', (_linha->>'id')::uuid, 'INSERT', _caller, NULL, _linha);

  RETURN jsonb_build_object('ok', true, 'roleta', _linha);
END;
$$;

REVOKE ALL ON FUNCTION public.criar_roleta_campanha(text, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_roleta_campanha(text, text, uuid, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sanidade de RUNTIME: executa a criação de verdade (token de 48 hex sai do
-- gen_random_bytes) e desfaz o rastro. Se o search_path regredir, o replay
-- aborta aqui em vez de passar batido.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _r jsonb;
  _id uuid;
BEGIN
  _r := public.criar_roleta_campanha('Fumaca search_path — apagar');
  IF (_r->'roleta'->>'webhook_token') !~ '^[0-9a-f]{48}$' THEN
    RAISE EXCEPTION 'criar_roleta_campanha não gerou token hex de 48 chars';
  END IF;
  _id := (_r->'roleta'->>'id')::uuid;
  DELETE FROM public.audit_log WHERE tabela = 'roletas' AND registro_id = _id;
  DELETE FROM public.roletas WHERE id = _id;
END $$;

NOTIFY pgrst, 'reload schema';
