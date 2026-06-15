
-- ============ ENUM DE PAPÉIS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'corretor');

-- ============ EQUIPES ============
CREATE TABLE public.equipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  gestor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipes TO authenticated;
GRANT ALL ON public.equipes TO service_role;
ALTER TABLE public.equipes ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  telefone TEXT,
  avatar_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  equipe_id UUID REFERENCES public.equipes(id) ON DELETE SET NULL,
  cargo TEXT,
  bio TEXT,
  data_admissao DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER_ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ FUNÇÃO has_role (SECURITY DEFINER) ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- ============ FUNÇÃO updated_at ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipes_updated_at
BEFORE UPDATE ON public.equipes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TRIGGER PARA AUTO-CRIAR profile + role NO SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );

  -- Primeiro usuário do sistema vira admin; demais viram corretor por padrão.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'corretor');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ POLICIES: profiles ============
CREATE POLICY "Usuários autenticados podem ver profiles"
  ON public.profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Usuário pode atualizar o próprio profile"
  ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin pode atualizar qualquer profile"
  ON public.profiles FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin pode inserir profile"
  ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin pode deletar profile"
  ON public.profiles FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ POLICIES: equipes ============
CREATE POLICY "Usuários autenticados podem ver equipes"
  ON public.equipes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/gestor podem criar equipes"
  ON public.equipes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Admin pode atualizar equipes"
  ON public.equipes FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Gestor pode atualizar a própria equipe"
  ON public.equipes FOR UPDATE
  TO authenticated USING (gestor_id = auth.uid())
  WITH CHECK (gestor_id = auth.uid());

CREATE POLICY "Admin pode deletar equipes"
  ON public.equipes FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ POLICIES: user_roles ============
CREATE POLICY "Usuário vê os próprios papéis"
  ON public.user_roles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admin vê todos os papéis"
  ON public.user_roles FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin pode atribuir papéis"
  ON public.user_roles FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin pode remover papéis"
  ON public.user_roles FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_profiles_equipe ON public.profiles(equipe_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
