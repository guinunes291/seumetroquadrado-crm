-- Replicação Manus — Fase 2a: Gamificação (motor de pontuação) + metas diárias.
-- Tabelas: configuracao_pontuacao, atividades_diarias, metas_diarias, alertas_produtividade.
-- A pontuação é calculada NO BANCO via triggers nas interações/agendamentos/transições/vendas
-- (otimização vs. legado, que somava em código). Pontos por atividade são configuráveis.

-- 1) Configuração de pontos por atividade ------------------------------------
CREATE TABLE public.configuracao_pontuacao (
  chave text PRIMARY KEY,            -- ligacao | whatsapp | agendamento | visita | documentacao | venda
  label text NOT NULL,
  pontos integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracao_pontuacao TO authenticated;
GRANT ALL ON public.configuracao_pontuacao TO service_role;
ALTER TABLE public.configuracao_pontuacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "todos leem config pontuacao" ON public.configuracao_pontuacao
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "gestor gerencia config pontuacao" ON public.configuracao_pontuacao
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_config_pontuacao_updated ON public.configuracao_pontuacao;
CREATE TRIGGER trg_config_pontuacao_updated BEFORE UPDATE ON public.configuracao_pontuacao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.configuracao_pontuacao (chave, label, pontos) VALUES
  ('ligacao','Ligação',2),
  ('whatsapp','WhatsApp',1),
  ('agendamento','Agendamento',100),
  ('visita','Visita realizada',250),
  ('documentacao','Documentação/Análise',400),
  ('venda','Venda (contrato fechado)',1000)
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pontos_de(_chave text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT pontos FROM public.configuracao_pontuacao WHERE chave = _chave AND ativo), 0);
$$;
GRANT EXECUTE ON FUNCTION public.pontos_de(text) TO authenticated, service_role;

