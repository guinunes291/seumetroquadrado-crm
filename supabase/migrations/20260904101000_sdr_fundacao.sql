-- Papel SDR — parte 2/3: fundação (dados, acesso e guardas).
--
-- Regra em uma página (docs/politica-sdr-v1.md):
--  * O SDR tem CARTEIRA PRÓPRIA: `leads.sdr_id` é o dono de pré-venda. A base
--    entra por importação, devolução por posse, perdidos reciclados e estoque
--    sem dono — tudo atrás da flag `sdr_ativo` (nasce desligada).
--  * O lead NÃO é copiado. O "espelho" é o MESMO registro com dois acessos:
--    o SDR segue dono de pré-venda (`sdr_id`) e o corretor vira o dono
--    comercial (`corretor_id`). Espelhos extras alocados pelo admin vivem em
--    `lead_acessos` (adicionar/substituir, sempre com motivo).
--  * O SDR pode reaquecer lead PARADO de corretor: sem registro há N dias
--    (`sdr_reaquecer_dias`, 7), abaixo de Análise de crédito e sem visita
--    futura. O corretor mantém a posse e tem prioridade na entrega.
--  * Só admin gerencia o SDR (fora do escopo de equipe do gestor).
--
-- Tudo aqui é aditivo: colunas novas, tabela nova, ramos novos nas funções
-- de acesso (assinaturas preservadas) e policies reescritas com visibilidade
-- IDÊNTICA para admin/gestor/corretor — o SDR só soma ramos.

-- ---------------------------------------------------------------------------
-- 1) Colunas do lead
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sdr_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sdr_entregue_em timestamptz,
  ADD COLUMN IF NOT EXISTS sdr_devolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS sdr_interesse_confirmado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.leads.sdr_id IS
  'Dono de pré-venda (papel sdr). Convive com corretor_id: antes da entrega o corretor é NULL (base do SDR) ou o dono original de um lead parado (reaquecimento); depois da entrega os dois enxergam e editam o mesmo registro.';
COMMENT ON COLUMN public.leads.sdr_entregue_em IS
  'Momento em que o SDR entregou o lead ao corretor (roleta de agendados, prioridade do corretor original ou entrega manual com motivo). NULL = ainda na base do SDR.';
COMMENT ON COLUMN public.leads.sdr_devolvido_em IS
  'Última devolução ao SDR (no-show ou corretor sem registro por sdr_devolucao_dias).';
COMMENT ON COLUMN public.leads.sdr_interesse_confirmado IS
  'Checkbox do SDR: cliente confirmou interesse. Obrigatório (com renda, tipo de renda e decisor) para o SDR marcar o lead como qualificado.';

CREATE INDEX IF NOT EXISTS idx_leads_sdr_carteira
  ON public.leads (sdr_id, status)
  WHERE sdr_id IS NOT NULL AND deleted_at IS NULL;

-- Trigger de posse (v2) já toca ultima_atividade_em quando corretor_id muda;
-- a troca de sdr_id também é atividade — mantém o mesmo relógio.
CREATE OR REPLACE FUNCTION public._touch_lead_atividade_sdr()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sdr_id IS DISTINCT FROM OLD.sdr_id THEN
    NEW.ultima_atividade_em := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lead_touch_sdr ON public.leads;
CREATE TRIGGER trg_lead_touch_sdr
  BEFORE UPDATE OF sdr_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public._touch_lead_atividade_sdr();

-- ---------------------------------------------------------------------------
-- 2) Espelhos extras: lead_acessos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel text NOT NULL DEFAULT 'corretor_espelho'
    CHECK (papel IN ('corretor_espelho')),
  motivo text NOT NULL,
  concedido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  concedido_em timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true,
  removido_em timestamptz,
  removido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo_remocao text
);

