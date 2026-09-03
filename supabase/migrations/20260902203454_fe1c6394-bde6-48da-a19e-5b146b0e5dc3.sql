-- Migration de dados (Lovable): promove um usuário de produção a gestor da
-- equipe. Guardada pela existência do usuário em auth.users: em produção já
-- foi aplicada (o runner nunca re-executa) e, no replay do zero do harness
-- (scripts/db-harness), o UUID não existe — sem a guarda o INSERT em
-- user_roles violava user_roles_user_id_fkey e derrubava o db-tests.
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '43866728-4cde-4f74-a5de-bbbecec10198') THEN
    RETURN;
  END IF;

  UPDATE public.equipes
  SET gestor_id = '43866728-4cde-4f74-a5de-bbbecec10198'
  WHERE id = 'e50c6921-89fa-4e93-9439-58aa72475678';

  UPDATE public.profiles
  SET equipe_id = 'e50c6921-89fa-4e93-9439-58aa72475678'
  WHERE id = '43866728-4cde-4f74-a5de-bbbecec10198';

  INSERT INTO public.user_roles (user_id, role)
  VALUES ('43866728-4cde-4f74-a5de-bbbecec10198', 'gestor')
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles
  WHERE user_id = '43866728-4cde-4f74-a5de-bbbecec10198'
    AND role = 'corretor';
END
$mig$;
