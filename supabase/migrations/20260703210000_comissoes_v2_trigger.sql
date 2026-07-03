-- Comissões V2: geração automática por beneficiário ao registrar venda.
--
-- Contexto: o histórico de migrations tem dois CREATE TABLE de `comissoes`
-- (V1 por venda em 20260616130200, V2 por beneficiário em 20260619185115).
-- O schema vivo é o V2, mas o gerador (`gerar_comissao_da_venda`) só existia
-- para o V1 e nunca foi reescrito — nenhuma comissão era criada. Tudo aqui é
-- defensivo/idempotente porque o estado do banco vivo vem de snapshot.
--
-- Não toca nos triggers de gamificação de `vendas` (pont_after_venda etc.).

-- 1) Remove o gerador V1 (escrevia colunas que não existem mais no V2).
DROP TRIGGER IF EXISTS trg_gerar_comissao ON public.vendas;
DROP FUNCTION IF EXISTS public.gerar_comissao_da_venda();

-- 2) Núcleo reutilizável (trigger + backfill): gera as linhas de comissão de
--    UMA venda no formato V2 — uma linha por beneficiário. SECURITY DEFINER é
--    obrigatório: a venda é inserida pelo corretor, mas o INSERT em
--    `comissoes` é restrito a admin/gestor/superintendente pela RLS.
CREATE OR REPLACE FUNCTION public.gerar_comissoes_para_venda(_venda_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _v public.vendas%ROWTYPE;
  _status text;
  _corretor_nome text;
  _gerente_id uuid;
  _gerente_nome text;
  _super_id uuid;
  _super_nome text;
BEGIN
  SELECT * INTO _v FROM public.vendas WHERE id = _venda_id;
  IF NOT FOUND THEN RETURN; END IF;

  _status := CASE WHEN _v.distrato THEN 'cancelada' ELSE 'pendente' END;

  SELECT p.nome INTO _corretor_nome FROM public.profiles p WHERE p.id = _v.corretor_id;

  -- Gerente = gestor da equipe do corretor (quando houver). Sem equipe/gestor,
  -- a linha nasce sem beneficiário ("a atribuir" — o gestor define na aba).
  SELECT e.gestor_id INTO _gerente_id
  FROM public.profiles p
  JOIN public.equipes e ON e.id = p.equipe_id
  WHERE p.id = _v.corretor_id;
  IF _gerente_id IS NOT NULL THEN
    SELECT p.nome INTO _gerente_nome FROM public.profiles p WHERE p.id = _gerente_id;
  END IF;

  -- Superintendente só é resolvido automaticamente quando é inequívoco
  -- (exatamente um usuário com esse papel).
  IF (SELECT count(*) FROM public.user_roles WHERE role = 'superintendente') = 1 THEN
    SELECT ur.user_id INTO _super_id FROM public.user_roles ur WHERE ur.role = 'superintendente';
    SELECT p.nome INTO _super_nome FROM public.profiles p WHERE p.id = _super_id;
  END IF;

  -- Corretor: sempre que a venda tem corretor (mesmo com pct 0, para a venda
  -- aparecer na página dele).
  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto, valor_liquido, contrato_vgv
  )
  SELECT _v.id, _v.lead_id, _v.corretor_id, _corretor_nome, 'corretor', _status,
         _v.valor_venda, COALESCE(_v.percentual_corretor, 0),
         round(_v.valor_venda * COALESCE(_v.percentual_corretor, 0) / 100, 2), 0,
         round(_v.valor_venda * COALESCE(_v.percentual_corretor, 0) / 100, 2), _v.valor_venda
  WHERE _v.corretor_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes c WHERE c.venda_id = _v.id AND c.tipo = 'corretor'
    );

  -- Gerente: só quando o percentual é positivo.
  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto, valor_liquido, contrato_vgv
  )
  SELECT _v.id, _v.lead_id, _gerente_id, _gerente_nome, 'gerente', _status,
         _v.valor_venda, COALESCE(_v.percentual_gerente, 0),
         round(_v.valor_venda * COALESCE(_v.percentual_gerente, 0) / 100, 2), 0,
         round(_v.valor_venda * COALESCE(_v.percentual_gerente, 0) / 100, 2), _v.valor_venda
  WHERE COALESCE(_v.percentual_gerente, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes c WHERE c.venda_id = _v.id AND c.tipo = 'gerente'
    );

  -- Superintendente: só quando o percentual é positivo.
  INSERT INTO public.comissoes (
    venda_id, lead_id, beneficiario_id, beneficiario_nome, tipo, status,
    valor_base, percentual, valor_comissao, percentual_desconto, valor_liquido, contrato_vgv
  )
  SELECT _v.id, _v.lead_id, _super_id, _super_nome, 'superintendente', _status,
         _v.valor_venda, COALESCE(_v.percentual_superintendente, 0),
         round(_v.valor_venda * COALESCE(_v.percentual_superintendente, 0) / 100, 2), 0,
         round(_v.valor_venda * COALESCE(_v.percentual_superintendente, 0) / 100, 2), _v.valor_venda
  WHERE COALESCE(_v.percentual_superintendente, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.comissoes c WHERE c.venda_id = _v.id AND c.tipo = 'superintendente'
    );
END;
$$;

-- 3) Trigger de INSERT em vendas (nome próprio, independente dos demais).
CREATE OR REPLACE FUNCTION public.gerar_comissoes_v2()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.gerar_comissoes_para_venda(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_comissoes_v2 ON public.vendas;
CREATE TRIGGER trg_gerar_comissoes_v2
AFTER INSERT ON public.vendas
FOR EACH ROW EXECUTE FUNCTION public.gerar_comissoes_v2();

-- 4) Distrato: cancela as comissões pendentes da venda; desfazer o distrato
--    restaura (o único caminho automático de cancelamento é o distrato, então
--    a restauração simétrica é segura). Comissões pagas não são tocadas —
--    estorno é decisão manual do gestor.
CREATE OR REPLACE FUNCTION public.sincronizar_comissoes_distrato()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.distrato AND NOT OLD.distrato THEN
    UPDATE public.comissoes SET status = 'cancelada'
    WHERE venda_id = NEW.id AND status = 'pendente';
  ELSIF OLD.distrato AND NOT NEW.distrato THEN
    UPDATE public.comissoes SET status = 'pendente'
    WHERE venda_id = NEW.id AND status = 'cancelada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comissoes_distrato ON public.vendas;
CREATE TRIGGER trg_comissoes_distrato
AFTER UPDATE OF distrato ON public.vendas
FOR EACH ROW
WHEN (OLD.distrato IS DISTINCT FROM NEW.distrato)
EXECUTE FUNCTION public.sincronizar_comissoes_distrato();

-- 5) Backfill: gera comissões para vendas existentes que ainda não têm
--    (vendas distratadas entram como 'cancelada').
DO $$
DECLARE _id uuid;
BEGIN
  FOR _id IN SELECT id FROM public.vendas LOOP
    PERFORM public.gerar_comissoes_para_venda(_id);
  END LOOP;
END $$;

-- 6) Índice para o filtro por status + realtime para a aba Comissões.
CREATE INDEX IF NOT EXISTS idx_comissoes_status ON public.comissoes(status);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comissoes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vendas;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
