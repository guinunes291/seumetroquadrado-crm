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