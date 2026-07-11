-- Operações server-side do ciclo de vida de contas. As funções abaixo não são
-- APIs de browser: somente service_role pode executá-las, depois que a Edge
-- Function valida o JWT e o papel do autor.

CREATE TABLE IF NOT EXISTS public.conta_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status_anterior public.status_conta,
  status_novo public.status_conta NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conta_auditoria_usuario_created
  ON public.conta_auditoria (usuario_id, created_at DESC);
ALTER TABLE public.conta_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conta_auditoria FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.conta_auditoria TO service_role;

CREATE OR REPLACE FUNCTION public.ativar_convite_por_email(_convite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _convite public.convites_crm%ROWTYPE;
  _usuario_id uuid;
  _email text;
BEGIN
  SELECT * INTO _convite
  FROM public.convites_crm
  WHERE id = _convite_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'convite nao encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF _convite.estado = 'aceito'::public.convite_crm_estado THEN
    RETURN _convite.aceito_por;
  END IF;
  IF _convite.estado <> 'pendente'::public.convite_crm_estado THEN
    RAISE EXCEPTION 'convite indisponivel' USING ERRCODE = '22023';
  END IF;
  IF _convite.expira_em <= now() THEN
    UPDATE public.convites_crm
    SET estado = 'expirado'::public.convite_crm_estado
    WHERE id = _convite.id;
    RETURN NULL;
  END IF;

  SELECT u.id, u.email
  INTO _usuario_id, _email
  FROM auth.users AS u
  WHERE lower(btrim(u.email)) = _convite.email_normalizado
  ORDER BY u.created_at ASC
  LIMIT 1;
  IF _usuario_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.profiles (id, email, nome, equipe_id, status_conta)
  VALUES (
    _usuario_id,
    _email,
    split_part(_email, '@', 1),
    _convite.equipe_id,
    'ativa'::public.status_conta
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      equipe_id = EXCLUDED.equipe_id,
      status_conta = 'ativa'::public.status_conta;

  DELETE FROM public.user_roles WHERE user_id = _usuario_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_usuario_id, _convite.papel)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.convites_crm
  SET estado = 'aceito'::public.convite_crm_estado,
      aceito_por = _usuario_id,
      aceito_em = now()
  WHERE id = _convite.id;

  RETURN _usuario_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_status_conta(
  _usuario_id uuid,
  _status public.status_conta,
  _autor_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _anterior public.status_conta;
BEGIN
  IF _autor_id IS NULL OR _usuario_id IS NULL THEN
    RAISE EXCEPTION 'usuario e autor sao obrigatorios' USING ERRCODE = '22023';
  END IF;

  SELECT status_conta INTO _anterior
  FROM public.profiles
  WHERE id = _usuario_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF _status = 'bloqueada'::public.status_conta
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = _usuario_id AND role = 'admin'::public.app_role
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_roles AS ur
       JOIN public.profiles AS p ON p.id = ur.user_id
       WHERE ur.role = 'admin'::public.app_role
         AND ur.user_id <> _usuario_id
         AND p.status_conta = 'ativa'::public.status_conta
     ) THEN
    RAISE EXCEPTION 'nao e permitido bloquear o ultimo admin ativo'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.profiles
  SET status_conta = _status,
      ativo = CASE WHEN _status = 'bloqueada'::public.status_conta THEN false ELSE ativo END
  WHERE id = _usuario_id;

  INSERT INTO public.conta_auditoria (usuario_id, autor_id, status_anterior, status_novo)
  VALUES (_usuario_id, _autor_id, _anterior, _status);

  IF _status <> 'ativa'::public.status_conta THEN
    -- Revoga refresh tokens/sessões no GoTrue. JWTs já emitidos continuam sendo
    -- negados imediatamente por is_active_member/has_role/RLS.
    DELETE FROM auth.sessions WHERE user_id = _usuario_id;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ativar_convite_por_email(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ativar_convite_por_email(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.definir_status_conta(uuid, public.status_conta, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_status_conta(uuid, public.status_conta, uuid)
  TO service_role;
