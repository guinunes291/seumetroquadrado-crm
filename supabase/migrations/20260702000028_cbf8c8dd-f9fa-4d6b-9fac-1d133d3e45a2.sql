
DELETE FROM public.copa_confrontos WHERE fase_id = '3dd9757e-00a9-4037-80af-09fcdcb2e94c';

INSERT INTO public.copa_confrontos (fase_id, corretor_a_id, corretor_b_id, semana_ref, posicao, definido_manual, is_wo)
VALUES
  ('3dd9757e-00a9-4037-80af-09fcdcb2e94c', '033a6545-2a74-4760-96d2-ff118b337a2a', 'c011118a-a057-4b63-b61d-b43f4b962cea', 8, 1, true, false),
  ('3dd9757e-00a9-4037-80af-09fcdcb2e94c', '277f3912-db60-46b0-92ee-07f641ab10df', '8f0a1cda-03a3-4a59-806e-3c1ba6191be0', 8, 2, true, false),
  ('3dd9757e-00a9-4037-80af-09fcdcb2e94c', '8c38e8e8-1e85-4248-bab8-4663385749d6', '6e09dcdf-0913-4482-b753-b98652be920e', 8, 3, true, false),
  ('3dd9757e-00a9-4037-80af-09fcdcb2e94c', '0c68fad9-b500-402a-b81a-31e925d7485b', '48a2040a-ba08-423f-8ba6-1f1cf5ded3c7', 8, 4, true, false);
