-- Copa SMQ: upgrade da v1 (8 semanas, UUID) para a réplica 1:1 do Manus (14 semanas),
-- via ALTER (sem drop das tabelas) — preserva dados. Corretor = UUID (profiles.id);
-- profiles.legacy_user_id é usado apenas no transform de import do histórico.

-- 1) Campos novos do modelo 1:1
ALTER TABLE public.copa_fases ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.copa_fases ALTER COLUMN semana_inicio TYPE text USING semana_inicio::text;
ALTER TABLE public.copa_fases ALTER COLUMN semana_fim TYPE text USING semana_fim::text;
ALTER TABLE public.copa_participantes ADD COLUMN IF NOT EXISTS grupo text;
ALTER TABLE public.copa_confrontos ADD COLUMN IF NOT EXISTS is_wo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_copa_part_grupo ON public.copa_participantes(grupo);
CREATE INDEX IF NOT EXISTS idx_copa_confrontos_semana ON public.copa_confrontos(semana_ref);

-- 2) Edição: janela 03/06 → 08/09 (14 semanas)
UPDATE public.copa_edicao SET data_inicio = '2026-06-03', data_fim = '2026-09-08' WHERE ativo = true;

-- 3) Reseed das fases (9, com tipo + semanas "DD/MM")
DELETE FROM public.copa_fases WHERE edicao_id IN (SELECT id FROM public.copa_edicao WHERE ativo = true);
INSERT INTO public.copa_fases (edicao_id, nome, tipo, ordem, semana_inicio, semana_fim)
SELECT e.id, v.nome, v.tipo, v.ordem, v.si, v.sf
FROM public.copa_edicao e
CROSS JOIN (VALUES
  ('Fase de Grupos','grupos',1,'03/06','21/07'),
  ('Repescagem 1','repescagem1',2,'22/07','28/07'),
  ('Oitavas de Final','oitavas',3,'29/07','04/08'),
  ('Repescagem 2','repescagem2',4,'05/08','11/08'),
  ('Quartas de Final','quartas',5,'12/08','18/08'),
  ('Semifinal','semifinal',6,'19/08','25/08'),
  ('3º Lugar','terceiro',7,'26/08','01/09'),
  ('Grande Final','final',8,'26/08','01/09'),
  ('Premiação','premiacao',9,'02/09','08/09')
) AS v(nome, tipo, ordem, si, sf)
WHERE e.ativo = true;

-- 4) Reseed das 14 seleções (sem participantes ainda → seguro)
DELETE FROM public.copa_selecoes;
INSERT INTO public.copa_selecoes (nome, bandeira) VALUES
  ('Alemanha','🇩🇪'),('Argentina','🇦🇷'),('Bélgica','🇧🇪'),('Brasil','🇧🇷'),
  ('Croácia','🇭🇷'),('Espanha','🇪🇸'),('França','🇫🇷'),('Holanda','🇳🇱'),
  ('Inglaterra','🏴󠁧󠁢󠁥󠁮󠁧󠁿'),('Itália','🇮🇹'),('Japão','🇯🇵'),('Marrocos','🇲🇦'),
  ('Portugal','🇵🇹'),('Uruguai','🇺🇾');

-- 5) Config de pontos (valores reais do Manus: 1/5/10/40) e prêmios oficiais
DELETE FROM public.copa_config_pontos;
INSERT INTO public.copa_config_pontos (chave, label, pontos) VALUES
  ('agendamentos','Agendamento confirmado',1),
  ('visitas','Visita realizada',5),
  ('documentacao','Análise de crédito/Documentação',10),
  ('vendas','Contrato fechado (venda)',40);

DELETE FROM public.copa_config_premios;
INSERT INTO public.copa_config_premios (posicao, descricao, valor, icone, ordem) VALUES
  ('Top 3 – Fase de Grupos','Para cada um dos 3 melhores pontuadores da fase de grupos.','R$ 100,00 cada','🏅',1),
  ('Avanço à Semifinal','Quem avançar das quartas ou repescagem rumo à semifinal.','R$ 250,00','🎖️',2),
  ('3º Lugar','Vencedor da disputa de terceiro lugar.','R$ 900,00','🥉',3),
  ('Vice-Campeão','Finalista derrotado.','R$ 2.000,00','🥈',4),
  ('Campeão','O grande campeão da Copa SMQ.','R$ 4.000,00','🏆',5);
