ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS gerente_beneficiario_id uuid REFERENCES public.profiles(id), ADD COLUMN IF NOT EXISTS socio_guilherme_id uuid REFERENCES public.profiles(id), ADD COLUMN IF NOT EXISTS socio_fabio_id uuid REFERENCES public.profiles(id);
CREATE OR REPLACE FUNCTION public.validar_socios_aprovacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF OLD.status_venda IN ('rascunho','pendente') AND NEW.status_venda='aprovada' THEN
   IF NEW.socio_guilherme_id IS DISTINCT FROM '43866728-4cde-4f74-a5de-bbbecec10198'::uuid OR NEW.socio_fabio_id IS NULL OR NEW.socio_fabio_id NOT IN ('69d35880-d2c3-4225-b07c-6cec02be8509'::uuid,'5531c08f-e0dc-4289-90f3-b6105eab4c4c'::uuid) THEN
     RAISE EXCEPTION 'Selecione Guilherme e Fábio como sócios antes de aprovar';
   END IF;
   IF COALESCE(NEW.percentual_gerente,0)>0 AND NEW.gerente_beneficiario_id IS NULL THEN RAISE EXCEPTION 'Selecione o gerente comissionado antes de aprovar'; END IF;
   NEW.percentual_superintendente := 0.6;
   IF COALESCE(NEW.percentual_corretor,0)+COALESCE(NEW.percentual_gerente,0)+0.6 > COALESCE(NEW.percentual_comissao,0) THEN RAISE EXCEPTION 'A soma das comissões excede a comissão total'; END IF;
 END IF;
 IF OLD.status_venda='aprovada' AND (NEW.gerente_beneficiario_id IS DISTINCT FROM OLD.gerente_beneficiario_id OR NEW.socio_guilherme_id IS DISTINCT FROM OLD.socio_guilherme_id OR NEW.socio_fabio_id IS DISTINCT FROM OLD.socio_fabio_id) THEN RAISE EXCEPTION 'Beneficiários de venda aprovada são imutáveis'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validar_socios_aprovacao() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_socios_aprovacao BEFORE UPDATE ON public.vendas FOR EACH ROW EXECUTE FUNCTION public.validar_socios_aprovacao();
DO $migration$
DECLARE d text; inicio integer; fim integer;
BEGIN
 d := pg_get_functiondef('public.gerar_comissoes_para_venda(uuid)'::regprocedure);
 d := replace(d,'SELECT e.gestor_id INTO _gerente_id','SELECT COALESCE(_v.gerente_beneficiario_id, e.gestor_id) INTO _gerente_id');
 inicio := strpos(d,'  INSERT INTO public.comissoes (' || chr(10) || '    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,' || chr(10) || '    valor_base, percentual, valor_comissao, percentual_desconto,' || chr(10) || '    valor_liquido, contrato_vgv' || chr(10) || '  )' || chr(10) || '  SELECT' || chr(10) || '    _v.id, _v.lead_id, _super_id');
 fim := strpos(d,'  -- SDR:');
 IF inicio=0 OR fim<=inicio THEN RAISE EXCEPTION 'Estrutura do gerador de comissão incompatível'; END IF;
 d := substr(d,1,inicio-1) || $replacement$
  INSERT INTO public.comissoes (venda_id,lead_id,beneficiario_id,beneficiario_nome,tipo,status,valor_base,percentual,valor_comissao,percentual_desconto,valor_liquido,contrato_vgv)
  SELECT _v.id,_v.lead_id,p.id,p.nome,'socio','pendente',_v.valor_venda,0.3,round(_v.valor_venda*0.3/100,2),0,round(_v.valor_venda*0.3/100,2),_v.valor_venda
  FROM public.profiles p WHERE p.id IN (_v.socio_guilherme_id,_v.socio_fabio_id)
  AND NOT EXISTS (SELECT 1 FROM public.comissoes c WHERE c.venda_id=_v.id AND c.tipo='socio' AND c.beneficiario_id=p.id);

$replacement$ || substr(d,fim);
 EXECUTE d;
END $migration$;
COMMENT ON COLUMN public.vendas.percentual_superintendente IS 'Legacy compatibility: new approvals store total partner share; individual partner commissions are generated separately.';