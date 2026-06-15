
-- Tipos de interação com leads
CREATE TYPE public.interacao_tipo AS ENUM (
  'ligacao',
  'whatsapp',
  'email',
  'sms',
  'visita',
  'reuniao',
  'nota',
  'mudanca_status',
  'proposta',
  'outro'
);

CREATE TYPE public.interacao_direcao AS ENUM ('entrada', 'saida', 'interna');

CREATE TABLE public.interacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo public.interacao_tipo NOT NULL DEFAULT 'nota',
  direcao public.interacao_direcao NOT NULL DEFAULT 'interna',
  titulo TEXT,
  conteudo TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocorreu_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_interacoes_lead ON public.interacoes(lead_id, ocorreu_em DESC);
CREATE INDEX idx_interacoes_autor ON public.interacoes(autor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interacoes TO authenticated;
GRANT ALL ON public.interacoes TO service_role;

ALTER TABLE public.interacoes ENABLE ROW LEVEL SECURITY;

-- Admin/gestor veem tudo; corretor vê só interações de leads dele
CREATE POLICY "Admins e gestores veem todas interacoes"
ON public.interacoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "Corretor ve interacoes dos seus leads"
ON public.interacoes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = interacoes.lead_id AND l.corretor_id = auth.uid()
  )
);

CREATE POLICY "Autenticados criam interacoes em leads visiveis"
ON public.interacoes FOR INSERT TO authenticated
WITH CHECK (
  autor_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = interacoes.lead_id AND l.corretor_id = auth.uid()
    )
  )
);

CREATE POLICY "Autor edita propria interacao"
ON public.interacoes FOR UPDATE TO authenticated
USING (autor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (autor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Autor ou admin remove interacao"
ON public.interacoes FOR DELETE TO authenticated
USING (autor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_updated_at_interacoes
BEFORE UPDATE ON public.interacoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Quando uma interação é criada, atualiza ultima_interacao do lead
CREATE OR REPLACE FUNCTION public.atualizar_ultima_interacao_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads
  SET ultima_interacao = NEW.ocorreu_em,
      ultimo_contato = CASE
        WHEN NEW.tipo IN ('ligacao','whatsapp','email','sms','visita','reuniao','proposta')
        THEN NEW.ocorreu_em ELSE ultimo_contato END
  WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_atualizar_ultima_interacao
AFTER INSERT ON public.interacoes
FOR EACH ROW EXECUTE FUNCTION public.atualizar_ultima_interacao_lead();