-- 2) Atividades diárias por corretor -----------------------------------------
CREATE TABLE public.atividades_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia date NOT NULL,
  ligacoes integer NOT NULL DEFAULT 0,
  whatsapps integer NOT NULL DEFAULT 0,
  agendamentos integer NOT NULL DEFAULT 0,
  visitas integer NOT NULL DEFAULT 0,
  documentacoes integer NOT NULL DEFAULT 0,
  vendas integer NOT NULL DEFAULT 0,
  vgv_dia numeric(14,2) NOT NULL DEFAULT 0,
  pontuacao_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atividades_diarias_corretor_dia_uk UNIQUE (corretor_id, dia)
);
CREATE INDEX idx_atividades_diarias_dia ON public.atividades_diarias(dia DESC);
CREATE INDEX idx_atividades_diarias_corretor ON public.atividades_diarias(corretor_id, dia DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atividades_diarias TO authenticated;
GRANT ALL ON public.atividades_diarias TO service_role;
ALTER TABLE public.atividades_diarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretor ve suas atividades" ON public.atividades_diarias
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
-- Escrita só via funções SECURITY DEFINER (sem policy de INSERT/UPDATE p/ authenticated).
DROP TRIGGER IF EXISTS trg_atividades_diarias_updated ON public.atividades_diarias;
CREATE TRIGGER trg_atividades_diarias_updated BEFORE UPDATE ON public.atividades_diarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Upsert + recálculo da pontuação do dia.
CREATE OR REPLACE FUNCTION public.bump_atividade(
  _corretor uuid, _dia date,
  _lig int DEFAULT 0, _wa int DEFAULT 0, _ag int DEFAULT 0,
  _vis int DEFAULT 0, _doc int DEFAULT 0, _ven int DEFAULT 0, _vgv numeric DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _corretor IS NULL THEN RETURN; END IF;
  INSERT INTO public.atividades_diarias
    (corretor_id, dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes, vendas, vgv_dia)
  VALUES (_corretor, _dia, _lig, _wa, _ag, _vis, _doc, _ven, _vgv)
  ON CONFLICT (corretor_id, dia) DO UPDATE SET
    ligacoes      = atividades_diarias.ligacoes      + EXCLUDED.ligacoes,
    whatsapps     = atividades_diarias.whatsapps     + EXCLUDED.whatsapps,
    agendamentos  = atividades_diarias.agendamentos  + EXCLUDED.agendamentos,
    visitas       = atividades_diarias.visitas       + EXCLUDED.visitas,
    documentacoes = atividades_diarias.documentacoes + EXCLUDED.documentacoes,
    vendas        = atividades_diarias.vendas        + EXCLUDED.vendas,
    vgv_dia       = atividades_diarias.vgv_dia       + EXCLUDED.vgv_dia,
    updated_at    = now();

  UPDATE public.atividades_diarias SET pontuacao_total =
      ligacoes      * public.pontos_de('ligacao')
    + whatsapps     * public.pontos_de('whatsapp')
    + agendamentos  * public.pontos_de('agendamento')
    + visitas       * public.pontos_de('visita')
    + documentacoes * public.pontos_de('documentacao')
    + vendas        * public.pontos_de('venda')
  WHERE corretor_id = _corretor AND dia = _dia;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bump_atividade(uuid,date,int,int,int,int,int,int,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_atividade(uuid,date,int,int,int,int,int,int,numeric) TO service_role;

-- 3) Triggers de pontuação (fonte: ações reais já registradas) ---------------
-- Dia em America/Sao_Paulo.
CREATE OR REPLACE FUNCTION public.pont_after_interacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _dia date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.autor_id IS NOT NULL AND NEW.tipo IN ('ligacao','whatsapp') THEN
    PERFORM public.bump_atividade(NEW.autor_id, _dia,
      _lig => CASE WHEN NEW.tipo = 'ligacao' THEN 1 ELSE 0 END,
      _wa  => CASE WHEN NEW.tipo = 'whatsapp' THEN 1 ELSE 0 END);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_pont_interacao ON public.interacoes;
CREATE TRIGGER trg_pont_interacao AFTER INSERT ON public.interacoes
  FOR EACH ROW EXECUTE FUNCTION public.pont_after_interacao();

CREATE OR REPLACE FUNCTION public.pont_after_agendamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _dia date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  PERFORM public.bump_atividade(NEW.corretor_id, _dia, _ag => 1);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_pont_agendamento ON public.agendamentos;
CREATE TRIGGER trg_pont_agendamento AFTER INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.pont_after_agendamento();

CREATE OR REPLACE FUNCTION public.pont_after_transicao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _dia date := (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.corretor_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.para_status = 'visita_realizada' THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _vis => 1);
  ELSIF NEW.para_status = 'analise_credito' THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _doc => 1);
  ELSIF NEW.para_status = 'contrato_fechado' THEN
    PERFORM public.bump_atividade(NEW.corretor_id, _dia, _ven => 1);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_pont_transicao ON public.lead_status_transitions;
CREATE TRIGGER trg_pont_transicao AFTER INSERT ON public.lead_status_transitions
  FOR EACH ROW EXECUTE FUNCTION public.pont_after_transicao();

-- VGV do dia (a contagem de "venda" vem da transição acima; aqui só somamos o valor).
CREATE OR REPLACE FUNCTION public.pont_after_venda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _dia date := COALESCE(NEW.data_assinatura, (COALESCE(NEW.created_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date);
BEGIN
  PERFORM public.bump_atividade(NEW.corretor_id, _dia, _vgv => COALESCE(NEW.valor_venda, 0));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_pont_venda ON public.vendas;
CREATE TRIGGER trg_pont_venda AFTER INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.pont_after_venda();

-- 4) Metas diárias por corretor (recorrentes) --------------------------------
CREATE TABLE public.metas_diarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meta_ligacoes integer NOT NULL DEFAULT 0,
  meta_whatsapps integer NOT NULL DEFAULT 0,
  meta_agendamentos integer NOT NULL DEFAULT 0,
  meta_visitas integer NOT NULL DEFAULT 0,
  meta_vendas integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metas_diarias_corretor_uk UNIQUE (corretor_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_diarias TO authenticated;
GRANT ALL ON public.metas_diarias TO service_role;
ALTER TABLE public.metas_diarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretor ve sua meta diaria" ON public.metas_diarias
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "gestor gerencia metas diarias" ON public.metas_diarias
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
DROP TRIGGER IF EXISTS trg_metas_diarias_updated ON public.metas_diarias;
CREATE TRIGGER trg_metas_diarias_updated BEFORE UPDATE ON public.metas_diarias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Alertas de produtividade ------------------------------------------------
CREATE TABLE public.alertas_produtividade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dia date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  tipo text NOT NULL,                -- ex: 'meta_abaixo', 'sem_atividade'
  mensagem text NOT NULL,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alertas_prod_corretor ON public.alertas_produtividade(corretor_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas_produtividade TO authenticated;
GRANT ALL ON public.alertas_produtividade TO service_role;
ALTER TABLE public.alertas_produtividade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corretor ve seus alertas prod" ON public.alertas_produtividade
  FOR SELECT TO authenticated
  USING (corretor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'superintendente'));
CREATE POLICY "corretor marca seus alertas prod" ON public.alertas_produtividade
  FOR UPDATE TO authenticated
  USING (corretor_id = auth.uid())
  WITH CHECK (corretor_id = auth.uid());

-- RPC de ranking/consulta (escopo por papel) usado por Meu Painel / Ranking.
CREATE OR REPLACE FUNCTION public.ranking_atividades(_di date, _df date)
RETURNS TABLE (corretor_id uuid, nome text, pontuacao integer, ligacoes integer, whatsapps integer,
               agendamentos integer, visitas integer, documentacoes integer, vendas integer, vgv numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _gestor boolean := public.has_role(_uid,'admin') OR public.has_role(_uid,'gestor') OR public.has_role(_uid,'superintendente');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY
  SELECT a.corretor_id, p.nome,
         sum(a.pontuacao_total)::int, sum(a.ligacoes)::int, sum(a.whatsapps)::int,
         sum(a.agendamentos)::int, sum(a.visitas)::int, sum(a.documentacoes)::int,
         sum(a.vendas)::int, sum(a.vgv_dia)
  FROM public.atividades_diarias a
  LEFT JOIN public.profiles p ON p.id = a.corretor_id
  WHERE a.dia BETWEEN _di AND _df
    AND (_gestor OR a.corretor_id = _uid)
  GROUP BY a.corretor_id, p.nome
  ORDER BY 3 DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ranking_atividades(date, date) TO authenticated;
