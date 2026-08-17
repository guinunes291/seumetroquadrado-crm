-- Telefonia Sonax, parte 2: discador AUTOMÁTICO por campanha. O click2call
-- (parte 1) liga um a um e o corretor ouve chamando/caixa postal; o modo
-- campanha inverte — o PABX disca a fila sozinho (descarte_caixa_postal=S) e
-- SÓ conecta ao ramal quem atende. Para isso cada corretor precisa, além do
-- ramal, dos vínculos dele no Sonax:
--
-- * sonax_id_atendente — ID do agente no PABX (AÇÃO login/logout/status; é o
--   <ID_ATENDENTE> dos eventos do webhook);
-- * sonax_id_campanha  — campanha do discador dedicada ao corretor, criada no
--   painel Sonax apontando para a fila que entrega no ramal dele, com
--   descarte de caixa postal ligado.
--
-- A edge function sonax-campanha (JWT do corretor) enfileira os leads na
-- campanha e dá play/stop; o webhook sonax-webhook registra as chamadas que o
-- discador gera (origem=campanha) conforme acontecem.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sonax_id_atendente text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sonax_id_campanha text;

COMMENT ON COLUMN public.profiles.sonax_id_atendente IS
  'ID do atendente/agente do corretor no Sonax PABX (acao=login e variavel <ID_ATENDENTE> do webhook). Necessario para o discador automatico.';
COMMENT ON COLUMN public.profiles.sonax_id_campanha IS
  'ID da campanha do discador Sonax dedicada ao corretor (fila que entrega no ramal dele, com descarte de caixa postal). Necessario para o discador automatico.';

NOTIFY pgrst, 'reload schema';
