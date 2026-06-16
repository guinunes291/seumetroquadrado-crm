-- Copa 1:1 Manus: corrige as SELEÇÕES e o vínculo corretor -> seleção/grupo.
-- O sorteio aleatório (copa_realizar_sorteio) atribuiu países errados (Catar,
-- Camarões, Canadá, etc.) de um conjunto de seleções incorreto. Aqui fixamos as
-- 14 seleções corretas e o mapa exato do Manus (por legacy_user_id). Os confrontos
-- já criados pelo inicializar batem 1:1 quando as seleções ficam corretas.
-- Idempotente: pode rodar de novo (ex.: após preencher legacy_user_id que faltava).

-- 1) Garante as 14 seleções corretas; ativa só elas.
INSERT INTO public.copa_selecoes (nome, bandeira, ativo)
SELECT v.nome, v.bandeira, true
FROM (VALUES
  ('Espanha','🇪🇸'),('França','🇫🇷'),('Brasil','🇧🇷'),('Bélgica','🇧🇪'),
  ('Alemanha','🇩🇪'),('Argentina','🇦🇷'),('Croácia','🇭🇷'),('Marrocos','🇲🇦'),
  ('Inglaterra','🏴'),('Uruguai','🇺🇾'),('Japão','🇯🇵'),('Itália','🇮🇹'),
  ('Portugal','🇵🇹'),('Holanda','🇳🇱')
) AS v(nome, bandeira)
WHERE NOT EXISTS (SELECT 1 FROM public.copa_selecoes s WHERE s.nome = v.nome);

UPDATE public.copa_selecoes SET ativo = (nome IN
  ('Espanha','França','Brasil','Bélgica','Alemanha','Argentina','Croácia',
   'Marrocos','Inglaterra','Uruguai','Japão','Itália','Portugal','Holanda'));

-- 2) Mapa corretor (legacy_user_id) -> seleção + grupo (exatamente como no Manus).
UPDATE public.copa_participantes cp
SET selecao_id = s.id, grupo = m.grupo
FROM (VALUES
  (38430789::bigint,'Espanha','A'),(39782610,'Brasil','A'),(37980302,'França','A'),
  (38400551,'Bélgica','A'),(38430037,'Alemanha','A'),(38400416,'Argentina','A'),
  (38431527,'Croácia','A'),
  (39780403,'Uruguai','B'),(38400413,'Japão','B'),(37980408,'Inglaterra','B'),
  (38400667,'Marrocos','B'),(37980503,'Itália','B'),(38430149,'Portugal','B'),
  (38431121,'Holanda','B')
) AS m(legacy, pais, grupo)
JOIN public.profiles pr        ON pr.legacy_user_id = m.legacy
JOIN public.copa_selecoes s    ON s.nome = m.pais
WHERE cp.corretor_id = pr.id;
