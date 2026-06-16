
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS regiao text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS tipologia text,
  ADD COLUMN IF NOT EXISTS vagas text,
  ADD COLUMN IF NOT EXISTS preco_inicial text,
  ADD COLUMN IF NOT EXISTS entrega_status text;
