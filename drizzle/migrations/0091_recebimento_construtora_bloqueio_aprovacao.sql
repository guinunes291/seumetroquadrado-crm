ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS nf_emitida_em date;
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS valor_recebido numeric;
COMMENT ON COLUMN public.vendas.nf_emitida_em IS 'Recebimento da construtora: data de emissão da NF (separado do pagamento ao time).';
COMMENT ON COLUMN public.vendas.valor_recebido IS 'Recebimento da construtora: valor efetivamente recebido (data em data_recebimento).';

DO $do$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.aprovar_venda(uuid,public.status_venda,text)'::regprocedure);
  n := replace(d, $a$  PERFORM set_config('app.aprovar_venda', 'on', true);$a$,
$b$  IF p_decisao = 'aprovada'::public.status_venda
     AND _venda.projeto_id IS NULL THEN
    RAISE EXCEPTION 'venda sem empreendimento: vincule o empreendimento antes de aprovar'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.aprovar_venda', 'on', true);$b$);
  IF n = d THEN RAISE EXCEPTION 'trecho 1 não encontrado'; END IF;
  d := n;
  n := replace(d, $a$  RETURNING * INTO _resultado;$a$,
$b$  RETURNING * INTO _resultado;

  IF p_decisao = 'aprovada'::public.status_venda AND EXISTS (
    SELECT 1 FROM public.comissoes c
    WHERE c.venda_id = p_venda_id AND c.beneficiario_id IS NULL
      AND c.status <> 'cancelada' AND COALESCE(c.valor_comissao, 0) > 0
  ) THEN
    RAISE EXCEPTION 'venda com beneficiário "a atribuir": defina gerente e superintendente da equipe do corretor antes de aprovar'
      USING ERRCODE = '22023';
  END IF;$b$);
  IF n = d THEN RAISE EXCEPTION 'trecho 2 não encontrado'; END IF;
  EXECUTE n;
END $do$;
NOTIFY pgrst, 'reload schema';