-- Telefonia, parte 4: o discador passa a ser o 3C Plus (decisão 2026-09-15).
-- Desenho completo em docs/integracoes/3cplus-discador.md.
--
-- O que muda em relação ao Sonax (partes 1–3, mantidas como legado):
-- * No 3C Plus, TODA ação do agente (login na campanha, discagem manual,
--   qualificação) exige o token do PRÓPRIO agente — o token do gestor não
--   serve. Cada corretor precisa, portanto, de um token próprio guardado no
--   CRM. Ele mora nesta tabela, e não em `profiles`, por dois motivos:
--   (1) `profiles` é lida por todo mundo (nome do corretor aparece em
--   dezenas de telas) e um segredo não pode viajar junto; (2) privilégios
--   POR COLUNA: `api_token` é gravável pelo app (o corretor cola o token) mas
--   NUNCA legível por `authenticated` — só a service_role das edge functions
--   lê. Um `select *` do browser falha com 42501; a tela lê só as colunas
--   liberadas (e mostra "token atualizado em …", nunca o valor).
-- * Os vínculos não secretos (ID do agente e ID da campanha dedicada) ficam
--   na mesma linha: uma peça só por corretor, sem alargar `profiles` de novo.
-- * A qualificação (tabulação) chega pelo webhook `call-history-was-created`,
--   então o mapeamento qualificação -> etapa (gestao_config
--   `telefonia_tabulacao_status`, da parte 3) ganha o default de follow-up
--   que "pediu retorno" exige e passa a ser aplicado em tempo de evento, sem
--   polling de arquivo.
--
-- `chamadas` não muda de forma: `provider` = '3cplus' e `provider_call_id` =
-- `sid` do CallHistory do 3C Plus (chave de idempotência do webhook).

CREATE TABLE IF NOT EXISTS public.telefonia_agentes (
  -- CASCADE: sem o perfil não há agente para vincular; a chamada histórica
  -- (`chamadas`) sobrevive sozinha, com corretor_id.
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT '3cplus' CHECK (provider IN ('3cplus')),
  -- ID do usuário/agente no 3C Plus (GET /users). Casa `agent.id` dos
  -- eventos do webhook com o corretor; opcional (o e-mail é o fallback).
  agent_id text,
  -- Campanha do discador DEDICADA ao corretor (o agente loga nela; o
  -- discador só entrega chamadas a quem está logado na campanha).
  campaign_id text,
  -- Token de API do AGENTE (fixo, não expira; o corretor vê o dele no 3C
  -- Plus). Write-only para o app — ver GRANTs por coluna abaixo.
  api_token text,
  -- Carimbo mantido pelo trigger (nunca pelo cliente): quando o token mudou.
  token_atualizado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.telefonia_agentes IS
  'Vinculo de cada corretor com o discador 3C Plus: ID do agente, campanha dedicada e token de API do agente. api_token e gravavel pelo app (self-service do corretor ou admin) mas legivel SO pela service_role (privilegio por coluna) — as edge functions tcplus-* usam o token em nome do corretor.';
COMMENT ON COLUMN public.telefonia_agentes.api_token IS
  'Token de API do agente no 3C Plus. Write-only para authenticated (sem GRANT SELECT nesta coluna); lido apenas pelas edge functions via service_role.';

-- Normaliza (vazio -> NULL), carimba atualizado_em e marca a troca do token.
CREATE OR REPLACE FUNCTION public.tg_telefonia_agentes_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.agent_id := NULLIF(btrim(NEW.agent_id), '');
  NEW.campaign_id := NULLIF(btrim(NEW.campaign_id), '');
  NEW.api_token := NULLIF(btrim(NEW.api_token), '');
  NEW.atualizado_em := now();
  IF TG_OP = 'INSERT' THEN
    NEW.token_atualizado_em := CASE WHEN NEW.api_token IS NULL THEN NULL ELSE now() END;
  ELSIF NEW.api_token IS DISTINCT FROM OLD.api_token THEN
    NEW.token_atualizado_em := CASE WHEN NEW.api_token IS NULL THEN NULL ELSE now() END;
  ELSE
    -- O cliente não tem UPDATE nesta coluna, mas a service_role tem: o
    -- carimbo só muda quando o token muda.
    NEW.token_atualizado_em := OLD.token_atualizado_em;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS telefonia_agentes_touch ON public.telefonia_agentes;
CREATE TRIGGER telefonia_agentes_touch
  BEFORE INSERT OR UPDATE ON public.telefonia_agentes
  FOR EACH ROW EXECUTE FUNCTION public.tg_telefonia_agentes_touch();

ALTER TABLE public.telefonia_agentes ENABLE ROW LEVEL SECURITY;

-- Leitura (das colunas liberadas): o próprio corretor e a gestão — a tela de
-- Corretores mostra "agente/campanha/token configurado" sem expor o token.
DROP POLICY IF EXISTS telefonia_agentes_select ON public.telefonia_agentes;
CREATE POLICY telefonia_agentes_select ON public.telefonia_agentes
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'gestor'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'superintendente'::public.app_role)
  );

