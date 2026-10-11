-- =============================================================================
-- Sua vez nas roletas: só a participação ativa
-- =============================================================================
-- Primeiro uso em produção (11/10/2026, depois da 0076): uma corretora
-- removida pela gestão da Roleta Zona Norte via "Não atende esta zona" no
-- painel, como se faltasse cadastro. A linha de participação removida
-- (roleta_participantes.ativo = false) continuava entrando na lista de
-- roletas do corretor. Removido não é "fora da fila": a roleta não é dele.
-- Só minhas_posicoes_roletas_v1 muda (mesmo corpo da 0076 + o filtro).
--
-- Idempotente. Espelhada em drizzle/migrations/0077.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.minhas_posicoes_roletas_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _estrita boolean := public._zona_estrita();
  _zonas   text[];
  _r       record;
  _z       text;
  _alvos   text[];
  _total   integer;
  _achou   boolean;
  _posicao integer;
  _apto    boolean;
  _motivos jsonb;
  _out     jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.is_active_member(_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(p.zonas, '{}') INTO _zonas FROM public.profiles p WHERE p.id = _uid;

  FOR _r IN
    SELECT r.slug, r.nome, r.tipo, r.equipe_fixa,
           CASE WHEN r.tipo = 'sdr' THEN 'sdr'
                WHEN r.tipo = 'zona' THEN 'zona'
                WHEN r.slug = 'marquinhos' THEN 'marquinhos'
                ELSE 'campanha' END AS papel,
           (SELECT zr.zona FROM public.zonas_roletas zr
             WHERE zr.roleta_slug = r.slug ORDER BY zr.zona LIMIT 1) AS zona_da_roleta
      FROM public.roletas r
      JOIN public.roleta_participantes rp ON rp.roleta_id = r.id AND rp.corretor_id = _uid
     -- Só a participação ATIVA: a roleta de onde a gestão o removeu não é
     -- "dele" (e, numa roleta de zona, removê-lo tira a zona da região).
     WHERE rp.ativo
       AND r.ativo
       AND (r.tipo IN ('zona', 'sdr', 'campanha') OR r.slug = 'marquinhos')
     ORDER BY CASE WHEN r.tipo = 'zona' THEN 1 WHEN r.tipo = 'sdr' THEN 2
                   WHEN r.slug = 'marquinhos' THEN 3 ELSE 4 END,
              r.nome
  LOOP
    -- Em que filas desta roleta ele está: a da zona dela; nas outras, uma por
    -- zona que ele atende (lead sem zona, se não atende nenhuma). Campanha
    -- comum só ordena lead sem zona.
    _alvos := CASE
      WHEN _r.papel = 'zona' THEN ARRAY[_r.zona_da_roleta]
      WHEN _r.papel = 'campanha' AND NOT _r.equipe_fixa THEN ARRAY[NULL::text]
      WHEN NOT _estrita THEN ARRAY[NULL::text]
      WHEN cardinality(_zonas) > 0 THEN _zonas
      ELSE ARRAY[NULL::text]
    END;

    FOREACH _z IN ARRAY _alvos LOOP
      -- A fila do SDR só recebe visita com zona: sem zona no perfil, fora.
      IF _r.papel = 'sdr' AND _z IS NULL AND _estrita THEN
        _out := _out || jsonb_build_array(jsonb_build_object(
          'slug', _r.slug, 'nome', _r.nome, 'papel', _r.papel, 'zona', NULL,
          'mecanica', public._roleta_fila_mecanica(_r.slug),
          'posicao', NULL, 'total', 0, 'apto', false,
          'motivos', '["sem_zona_no_perfil"]'::jsonb));
        CONTINUE;
      END IF;

      SELECT count(*) FILTER (WHERE f.apto)::int,
             count(*) FILTER (WHERE f.corretor_id = _uid) > 0,
             max(f.posicao) FILTER (WHERE f.corretor_id = _uid),
             coalesce(bool_or(f.apto) FILTER (WHERE f.corretor_id = _uid), false),
             (jsonb_agg(to_jsonb(f.motivos)) FILTER (WHERE f.corretor_id = _uid)) -> 0
        INTO _total, _achou, _posicao, _apto, _motivos
        FROM public._roleta_fila_prevista(_r.slug, _z) f;

      _out := _out || jsonb_build_array(jsonb_build_object(
        'slug', _r.slug,
        'nome', _r.nome,
        'papel', _r.papel,
        'zona', _z,
        'mecanica', public._roleta_fila_mecanica(_r.slug),
        'posicao', _posicao,
        'total', _total,
        'apto', _apto,
        'motivos', CASE WHEN _achou THEN coalesce(_motivos, '[]'::jsonb)
                        ELSE '["fora_da_regiao"]'::jsonb END));
    END LOOP;
  END LOOP;

  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.minhas_posicoes_roletas_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_posicoes_roletas_v1() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
