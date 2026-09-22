-- CADÊNCIA D1/D2/D3 E REATIVAÇÃO — Fatia 1: fundação (schema, sem motor)
CREATE TABLE IF NOT EXISTS public.cadencia_config (
  id                integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modo              text     NOT NULL DEFAULT 'sombra' CHECK (modo IN ('sombra','ativo')),
  descanso_dias     integer  NOT NULL DEFAULT 15 CHECK (descanso_dias BETWEEN 0 AND 180),
  espera_pos_d3_h   integer  NOT NULL DEFAULT 24 CHECK (espera_pos_d3_h BETWEEN 1 AND 168),
  tolerancia_venc_d integer  NOT NULL DEFAULT 1  CHECK (tolerancia_venc_d BETWEEN 0 AND 30),
  intervalo_min_lig interval NOT NULL DEFAULT '2 minutes',
  lote_estoque_dia  integer  NOT NULL DEFAULT 15 CHECK (lote_estoque_dia BETWEEN 1 AND 200),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cadencia_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.cadencia_config IS
  'Parâmetros da cadência D1/D2/D3. Linha única. modo=sombra|ativo, como o motor de higiene e a régua de devolução.';
COMMENT ON COLUMN public.cadencia_config.modo IS
  'sombra: o motor calcula e loga em cadencia_execucao_log, sem tocar em lead nenhum. ativo: aplica.';
COMMENT ON COLUMN public.cadencia_config.espera_pos_d3_h IS
  'Horas após a mensagem de encerramento do D3 antes de mandar para descanso.';
COMMENT ON COLUMN public.cadencia_config.intervalo_min_lig IS
  'Intervalo mínimo entre duas ligações para que a segunda conte como tentativa nova.';

ALTER TABLE public.cadencia_config ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.cadencia_config TO authenticated;
GRANT ALL    ON public.cadencia_config TO service_role;

DROP POLICY IF EXISTS "cadencia_config leitura autenticada" ON public.cadencia_config;
CREATE POLICY "cadencia_config leitura autenticada"
  ON public.cadencia_config FOR SELECT TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.cadencia_tentativas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  corretor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  etapa       text NOT NULL CHECK (etapa IN ('D1','D2','D3')),
  canal       text NOT NULL CHECK (canal IN ('ligacao','whatsapp')),
  resultado   text NOT NULL CHECK (resultado IN (
                'nao_atendeu','caixa_postal','ocupado','atendeu',
                'enviada','numero_invalido')),
  template_id uuid REFERENCES public.templates_mensagem(id) ON DELETE SET NULL,
  ts          timestamptz NOT NULL DEFAULT now(),
  origem      text NOT NULL DEFAULT 'crm' CHECK (origem IN ('crm','discador','importacao')),
  ciclo       integer NOT NULL DEFAULT 1 CHECK (ciclo >= 1),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cadencia_tentativas_lead_etapa_idx
  ON public.cadencia_tentativas (lead_id, ciclo, etapa, ts);
CREATE INDEX IF NOT EXISTS cadencia_tentativas_corretor_idx
  ON public.cadencia_tentativas (corretor_id, ts DESC);

COMMENT ON TABLE public.cadencia_tentativas IS
  'Fonte da verdade da cadência: uma linha por ligação/mensagem. ts é sempre do servidor.';
COMMENT ON COLUMN public.cadencia_tentativas.ciclo IS
  'Espelha leads.cadencia_ciclo no momento do registro.';

ALTER TABLE public.cadencia_tentativas ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.cadencia_tentativas TO authenticated;
GRANT ALL    ON public.cadencia_tentativas TO service_role;

DROP POLICY IF EXISTS "cadencia_tentativas leitura por acesso ao lead" ON public.cadencia_tentativas;
CREATE POLICY "cadencia_tentativas leitura por acesso ao lead"
  ON public.cadencia_tentativas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = cadencia_tentativas.lead_id
        AND l.corretor_id = auth.uid()
    )
  );

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cadencia_etapa     text,
  ADD COLUMN IF NOT EXISTS cadencia_inicio_ts timestamptz,
  ADD COLUMN IF NOT EXISTS cadencia_prazo_ts  timestamptz,
  ADD COLUMN IF NOT EXISTS cadencia_ciclo     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reativado          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arquivado_em       timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_cadencia_etapa_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_cadencia_etapa_check CHECK (
        cadencia_etapa IS NULL OR cadencia_etapa IN (
          'D1','D2','D3','respondeu','descanso','reativacao','arquivado','encerrado'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leads_cadencia_prazo_idx
  ON public.leads (corretor_id, cadencia_prazo_ts)
  WHERE cadencia_etapa IN ('D1','D2','D3');

CREATE INDEX IF NOT EXISTS leads_cadencia_etapa_prazo_idx
  ON public.leads (cadencia_etapa, cadencia_prazo_ts)
  WHERE cadencia_etapa IN ('D1','D2','D3');

COMMENT ON COLUMN public.leads.cadencia_etapa IS
  'O que o corretor deve fazer agora. Independente de leads.status. NULL = fora da cadência.';
COMMENT ON COLUMN public.leads.cadencia_prazo_ts IS
  'Fim do dia (fuso São Paulo) em que a etapa vence. Ordena a Fila do Dia.';
COMMENT ON COLUMN public.leads.cadencia_ciclo IS
  '1 = primeira passagem. 2 = voltou pela reativação.';
COMMENT ON COLUMN public.leads.reativado IS
  'Lead que voltou à roleta pela base de reativação.';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_motivo_perda_categoria_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_motivo_perda_categoria_check
  CHECK (
    motivo_perda_categoria IS NULL OR motivo_perda_categoria IN (
      'sem_contato','sumiu_pos_proposta','credito_score','credito_renda',
      'estourou_teto','ja_possui_imovel','preco_parcela','comprou_concorrente',
      'timing_adiou','sem_perfil','outro',
      'sem_retorno_cadencia','numero_invalido','opt_out'
    )
  );

CREATE OR REPLACE FUNCTION public.motivo_perda_sem_retrabalho(_motivo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(_motivo, 'outro')
    IN ('ja_possui_imovel', 'comprou_concorrente', 'sem_perfil',
        'numero_invalido', 'opt_out');
$$;

COMMENT ON FUNCTION public.motivo_perda_sem_retrabalho(text) IS
  'Motivos de perda em que reabordar é incômodo, não oportunidade. numero_invalido e opt_out entraram com a cadência (20260921120000); sem_retorno_cadencia fica FORA.';

CREATE TABLE IF NOT EXISTS public.reativacao_fila (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  entrou_em             timestamptz NOT NULL DEFAULT now(),
  elegivel_em           timestamptz NOT NULL,
  origem                text NOT NULL CHECK (origem IN ('cadencia_cumprida','estoque_30d')),
  empreendimento        text,
  faixa_renda           text,
  prioridade            integer NOT NULL DEFAULT 5 CHECK (prioridade BETWEEN 1 AND 9),
  horarios_tentados     jsonb,
  status                text NOT NULL DEFAULT 'aguardando' CHECK (status IN (
                          'aguardando','em_discagem','com_sdr','reativado',
                          'sem_retorno','arquivado')),
  tentativas_reativacao integer NOT NULL DEFAULT 0 CHECK (tentativas_reativacao >= 0),
  sdr_id                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sdr_notas             text,
  finalizado_em         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reativacao_fila_lead_aberta_uq
  ON public.reativacao_fila (lead_id)
  WHERE status IN ('aguardando','em_discagem','com_sdr');

CREATE INDEX IF NOT EXISTS reativacao_fila_elegivel_idx
  ON public.reativacao_fila (status, elegivel_em, prioridade);

COMMENT ON TABLE public.reativacao_fila IS
  'Base de reativação: leads que cumpriram a cadência 100% sem retorno (mais a carga única do estoque parado).';
COMMENT ON COLUMN public.reativacao_fila.prioridade IS
  '1 = maior renda. Espelha a ordem da planilha de follow-up.';
COMMENT ON COLUMN public.reativacao_fila.horarios_tentados IS
  'Resumo das 7 tentativas (faixas de horário e dias da semana já gastos).';

DROP TRIGGER IF EXISTS trg_reativacao_fila_updated_at ON public.reativacao_fila;
CREATE TRIGGER trg_reativacao_fila_updated_at
  BEFORE UPDATE ON public.reativacao_fila
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reativacao_fila ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.reativacao_fila TO authenticated;
GRANT ALL    ON public.reativacao_fila TO service_role;

DROP POLICY IF EXISTS "reativacao_fila leitura gestao e sdr" ON public.reativacao_fila;
CREATE POLICY "reativacao_fila leitura gestao e sdr"
  ON public.reativacao_fila FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR sdr_id = auth.uid()
  );

ALTER TABLE public.templates_mensagem
  ADD COLUMN IF NOT EXISTS contexto text;

CREATE UNIQUE INDEX IF NOT EXISTS templates_mensagem_contexto_ativo_uq
  ON public.templates_mensagem (contexto)
  WHERE contexto IS NOT NULL AND ativo;

COMMENT ON COLUMN public.templates_mensagem.contexto IS
  'Marca o template usado por um fluxo automático (cadencia_D1, cadencia_D2, cadencia_D3).';

INSERT INTO public.templates_mensagem (nome, canal, conteudo, contexto, ativo)
VALUES
  ('Cadência D1 — abertura', 'whatsapp',
   'Oi, {nome}! Tudo bem? Aqui é da Seu Metro Quadrado. Você pediu informações sobre o {empreendimento} e acabei de tentar te ligar. Consigo te explicar as condições em poucos minutos. Fica melhor eu te ligar hoje às 12h ou às 18h?',
   'cadencia_D1', true),
  ('Cadência D2 — insistência', 'whatsapp',
   '{nome}, tentei falar com você de novo hoje sobre o {empreendimento}. Já deixei separadas as condições de entrada e a simulação da parcela para te mostrar. Posso te ligar às 12h ou prefere às 19h?',
   'cadencia_D2', true),
  ('Cadência D3 — encerramento', 'whatsapp',
   '{nome}, como não consegui falar com você, vou encerrar seu atendimento por aqui para não te incomodar. Se ainda quiser saber do {empreendimento}, é só responder esta mensagem que eu retomo com prioridade. Obrigado!',
   'cadencia_D3', true)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.telefone_suspeito(_telefone text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  WITH d AS (SELECT public.telefone_digits(_telefone) AS n)
  SELECT
    CASE
      WHEN (SELECT n FROM d) IS NULL OR length((SELECT n FROM d)) < 10 THEN true
      WHEN (SELECT n FROM d) ~ '^(.)\1+$' THEN true
      WHEN (SELECT n FROM d) LIKE '551195555%' THEN true
      WHEN right((SELECT n FROM d), 8) ~ '^(.)\1+$' THEN true
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.telefone_suspeito(text) IS
  'Telefone que não vale gastar a cadência: curto demais, dígito repetido ou prefixo de teste.';