-- Escrita: o próprio corretor (self-service: cola o token dele) e o admin
-- (cadastra agente/campanha e pode trocar o token de qualquer um).
DROP POLICY IF EXISTS telefonia_agentes_insert ON public.telefonia_agentes;
CREATE POLICY telefonia_agentes_insert ON public.telefonia_agentes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS telefonia_agentes_update ON public.telefonia_agentes;
CREATE POLICY telefonia_agentes_update ON public.telefonia_agentes
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS telefonia_agentes_delete ON public.telefonia_agentes;
CREATE POLICY telefonia_agentes_delete ON public.telefonia_agentes
  FOR DELETE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

-- Privilégios POR COLUNA: `api_token` entra no INSERT/UPDATE (o app grava),
-- mas fica FORA do SELECT (o app nunca lê). `token_atualizado_em` é só do
-- trigger. PostgREST respeita: `select=api_token` devolve 42501.
REVOKE ALL ON TABLE public.telefonia_agentes FROM PUBLIC, anon, authenticated;
GRANT SELECT (user_id, provider, agent_id, campaign_id, token_atualizado_em, criado_em, atualizado_em)
  ON public.telefonia_agentes TO authenticated;
GRANT INSERT (user_id, provider, agent_id, campaign_id, api_token)
  ON public.telefonia_agentes TO authenticated;
GRANT UPDATE (agent_id, campaign_id, api_token)
  ON public.telefonia_agentes TO authenticated;
GRANT DELETE ON public.telefonia_agentes TO authenticated;
GRANT ALL ON TABLE public.telefonia_agentes TO service_role;

-- Qualificação -> etapa: o mesmo mapeamento da parte 3 (chaves normalizadas,
-- sem acento/maiúsculas) passa a valer para as qualificações do 3C Plus e é
-- aplicado pelo webhook em tempo de evento. "pediu retorno" ->
-- aguardando_retorno exige follow-up FUTURO na RPC transicionar_lead; sem um
-- default a transição sempre falharia. `followup_padrao_horas` é esse
-- default (ajustável pelo admin sem deploy). Não sobrescreve ajustes já
-- feitos no mapeamento.
UPDATE public.gestao_config
   SET valor = valor || jsonb_build_object('followup_padrao_horas', 24),
       descricao = 'Qualificacao (tabulacao) do discador 3C Plus -> etapa do funil (lead_status). Chaves normalizadas (minusculas, sem acento). Aplicado pela edge function tcplus-webhook (evento call-history-was-created) via RPC transicionar_lead; qualificacao sem entrada aqui so fica registrada na chamada. followup_padrao_horas: prazo do follow-up criado quando a etapa alvo exige um (aguardando_retorno). Alinhe os nomes com as qualificacoes criadas no 3C Plus.'
 WHERE chave = 'telefonia_tabulacao_status'
   AND NOT (valor ? 'followup_padrao_horas');

COMMENT ON TABLE public.chamadas IS
  'Historico de ligacoes da telefonia. Provider atual: 3cplus — saida gravada pela edge function tcplus-discar (JWT do corretor, RLS) e pelo webhook tcplus-webhook (service_role, idempotente por provider_call_id = sid do CallHistory); provider sonax e legado (partes 1-3). O webhook ecoa em interacoes (tipo ligacao) para alimentar a timeline do lead.';
COMMENT ON COLUMN public.profiles.ramal_sonax IS
  'LEGADO (Sonax, substituido pelo 3C Plus em 2026-09-15; vinculo atual em telefonia_agentes). Ramal do corretor no Sonax PABX Virtual.';
COMMENT ON COLUMN public.profiles.sonax_id_atendente IS
  'LEGADO (Sonax, substituido pelo 3C Plus em 2026-09-15; vinculo atual em telefonia_agentes).';
COMMENT ON COLUMN public.profiles.sonax_id_campanha IS
  'LEGADO (Sonax, substituido pelo 3C Plus em 2026-09-15; vinculo atual em telefonia_agentes).';

NOTIFY pgrst, 'reload schema';
