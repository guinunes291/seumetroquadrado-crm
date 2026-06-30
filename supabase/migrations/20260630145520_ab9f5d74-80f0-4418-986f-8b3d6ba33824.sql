
-- 1) Função de normalização (espelha normalizePhoneSMQ do app)
CREATE OR REPLACE FUNCTION public.normalize_phone_smq(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  d text;
  ddd text;
  rest text;
BEGIN
  IF _raw IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(_raw, '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  IF left(d, 2) = '00' THEN d := substring(d from 3); END IF;
  IF left(d, 2) <> '55' THEN
    IF length(d) IN (10, 11) THEN d := '55' || d; END IF;
  END IF;
  -- Garante 9º dígito no celular: 55 + DDD(2) + 8 dígitos -> insere 9
  IF length(d) = 12 AND left(d, 2) = '55' THEN
    ddd := substring(d from 3 for 2);
    rest := substring(d from 5);
    IF left(rest, 1) <> '9' THEN
      d := '55' || ddd || '9' || rest;
    END IF;
  END IF;
  IF length(d) < 12 OR length(d) > 15 THEN RETURN NULL; END IF;
  RETURN d;
END;
$$;

-- 2) Coluna
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS telefone_e164 text;

-- 3) Trigger de sincronização
CREATE OR REPLACE FUNCTION public.sync_lead_telefone_e164()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.telefone_e164 := public.normalize_phone_smq(NEW.telefone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_telefone_e164 ON public.leads;
CREATE TRIGGER trg_sync_lead_telefone_e164
BEFORE INSERT OR UPDATE OF telefone ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_telefone_e164();

-- 4) Backfill
UPDATE public.leads
SET telefone_e164 = public.normalize_phone_smq(telefone)
WHERE telefone IS NOT NULL
  AND (telefone_e164 IS DISTINCT FROM public.normalize_phone_smq(telefone));

-- 5) Índice (não-único; existem duplicatas legadas que serão tratadas no Bloco B)
CREATE INDEX IF NOT EXISTS idx_leads_telefone_e164
  ON public.leads (telefone_e164)
  WHERE telefone_e164 IS NOT NULL AND deleted_at IS NULL;
