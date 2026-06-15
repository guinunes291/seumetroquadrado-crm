-- =============================================================================
-- IMPORT DO HISTÓRICO DA COPA SMQ (semanas 1–7 / fase de grupos) — RODAR MANUAL
-- =============================================================================
-- Reconstrói participantes + confrontos a partir dos CSVs do Manus, convertendo
-- os IDs inteiros de corretor para o UUID de profiles via profiles.legacy_user_id.
--
-- PRÉ-REQUISITOS:
--   1) profiles.legacy_user_id preenchido para os corretores (já feito p/ ~10).
--   2) Os corretores faltantes (sem conta) NÃO serão resolvidos — seus confrontos
--      entram com lado "A definir" (corretor_id NULL). Crie as contas e rode de novo.
--   3) Migrations da Copa 1:1 já aplicadas (copa_fases.tipo, copa_participantes.grupo,
--      copa_confrontos.is_wo, etc.).
--
-- ⚠️ O mapa selecao_id→país abaixo é o MEU PALPITE (não havia CSV de copa_selecoes).
--    Confira os rótulos: o vínculo corretor↔seleção vem do CSV (corretorId→selecaoId).
-- É idempotente: limpa os confrontos da edição e refaz.
-- =============================================================================

DO $$
DECLARE
  _ed  uuid;
  _fg  uuid;
