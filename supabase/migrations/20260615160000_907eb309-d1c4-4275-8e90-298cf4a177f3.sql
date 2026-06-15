-- Correção crítica: alerta_agendamento_criado() referenciava NEW.data_agendada,
-- coluna que não existe em agendamentos (o correto é data_inicio). Como o trigger
-- é AFTER INSERT, todo INSERT em agendamentos falhava com rollback. Recria a função
-- com a coluna correta, mantendo assinatura, SECURITY DEFINER e search_path.

CREATE OR REPLACE FUNCTION public.alerta_agendamento_criado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.corretor_id IS NOT NULL THEN
    INSERT INTO public.alertas (user_id, tipo, titulo, mensagem, link, ref_id)
    VALUES (
      NEW.corretor_id,
      'agendamento_proximo',
      'Novo agendamento: ' || COALESCE(NEW.titulo, 'sem título'),
      'Data: ' || to_char(NEW.data_inicio, 'DD/MM/YYYY HH24:MI'),
      '/agendamentos',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.alerta_agendamento_criado() FROM PUBLIC, anon, authenticated;
