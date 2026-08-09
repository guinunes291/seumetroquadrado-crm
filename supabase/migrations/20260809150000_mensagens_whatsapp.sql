-- Fase 7a da mensageria (estrategia-2026-08, Onda C): a tabela `mensagens` —
-- a CONVERSA real com o cliente, separada de `interacoes` (timeline manual).
-- Desenho em docs/fase7-mensageria.md §B. Não depende do provedor (D1):
-- o webhook de entrada recebe payload normalizado do n8n, e o modo simulado
-- da Central (7b) escreve direto aqui.
--
-- Decisões de endurecimento sobre o rascunho do desenho:
-- * provider_message_id com UNIQUE PARCIAL (mensagens do modo simulado não
--   têm id de provedor — várias linhas NULL convivem; a idempotência do
--   webhook continua garantida onde importa);
-- * coluna `provider` para o dia em que Z-API e Cloud API coexistirem na
--   migração de provedor;
-- * RLS espelha o acesso ao lead (pode_acessar_lead), como interacoes;
--   INSERT do cliente autenticado só de SAÍDA (entrada é sempre do webhook,
--   via service_role) e UPDATE nenhum (status é do provedor, não do usuário).

CREATE TABLE IF NOT EXISTS public.mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES public.profiles(id),
  direcao text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  canal text NOT NULL DEFAULT 'whatsapp',
  -- 'zapi' | 'meta_cloud' | 'simulado' | ... (livre até a decisão D1)
  provider text,
  -- id da mensagem no provedor: a chave de idempotência do webhook.
  provider_message_id text,
  status text NOT NULL DEFAULT 'recebida'
    CHECK (status IN ('fila', 'enviada', 'entregue', 'lida', 'falha', 'recebida')),
  conteudo text,
  midia_url text,
  -- nome do template aprovado quando enviada fora da janela de 24h (7c)
  template_nome text,
  erro text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Idempotência do webhook: um provider_message_id nunca duplica; NULLs
-- (modo simulado) não colidem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS mensagens_provider_message_id_uq
  ON public.mensagens (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Thread por lead (a query da Central) e fila de saída pendente (7c).
CREATE INDEX IF NOT EXISTS mensagens_lead_recentes_idx
  ON public.mensagens (lead_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS mensagens_fila_idx
  ON public.mensagens (criado_em)
  WHERE status = 'fila';

DROP TRIGGER IF EXISTS mensagens_set_updated_at ON public.mensagens;
CREATE TRIGGER mensagens_set_updated_at
  BEFORE UPDATE ON public.mensagens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- Leitura espelha o acesso ao lead (corretor: os seus; gestão: tudo) —
-- mesma régua de interacoes, via helper SECURITY DEFINER já existente.
DROP POLICY IF EXISTS mensagens_select ON public.mensagens;
CREATE POLICY mensagens_select ON public.mensagens
  FOR SELECT TO authenticated
  USING (public.pode_acessar_lead(auth.uid(), lead_id));

-- Escrita do usuário: só mensagens de SAÍDA em leads que ele acessa (modo
-- simulado da 7b e envio da 7c). Entrada e updates de status são exclusivos
-- do webhook (service_role, que ignora RLS).
DROP POLICY IF EXISTS mensagens_insert_saida ON public.mensagens;
CREATE POLICY mensagens_insert_saida ON public.mensagens
  FOR INSERT TO authenticated
  WITH CHECK (direcao = 'saida' AND public.pode_acessar_lead(auth.uid(), lead_id));

REVOKE ALL ON TABLE public.mensagens FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.mensagens TO authenticated;
GRANT ALL ON TABLE public.mensagens TO service_role;

-- Realtime para a Central (7b) — mesmo padrão de interacoes/agendamentos.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.mensagens IS
  'Conversa WhatsApp 2 vias (Fase 7): entrada gravada pelo webhook n8n (idempotente por provider_message_id), saida pela Central/automacoes. Separada de interacoes (timeline manual); o webhook ecoa a entrada como interacao para acionar a fila Responder.';

NOTIFY pgrst, 'reload schema';
