-- Defesa transversal da máquina de estados.
--
-- O navegador continua podendo editar os demais campos de um lead, mas uma
-- alteração de `leads.status` só passa quando a própria transação foi aberta
-- por `transicionar_lead`, pela aprovação/cancelamento de venda ou pelo fluxo
-- especializado e auditado de perda. A atribuição inicial da distribuição é a
-- única compatibilidade estrutural: novo sem dono -> aguardando com dono.

CREATE OR REPLACE FUNCTION public.validar_status_lead_via_rpc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _role text := COALESCE(auth.role(), '');
  _autorizado boolean := COALESCE(
    current_setting('app.transicionar_lead', true) = 'on', false
  );
  _atribuicao_inicial boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- service_role e sessões SQL administrativas são fronteiras internas. As
  -- APIs públicas que usam service_role validam cliente/escopo antes da RPC.
  IF _role NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF _autorizado THEN
    RETURN NEW;
  END IF;

  _atribuicao_inicial := OLD.corretor_id IS NULL
    AND NEW.corretor_id IS NOT NULL
    AND OLD.status IN (
      'novo'::public.lead_status,
      'aguardando_corretor'::public.lead_status
    )
    AND NEW.status = 'aguardando_atendimento'::public.lead_status
    AND (
      NEW.corretor_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'gestor'::public.app_role)
      OR public.has_role(auth.uid(), 'superintendente'::public.app_role)
    );

  IF _atribuicao_inicial THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'status do lead só pode ser alterado por transicionar_lead'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.validar_status_lead_via_rpc()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validar_status_lead_via_rpc ON public.leads;
CREATE TRIGGER trg_validar_status_lead_via_rpc
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validar_status_lead_via_rpc();

-- A API pública tem uma única transição suportada: perda. Ela não recebe o
-- status como argumento, portanto uma credencial de integração nunca consegue
-- usar esta RPC para avançar/fechar o funil. O gate de cliente/equipe/projeto é
-- aplicado pelo handler antes desta chamada service_role-only.
CREATE OR REPLACE FUNCTION public.transicionar_lead_api_perda(
  p_lead_id uuid,
  p_categoria text,
  p_motivo text DEFAULT NULL,
  p_data_perda timestamptz DEFAULT NULL
)
RETURNS public.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _motivo text := COALESCE(NULLIF(btrim(p_motivo), ''), NULLIF(btrim(p_categoria), ''));
  _resultado public.leads%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role required'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(p_categoria), '') IS NULL
     OR char_length(btrim(p_categoria)) > 120 THEN
    RAISE EXCEPTION 'categoria de perda inválida'
      USING ERRCODE = '22023';
  END IF;

  IF _motivo IS NULL THEN
    RAISE EXCEPTION 'motivo de perda obrigatório'
      USING ERRCODE = '22023';
  END IF;

  IF p_data_perda IS NOT NULL AND p_data_perda > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'data da perda não pode estar no futuro'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.transicionar_lead(
    p_lead_id,
    'perdido'::public.lead_status,
    _motivo,
    NULL,
    NULL
  );

  UPDATE public.leads
  SET motivo_perda_categoria = btrim(p_categoria),
      motivo_perdido = NULLIF(btrim(p_motivo), ''),
      data_perda = COALESCE(p_data_perda, now())
  WHERE id = p_lead_id
  RETURNING * INTO _resultado;

  RETURN _resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.transicionar_lead_api_perda(uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transicionar_lead_api_perda(uuid, text, text, timestamptz)
  TO service_role;

-- Defesa para ambientes que tenham aplicado uma revisão intermediária da
-- migration anterior: service_role só recebe o wrapper restrito acima.
REVOKE EXECUTE ON FUNCTION public.transicionar_lead(
  uuid, public.lead_status, text, text, timestamptz
) FROM service_role;

-- Compatibilidade controlada: este fluxo ainda precisa redistribuir o lead
-- depois da perda. Ele abre a mesma flag transacional e mantém o gate central
-- de carteira. O RPC legado interno continua inacessível ao navegador.
CREATE OR REPLACE FUNCTION public.marcar_lead_perdido_v2(
  _lead_id uuid,
  _categoria text,
  _detalhe text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _service_role boolean := COALESCE(auth.role() = 'service_role', false);
  _motivo text := COALESCE(NULLIF(btrim(_detalhe), ''), btrim(_categoria));
BEGIN
  IF NOT _service_role
     AND NOT public.pode_acessar_lead(auth.uid(), _lead_id) THEN
    RAISE EXCEPTION 'lead fora da carteira autorizada'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(btrim(_categoria), '') IS NULL THEN
    RAISE EXCEPTION 'motivo de perda obrigatório'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.transicionar_lead', 'on', true);
  PERFORM public.transicionar_lead(
    _lead_id,
    'perdido'::public.lead_status,
    _motivo,
    NULL,
    NULL
  );
  RETURN public.marcar_lead_perdido(_lead_id, _categoria, _detalhe);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_lead_perdido_v2(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_lead_perdido_v2(uuid, text, text)
  TO authenticated, service_role;
