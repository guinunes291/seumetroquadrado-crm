-- Camada de Gestão (Fase A1): configuração operacional editável.
--
-- Limiar de "parado" por temperatura, SLA fallback, janela de coortes
-- confiáveis e calendário de pacing saem do código e viram configuração,
-- para o gestor ajustar sem deploy. Consumida pelas views do schema
-- metrics e pelas RPCs gestao_* (migrations 2026072711xxxx).

CREATE TABLE IF NOT EXISTS public.gestao_config (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL,
  descricao text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.gestao_config IS
  'Configuração da camada de gestão (limiares de parado, SLA fallback, pacing). Editável por admin; lida pelas views metrics.* e RPCs gestao_*.';

GRANT SELECT ON public.gestao_config TO authenticated;
GRANT ALL ON public.gestao_config TO service_role;
ALTER TABLE public.gestao_config ENABLE ROW LEVEL SECURITY;

-- Leitura: papéis de gestão (corretor não precisa ver limiares).
DROP POLICY IF EXISTS "gestao_config_select_gestao" ON public.gestao_config;
CREATE POLICY "gestao_config_select_gestao"
  ON public.gestao_config FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(), 'gestor'::public.app_role))
    OR (SELECT public.has_role(auth.uid(), 'superintendente'::public.app_role))
  );

-- Escrita: só admin (mudança de limiar muda todos os painéis).
DROP POLICY IF EXISTS "gestao_config_write_admin" ON public.gestao_config;
CREATE POLICY "gestao_config_write_admin"
  ON public.gestao_config FOR ALL TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)))
  WITH CHECK ((SELECT public.has_role(auth.uid(), 'admin'::public.app_role)));

INSERT INTO public.gestao_config (chave, valor, descricao) VALUES
  ('parado_limiares_dias',
   '{"quente": 2, "morno": 5, "frio": 15, "default": 7}',
   'Dias sem atividade (COALESCE(ultima_interacao, ultimo_contato, updated_at)) a partir dos quais um lead conta como "parado", por temperatura.'),
  ('sla_fallback_minutos', '30',
   'SLA de 1º contato quando a origem não tem sla_minutos em distribuicao_config.'),
  ('analise_parada_dias', '5',
   'Dias sem atividade em analise_credito a partir dos quais a pasta conta como travada (Painel do Dia).'),
  ('coortes_confiaveis_desde', '"2026-06-01"',
   'Coortes criadas antes desta data não têm lead_status_transitions (import legado): a UI mostra "sem dado suficiente".'),
  ('cobertura_transicoes_minima_pct', '60',
   'Cobertura mínima de transições (% de leads da coorte com histórico) para exibir taxas de conversão da coorte.'),
  ('capacidade_leads_ativos_por_corretor', '40',
   'Carga de leads ativos considerada 100% da capacidade de um corretor (Tela Time).'),
  ('pacing',
   '{"dias_uteis": [1,2,3,4,5,6], "feriados": []}',
   'Calendário do pacing: dias_uteis em ISO dow (1=segunda … 7=domingo; sábado útil por padrão) e feriados como ["YYYY-MM-DD"].')
ON CONFLICT (chave) DO NOTHING;

-- Helper: valor de uma chave (SECURITY DEFINER para uso dentro de views/RPCs
-- sem depender da policy de SELECT do chamador).
CREATE OR REPLACE FUNCTION public.gestao_config_valor(_chave text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT valor FROM public.gestao_config WHERE chave = _chave;
$$;

REVOKE ALL ON FUNCTION public.gestao_config_valor(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_config_valor(text) TO authenticated, service_role;

-- Helper: limiar de "parado" (dias) para uma temperatura, com fallback.
CREATE OR REPLACE FUNCTION public.gestao_limiar_parado(_temperatura text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (public.gestao_config_valor('parado_limiares_dias') ->> COALESCE(_temperatura, 'default'))::int,
    (public.gestao_config_valor('parado_limiares_dias') ->> 'default')::int,
    7
  );
$$;

REVOKE ALL ON FUNCTION public.gestao_limiar_parado(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestao_limiar_parado(text) TO authenticated, service_role;

-- Carimbo de quem/quando alterou (auditoria mínima da configuração).
CREATE OR REPLACE FUNCTION public.gestao_config_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  NEW.atualizado_por := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gestao_config_stamp ON public.gestao_config;
CREATE TRIGGER trg_gestao_config_stamp
  BEFORE UPDATE ON public.gestao_config
  FOR EACH ROW EXECUTE FUNCTION public.gestao_config_stamp();
