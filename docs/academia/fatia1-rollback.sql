-- ===========================================================================
-- ACADEMIA SMQ · Fatia 1 · rollback completo
-- ===========================================================================
-- Desfaz 20261002120000_academia_fundacao.sql e 20261002120100_academia_seed.sql.
-- Remove SÓ objetos academia_*. Nenhuma tabela da operação é tocada.
--
-- ANTES DE RODAR: desligue as flags e confirme que ninguém está na tela.
--   UPDATE public.app_flags SET ativo = false, atualizado_em = now()
--    WHERE chave IN ('academia_menu','academia_card_inicio');
--
-- ATENÇÃO: apaga progresso, notas, práticas e certificados. Se já houver uso
-- real, exporte antes:
--   \copy (select * from public.academia_tentativas) to 'tentativas.csv' csv header
--   \copy (select * from public.academia_praticas)   to 'praticas.csv'   csv header
--   \copy (select * from public.academia_certificados) to 'certificados.csv' csv header
--
-- A ORDEM IMPORTA. O 99-rollback-academia.sql original derrubava as funções
-- ANTES das tabelas, e o Postgres recusava: as policies de RLS dependem de
-- academia_pode_gerir e academia_eh_admin. Aqui é views → tabelas (as policies
-- vão junto) → funções → tipos.
--
-- Este arquivo é script de mão, não migration: por isso tem a transação
-- explícita. Se algo falhar no meio, nada é removido pela metade.
-- ===========================================================================

BEGIN;

-- 1. Flags (a tela some antes do schema)
DELETE FROM public.app_flags WHERE chave IN ('academia_menu','academia_card_inicio');

-- 2. Views
DROP VIEW IF EXISTS public.v_academia_corretor_resumo;
DROP VIEW IF EXISTS public.v_academia_fase_status;
DROP VIEW IF EXISTS public.v_academia_modulo_status;

-- 3. Tabelas (cada DROP leva junto as policies, índices e a sequência)
DROP TABLE IF EXISTS public.academia_presencas;
DROP TABLE IF EXISTS public.academia_encontros;
-- atribuicoes ANTES de recomendacoes: academia_atribuicoes.recomendacao_id tem
-- FK para academia_recomendacoes. Na primeira versão deste arquivo a ordem
-- estava invertida e o DROP falhava com "other objects depend on it".
DROP TABLE IF EXISTS public.academia_atribuicoes;
DROP TABLE IF EXISTS public.academia_recomendacoes;
DROP TABLE IF EXISTS public.academia_regras_recomendacao;
DROP TABLE IF EXISTS public.academia_indicadores;
DROP TABLE IF EXISTS public.academia_certificados;
DROP TABLE IF EXISTS public.academia_praticas;
DROP TABLE IF EXISTS public.academia_tentativas;
DROP TABLE IF EXISTS public.academia_progresso_aulas;
DROP TABLE IF EXISTS public.academia_niveis_historico;
DROP TABLE IF EXISTS public.academia_participantes;
DROP TABLE IF EXISTS public.academia_questoes;
DROP TABLE IF EXISTS public.academia_aulas;
DROP TABLE IF EXISTS public.academia_modulos;
DROP TABLE IF EXISTS public.academia_fases;
DROP TABLE IF EXISTS public.academia_config;

-- 4. Funções (agora nada mais depende delas)
DROP FUNCTION IF EXISTS public.academia_definir_participacao(uuid, boolean, date);
DROP FUNCTION IF EXISTS public.academia_publicar_modulo(uuid);
DROP FUNCTION IF EXISTS public.academia_decidir_recomendacao(uuid, text, text, date);
DROP FUNCTION IF EXISTS public.academia_atribuir(uuid, uuid, date, text);
DROP FUNCTION IF EXISTS public.academia_atribuir_interno(uuid, uuid, date, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.academia_promover_mestre(uuid, text);
DROP FUNCTION IF EXISTS public.academia_definir_habilitado(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.academia_registrar_roleplay(uuid, uuid, public.academia_status_pratica, jsonb, text);
DROP FUNCTION IF EXISTS public.academia_pratica_avaliar(uuid, public.academia_status_pratica, jsonb, text);
DROP FUNCTION IF EXISTS public.academia_pratica_enviar(uuid, text, text);
DROP FUNCTION IF EXISTS public.academia_quiz_enviar(uuid, jsonb);
DROP FUNCTION IF EXISTS public.academia_quiz_iniciar(uuid);
DROP FUNCTION IF EXISTS public.academia_marcar_aula(uuid, boolean);
DROP FUNCTION IF EXISTS public.academia_concluir_atribuicoes(uuid, uuid);
DROP FUNCTION IF EXISTS public.academia_recalcular_nivel(uuid);
DROP FUNCTION IF EXISTS public.academia_pode_gerir(uuid);
DROP FUNCTION IF EXISTS public.academia_eh_admin();

-- 5. Tipos (depois das funções que os usam na assinatura)
DROP TYPE IF EXISTS public.academia_status_recomendacao;
DROP TYPE IF EXISTS public.academia_status_pratica;
DROP TYPE IF EXISTS public.academia_tipo_aula;
DROP TYPE IF EXISTS public.academia_status_conteudo;
DROP TYPE IF EXISTS public.academia_nivel;

COMMIT;

-- Conferência (tem que voltar 0, 0 e 0):
--   SELECT count(*) FROM pg_class      WHERE relname LIKE 'academia%' OR relname LIKE 'v_academia%';
--   SELECT count(*) FROM pg_proc       WHERE proname LIKE 'academia%';
--   SELECT count(*) FROM public.app_flags WHERE chave LIKE 'academia%';
