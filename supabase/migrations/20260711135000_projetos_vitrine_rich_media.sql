-- Conteúdo comercial rico para a Vitrine. Campos são opcionais para rollout
-- aditivo; a aplicação continua exibindo fallback quando o catálogo antigo não
-- possui mídia ou comissão configurada.

ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS capa_url text,
  ADD COLUMN IF NOT EXISTS galeria_urls text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS percentual_comissao numeric(6,3),
  ADD COLUMN IF NOT EXISTS disponibilidade_resumo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_capa_url_tamanho_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_capa_url_tamanho_ck
      CHECK (capa_url IS NULL OR char_length(capa_url) <= 2048);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_galeria_urls_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_galeria_urls_ck
      CHECK (cardinality(galeria_urls) <= 12);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_percentual_comissao_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_percentual_comissao_ck
      CHECK (percentual_comissao IS NULL OR percentual_comissao BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projetos'::regclass
      AND conname = 'projetos_disponibilidade_resumo_ck'
  ) THEN
    ALTER TABLE public.projetos ADD CONSTRAINT projetos_disponibilidade_resumo_ck
      CHECK (
        disponibilidade_resumo IS NULL
        OR char_length(btrim(disponibilidade_resumo)) BETWEEN 1 AND 160
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.projetos.capa_url IS
  'Imagem principal HTTPS do empreendimento; publicação externa ainda passa pela allowlist server-side.';
COMMENT ON COLUMN public.projetos.galeria_urls IS
  'Até 12 imagens; publicação externa ainda passa pela allowlist server-side.';
COMMENT ON COLUMN public.projetos.percentual_comissao IS
  'Percentual comercial interno exibido somente no CRM autenticado.';
COMMENT ON COLUMN public.projetos.disponibilidade_resumo IS
  'Resumo curto e revisado da disponibilidade atual.';

CREATE OR REPLACE FUNCTION public.obter_vitrine_publica(_token_hash text)
RETURNS TABLE (
  expira_em timestamptz,
  projetos jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    vl.expira_em,
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'nome', p.nome,
        'construtora', p.construtora,
        'bairro', p.bairro,
        'cidade', p.cidade,
        'zona', p.zona_smq,
        'dorms_min', p.dorms_min,
        'dorms_max', p.dorms_max,
        'metragem_min', p.metragem_min,
        'metragem_max', p.metragem_max,
        'preco_a_partir', p.preco_a_partir,
        'sob_consulta', p.sob_consulta,
        'status_preco', p.status_preco,
        'status_entrega', p.status_entrega,
        'mes_entrega', p.mes_entrega,
        'ano_entrega', p.ano_entrega,
        'renda_minima', p.renda_minima,
        'disponibilidade_resumo', p.disponibilidade_resumo,
        'capa_url', p.capa_url,
        'galeria_urls', p.galeria_urls,
        'diferenciais', p.diferenciais,
        'book_url', p.book_url,
        'tabela_precos_url', p.tabela_precos_url
      ) ORDER BY vlp.ordem
    ) AS projetos
  FROM public.vitrine_links vl
  JOIN public.vitrine_link_projetos vlp ON vlp.link_id = vl.id
  JOIN public.projetos p ON p.id = vlp.projeto_id
  WHERE vl.token_hash = lower(_token_hash)
    AND lower(_token_hash) ~ '^[0-9a-f]{64}$'
    AND vl.revogado_em IS NULL
    AND vl.expira_em > now()
    AND p.ativo = true
    AND p.deleted_at IS NULL
  GROUP BY vl.id;
$$;

REVOKE ALL ON FUNCTION public.obter_vitrine_publica(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obter_vitrine_publica(text)
  TO service_role;
