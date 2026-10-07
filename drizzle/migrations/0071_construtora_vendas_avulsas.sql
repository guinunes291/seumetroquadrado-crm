UPDATE public.projetos SET construtora='Direcional' WHERE id IN ('52e793bc-aa6b-4923-b557-2c0ba0af0f82','6328019b-df75-4e9d-bed6-623ac87ce574') AND coalesce(trim(construtora),'')='';
UPDATE public.projetos SET construtora='Longitude' WHERE id IN ('651ac42a-8331-4618-afa1-496a45d82d4d','682ef688-3e21-43e7-810e-2d5055a59a09','5886bef8-b9a4-4dae-9d35-4bffcd9a3e5b','c53c4cec-975a-4e83-a25a-dfd054d82368') AND coalesce(trim(construtora),'')='';
UPDATE public.projetos SET construtora='Novvo' WHERE id='7a7e5a06-77b2-43fd-b2e3-2ecf0f4e0014' AND coalesce(trim(construtora),'')='';
UPDATE public.projetos SET construtora='Direcional' WHERE id='8dddf3ac-594d-4872-904a-dfeb97c07606' AND coalesce(trim(construtora),'')='';

-- Vendas lançadas só com o nome do empreendimento (sem vínculo ao cadastro):
-- de/para nome digitado -> construtora, sem tocar na venda.
CREATE TABLE public.vendas_construtora_avulsa (
  projeto_nome text PRIMARY KEY,
  construtora text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendas_construtora_avulsa TO authenticated;
GRANT ALL ON public.vendas_construtora_avulsa TO service_role;
ALTER TABLE public.vendas_construtora_avulsa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura autenticada" ON public.vendas_construtora_avulsa FOR SELECT TO authenticated USING (true);
INSERT INTO public.vendas_construtora_avulsa(projeto_nome, construtora) VALUES
 ('CONDOMÍNIO LIV PARQUE DO CARMO - Econ','Econ'),
 ('DIRECIONAL','Direcional'),
 ('Despertar Sapopemba','Direcional'),
 ('LONGITUDE','Longitude'),
 ('Estilo Lapa','Riva'),
 ('RIVA','Riva'),
 ('VIBRA','Vibra'),
 ('Vibra Mooca','Vibra');