CREATE OR REPLACE FUNCTION public.importar_leads_csv_lote(_rows jsonb, _batch uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb; i int := 0;
  v_nome text; v_tel text; v_email text; v_zona text; v_renda text;
  ins int := 0; dup int := 0; erros jsonb := '[]'::jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    i := i + 1;
    v_nome  := nullif(btrim(r->>'nome'), '');
    v_tel   := nullif(regexp_replace(coalesce(r->>'telefone',''), '\D', '', 'g'), '');
    v_email := nullif(lower(btrim(r->>'email')), '');
    v_zona  := nullif(btrim(r->>'zona'), '');
    v_renda := nullif(btrim(r->>'renda'), '');
    BEGIN
      IF v_tel IS NULL AND v_email IS NULL THEN
        RAISE EXCEPTION 'sem telefone e sem e-mail';
      END IF;
      IF v_tel IS NOT NULL AND length(v_tel) < 10 THEN
        RAISE EXCEPTION 'telefone sem DDD ou inválido';
      END IF;
      IF v_nome IS NULL THEN RAISE EXCEPTION 'nome vazio'; END IF;

      IF (v_tel IS NOT NULL AND EXISTS (
            SELECT 1 FROM leads l
             WHERE right(regexp_replace(coalesce(l.telefone_e164, l.telefone, ''), '\D', '', 'g'), 9) = right(v_tel, 9)
               AND l.na_lixeira = false AND l.deleted_at IS NULL AND NOT l.registro_adicional))
         OR (v_tel IS NULL AND EXISTS (
            SELECT 1 FROM leads l WHERE lower(l.email) = v_email AND l.deleted_at IS NULL AND l.na_lixeira = false)) THEN
        dup := dup + 1;
        CONTINUE;
      END IF;

      INSERT INTO leads (nome, telefone, email, zona, renda_informada, origem, status, corretor_id, import_batch_id)
      VALUES (v_nome, v_tel, v_email, v_zona, v_renda, 'importacao', 'novo', NULL, _batch);
      ins := ins + 1;
    EXCEPTION
      WHEN unique_violation THEN dup := dup + 1;
      WHEN OTHERS THEN
        erros := erros || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', v_nome,
                   'telefone', r->>'telefone', 'email', v_email, 'motivo', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('inseridos', ins, 'duplicados', dup, 'erros', erros);
END $$;

REVOKE ALL ON FUNCTION public.importar_leads_csv_lote(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.importar_leads_csv_lote(jsonb, uuid) TO service_role;