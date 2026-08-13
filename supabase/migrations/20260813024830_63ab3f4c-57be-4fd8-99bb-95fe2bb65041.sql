ALTER TABLE public.comissao_ledger DROP CONSTRAINT comissao_ledger_evento_check;
ALTER TABLE public.comissao_ledger ADD CONSTRAINT comissao_ledger_evento_check
  CHECK (evento = ANY (ARRAY['credito'::text, 'estorno'::text, 'desconto_ajustado'::text]));

ALTER TABLE public.comissao_ledger DROP CONSTRAINT comissao_ledger_evento_uk;
CREATE UNIQUE INDEX comissao_ledger_evento_uk
  ON public.comissao_ledger (comissao_id, evento)
  WHERE evento IN ('credito', 'estorno');