-- =============================================================================
-- Academia SMQ · Fatia 0 · Controle positivo do SQL de diagnóstico
--
-- NUNCA RODE ISTO EM PRODUÇÃO. Planta dados sintéticos com resposta conhecida
-- e só existe para provar que fatia0-diagnostico.sql ACHA o que existe
-- (regra 2: zero só vale depois de provar que a consulta enxergaria algo).
--
-- Como repetir (harness local, ver scripts/db-harness/README.md):
--   npm run db:up && npm run db:apply          # ou o caminho sem Docker
--   psql "postgresql://postgres:postgres@localhost:54329/postgres" -X \
--     -v ON_ERROR_STOP=1 \
--     -f docs/academia/fatia0-controle-sintetico.sql \
--     -f docs/academia/fatia0-diagnostico.sql \
--     -c ROLLBACK
--
-- O arquivo abre BEGIN e não fecha: o ROLLBACK final desfaz tudo.
-- Os valores esperados de cada indicador estão anotados em cada seção.
-- =============================================================================
BEGIN;
SET LOCAL session_replication_role = replica;  -- sem gatilhos: só dados

CREATE FUNCTION pg_temp.t(_dias int, _hora time) RETURNS timestamptz
LANGUAGE sql AS $$
  SELECT ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') - make_interval(days => _dias)) + _hora)
         AT TIME ZONE 'America/Sao_Paulo'
$$;

-- Pessoas: C1, C2 corretores; B1 bot com papel corretor (tem que sumir).
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'c1@sint.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@sint.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@sint.test');
INSERT INTO public.profiles (id, email, nome, status_conta) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'c1@sint.test', 'Sint C1', 'ativa'),
  ('00000000-0000-0000-0000-0000000000c2', 'c2@sint.test', 'Sint C2', 'ativa'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@sint.test', 'Sint Bot', 'ativa');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'corretor'),
  ('00000000-0000-0000-0000-0000000000c2', 'corretor'),
  ('00000000-0000-0000-0000-0000000000b1', 'corretor');
INSERT INTO public.service_bots (user_id, descricao) VALUES ('00000000-0000-0000-0000-0000000000b1', 'sint');

-- ---------------------------------------------------------------- I1
-- L1 C1 D-5 10:00, whatsapp +45min          -> 45
-- L2 C1 D-4 10:00, chamada saída +2h        -> 120
-- L3 C1 D-4 11:00, nada                     -> sem contato
-- L4 C1 D-3 10:00, gatilho estoque, +10min  -> fora do I1b
-- L5 C2 D-2 10:00, nota mudanca_status +5min (não conta), saiu da fila +3h -> 180
-- L6 B1 D-2 10:00, bot                      -> fora de tudo
-- L7..L10 (bloco I2, D-20) também caem na janela de 30d do I1, sem contato.
-- Esperado I1a: webhook 7 atrib, 1 interação, 1 chamada, 0 msg, 1 saída, 3 com algum | estoque 2, 1, 1
-- Esperado I1b: C1 6 atrib, 2 contatadas, 66.7, mediana 01:22 | C2 1, 1, 0.0, 03:00
INSERT INTO public.leads (id, nome, telefone, corretor_id, status, created_at) VALUES
  ('10000000-0000-0000-0000-000000000001','L1','1',  '00000000-0000-0000-0000-0000000000c1','aguardando_atendimento', pg_temp.t(5,'09:59')),
  ('10000000-0000-0000-0000-000000000002','L2','2',  '00000000-0000-0000-0000-0000000000c1','aguardando_atendimento', pg_temp.t(4,'09:59')),
  ('10000000-0000-0000-0000-000000000003','L3','3',  '00000000-0000-0000-0000-0000000000c1','aguardando_atendimento', pg_temp.t(4,'10:59')),
  ('10000000-0000-0000-0000-000000000004','L4','4',  '00000000-0000-0000-0000-0000000000c1','aguardando_atendimento', pg_temp.t(3,'09:59')),
  ('10000000-0000-0000-0000-000000000005','L5','5',  '00000000-0000-0000-0000-0000000000c2','em_atendimento',         pg_temp.t(2,'09:59')),
  ('10000000-0000-0000-0000-000000000006','L6','6',  '00000000-0000-0000-0000-0000000000b1','aguardando_atendimento', pg_temp.t(2,'09:59'));
INSERT INTO public.distribution_log (id, lead_id, corretor_id, tipo, created_at) VALUES
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','automatica', pg_temp.t(5,'10:00')),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1','automatica', pg_temp.t(4,'10:00')),
  ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c1','automatica', pg_temp.t(4,'11:00')),
  ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000c1','automatica', pg_temp.t(3,'10:00')),
  ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c2','automatica', pg_temp.t(2,'10:00')),
  ('20000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000b1','automatica', pg_temp.t(2,'10:00'));
INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES
  ('20000000-0000-0000-0000-000000000001','{"gatilho":"webhook"}'),
  ('20000000-0000-0000-0000-000000000002','{"gatilho":"webhook"}'),
  ('20000000-0000-0000-0000-000000000003','{"gatilho":"webhook"}'),
  ('20000000-0000-0000-0000-000000000004','{"gatilho":"estoque"}'),
  ('20000000-0000-0000-0000-000000000005','{"gatilho":"webhook"}'),
  ('20000000-0000-0000-0000-000000000006','{"gatilho":"webhook"}');
INSERT INTO public.interacoes (lead_id, autor_id, tipo, direcao, conteudo, created_at) VALUES
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','whatsapp','saida','oi', pg_temp.t(5,'10:45')),
  ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000c1','whatsapp','saida','oi', pg_temp.t(3,'10:10')),
  ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c2','mudanca_status','interna','x', pg_temp.t(2,'10:05'));
INSERT INTO public.chamadas (lead_id, corretor_id, direcao, numero, criado_em) VALUES
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1','saida','2', pg_temp.t(4,'12:00'));
INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, alterado_por, created_at) VALUES
  ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c2','aguardando_atendimento','em_atendimento','00000000-0000-0000-0000-0000000000c2', pg_temp.t(2,'13:00'));

-- ---------------------------------------------------------------- I2
-- Coorte madura [D-37, D-7). Todos atribuídos a C1 em D-20 10:00.
-- L7 só agenda | L8 só histórico (hoje perdido) | L9 nada | L10 estoque, só status atual
-- Esperado C1: coorte 4, estoque 1, passou 3, so_hist 1, so_agenda 1, so_status 1, 75.0, 66.7
INSERT INTO public.leads (id, nome, telefone, corretor_id, status, created_at) VALUES
  ('10000000-0000-0000-0000-000000000007','L7','7',  '00000000-0000-0000-0000-0000000000c1','em_atendimento',   pg_temp.t(20,'09:59')),
  ('10000000-0000-0000-0000-000000000008','L8','8',  '00000000-0000-0000-0000-0000000000c1','perdido',          pg_temp.t(20,'09:59')),
  ('10000000-0000-0000-0000-000000000009','L9','9',  '00000000-0000-0000-0000-0000000000c1','em_atendimento',   pg_temp.t(20,'09:59')),
  ('10000000-0000-0000-0000-000000000010','L10','10','00000000-0000-0000-0000-0000000000c1','visita_realizada', pg_temp.t(20,'09:59'));
INSERT INTO public.distribution_log (id, lead_id, corretor_id, tipo, created_at) VALUES
  ('20000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000c1','automatica', pg_temp.t(20,'10:00')),
  ('20000000-0000-0000-0000-000000000008','10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-0000000000c1','automatica', pg_temp.t(20,'10:00')),
  ('20000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-0000000000c1','automatica', pg_temp.t(20,'10:00')),
  ('20000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-0000000000c1','automatica', pg_temp.t(20,'10:00'));
INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES
  ('20000000-0000-0000-0000-000000000007','{"gatilho":"webhook"}'),
  ('20000000-0000-0000-0000-000000000008','{"gatilho":"webhook"}'),
  ('20000000-0000-0000-0000-000000000009','{"gatilho":"webhook"}'),
  ('20000000-0000-0000-0000-000000000010','{"gatilho":"estoque"}');
