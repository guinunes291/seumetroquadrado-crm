SET lock_timeout = '20s';
CREATE TABLE public.comissao_tier_regras (
  tier text PRIMARY KEY,
  ordem int NOT NULL,
  min_vendas int NOT NULL,
  pct_lead_empresa numeric(5,2) NOT NULL,
  pct_lead_proprio numeric(5,2) NOT NULL,
  pct_marquinhos numeric(5,2) NOT NULL,
  pct_sdr numeric(5,2) NOT NULL DEFAULT 8,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comissao_tier_regras TO authenticated;
GRANT UPDATE ON public.comissao_tier_regras TO authenticated;
GRANT ALL ON public.comissao_tier_regras TO service_role;
ALTER TABLE public.comissao_tier_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tier regras leitura" ON public.comissao_tier_regras FOR SELECT TO authenticated USING (true);
CREATE POLICY "tier regras admin edita" ON public.comissao_tier_regras FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.comissao_tier_regras VALUES
 ('tier_1',1,0,40,45,30,8,now()),
 ('tier_2',2,3,45,50,35,8,now()),
 ('tier_3',3,5,50,55,37,8,now()),
 ('elite',4,8,55,60,40,8,now());

ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS tier_comissao text,
  ADD COLUMN IF NOT EXISTS esteira_comissao text,
  ADD COLUMN IF NOT EXISTS pct_share_corretor numeric(5,2);

CREATE OR REPLACE FUNCTION public.corretor_vendas_trimestre(p_corretor uuid, p_ref date, p_offset int DEFAULT -1)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::int FROM vendas v
  WHERE v.corretor_id = p_corretor AND v.status_venda='aprovada' AND coalesce(v.distrato,false)=false
    AND v.data_assinatura >= (date_trunc('quarter', p_ref) + make_interval(months => 3*p_offset))::date
    AND v.data_assinatura <  (date_trunc('quarter', p_ref) + make_interval(months => 3*(p_offset+1)))::date
$$;

CREATE OR REPLACE FUNCTION public.corretor_tier(p_corretor uuid, p_ref date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT tier FROM comissao_tier_regras
  WHERE min_vendas <= public.corretor_vendas_trimestre(p_corretor, p_ref, -1)
  ORDER BY ordem DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.lead_esteira_comissao(p_lead uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM agendamentos a WHERE a.lead_id=l.id AND a.tipo='visita' AND a.criado_por_id IS NULL) THEN 'marquinhos'
    WHEN l.sdr_id IS NOT NULL THEN 'sdr'
    WHEN l.origem::text IN ('captacao_corretor','investimento_corretor') THEN 'lead_proprio'
    ELSE 'lead_empresa' END
  FROM leads l WHERE l.id = p_lead
$$;

CREATE OR REPLACE FUNCTION public.comissao_sugerida_corretor(p_lead uuid, p_corretor uuid, p_data date DEFAULT NULL)
RETURNS TABLE(tier text, esteira text, pct_share numeric, vendas_trimestre_anterior int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ref date := coalesce(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date); r comissao_tier_regras;
BEGIN
  tier := public.corretor_tier(p_corretor, v_ref);
  esteira := coalesce(public.lead_esteira_comissao(p_lead),'lead_empresa');
  vendas_trimestre_anterior := public.corretor_vendas_trimestre(p_corretor, v_ref, -1);
  SELECT * INTO r FROM comissao_tier_regras t WHERE t.tier = comissao_sugerida_corretor.tier;
  pct_share := CASE esteira WHEN 'marquinhos' THEN r.pct_marquinhos WHEN 'sdr' THEN r.pct_sdr
                 WHEN 'lead_proprio' THEN r.pct_lead_proprio ELSE r.pct_lead_empresa END;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.comissao_sugerida_corretor(uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.corretor_tier(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.corretor_vendas_trimestre(uuid,date,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.vendas_aplicar_tier_comissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; v_gestao boolean;
BEGIN
  v_gestao := auth.uid() IS NULL OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor')
              OR public.has_role(auth.uid(),'superintendente');
  IF TG_OP = 'INSERT' THEN
    IF NEW.corretor_id IS NOT NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT * INTO s FROM public.comissao_sugerida_corretor(NEW.lead_id, NEW.corretor_id, NEW.data_assinatura);
      NEW.tier_comissao := s.tier; NEW.esteira_comissao := s.esteira; NEW.pct_share_corretor := s.pct_share;
      IF NOT v_gestao AND s.pct_share IS NOT NULL THEN
        NEW.percentual_corretor := round(coalesce(NEW.percentual_comissao,0) * s.pct_share / 100, 4);
      END IF;
    END IF;
  ELSIF NOT v_gestao AND (NEW.percentual_corretor IS DISTINCT FROM OLD.percentual_corretor
        OR NEW.percentual_comissao IS DISTINCT FROM OLD.percentual_comissao) THEN
    RAISE EXCEPTION 'Somente a gestão pode alterar os percentuais de comissão';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_vendas_tier_comissao BEFORE INSERT OR UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.vendas_aplicar_tier_comissao();

CREATE OR REPLACE FUNCTION public.ranking_tiers_corretores()
RETURNS TABLE(corretor_id uuid, nome text, vendas_trimestre_anterior int, vendas_trimestre_atual int, tier_atual text, tier_proximo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date d)
  SELECT p.id, p.nome,
    public.corretor_vendas_trimestre(p.id, h.d, -1),
    public.corretor_vendas_trimestre(p.id, h.d, 0),
    public.corretor_tier(p.id, h.d),
    (SELECT t.tier FROM comissao_tier_regras t WHERE t.min_vendas <= public.corretor_vendas_trimestre(p.id, h.d, 0) ORDER BY t.ordem DESC LIMIT 1)
  FROM profiles p CROSS JOIN hoje h
  WHERE coalesce(p.ativo,true) AND EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role IN ('corretor','gestor'))
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente') OR p.id = auth.uid())
  ORDER BY 4 DESC, 3 DESC, 2
$$;
GRANT EXECUTE ON FUNCTION public.ranking_tiers_corretores() TO authenticated;