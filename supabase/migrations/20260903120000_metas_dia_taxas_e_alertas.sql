-- Metas do dia — fase 2: balanço do dia anterior, conversão do corretor e
-- avisos de andamento durante o dia.
--
-- 1) metas_dia_taxas(_dias): contagens do funil (contatos → agendamentos →
--    documentações → vendas) dos últimos N dias, do PRÓPRIO corretor e do TIME
--    (todos com papel corretor). O front deriva as taxas e o "quantos contatos
--    preciso hoje". SECURITY DEFINER porque a RLS não deixa o corretor ler as
--    interações dos colegas — e o agregado do time não expõe ninguém.
--
-- 2) metas_dia_alerta_checkpoint(...): grava no sino (public.alertas) o aviso
--    de andamento de um checkpoint (12h/15h/17h). O corretor não tem INSERT em
--    alertas (só admin/gestor), por isso passa por aqui. Dedup por ref_id
--    determinístico (md5 → uuid), então o mesmo checkpoint não repete em outro
--    aparelho.

CREATE OR REPLACE FUNCTION public.metas_dia_taxas(_dias int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _janela int := GREATEST(1, COALESCE(_dias, 30));
  _ini date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - _janela;
  _minhas jsonb;
  _time jsonb;
  _n int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
  END IF;

  -- Contato = ligação ou WhatsApp DE SAÍDA (o que o corretor fez, não o que recebeu).
  SELECT jsonb_build_object(
    'contatos', (SELECT count(*) FROM public.interacoes i
                  WHERE i.autor_id = _uid
                    AND i.tipo IN ('ligacao','whatsapp')
                    AND i.direcao = 'saida'
                    AND i.deleted_at IS NULL
                    AND i.ocorreu_em >= _ini),
    'agendamentos', (SELECT count(*) FROM public.agendamentos a
                      WHERE a.corretor_id = _uid
                        AND a.tipo IN ('visita','reuniao')
                        AND NOT a.auto_gerado
                        AND a.deleted_at IS NULL
                        AND a.status <> 'cancelado'
                        AND a.created_at >= _ini),
    'documentacoes', (SELECT count(*) FROM public.lead_status_transitions t
                       WHERE t.corretor_id = _uid
                         AND t.para_status = 'analise_credito'
                         AND t.created_at >= _ini),
    'vendas', (SELECT count(*) FROM public.vendas v
                WHERE v.corretor_id = _uid
                  AND v.status_venda IN ('pendente','aprovada')
                  AND NOT v.distrato
                  AND v.data_assinatura >= _ini)
  ) INTO _minhas;

  WITH corretores AS (
    SELECT DISTINCT user_id FROM public.user_roles WHERE role = 'corretor'
  )
  SELECT jsonb_build_object(
    'contatos', (SELECT count(*) FROM public.interacoes i
                  WHERE i.autor_id IN (SELECT user_id FROM corretores)
                    AND i.tipo IN ('ligacao','whatsapp')
                    AND i.direcao = 'saida'
                    AND i.deleted_at IS NULL
                    AND i.ocorreu_em >= _ini),
    'agendamentos', (SELECT count(*) FROM public.agendamentos a
                      WHERE a.corretor_id IN (SELECT user_id FROM corretores)
                        AND a.tipo IN ('visita','reuniao')
                        AND NOT a.auto_gerado
                        AND a.deleted_at IS NULL
                        AND a.status <> 'cancelado'
                        AND a.created_at >= _ini),
    'documentacoes', (SELECT count(*) FROM public.lead_status_transitions t
                       WHERE t.corretor_id IN (SELECT user_id FROM corretores)
                         AND t.para_status = 'analise_credito'
                         AND t.created_at >= _ini),
    'vendas', (SELECT count(*) FROM public.vendas v
                WHERE v.corretor_id IN (SELECT user_id FROM corretores)
                  AND v.status_venda IN ('pendente','aprovada')
                  AND NOT v.distrato
                  AND v.data_assinatura >= _ini)
  ) INTO _time;

  SELECT count(DISTINCT user_id) INTO _n FROM public.user_roles WHERE role = 'corretor';

  RETURN jsonb_build_object(
    'dias', _janela,
    'inicio', _ini,
    'minhas', _minhas,
    'time', _time,
    'corretores', _n,
    'atualizado_em', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.metas_dia_taxas(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metas_dia_taxas(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.metas_dia_alerta_checkpoint(
  _dia date,
  _checkpoint int,
  _titulo text,
  _mensagem text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ref uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'não autenticado' USING ERRCODE = '42501';
  END IF;
  -- ref_id determinístico por corretor + dia + checkpoint → dedup entre aparelhos.
  _ref := md5('metas-dia:' || _uid::text || ':' || _dia::text || ':' || _checkpoint::text)::uuid;
  IF EXISTS (SELECT 1 FROM public.alertas WHERE user_id = _uid AND ref_id = _ref) THEN
    RETURN false;
  END IF;
  INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
  VALUES (_uid, 'sistema', left(COALESCE(_titulo, 'Metas de hoje'), 120),
          left(COALESCE(_mensagem, ''), 600), '/hoje', _ref);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.metas_dia_alerta_checkpoint(date, int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metas_dia_alerta_checkpoint(date, int, text, text) TO authenticated, service_role;