-- L7: agendamento de visita criado D-18, visita D-15 realizada (vale para I3 e I4)
INSERT INTO public.agendamentos (lead_id, corretor_id, tipo, status, titulo, data_inicio, data_fim, created_at) VALUES
  ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000c1','visita','realizado','v', pg_temp.t(15,'10:00'), pg_temp.t(15,'11:00'), pg_temp.t(18,'10:00'));
INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, alterado_por, created_at) VALUES
  ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-0000000000c1','em_atendimento','agendado','00000000-0000-0000-0000-0000000000c1', pg_temp.t(19,'10:00'));

-- ---------------------------------------------------------------- I3 / I4
-- C2: L11, L12 realizadas D-20 | L13 realizada D-10 | L14 não compareceu D-10
--     L15 agendada D-3 sem validação | L16 sintética realizada D-10
-- Esperado I3 C2: realizadas 3, nao_comp 1, pendente 1, sinteticas 1, 75.0
-- Esperado I3 C1: realizadas 1, 100.0 (L7)
-- I4 [D-44, D-14): C1 L7 (pasta D-14 depois da visita D-15) -> 1/1 100.0
--                  C2 L11 (análise D-18), L12 (nada)        -> 1/2  50.0
INSERT INTO public.leads (id, nome, telefone, corretor_id, status, created_at) VALUES
  ('10000000-0000-0000-0000-000000000011','L11','11','00000000-0000-0000-0000-0000000000c2','perdido', pg_temp.t(25,'09:00')),
  ('10000000-0000-0000-0000-000000000012','L12','12','00000000-0000-0000-0000-0000000000c2','perdido', pg_temp.t(25,'09:00')),
  ('10000000-0000-0000-0000-000000000013','L13','13','00000000-0000-0000-0000-0000000000c2','perdido', pg_temp.t(25,'09:00')),
  ('10000000-0000-0000-0000-000000000014','L14','14','00000000-0000-0000-0000-0000000000c2','perdido', pg_temp.t(25,'09:00')),
  ('10000000-0000-0000-0000-000000000015','L15','15','00000000-0000-0000-0000-0000000000c2','perdido', pg_temp.t(25,'09:00')),
  ('10000000-0000-0000-0000-000000000016','L16','16','00000000-0000-0000-0000-0000000000c2','perdido', pg_temp.t(25,'09:00'));
INSERT INTO public.agendamentos (lead_id, corretor_id, tipo, status, auto_gerado, titulo, data_inicio, data_fim, created_at) VALUES
  ('10000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000c2','visita','realizado',      false,'v', pg_temp.t(20,'10:00'), pg_temp.t(20,'11:00'), pg_temp.t(22,'10:00')),
  ('10000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000c2','visita','realizado',      false,'v', pg_temp.t(20,'10:00'), pg_temp.t(20,'11:00'), pg_temp.t(22,'10:00')),
  ('10000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-0000000000c2','visita','realizado',      false,'v', pg_temp.t(10,'10:00'), pg_temp.t(10,'11:00'), pg_temp.t(12,'10:00')),
  ('10000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-0000000000c2','visita','nao_compareceu', false,'v', pg_temp.t(10,'10:00'), pg_temp.t(10,'11:00'), pg_temp.t(12,'10:00')),
  ('10000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-0000000000c2','visita','agendado',       false,'v', pg_temp.t(3,'10:00'),  pg_temp.t(3,'11:00'),  pg_temp.t(5,'10:00')),
  ('10000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-0000000000c2','visita','realizado',      true, 'v', pg_temp.t(10,'10:00'), pg_temp.t(10,'11:00'), pg_temp.t(10,'12:00'));
UPDATE public.leads SET pasta_montada_em = pg_temp.t(14,'10:00') WHERE id = '10000000-0000-0000-0000-000000000007';
INSERT INTO public.analises_credito (lead_id, corretor_id, status, created_at) VALUES
  ('10000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000c2','enviada', pg_temp.t(18,'10:00'));
INSERT INTO public.documentacoes (lead_id, tipo, status, updated_at) VALUES
  ('10000000-0000-0000-0000-000000000007','rg','reprovado', pg_temp.t(13,'10:00'));

