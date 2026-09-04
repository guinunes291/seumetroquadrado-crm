-- SDR (pré-venda) — teto de leads ativos próprio da roleta `agendados-sdr`.
--
-- Sintoma (04/09/2026): na Central → Filas → Agendados do SDR TODOS os
-- corretores apareciam "Inapto · Teto de leads ativos atingido". A régua
-- `_elegibilidade_roleta_sdr` aplicava o `disjuntor_wip` global (30) sobre a
-- carteira inteira do corretor (`_wip_corretor`: todo lead fora de contrato
-- fechado / pós-venda / perdido). A roleta comum (v3) nunca aplicou esse teto
-- e a equipe toda carrega mais de 30 leads ativos, então a fila do SDR
-- nascia vazia.
--
-- Correção: a roleta do SDR passa a ler uma chave própria,
-- `sdr_teto_leads_ativos` (nasce 0 = sem teto), editável na Central →
-- Política → "Outras chaves". Com 0 o teto é ignorado; com N > 0 o corretor
-- com N ou mais leads ativos fica inapto (motivo `disjuntor_wip_<n>`, mesmo
-- rótulo já conhecido da Central). Nada mais muda.

INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('sdr_teto_leads_ativos', '0'::jsonb,
   'Teto de leads ativos por corretor na roleta Agendados do SDR (0 = sem teto). Conta a carteira inteira fora de fechado/pós-venda/perdido; a roleta comum não aplica teto.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public._elegibilidade_roleta_sdr(
  _slug text, _inicio timestamptz DEFAULT NULL, _fim timestamptz DEFAULT NULL
)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  apto boolean,
  motivos text[],
  pct_trabalhado numeric,
  carteira_total integer,
  aguardando integer,
  recebidos_hoje integer,
  recebidos_mes integer,
  limite_diario integer,
  presente boolean,
  pausado boolean,
  motivo_pausa text,
  participante_ativo boolean,
  ultimo_lead_em timestamptz,
  incluido_por uuid,
  incluido_em timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    -- Teto PRÓPRIO da roleta do SDR (0 = sem teto). O disjuntor_wip global
    -- (30) não é aplicado pela roleta comum v3 e, na prática, toda a equipe
    -- carrega mais de 30 leads ativos — usá-lo aqui deixava todo mundo inapto.
    SELECT public._sdr_setting_int('sdr_teto_leads_ativos', 0) AS disjuntor,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje_brt
  ),
  r AS (SELECT * FROM public.roletas WHERE slug = _slug),
  base AS (
    SELECT rp.corretor_id,
           p.nome,
           rp.ativo AS participante_ativo,
           (rp.pausado_ate IS NOT NULL AND rp.pausado_ate > now()) AS pausado,
           rp.motivo_pausa,
           rp.ultimo_lead_em,
           rp.incluido_por,
           rp.incluido_em,
           (p.ativo AND p.status_conta = 'ativa'::public.status_conta) AS perfil_ativo,
           (p.telefone IS NOT NULL AND btrim(p.telefone) <> '') AS tem_telefone,
           (p.presente AND p.presente_em IS NOT NULL
             AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = cfg.hoje_brt) AS presente_hoje,
           EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = p.id AND ur.role = 'corretor'::public.app_role) AS eh_corretor,
           public._wip_corretor(rp.corretor_id) AS wip,
           public._sdr_agenda_conflita(rp.corretor_id, _inicio, _fim) AS conflito,
           cfg.disjuntor,
           cfg.hoje_brt
    FROM public.roleta_participantes rp
    JOIN r ON r.id = rp.roleta_id
    JOIN public.profiles p ON p.id = rp.corretor_id
    CROSS JOIN cfg
    WHERE lower(coalesce(p.nome, '')) <> 'docs-bot'
  ),
  recebidos AS (
    SELECT b.corretor_id,
           (count(dl.id) FILTER (
              WHERE (dl.created_at AT TIME ZONE 'America/Sao_Paulo')::date = b.hoje_brt))::int AS hoje_n,
           count(dl.id)::int AS mes_n
    FROM base b
    LEFT JOIN public.distribution_log dl
      ON dl.corretor_id = b.corretor_id
     AND dl.resultado = 'sucesso'
     AND dl.roleta_slug = _slug
     AND dl.created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
                           AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY b.corretor_id
  )
  SELECT
    b.corretor_id,
    b.nome,
    ( b.participante_ativo
      AND NOT b.pausado
      AND b.perfil_ativo
      AND b.eh_corretor
      AND b.tem_telefone
      AND (b.disjuntor <= 0 OR b.wip < b.disjuntor)
      AND NOT b.conflito
    ) AS apto,
    array_remove(ARRAY[
      CASE WHEN NOT b.participante_ativo THEN 'participacao_inativa' END,
      CASE WHEN b.pausado THEN 'pausado' END,
      CASE WHEN NOT b.perfil_ativo THEN 'perfil_inativo' END,
      CASE WHEN NOT b.eh_corretor THEN 'sem_role_corretor' END,
      CASE WHEN NOT b.tem_telefone THEN 'sem_telefone' END,
      CASE WHEN b.disjuntor > 0 AND b.wip >= b.disjuntor THEN 'disjuntor_wip_' || b.wip END,
      CASE WHEN b.conflito THEN 'conflito_agenda' END
    ], NULL) AS motivos,
    100::numeric AS pct_trabalhado,
    b.wip AS carteira_total,
    0 AS aguardando,
    rec.hoje_n AS recebidos_hoje,
    rec.mes_n AS recebidos_mes,
    NULL::integer AS limite_diario,
    b.presente_hoje AS presente,
    b.pausado,
    b.motivo_pausa,
    b.participante_ativo,
    b.ultimo_lead_em,
    b.incluido_por,
    b.incluido_em
  FROM base b
  JOIN recebidos rec ON rec.corretor_id = b.corretor_id;
$$;

REVOKE ALL ON FUNCTION public._elegibilidade_roleta_sdr(text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._elegibilidade_roleta_sdr(text, timestamptz, timestamptz) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.distribuicao_settings WHERE chave = 'sdr_teto_leads_ativos') THEN
    RAISE EXCEPTION 'sdr_teto_proprio: chave sdr_teto_leads_ativos ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_elegibilidade_roleta_sdr'
      AND p.prosrc LIKE '%sdr_teto_leads_ativos%'
  ) THEN
    RAISE EXCEPTION 'sdr_teto_proprio: _elegibilidade_roleta_sdr ainda usa disjuntor_wip';
  END IF;
END $$;
