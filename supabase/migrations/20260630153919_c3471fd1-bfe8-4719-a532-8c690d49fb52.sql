-- Bloco D: limpar referências órfãs de corretor_id
-- Tabelas com nullable=YES → NULL
UPDATE public.leads SET corretor_id = NULL
WHERE corretor_id IS NOT NULL
  AND corretor_id NOT IN (SELECT id FROM public.profiles);

UPDATE public.vendas SET corretor_id = NULL
WHERE corretor_id IS NOT NULL
  AND corretor_id NOT IN (SELECT id FROM public.profiles);

UPDATE public.analises_credito SET corretor_id = NULL
WHERE corretor_id IS NOT NULL
  AND corretor_id NOT IN (SELECT id FROM public.profiles);

-- Tabelas com NOT NULL → reatribui ao sistema
UPDATE public.agendamentos
   SET corretor_id = '07699874-e860-47f1-971b-a6bf3f71ae6f'
WHERE corretor_id NOT IN (SELECT id FROM public.profiles);

UPDATE public.tarefas
   SET corretor_id = '07699874-e860-47f1-971b-a6bf3f71ae6f'
WHERE corretor_id NOT IN (SELECT id FROM public.profiles);