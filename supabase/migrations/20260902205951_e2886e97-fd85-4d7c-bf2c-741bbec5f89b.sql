-- Migration de dados (Lovable): concede admin a um usuário de produção.
-- Guardada pela existência do usuário em auth.users pelo mesmo motivo da
-- 20260902203454: no replay do harness o UUID não existe.
DO $mig$
DECLARE
  v_usuario constant uuid := '43866728-4cde-4f74-a5de-bbbecec10198';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_usuario) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_usuario, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END
$mig$;
