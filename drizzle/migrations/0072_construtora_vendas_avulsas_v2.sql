UPDATE public.projetos SET construtora='Direcional' WHERE id IN ('52e793bc-aa6b-4923-b557-2c0ba0af0f82','6328019b-df75-4e9d-bed6-623ac87ce574') AND coalesce(trim(construtora),'')='';
UPDATE public.projetos SET construtora='Longitude' WHERE id IN ('651ac42a-8331-4618-afa1-496a45d82d4d','682ef688-3e21-43e7-810e-2d5055a59a09','5886bef8-b9a4-4dae-9d35-4bffcd9a3e5b','c53c4cec-975a-4e83-a25a-dfd054d82368','8dddf3ac-594d-4872-904a-dfeb97c07606') AND coalesce(trim(construtora),'')='';
UPDATE public.projetos SET construtora='Novvo' WHERE id='7a7e5a06-77b2-43fd-b2e3-2ecf0f4e0014' AND coalesce(trim(construtora),'')='';
UPDATE public.projetos SET construtora='Vibra' WHERE id='73a25ec3-951a-479d-b94a-6857bf96b1b9';
CREATE TABLE IF NOT EXISTS public.vendas_construtora_avulsa (
  projeto_nome text PRIMARY KEY,
  construtora text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendas_construtora_avulsa TO authenticated;
GRANT ALL ON public.vendas_construtora_avulsa TO service_role;
ALTER TABLE public.vendas_construtora_avulsa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leitura autenticada" ON public.vendas_construtora_avulsa;
CREATE POLICY "leitura autenticada" ON public.vendas_construtora_avulsa FOR SELECT TO authenticated USING (true);
INSERT INTO public.vendas_construtora_avulsa(projeto_nome, construtora) VALUES
 ('CONDOMÍNIO LIV PARQUE DO CARMO - Econ','Econ'),
 ('DIRECIONAL','Direcional'),
 ('Despertar Sapopemba','Direcional'),
 ('LONGITUDE','Longitude'),
 ('Zen Residence','Longitude'),
 ('Estilo Lapa','Riva'),
 ('RIVA','Riva'),
 ('VIBRA','Vibra'),
 ('Vibra Mooca','Vibra')
ON CONFLICT (projeto_nome) DO UPDATE SET construtora=EXCLUDED.construtora, updated_at=now();