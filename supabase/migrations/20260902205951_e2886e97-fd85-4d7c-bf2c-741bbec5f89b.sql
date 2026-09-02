INSERT INTO public.user_roles (user_id, role)
VALUES ('43866728-4cde-4f74-a5de-bbbecec10198', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;