-- ---------------------------------------------------------------- I5 / I6
-- C2: K1 em_atendimento mov D-10 sem passo | K2 em_atendimento mov D-6 com tarefa futura
--     K3 agendado mov D-1 com agendamento futuro | K4 analise_credito mov D-20 sem passo
--     K5 em formação (D1), fora | 50 leads em lote no mesmo segundo D-12, fora
-- L5 (bloco I1, em_atendimento, mov D-2, sem passo) também é carteira do C2.
-- Esperado C2: carteira 55, lote 50, base 5, p5 3, p7 2, p7/30 1, 40.0, sem passo 3, 60.0
-- Esperado C1: carteira 3 (L7, L9, L10), p5 3, p7 3, p7/30 2, 100.0, sem passo 3, 100.0
INSERT INTO public.leads (id, nome, telefone, corretor_id, status, created_at, ultima_interacao, cadencia_etapa) VALUES
  ('30000000-0000-0000-0000-000000000001','K1','k1','00000000-0000-0000-0000-0000000000c2','em_atendimento',  pg_temp.t(40,'10:00'), pg_temp.t(10,'10:00'), NULL),
  ('30000000-0000-0000-0000-000000000002','K2','k2','00000000-0000-0000-0000-0000000000c2','em_atendimento',  pg_temp.t(40,'10:00'), pg_temp.t(6,'10:00'),  NULL),
  ('30000000-0000-0000-0000-000000000003','K3','k3','00000000-0000-0000-0000-0000000000c2','agendado',        pg_temp.t(40,'10:00'), pg_temp.t(1,'10:00'),  NULL),
  ('30000000-0000-0000-0000-000000000004','K4','k4','00000000-0000-0000-0000-0000000000c2','analise_credito', pg_temp.t(40,'10:00'), pg_temp.t(20,'10:00'), NULL),
  ('30000000-0000-0000-0000-000000000005','K5','k5','00000000-0000-0000-0000-0000000000c2','em_atendimento',  pg_temp.t(40,'10:00'), pg_temp.t(10,'10:01'), 'D1');
INSERT INTO public.leads (nome, telefone, corretor_id, status, created_at, ultima_interacao)
SELECT 'Lote' || g, 'lote' || g, '00000000-0000-0000-0000-0000000000c2', 'em_atendimento',
       pg_temp.t(60,'10:00'), pg_temp.t(12,'17:01:23')
FROM generate_series(1, 50) g;
INSERT INTO public.tarefas (lead_id, corretor_id, titulo, status, data_vencimento) VALUES
  ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c2','ligar','pendente', now() + interval '2 days');
INSERT INTO public.agendamentos (lead_id, corretor_id, tipo, status, titulo, data_inicio, data_fim, created_at) VALUES
  ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c2','visita','agendado','v', now() + interval '3 days', now() + interval '3 days 1 hour', pg_temp.t(1,'10:00'));

-- ---------------------------------------------------------------- I8
-- L8: perdido D-12 pelo próprio C1, categoria credito_renda no evento, depois de agendado
-- M1: perdido D-5 por automação (sem autor), sem evento
-- Esperado: (o próprio corretor, credito_renda, 1, 1) e (automação, (sem evento), 1, 0)
INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, alterado_por, created_at) VALUES
  ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-0000000000c1','agendado','perdido','00000000-0000-0000-0000-0000000000c1', pg_temp.t(12,'10:00'));
INSERT INTO public.lead_eventos (lead_id, tipo, agente, payload, created_at) VALUES
  ('10000000-0000-0000-0000-000000000008','transicao_lead','transicionar_lead',
   '{"de_status":"agendado","para_status":"perdido","motivo_categoria":"credito_renda"}', pg_temp.t(12,'10:00') + interval '1 second');
INSERT INTO public.leads (id, nome, telefone, corretor_id, status, created_at) VALUES
  ('30000000-0000-0000-0000-000000000009','M1','m1','00000000-0000-0000-0000-0000000000c2','perdido', pg_temp.t(40,'10:00'));
INSERT INTO public.lead_status_transitions (lead_id, corretor_id, de_status, para_status, alterado_por, created_at) VALUES
  ('30000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-0000000000c2','em_atendimento','perdido', NULL, pg_temp.t(5,'10:00'));

SET LOCAL session_replication_role = origin;
