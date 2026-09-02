CREATE UNIQUE INDEX IF NOT EXISTS leads_telefone_unico_ativo_uidx
  ON public.leads ((right(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g'), 9)))
  WHERE na_lixeira = false AND deleted_at IS NULL
    AND length(regexp_replace(coalesce(telefone_e164, telefone, ''), '\D', '', 'g')) >= 9;