BEGIN
  SELECT id INTO _ed FROM public.copa_edicao WHERE ativo = true ORDER BY created_at DESC LIMIT 1;
  IF _ed IS NULL THEN RAISE EXCEPTION 'Nenhuma edição ativa de Copa'; END IF;
  SELECT id INTO _fg FROM public.copa_fases WHERE edicao_id = _ed AND tipo = 'grupos' LIMIT 1;
  IF _fg IS NULL THEN RAISE EXCEPTION 'Fase de grupos não encontrada'; END IF;

  -- ---- limpa confrontos da edição (refaz) ----
  DELETE FROM public.copa_confrontos c USING public.copa_fases f
   WHERE c.fase_id = f.id AND f.edicao_id = _ed;

  -- ---- participantes (corretor via legacy_user_id; seleção via mapa→país) ----
  INSERT INTO public.copa_participantes (edicao_id, corretor_id, grupo, selecao_id, ativo)
  SELECT _ed, pr.id, cor.grupo, sc.id, true
  FROM (VALUES
    (38430789, 5,'A'),(39782610, 1,'A'),(37980302, 3,'A'),(38400551,30001,'A'),
    (38430037, 4,'A'),(38400416, 2,'A'),(38431527,12,'A'),
    (39780403,30002,'B'),(38400413,10,'B'),(37980408, 7,'B'),(38400667,11,'B'),
    (37980503, 8,'B'),(38430149, 6,'B'),(38431121, 9,'B')
  ) AS cor(legacy, selegacy, grupo)
  JOIN public.profiles pr ON pr.legacy_user_id = cor.legacy
  LEFT JOIN (VALUES
    (1,'Alemanha'),(2,'Argentina'),(3,'Bélgica'),(4,'Brasil'),(5,'Croácia'),
    (6,'Espanha'),(7,'França'),(8,'Holanda'),(9,'Inglaterra'),(10,'Itália'),
    (11,'Japão'),(12,'Marrocos'),(30001,'Portugal'),(30002,'Uruguai')
  ) AS sm(selegacy, pais) ON sm.selegacy = cor.selegacy
  LEFT JOIN public.copa_selecoes sc ON sc.nome = sm.pais
  ON CONFLICT (edicao_id, corretor_id)
    DO UPDATE SET grupo = EXCLUDED.grupo, selecao_id = EXCLUDED.selecao_id, ativo = true;

  -- ---- confrontos (corretores via legacy_user_id) ----
  INSERT INTO public.copa_confrontos (fase_id, corretor_a_id, corretor_b_id, vencedor_id, is_wo, semana_ref, posicao)
  SELECT _fg, pa.id, pb.id, pv.id, cf.iswo, cf.semana, cf.posicao
  FROM (VALUES
    -- semana, posicao, corretorA, corretorB, vencedor(0=null), isWO
    (1,1,  39782610,38431527,39782610,false),
    (1,2,  37980302,38400416,38400416,false),
    (1,3,  38400551,38430037,38400551,false),
    (1,4,  39780403,38431121,39780403,false),
    (1,5,  38400413,37980503,38400413,false),
    (1,6,  37980408,38400667,37980408,false),
    (2,7,  38430789,38431527,0,false),
    (2,8,  39782610,38430037,0,false),
    (2,9,  37980302,38400551,0,false),
    (2,10, 38400413,38431121,0,false),
    (2,11, 37980408,38430149,0,false),
    (2,12, 38400667,37980503,0,false),
    (3,13, 38430789,38400416,0,false),
    (3,14, 38431527,38430037,0,false),
    (3,15, 39782610,37980302,0,false),
    (3,16, 39780403,38430149,0,false),
    (3,17, 38431121,37980503,0,false),
    (3,18, 38400413,37980408,0,false),
    (4,19, 38430789,38430037,0,false),
    (4,20, 38400416,38400551,0,false),
    (4,21, 38431527,37980302,0,false),
    (4,22, 39780403,37980503,0,false),
    (4,23, 38430149,38400667,0,false),
    (4,24, 38431121,37980408,0,false),
    (5,25, 38430789,38400551,0,false),
    (5,26, 38430037,37980302,0,false),
    (5,27, 38400416,39782610,0,false),
    (5,28, 39780403,38400667,0,false),
    (5,29, 37980503,37980408,0,false),
    (5,30, 38430149,38400413,0,false),
    (6,31, 38430789,37980302,0,false),
    (6,32, 38400551,39782610,0,false),
    (6,33, 38400416,38431527,0,false),
    (6,34, 39780403,37980408,0,false),
    (6,35, 38400667,38400413,0,false),
    (6,36, 38430149,38431121,0,false),
    (7,37, 38430789,39782610,0,false),
    (7,38, 38400551,38431527,0,false),
    (7,39, 38430037,38400416,0,false),
    (7,40, 39780403,38400413,0,false),
    (7,41, 38400667,38431121,0,false),
    (7,42, 37980503,38430149,0,false),
    -- W.O. (folga): corretorB nulo (0), is_wo=true
    (1,1000, 38430789,0,38430789,true),
    (4,1001, 39782610,0,0,true),
    (7,1002, 37980302,0,0,true),
    (3,1003, 38400551,0,0,true),
    (6,1004, 38430037,0,0,true),
    (2,1005, 38400416,0,0,true),
    (5,1006, 38431527,0,0,true),
    (2,1007, 39780403,0,0,true),
    (4,1008, 38400413,0,0,true),
    (7,1009, 37980408,0,0,true),
    (3,1010, 38400667,0,0,true),
    (6,1011, 37980503,0,0,true),
    (1,1012, 38430149,0,38430149,true),
    (5,1013, 38431121,0,0,true)
  ) AS cf(semana, posicao, aid, bid, vid, iswo)
  LEFT JOIN public.profiles pa ON pa.legacy_user_id = cf.aid
  LEFT JOIN public.profiles pb ON pb.legacy_user_id = NULLIF(cf.bid,0)
  LEFT JOIN public.profiles pv ON pv.legacy_user_id = NULLIF(cf.vid,0);

  RAISE NOTICE 'Import concluído. Participantes resolvidos: %, confrontos: %',
    (SELECT count(*) FROM public.copa_participantes WHERE edicao_id=_ed AND ativo),
    (SELECT count(*) FROM public.copa_confrontos c JOIN public.copa_fases f ON f.id=c.fase_id WHERE f.edicao_id=_ed);
END $$;

-- Corretores do CSV sem perfil (não resolvidos) — crie a conta e rode de novo:
SELECT cor.legacy AS legacy_user_id
FROM (VALUES (38430789),(39782610),(37980302),(38400551),(38430037),(38400416),
  (38431527),(39780403),(38400413),(37980408),(38400667),(37980503),(38430149),(38431121)
) AS cor(legacy)
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.legacy_user_id = cor.legacy);
