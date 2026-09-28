-- =====================================================================
-- ACADEMIA SMQ · rollback completo das migrations 01 e 02
-- Remove SÓ objetos academia_*. Nenhuma tabela da operação é tocada.
-- ATENÇÃO: apaga progresso, notas e certificados. Exporte antes se já
-- houver uso real:  \copy (select * from academia_tentativas) to 'tentativas.csv' csv header
-- =====================================================================
begin;

drop view if exists public.v_academia_corretor_resumo;
drop view if exists public.v_academia_fase_status;
drop view if exists public.v_academia_modulo_status;

drop function if exists public.academia_publicar_modulo(uuid);
drop function if exists public.academia_decidir_recomendacao(uuid, text, text, date);
drop function if exists public.academia_atribuir(uuid, uuid, date, text, text, uuid);
drop function if exists public.academia_promover_mestre(uuid, text);
drop function if exists public.academia_definir_apto(uuid, boolean, text);
drop function if exists public.academia_registrar_roleplay(uuid, uuid, public.academia_status_pratica, jsonb, text);
drop function if exists public.academia_pratica_avaliar(uuid, public.academia_status_pratica, jsonb, text);
drop function if exists public.academia_pratica_enviar(uuid, text, text);
drop function if exists public.academia_quiz_enviar(uuid, jsonb);
drop function if exists public.academia_quiz_iniciar(uuid);
drop function if exists public.academia_marcar_aula(uuid, boolean);
drop function if exists public.academia_recalcular_nivel(uuid);
drop function if exists public.academia_eh_gestor(uuid);

drop table if exists public.academia_presencas;
drop table if exists public.academia_encontros;
drop table if exists public.academia_recomendacoes;
drop table if exists public.academia_regras_recomendacao;
drop table if exists public.academia_indicadores;
drop table if exists public.academia_certificados;
drop table if exists public.academia_atribuicoes;
drop table if exists public.academia_praticas;
drop table if exists public.academia_tentativas;
drop table if exists public.academia_progresso_aulas;
drop table if exists public.academia_niveis_historico;
drop table if exists public.academia_participantes;
drop table if exists public.academia_questoes;
drop table if exists public.academia_aulas;
drop table if exists public.academia_modulos;
drop table if exists public.academia_fases;
drop table if exists public.academia_config;

drop type if exists public.academia_status_recomendacao;
drop type if exists public.academia_status_pratica;
drop type if exists public.academia_tipo_aula;
drop type if exists public.academia_status_conteudo;
drop type if exists public.academia_nivel;

commit;
