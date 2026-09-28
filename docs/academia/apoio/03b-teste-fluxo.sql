-- Teste local da Academia (Postgres 16 puro, simula Supabase). Uso:
--   createdb t && psql -d t -f 03a-stub-supabase.sql -f 01-migration-academia.sql -f 02-seed-academia.sql -f 03b-teste-fluxo.sql
-- Linhas marcadas 'deve FALHAR' precisam mostrar ERROR com a mensagem da regra.
\set ON_ERROR_STOP 0
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
insert into academia_participantes (corretor_id) values ('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');

-- GESTOR
set role authenticated; select set_config('request.uid','00000000-0000-0000-0000-000000000001',false);
\echo '--- publicar com revisao pendente deve FALHAR'
select academia_publicar_modulo((select id from academia_modulos where codigo='O01'));
update academia_modulos set revisao_pendente=null where codigo in ('O01','M01');
select academia_publicar_modulo((select id from academia_modulos where codigo='O01'));
\echo '--- publicado:'
select codigo,status,versao from academia_modulos where status='publicado';

-- CORRETOR
select set_config('request.uid','00000000-0000-0000-0000-000000000002',false);
\echo '--- corretor ve modulos (so publicados):'; select count(*) from academia_modulos;
\echo '--- corretor ve questoes (deve ser 0):'; select count(*) from academia_questoes;
\echo '--- quiz antes das aulas deve FALHAR'
select academia_quiz_iniciar((select id from academia_modulos where codigo='O01'));
select academia_marcar_aula(id) from academia_aulas where modulo_id=(select id from academia_modulos where codigo='O01');
\echo '--- quiz iniciar (sem gabarito):'
select (academia_quiz_iniciar((select id from academia_modulos where codigo='O01'))->'questoes'->0) ? 'correta' as vazou_gabarito;
-- responder errado tudo
select jsonb_build_object('nota',r->'nota','aprovado',r->'aprovado') from (select academia_quiz_enviar(t.id, '{}'::jsonb) r from academia_tentativas t where enviada_em is null) x;
\echo '--- nova tentativa logo apos reprovar deve FALHAR (intervalo)'
select academia_quiz_iniciar((select id from academia_modulos where codigo='O01'));
reset role;
update academia_tentativas set enviada_em = now() - interval '2 hours';
set role authenticated; select set_config('request.uid','00000000-0000-0000-0000-000000000002',false);
select (academia_quiz_iniciar((select id from academia_modulos where codigo='O01'))->>'tentativa_id') is not null as nova_tentativa;
reset role;
-- monta respostas corretas (como superuser, simula o corretor que acertou)
create temp table resp as select t.id tid, jsonb_object_agg(q.id::text, q.correta) r from academia_tentativas t join academia_questoes q on q.id=any(t.questoes_ids) where t.enviada_em is null group by t.id;
grant select on resp to authenticated;
set role authenticated; select set_config('request.uid','00000000-0000-0000-0000-000000000002',false);
select jsonb_build_object('nota',x->'nota','aprovado',x->'aprovado') from (select academia_quiz_enviar(tid, r) x from resp) y;
\echo '--- nivel apos quiz (pratica pendente => iniciante):'
select nivel, apto from v_academia_corretor_resumo;
select academia_pratica_enviar((select id from academia_modulos where codigo='O01'), 'Fiz o roleplay com a Dayane, 6 perguntas na ordem', null) is not null as pratica_enviada;
\echo '--- corretor tenta avaliar a propria pratica deve FALHAR'
select academia_pratica_avaliar((select id from academia_praticas limit 1),'aprovada','[]','ok');

select set_config('request.uid','00000000-0000-0000-0000-000000000001',false);
\echo '--- gestor sem feedback deve FALHAR'
select academia_pratica_avaliar((select id from academia_praticas limit 1),'aprovada','[]','');
select academia_pratica_avaliar((select id from academia_praticas limit 1),'aprovada','[{"criterio":"Agenda","ok":true}]','Foco: oferecer 2 horarios mais cedo');
\echo '--- visao gestor:'
select corretor_nome, nivel, apto, modulos_concluidos from v_academia_corretor_resumo order by 1;
select para, motivo from academia_niveis_historico;
select nivel from academia_certificados;
\echo '--- veterano: override apto sem motivo deve FALHAR, com motivo OK'
select academia_definir_apto('00000000-0000-0000-0000-000000000003', true, null);
select academia_definir_apto('00000000-0000-0000-0000-000000000003', true, 'Corretor pleno com vendas em 2026, validado pelo Guilherme');
\echo '--- publicar M01 (fase 1) nao deve criar atribuicao em massa:'
select academia_publicar_modulo((select id from academia_modulos where codigo='M01'));
select count(*) atribuicoes from academia_atribuicoes;
\echo '--- recomendacao/atribuicao manual'
select academia_atribuir('00000000-0000-0000-0000-000000000002',(select id from academia_modulos where codigo='M01'), current_date+7, 'teste') is not null;
select academia_atribuir('00000000-0000-0000-0000-000000000002',(select id from academia_modulos where codigo='M01'), current_date+10, 'teste 2') is not null as upsert_ok;
select count(*), max(prazo) from academia_atribuicoes;
select corretor_nome, nivel, apto from v_academia_corretor_resumo order by 1;
\echo '--- corretor ve so o proprio resumo:'
select set_config('request.uid','00000000-0000-0000-0000-000000000002',false);
select count(*) from v_academia_corretor_resumo;
select count(*) from academia_participantes;