COMMENT ON TABLE public.lead_acessos IS
  'Espelhos extras de um lead (decisão SDR 2026-09-04): corretores adicionais que enxergam e editam o mesmo registro sem serem o dono comercial. Só o admin concede/remove, sempre com motivo. Escrita exclusiva por RPC.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_acessos_ativo
  ON public.lead_acessos (lead_id, user_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_lead_acessos_user_ativo
  ON public.lead_acessos (user_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_lead_acessos_lead
  ON public.lead_acessos (lead_id);

ALTER TABLE public.lead_acessos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lead_acessos FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.lead_acessos TO authenticated;
GRANT ALL ON TABLE public.lead_acessos TO service_role;

-- Leitura: quem enxerga o lead enxerga seus espelhos (pode_acessar_lead é
-- SECURITY DEFINER — sem recursão de policy entre leads e lead_acessos).
DROP POLICY IF EXISTS lead_acessos_select ON public.lead_acessos;
CREATE POLICY lead_acessos_select ON public.lead_acessos
  FOR SELECT TO authenticated
  USING (public.pode_acessar_lead((SELECT auth.uid()), lead_id));

-- ---------------------------------------------------------------------------
-- 3) Flag e réguas do SDR (distribuicao_settings — recalibrar não exige deploy)
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('sdr_ativo', 'false'::jsonb,
   'Liga o modelo SDR: importação, estoque, devolvidos e perdidos passam a alimentar a base dos SDRs; roleta de agendados ativa. Rollback = false.'),
  ('sdr_reaquecer_dias', '7'::jsonb,
   'Dias sem registro para um lead de corretor (abaixo de Análise de crédito, sem visita futura) aparecer na aba Reaquecer do SDR.'),
  ('sdr_devolucao_dias', '7'::jsonb,
   'Dias sem registro do corretor em lead entregue pelo SDR até o lead voltar à base do SDR.'),
  ('sdr_perdidos_dias', '30'::jsonb,
   'Dias após a perda para o lead perdido entrar na base do SDR (exceto já possui imóvel, comprou concorrente, sem perfil e opt-out).'),
  ('sdr_comissao_percentual', '0'::jsonb,
   'Percentual do VGV creditado ao SDR na aprovação de venda de lead com sdr_id. 0 = sem comissão de SDR.'),
  ('sdr_meta_contatos_dia', '40'::jsonb, 'Meta diária de contatos (ligação/WhatsApp) por SDR — Raio-X do SDR.'),
  ('sdr_meta_agendamentos_semana', '8'::jsonb, 'Meta semanal de visitas agendadas por SDR — Raio-X do SDR.'),
  ('sdr_meta_comparecimento_pct', '60'::jsonb, 'Meta de comparecimento (%) das visitas agendadas pelo SDR — Raio-X do SDR.')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public._sdr_ativo()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.get_dist_setting('sdr_ativo') #>> '{}')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION public._sdr_setting_int(_chave text, _default int)
RETURNS int
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.get_dist_setting(_chave) #>> '{}')::int, _default);
$$;

REVOKE ALL ON FUNCTION public._sdr_ativo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._sdr_ativo() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._sdr_setting_int(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._sdr_setting_int(text, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Roleta de agendados do SDR (tipo novo 'sdr'; regras próprias no motor)
-- ---------------------------------------------------------------------------
INSERT INTO public.roletas (slug, nome, descricao, ativo, criterio_participacao,
                            exigir_presenca, permitir_fora_horario, tipo)
VALUES (
  'agendados-sdr',
  'Agendados do SDR',
  'Recebe os leads que o SDR agendou ou entregou com motivo. Aptidão própria: perfil ativo, telefone, teto de carteira (disjuntor) e agenda livre no horário da visita — sem presença do dia nem cota diária. Time montado pelo admin.',
  true, 'manual', false, true, 'sdr'
)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5) Reaquecimento: o que o SDR pode pegar da carteira dos corretores
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER de propósito: é chamada de dentro da policy de leads e lê
-- agendamentos — como função do dono da tabela, não dispara a policy de
-- agendamentos (que, por sua vez, consulta leads) e evita recursão de RLS.
CREATE OR REPLACE FUNCTION public.lead_reaquecivel_sdr(_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public._sdr_ativo() AND EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = _lead_id
      AND l.deleted_at IS NULL
      AND l.na_lixeira = false
      AND l.sdr_id IS NULL
      AND l.corretor_id IS NOT NULL
      AND l.status IN (
        'aguardando_atendimento','aguardando_retorno','qualificacao_corretor',
        'em_atendimento','qualificado','agendado','visita_realizada'
      )
      AND l.ultima_atividade_em < now()
          - make_interval(days => public._sdr_setting_int('sdr_reaquecer_dias', 7))
      AND NOT EXISTS (
        SELECT 1 FROM public.agendamentos a
        WHERE a.lead_id = l.id
          AND a.deleted_at IS NULL
          AND a.status IN ('agendado','confirmado','remarcado')
          AND a.data_inicio > now()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.lead_reaquecivel_sdr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lead_reaquecivel_sdr(uuid) TO authenticated, service_role;

-- Conjunto de leads em que o usuário é espelho extra — avaliado 1x por query
-- (InitPlan) nas policies, no padrão de corretores_do_gestor.
CREATE OR REPLACE FUNCTION public.leads_espelhados(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT a.lead_id FROM public.lead_acessos a
  WHERE a.user_id = _user_id AND a.ativo;
$$;

REVOKE ALL ON FUNCTION public.leads_espelhados(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leads_espelhados(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Autorização central — ramos do SDR (assinaturas preservadas)
-- ---------------------------------------------------------------------------
-- pode_acessar_lead: + dono de pré-venda, + espelho extra, + reaquecimento.
CREATE OR REPLACE FUNCTION public.pode_acessar_lead(
  _user_id uuid,
  _lead_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_active_member(_user_id)
     AND EXISTS (
       SELECT 1
       FROM public.leads AS l
       WHERE l.id = _lead_id
         AND (
           l.corretor_id = _user_id
           OR l.sdr_id = _user_id
           OR public.has_role(_user_id, 'admin'::public.app_role)
           OR public.has_role(_user_id, 'superintendente'::public.app_role)
           OR (
             public.has_role(_user_id, 'gestor'::public.app_role)
             AND l.corretor_id IS NOT NULL
             AND EXISTS (
               SELECT 1
               FROM public.profiles AS gestor
               JOIN public.profiles AS corretor ON corretor.id = l.corretor_id
               WHERE gestor.id = _user_id
                 AND (
                   (gestor.equipe_id IS NOT NULL AND gestor.equipe_id = corretor.equipe_id)
                   OR EXISTS (
                     SELECT 1
                     FROM public.equipes AS e
                     WHERE e.id = corretor.equipe_id
                       AND e.gestor_id = _user_id
                   )
                 )
             )
           )
           OR EXISTS (
             SELECT 1 FROM public.lead_acessos AS a
             WHERE a.lead_id = l.id AND a.user_id = _user_id AND a.ativo
           )
           OR (
             public.has_role(_user_id, 'sdr'::public.app_role)
             AND public.lead_reaquecivel_sdr(l.id)
           )
         )
     );
$$;

-- pode_atribuir_lead: o SDR passa no WITH CHECK das linhas que acessa. A
-- POSSE (corretor_id / sdr_id / sdr_entregue_em) continua fora do alcance
-- dele por UPDATE direto — o trigger sdr_guarda_posse abaixo barra — e só
-- muda pelas RPCs do motor SDR.
CREATE OR REPLACE FUNCTION public.pode_atribuir_lead(
  _user_id uuid,
  _corretor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_active_member(_user_id)
     AND (
       public.has_role(_user_id, 'admin'::public.app_role)
       OR public.has_role(_user_id, 'superintendente'::public.app_role)
       OR (
         public.has_role(_user_id, 'corretor'::public.app_role)
         AND _corretor_id = _user_id
       )
       OR public.has_role(_user_id, 'sdr'::public.app_role)
       OR (
         public.has_role(_user_id, 'gestor'::public.app_role)
         AND _corretor_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.profiles AS gestor
           JOIN public.profiles AS corretor ON corretor.id = _corretor_id
           WHERE gestor.id = _user_id
             AND (
               (gestor.equipe_id IS NOT NULL AND gestor.equipe_id = corretor.equipe_id)
               OR EXISTS (
                 SELECT 1
                 FROM public.equipes AS e
                 WHERE e.id = corretor.equipe_id
                   AND e.gestor_id = _user_id
               )
             )
         )
       )
     );
$$;

-- ---------------------------------------------------------------------------
-- 7) Policies de SELECT (padrão InitPlan da 20260718100000) — só somam ramos
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "leads_select_carteira" ON public.leads;
CREATE POLICY "leads_select_carteira"
  ON public.leads FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_member(auth.uid()))
    AND (
      corretor_id = (SELECT auth.uid())
      OR sdr_id = (SELECT auth.uid())
      OR (SELECT public.ve_carteira_completa(auth.uid()))
      OR corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
      OR id IN (SELECT public.leads_espelhados(auth.uid()))
      -- Reaquecer: só para o papel sdr (o InitPlan booleano corta o custo da
      -- função por linha para todos os outros papéis).
      OR (
        (SELECT public.has_role(auth.uid(), 'sdr'::public.app_role))
        AND public.lead_reaquecivel_sdr(id)
      )
    )
  );

DROP POLICY IF EXISTS "tarefas_select_carteira" ON public.tarefas;
CREATE POLICY "tarefas_select_carteira"
  ON public.tarefas FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_member(auth.uid()))
    AND (
      (
        lead_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.leads AS l
          WHERE l.id = lead_id
            AND (
              l.corretor_id = (SELECT auth.uid())
              OR l.sdr_id = (SELECT auth.uid())
              OR (SELECT public.ve_carteira_completa(auth.uid()))
              OR l.corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
              OR l.id IN (SELECT public.leads_espelhados(auth.uid()))
            )
        )
      )
      OR (
        lead_id IS NULL
        AND corretor_id IS NOT NULL
        AND (
          corretor_id = (SELECT auth.uid())
          OR (SELECT public.ve_carteira_completa(auth.uid()))
          OR corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
        )
      )
    )
  );

DROP POLICY IF EXISTS "agendamentos_select_carteira" ON public.agendamentos;
CREATE POLICY "agendamentos_select_carteira"
  ON public.agendamentos FOR SELECT TO authenticated
  USING (
    (SELECT public.is_active_member(auth.uid()))
    AND (
      (
        lead_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.leads AS l
          WHERE l.id = lead_id
            AND (
              l.corretor_id = (SELECT auth.uid())
              OR l.sdr_id = (SELECT auth.uid())
              OR (SELECT public.ve_carteira_completa(auth.uid()))
              OR l.corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
              OR l.id IN (SELECT public.leads_espelhados(auth.uid()))
            )
        )
      )
      OR (
        lead_id IS NULL
        AND corretor_id IS NOT NULL
        AND (
          corretor_id = (SELECT auth.uid())
          OR (SELECT public.ve_carteira_completa(auth.uid()))
          OR corretor_id IN (SELECT public.corretores_do_gestor(auth.uid()))
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 8) Guardas do SDR na tabela de leads
-- ---------------------------------------------------------------------------
-- a) Posse: o SDR cria leads SEMPRE na própria base (sdr_id = ele, sem
--    corretor, aguardando atendimento, classe base) e nunca troca posse por
--    UPDATE direto. O motor SDR (RPCs) abre a exceção via app.sdr_motor.
CREATE OR REPLACE FUNCTION public.sdr_guarda_posse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR current_setting('app.sdr_motor', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT public.has_role(_uid, 'sdr'::public.app_role)
     OR public.has_role(_uid, 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.sdr_id := _uid;
    NEW.corretor_id := NULL;
    NEW.classe_lead := 'base';
    NEW.sdr_entregue_em := NULL;
    IF NEW.status IN ('novo'::public.lead_status, 'aguardando_corretor'::public.lead_status) THEN
      NEW.status := 'aguardando_atendimento'::public.lead_status;
    END IF;
    NEW.data_distribuicao := COALESCE(NEW.data_distribuicao, now());
    NEW.timestamp_recebimento := COALESCE(NEW.timestamp_recebimento, now());
    RETURN NEW;
  END IF;

  IF NEW.corretor_id IS DISTINCT FROM OLD.corretor_id
     OR NEW.sdr_id IS DISTINCT FROM OLD.sdr_id
     OR NEW.sdr_entregue_em IS DISTINCT FROM OLD.sdr_entregue_em THEN
    RAISE EXCEPTION 'SDR não altera a posse do lead diretamente — use Agendar visita, Entregar ou Pegar para reaquecer'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.sdr_guarda_posse() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sdr_guarda_posse ON public.leads;
CREATE TRIGGER trg_sdr_guarda_posse
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.sdr_guarda_posse();

-- b) Qualificado: critério objetivo do SDR (decisão: campos + interesse
--    confirmado). Vale quando é o PRÓPRIO SDR movendo um lead ainda não
--    entregue — o corretor que qualifica o lead dele segue a régua de sempre.
CREATE OR REPLACE FUNCTION public.sdr_guarda_qualificado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status <> 'qualificado'::public.lead_status
     OR OLD.status = 'qualificado'::public.lead_status
     OR NEW.sdr_id IS NULL
     OR NEW.sdr_entregue_em IS NOT NULL
     OR auth.uid() IS DISTINCT FROM NEW.sdr_id THEN
    RETURN NEW;
  END IF;

  IF NOT NEW.sdr_interesse_confirmado THEN
    RAISE EXCEPTION 'Para qualificar, marque "Interesse confirmado" na ficha do lead'
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(NEW.renda_informada), '') IS NULL AND COALESCE(NEW.renda_estimada, 0) <= 0 THEN
    RAISE EXCEPTION 'Para qualificar, informe a renda do cliente'
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(NEW.tipo_renda), '') IS NULL THEN
    RAISE EXCEPTION 'Para qualificar, informe o tipo de renda (CLT, autônomo…)'
      USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(NEW.decisor), '') IS NULL THEN
    RAISE EXCEPTION 'Para qualificar, informe quem decide a compra'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.sdr_guarda_qualificado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sdr_guarda_qualificado ON public.leads;
CREATE TRIGGER trg_sdr_guarda_qualificado
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.sdr_guarda_qualificado();

-- ---------------------------------------------------------------------------
-- 9) Sanidade
-- ---------------------------------------------------------------------------
DO $$
DECLARE _def text;
BEGIN
  _def := pg_get_functiondef('public.pode_acessar_lead(uuid,uuid)'::regprocedure);
  IF position('l.sdr_id = _user_id' IN _def) = 0 OR position('lead_acessos' IN _def) = 0
     OR position('lead_reaquecivel_sdr' IN _def) = 0 THEN
    RAISE EXCEPTION 'pode_acessar_lead sem os ramos do SDR';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.roletas WHERE slug = 'agendados-sdr' AND tipo = 'sdr') THEN
    RAISE EXCEPTION 'roleta agendados-sdr ausente';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
