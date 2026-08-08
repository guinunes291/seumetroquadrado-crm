-- =============================================================================
-- Higiene da roleta (estrategia-2026-08, item 0.4).
--
-- `docs-bot` é conta de serviço (recebimento de documentação via WhatsApp) que
-- vive em `profiles` como corretor ativo e pode constar em roleta_participantes.
-- A elegibilidade v3 (_elegibilidade_roleta) e o caminho legado do webhook já a
-- excluem POR NOME ('docs-bot'); este patch remove a participação na fonte,
-- para que a exclusão não dependa de um filtro por string em cada motor — se a
-- conta for renomeada um dia, o filtro por nome falha, a remoção aqui não.
--
-- Guardas: só age se a conta existir e tiver participação ativa (ambientes de
-- harness/branch sem o dado ficam intactos). Reversível via
-- roleta_gerir_participante('incluir', ...). Espelha exatamente o efeito da
-- ação 'remover' do RPC roleta_gerir_participante, incluindo o log.
-- =============================================================================

DO $$
DECLARE
  _bot uuid;
BEGIN
  SELECT p.id INTO _bot
  FROM public.profiles p
  WHERE lower(coalesce(p.email, '')) = 'docs-bot@seumetroquadrado.com.br'
     OR lower(coalesce(p.nome, '')) = 'docs-bot'
  LIMIT 1;

  IF _bot IS NULL THEN
    RETURN; -- ambiente sem a conta: nada a fazer
  END IF;

  INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
  SELECT rp.roleta_id, rp.corretor_id, 'removido',
         'Higiene: conta de serviço fora da distribuição (estrategia-2026-08, item 0.4)',
         NULL
  FROM public.roleta_participantes rp
  WHERE rp.corretor_id = _bot AND rp.ativo;

  UPDATE public.roleta_participantes
     SET ativo = false, pausado_ate = NULL, motivo_pausa = NULL
   WHERE corretor_id = _bot AND ativo;
END $$;
