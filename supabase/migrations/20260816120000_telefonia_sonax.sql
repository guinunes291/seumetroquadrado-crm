-- Telefonia (discador Sonax PABX Virtual): registro de chamadas integrado ao
-- CRM. Desenho em docs/integracoes/sonax-discador.md.
--
-- Peças desta migration:
-- * `chamadas` — o histórico de ligações, no molde de `mensagens` (provider +
--   provider_call_id com UNIQUE parcial para idempotência do webhook; RLS
--   espelhando o acesso ao lead). `lead_id` é NULL quando o número receptivo
--   não casa com nenhum lead — a chamada não se perde, e o corretor ainda a
--   enxerga pela cláusula corretor_id.
-- * `profiles.ramal_sonax` — o ramal do corretor no PABX: é o que o
--   click-to-call disca primeiro e é a chave que casa eventos do webhook
--   (variável <RAMAL>) com o corretor.
-- * `tg_touch_atualizado_em()` — helper de trigger para tabelas com carimbo
--   pt-BR. Os helpers existentes (`set_updated_at`, `tg_set_updated_at`)
--   gravam NEW.updated_at e explodem em tabelas cuja coluna é `atualizado_em`;
--   `mensagens` estava nesse estado (qualquer UPDATE falhava com "record new
--   has no field updated_at") — o trigger dela é repontado aqui.
--
-- A escrita de chamadas de SAÍDA é do corretor autenticado (edge function
-- sonax-discar usa o JWT dele — RLS decide); ENTRADA e updates de status são
-- exclusivos do webhook (service_role, que ignora RLS), como em `mensagens`.

CREATE OR REPLACE FUNCTION public.tg_touch_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

-- Conserta o trigger de `mensagens` (gravava updated_at, coluna inexistente).
DROP TRIGGER IF EXISTS mensagens_set_updated_at ON public.mensagens;
CREATE TRIGGER mensagens_set_updated_at
  BEFORE UPDATE ON public.mensagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_atualizado_em();

-- Ramal do corretor no PABX Sonax (ex.: "122"). Editável pelo admin na página
-- de corretores; sem ramal o corretor não usa o click-to-call.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ramal_sonax text;
COMMENT ON COLUMN public.profiles.ramal_sonax IS
  'Ramal (SIPFRIEND) do corretor no Sonax PABX Virtual. Usado pelo click-to-call (sonax-discar) e para casar eventos do webhook (<RAMAL>) com o corretor.';

CREATE TABLE IF NOT EXISTS public.chamadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL (e não CASCADE): a chamada é registro operacional/auditoria e
  -- sobrevive à exclusão definitiva do lead.
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  corretor_id uuid REFERENCES public.profiles(id),
  direcao text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  -- Como a chamada nasceu: clique no CRM, discador (campanha), receptivo.
  origem text NOT NULL DEFAULT 'click2call'
    CHECK (origem IN ('click2call', 'campanha', 'receptivo', 'agendada')),
  provider text NOT NULL DEFAULT 'sonax',
  -- id/protocolo da chamada no provedor: chave de idempotência do webhook.
  provider_call_id text,
  -- Número do cliente, só dígitos.
  numero text NOT NULL,
  ramal text,
  status text NOT NULL DEFAULT 'iniciada'
    CHECK (status IN ('iniciada', 'chamando', 'falando', 'atendida', 'concluida', 'nao_atendida', 'falha')),
  duracao_segundos integer,
  gravacao_url text,
  -- Tabulação/disposição aplicada no discador (texto livre do Sonax).
  tabulacao text,
  -- Payload cru do evento/resposta do provedor (auditoria e debug).
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Idempotência do webhook: um provider_call_id nunca duplica; NULLs (chamadas
-- registradas antes de o provedor devolver protocolo) não colidem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS chamadas_provider_call_id_uq
  ON public.chamadas (provider_call_id)
  WHERE provider_call_id IS NOT NULL;

-- Histórico por lead (dossiê) e por corretor (produtividade/telefonia).
CREATE INDEX IF NOT EXISTS chamadas_lead_recentes_idx
  ON public.chamadas (lead_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS chamadas_corretor_recentes_idx
  ON public.chamadas (corretor_id, criado_em DESC);

DROP TRIGGER IF EXISTS chamadas_touch_atualizado_em ON public.chamadas;
CREATE TRIGGER chamadas_touch_atualizado_em
  BEFORE UPDATE ON public.chamadas
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_atualizado_em();

ALTER TABLE public.chamadas ENABLE ROW LEVEL SECURITY;

-- Leitura: quem acessa o lead enxerga as chamadas dele (mesma régua de
-- interacoes/mensagens). Chamadas sem lead casado só aparecem para o corretor
-- do ramal e para admin/superintendente — receptivo não vaza entre carteiras.
DROP POLICY IF EXISTS chamadas_select ON public.chamadas;
CREATE POLICY chamadas_select ON public.chamadas
  FOR SELECT TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.pode_acessar_lead((SELECT auth.uid()), lead_id))
    OR corretor_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'superintendente'::public.app_role)
  );

-- Escrita do usuário: só chamada de SAÍDA, em nome próprio, num lead que ele
-- acessa (é o insert da edge function sonax-discar com o JWT do corretor).
-- Entrada e updates de status são exclusivos do webhook (service_role).
DROP POLICY IF EXISTS chamadas_insert_saida ON public.chamadas;
CREATE POLICY chamadas_insert_saida ON public.chamadas
  FOR INSERT TO authenticated
  WITH CHECK (
    direcao = 'saida'
    AND corretor_id = (SELECT auth.uid())
    AND lead_id IS NOT NULL
    AND public.pode_acessar_lead((SELECT auth.uid()), lead_id)
  );

REVOKE ALL ON TABLE public.chamadas FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.chamadas TO authenticated;
GRANT ALL ON TABLE public.chamadas TO service_role;

-- Realtime (status da chamada ao vivo no dossiê) — padrão de mensagens.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chamadas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.chamadas IS
  'Historico de ligacoes da telefonia (Sonax PABX): saida gravada pela edge function sonax-discar (JWT do corretor, RLS), entrada/status pelo webhook sonax-webhook (service_role, idempotente por provider_call_id). O webhook ecoa em interacoes (tipo ligacao) para alimentar a timeline do lead.';

NOTIFY pgrst, 'reload schema';
