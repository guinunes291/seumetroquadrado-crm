-- =============================================================================
-- Roleta Marquinhos automática — os 6 corretores com mais vendas em 30 dias
-- =============================================================================
-- Pedido do dono (13/10/2026), junto com as roletas simples (0084): a Roleta
-- Marquinhos continua "dentro da filial" (lead do bot com zona vai primeiro a
-- quem da Marquinhos atende a zona; sem ninguém, a filial da zona) e "somente
-- corretores com conversão recebem". Decisões na revisão:
--   * quem está nela é AUTOMÁTICO: os 6 corretores com mais vendas nos
--     últimos 30 dias (a gestão não monta mais o time à mão);
--   * conta a QUANTIDADE de vendas assinadas (status pendente ou aprovada,
--     sem distrato) — a aprovação depende de contrato + ato + repasse e
--     deixaria o top 6 semanas atrasado; empate pelo valor vendido (VGV),
--     depois a venda mais recente, depois o nome;
--   * quem a gestão marcou "Inapto" (pausa até 2099) vira BLOQUEIO manual: a
--     regra nunca o recoloca — até a gestão "devolver à regra";
--   * menos de 6 com venda: entram só esses; ninguém: a roleta fica vazia,
--     alerta no sino, e o lead do bot vai para a filial (o motor já faz).
--
-- Peças:
--   * chaves em distribuicao_settings (top N, janela, status, a regra ligada);
--   * marquinhos_apuracoes: o placar do dia, por corretor (auditável);
--   * _marquinhos_ranking(): a régua (pura, sem escrita);
--   * _marquinhos_aplicar(gatilho): grava a apuração e acerta o time —
--     inclui/reativa os de dentro, tira os de fora, nunca mexe em pausa;
--   * marquinhos_apurar() (admin ou cron), marquinhos_ranking_v1() (telas);
--   * gerenciar_participante_roleta: na Marquinhos com a regra ligada,
--     "remover" = bloquear, "incluir" (admin) = devolver à regra;
--   * cron diário às 06:50 de Brasília, antes dos check-ins.
--
-- Bloqueio manual (mesmo padrão da roleta semanal do SDR, 20261011120000): a
-- última inclusão/remoção do corretor na Marquinhos é uma REMOÇÃO feita por
-- uma PESSOA (feito_por preenchido) depois que a regra começou
-- (marquinhos_regra_desde). Remoção feita antes, no critério antigo, não
-- bloqueia. As ações da regra vão com feito_por NULL.
--
-- Idempotente. Espelhada em drizzle/migrations/0088. Exige a 0084.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.rodizio_sem_zona') IS NULL THEN
    RAISE EXCEPTION 'marquinhos automática: aplique antes a 0084 (20261023120000_roletas_simples)';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1) As chaves. Só entram se ainda não existem (reaplicar não reabre a regra
--    nem move o "desde").
-- ---------------------------------------------------------------------------
INSERT INTO public.distribuicao_settings (chave, valor, descricao) VALUES
  ('marquinhos_regra_ativa', 'true'::jsonb,
   'Roleta Marquinhos automática: o time são os N corretores com mais vendas na janela (13/10/2026).'),
  ('marquinhos_top_n', '6'::jsonb,
   'Quantos corretores ficam na Roleta Marquinhos (os de mais vendas na janela).'),
  ('marquinhos_janela_dias', '30'::jsonb,
   'Janela da contagem de vendas da Roleta Marquinhos, em dias (inclui hoje).'),
  ('marquinhos_status_venda', '["pendente","aprovada"]'::jsonb,
   'Status de venda que contam para a Roleta Marquinhos (sem distrato).'),
  ('marquinhos_regra_desde', to_jsonb(now()),
   'Desde quando a regra vale: remoção manual anterior a isto não bloqueia.')
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) O placar do dia.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marquinhos_apuracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia date NOT NULL,
  corretor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  posicao integer,
  vendas integer NOT NULL DEFAULT 0,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  ultima_venda date,
  resultado text NOT NULL
    CHECK (resultado IN ('dentro', 'fora', 'sem_venda', 'bloqueado_admin')),
  parametros jsonb NOT NULL DEFAULT '{}'::jsonb,
  apurado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dia, corretor_id)
);
COMMENT ON TABLE public.marquinhos_apuracoes IS
  'Roleta Marquinhos automática (13/10/2026): a apuração de cada dia, por corretor — posição em vendas na janela e se ficou dentro do top N.';
CREATE INDEX IF NOT EXISTS idx_marquinhos_apuracoes_dia ON public.marquinhos_apuracoes (dia DESC);

ALTER TABLE public.marquinhos_apuracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marquinhos_apuracoes_select ON public.marquinhos_apuracoes;
CREATE POLICY marquinhos_apuracoes_select ON public.marquinhos_apuracoes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'gestor'::app_role)
         OR public.has_role(auth.uid(), 'superintendente'::app_role)
         OR corretor_id = auth.uid());
REVOKE ALL ON public.marquinhos_apuracoes FROM PUBLIC, anon;
GRANT SELECT ON public.marquinhos_apuracoes TO authenticated;
GRANT ALL ON public.marquinhos_apuracoes TO service_role;

-- ---------------------------------------------------------------------------
-- 3) A régua: todo corretor ativo, com as vendas da janela, quem está
--    bloqueado e a posição entre os que têm venda (sem bloqueio).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._marquinhos_ranking()
RETURNS TABLE(corretor_id uuid, nome text, vendas integer, valor numeric, ultima_venda date,
              bloqueado boolean, posicao integer, resultado text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH cfg AS (
    SELECT GREATEST(COALESCE((public.get_dist_setting('marquinhos_top_n') #>> '{}')::int, 6), 0) AS top_n,
           GREATEST(COALESCE((public.get_dist_setting('marquinhos_janela_dias') #>> '{}')::int, 30), 1) AS janela,
           CASE WHEN jsonb_typeof(public.get_dist_setting('marquinhos_status_venda')) = 'array'
                THEN ARRAY(SELECT jsonb_array_elements_text(public.get_dist_setting('marquinhos_status_venda')))
                ELSE ARRAY['pendente', 'aprovada'] END AS status_ok,
           COALESCE((public.get_dist_setting('marquinhos_regra_desde') #>> '{}')::timestamptz,
                    '-infinity'::timestamptz) AS desde,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ),
  universo AS (
    SELECT p.id, p.nome
      FROM public.profiles p
     WHERE p.ativo AND p.status_conta = 'ativa'
       AND lower(coalesce(p.nome, '')) <> 'docs-bot'
       AND EXISTS (SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = p.id AND ur.role = 'corretor'::public.app_role)
  ),
  ven AS (
    SELECT v.corretor_id, count(*)::int AS n,
           COALESCE(sum(v.valor_venda), 0)::numeric AS valor,
           max(v.data_assinatura) AS ultima
      FROM public.vendas v
      CROSS JOIN cfg
     WHERE v.status_venda::text = ANY (cfg.status_ok)
       AND NOT COALESCE(v.distrato, false)
       AND v.corretor_id IS NOT NULL
       -- "últimos 30 dias" incluindo hoje: hoje-29 entra, hoje-30 não.
       AND v.data_assinatura > cfg.hoje - cfg.janela
       AND v.data_assinatura <= cfg.hoje
     GROUP BY v.corretor_id
  ),
  bloq AS (
    -- Última inclusão/remoção na Marquinhos é uma remoção de uma PESSOA,
    -- feita depois que a regra começou.
    SELECT rp.corretor_id
      FROM public.roleta_participantes rp
      JOIN public.roletas r ON r.id = rp.roleta_id AND r.slug = 'marquinhos'
      CROSS JOIN cfg
      CROSS JOIN LATERAL (
        SELECT l.acao, l.feito_por, l.created_at
          FROM public.roleta_participantes_log l
         WHERE l.roleta_id = rp.roleta_id AND l.corretor_id = rp.corretor_id
           AND l.acao IN ('incluido', 'removido')
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT 1) u
     WHERE NOT rp.ativo
       AND u.acao = 'removido' AND u.feito_por IS NOT NULL AND u.created_at >= cfg.desde
  ),
  base AS (
    SELECT u.id AS corretor_id, u.nome,
           COALESCE(v.n, 0) AS vendas, COALESCE(v.valor, 0) AS valor, v.ultima,
           (b.corretor_id IS NOT NULL) AS bloqueado
      FROM universo u
      LEFT JOIN ven v ON v.corretor_id = u.id
      LEFT JOIN bloq b ON b.corretor_id = u.id
  ),
  rk AS (
    SELECT b.*,
           CASE WHEN NOT b.bloqueado AND b.vendas > 0 THEN
             row_number() OVER (
               PARTITION BY (NOT b.bloqueado AND b.vendas > 0)
               ORDER BY b.vendas DESC, b.valor DESC, b.ultima DESC NULLS LAST, b.nome, b.corretor_id)
           END AS posicao
      FROM base b
  )
  SELECT rk.corretor_id, rk.nome, rk.vendas, rk.valor, rk.ultima, rk.bloqueado, rk.posicao::int,
         CASE WHEN rk.bloqueado THEN 'bloqueado_admin'
              WHEN rk.vendas = 0 THEN 'sem_venda'
              WHEN rk.posicao <= (SELECT cfg.top_n FROM cfg) THEN 'dentro'
              ELSE 'fora' END
    FROM rk
   ORDER BY rk.posicao NULLS LAST, rk.vendas DESC, rk.nome;
$$;

-- ---------------------------------------------------------------------------
-- 4) A aplicação: grava o placar do dia e acerta o time. Rodar de novo não
--    muda nada (só reescreve o placar). Nunca mexe em pausa (pausa da gestão
--    vence, mas guarda a vaga) nem no cursor (ninguém fura a fila por ter
--    saído e voltado).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._marquinhos_aplicar(_gatilho text DEFAULT 'cron')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _roleta uuid;
  _dia date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _top_n int := GREATEST(COALESCE((public.get_dist_setting('marquinhos_top_n') #>> '{}')::int, 6), 0);
  _janela int := GREATEST(COALESCE((public.get_dist_setting('marquinhos_janela_dias') #>> '{}')::int, 30), 1);
  _params jsonb;
  _r record;
  _rp record;
  _entraram int := 0;
  _sairam int := 0;
  _dentro int := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('marquinhos_apuracao'));

  SELECT r.id INTO _roleta FROM public.roletas r WHERE r.slug = 'marquinhos';
  IF _roleta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'roleta_inexistente');
  END IF;

  _params := jsonb_build_object(
    'top_n', _top_n, 'janela_dias', _janela,
    'status_venda', public.get_dist_setting('marquinhos_status_venda'),
    'gatilho', _gatilho);

  CREATE TEMP TABLE IF NOT EXISTS _mq_rank (
    corretor_id uuid, nome text, vendas int, valor numeric, ultima_venda date,
    bloqueado boolean, posicao int, resultado text
  ) ON COMMIT DROP;
  TRUNCATE _mq_rank;
  INSERT INTO _mq_rank SELECT * FROM public._marquinhos_ranking();

  INSERT INTO public.marquinhos_apuracoes
    (dia, corretor_id, posicao, vendas, valor, ultima_venda, resultado, parametros, apurado_em)
  SELECT _dia, k.corretor_id, k.posicao, k.vendas, k.valor, k.ultima_venda, k.resultado, _params, now()
    FROM _mq_rank k
  ON CONFLICT (dia, corretor_id) DO UPDATE SET
    posicao = EXCLUDED.posicao, vendas = EXCLUDED.vendas, valor = EXCLUDED.valor,
    ultima_venda = EXCLUDED.ultima_venda, resultado = EXCLUDED.resultado,
    parametros = EXCLUDED.parametros, apurado_em = EXCLUDED.apurado_em;
  -- Quem saiu do universo (conta desativada, perdeu o papel) não fica com a
  -- linha de hoje de uma apuração anterior.
  DELETE FROM public.marquinhos_apuracoes a
   WHERE a.dia = _dia AND NOT EXISTS (SELECT 1 FROM _mq_rank k WHERE k.corretor_id = a.corretor_id);

  -- Os de dentro: entram (ou voltam).
  FOR _r IN SELECT * FROM _mq_rank k WHERE k.resultado = 'dentro' ORDER BY k.posicao LOOP
    _dentro := _dentro + 1;
    SELECT rp.id, rp.ativo INTO _rp
      FROM public.roleta_participantes rp
     WHERE rp.roleta_id = _roleta AND rp.corretor_id = _r.corretor_id;
    IF NOT FOUND THEN
      INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_por)
      VALUES (_roleta, _r.corretor_id, true, NULL);
    ELSIF NOT _rp.ativo THEN
      UPDATE public.roleta_participantes SET ativo = true WHERE id = _rp.id;
    ELSE
      CONTINUE;
    END IF;
    _entraram := _entraram + 1;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por, created_at)
    VALUES (_roleta, _r.corretor_id, 'incluido',
            'Regra Marquinhos: ' || _r.posicao || 'º em vendas nos últimos ' || _janela || ' dias ('
              || _r.vendas || ' venda' || CASE WHEN _r.vendas = 1 THEN '' ELSE 's' END
              || ') — apuração de ' || to_char(_dia, 'DD/MM'),
            NULL, clock_timestamp());
  END LOOP;

  -- Quem está ativo e não está dentro: sai (inclusive quem saiu do universo).
  FOR _rp IN
    SELECT rp.id, rp.corretor_id, k.resultado, k.posicao
      FROM public.roleta_participantes rp
      LEFT JOIN _mq_rank k ON k.corretor_id = rp.corretor_id
     WHERE rp.roleta_id = _roleta AND rp.ativo
       AND COALESCE(k.resultado, 'fora_do_universo') <> 'dentro'
  LOOP
    UPDATE public.roleta_participantes SET ativo = false WHERE id = _rp.id;
    _sairam := _sairam + 1;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por, created_at)
    VALUES (_roleta, _rp.corretor_id, 'removido',
            'Regra Marquinhos: ' || CASE
              WHEN _rp.resultado = 'sem_venda' THEN 'sem venda nos últimos ' || _janela || ' dias'
              WHEN _rp.resultado = 'fora' THEN _rp.posicao || 'º em vendas, fora do top ' || _top_n
              ELSE 'corretor inativo ou sem papel de corretor' END
              || ' — apuração de ' || to_char(_dia, 'DD/MM'),
            NULL, clock_timestamp());
  END LOOP;

  IF _dentro = 0 THEN
    PERFORM public._alertar_gestores_distribuicao(
      'Roleta Marquinhos sem ninguém com venda',
      'Nenhum corretor tem venda nos últimos ' || _janela
        || ' dias: o lead do bot vai para as roletas de filial até alguém vender.',
      _roleta,
      '/distribuicao?tab=filas&fila=marquinhos');
  END IF;

  RETURN jsonb_build_object('ok', true, 'dia', _dia, 'gatilho', _gatilho,
                            'dentro', _dentro, 'entraram', _entraram, 'sairam', _sairam);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) As portas.
-- ---------------------------------------------------------------------------
-- Apurar agora (botão da Central) e o cron. Com a regra desligada, não mexe.
CREATE OR REPLACE FUNCTION public.marquinhos_apurar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((public.get_dist_setting('marquinhos_regra_ativa') #>> '{}')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'regra_inativa');
  END IF;
  RETURN public._marquinhos_aplicar(CASE WHEN _caller IS NULL THEN 'cron' ELSE 'manual' END);
END;
$$;

-- O ranking ao vivo (Central e Quadro). Gestão vê todos; o corretor, a
-- própria linha.
CREATE OR REPLACE FUNCTION public.marquinhos_ranking_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _gestao boolean;
BEGIN
  IF _caller IS NULL OR NOT public.is_active_member(_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _gestao := public.has_role(_caller, 'admin') OR public.has_role(_caller, 'gestor')
             OR public.has_role(_caller, 'superintendente');
  RETURN jsonb_build_object(
    'regra_ativa', COALESCE((public.get_dist_setting('marquinhos_regra_ativa') #>> '{}')::boolean, false),
    'top_n', GREATEST(COALESCE((public.get_dist_setting('marquinhos_top_n') #>> '{}')::int, 6), 0),
    'janela_dias', GREATEST(COALESCE((public.get_dist_setting('marquinhos_janela_dias') #>> '{}')::int, 30), 1),
    'status_venda', public.get_dist_setting('marquinhos_status_venda'),
    'apurado_em', (SELECT max(a.apurado_em) FROM public.marquinhos_apuracoes a),
    'corretores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'corretor_id', k.corretor_id, 'nome', k.nome, 'vendas', k.vendas,
               'valor', k.valor, 'ultima_venda', k.ultima_venda,
               'bloqueado', k.bloqueado, 'posicao', k.posicao, 'resultado', k.resultado)
             ORDER BY k.posicao NULLS LAST, k.vendas DESC, k.nome)
        FROM public._marquinhos_ranking() k
       WHERE _gestao OR k.corretor_id = _caller), '[]'::jsonb)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Gerenciar participante. Corpo vigente (20260912150728) + o bloco
--    [MARQUINHOS AUTOMÁTICA]: com a regra ligada, na Marquinhos
--      * remover  = BLOQUEAR (vale mesmo para quem ainda não está nela) e
--        aplicar a regra na hora (o 7º entra);
--      * incluir  = DEVOLVER À REGRA (só admin): registra a inclusão (limpa
--        o bloqueio) e aplica — entra se estiver no top;
--      * reativar = só tira a pausa (não fura a regra);
--      * pausar e limite, como sempre.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerenciar_participante_roleta(_slug text, _corretor_id uuid, _acao text, _motivo text DEFAULT NULL::text, _limite integer DEFAULT NULL::integer, _pausado_ate timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _roleta_id uuid;
  _eh_admin boolean;
  _regra boolean;
BEGIN
  _eh_admin := _caller IS NOT NULL AND public.has_role(_caller, 'admin');
  IF _caller IS NOT NULL AND NOT _eh_admin THEN
    IF NOT public.has_role(_caller, 'gestor') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    -- Gestor tem autonomia SOMENTE sobre corretores da(s) equipe(s) dele.
    IF NOT public.gestor_gere_corretor(_caller, _corretor_id) THEN
      RAISE EXCEPTION 'corretor fora da sua equipe';
    END IF;
  END IF;

  SELECT id INTO _roleta_id FROM public.roletas WHERE slug = _slug;
  IF _roleta_id IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _slug;
  END IF;

  -- [MARQUINHOS AUTOMÁTICA] (0088)
  _regra := _slug = 'marquinhos'
            AND COALESCE((public.get_dist_setting('marquinhos_regra_ativa') #>> '{}')::boolean, false);
  IF _regra AND _acao IN ('incluir', 'remover', 'reativar') THEN
    IF _acao = 'incluir' THEN
      IF NOT _eh_admin AND _caller IS NOT NULL THEN
        RAISE EXCEPTION 'A Roleta Marquinhos é automática (top em vendas): só o admin devolve alguém à regra';
      END IF;
      INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
      VALUES (_roleta_id, _corretor_id, 'incluido',
              COALESCE(NULLIF(btrim(_motivo), ''), 'Devolvido à regra (top em vendas) pela gestão'), _caller);
    ELSIF _acao = 'remover' THEN
      INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, incluido_por)
      VALUES (_roleta_id, _corretor_id, false, _caller)
      ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET ativo = false;
      INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
      VALUES (_roleta_id, _corretor_id, 'removido',
              COALESCE(NULLIF(btrim(_motivo), ''), 'Bloqueado na Roleta Marquinhos pela gestão'), _caller);
    ELSE
      UPDATE public.roleta_participantes
         SET pausado_ate = NULL, motivo_pausa = NULL
       WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
      INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
      VALUES (_roleta_id, _corretor_id, 'reativado', _motivo, _caller);
      RETURN jsonb_build_object('ok', true, 'acao', _acao, 'roleta', _slug, 'corretor_id', _corretor_id);
    END IF;
    PERFORM public._marquinhos_aplicar(CASE _acao WHEN 'incluir' THEN 'devolvido_a_regra' ELSE 'bloqueio_manual' END);
    RETURN jsonb_build_object('ok', true, 'acao', _acao, 'roleta', _slug, 'corretor_id', _corretor_id,
                              'regra_automatica', true);
  END IF;

  IF _acao = 'incluir' THEN
    IF _slug = 'marquinhos' AND NOT _eh_admin
       AND NOT (public.get_dist_setting('permitir_inclusao_manual') #>> '{}')::boolean THEN
      RAISE EXCEPTION 'inclusao manual desabilitada para gestores';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'corretor'::app_role
      WHERE p.id = _corretor_id AND p.ativo = true
    ) THEN
      RAISE EXCEPTION 'corretor inexistente, inativo ou sem papel de corretor';
    END IF;

    INSERT INTO public.roleta_participantes (roleta_id, corretor_id, ativo, limite_diario, incluido_por)
    VALUES (_roleta_id, _corretor_id, true, _limite, _caller)
    ON CONFLICT (roleta_id, corretor_id) DO UPDATE SET
      ativo = true,
      pausado_ate = NULL,
      motivo_pausa = NULL,
      limite_diario = COALESCE(EXCLUDED.limite_diario, public.roleta_participantes.limite_diario),
      incluido_por = _caller,
      incluido_em = now();
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'incluido', _motivo, _caller);

  ELSIF _acao = 'remover' THEN
    UPDATE public.roleta_participantes
       SET ativo = false, pausado_ate = NULL, motivo_pausa = NULL
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'removido', _motivo, _caller);

  ELSIF _acao = 'pausar' THEN
    IF _pausado_ate IS NULL OR _pausado_ate <= now() THEN
      RAISE EXCEPTION 'pausa exige data futura (_pausado_ate)';
    END IF;
    UPDATE public.roleta_participantes
       SET pausado_ate = _pausado_ate, motivo_pausa = _motivo
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'pausado',
            COALESCE(_motivo,'') || ' (até ' || to_char(_pausado_ate AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')',
            _caller);

  ELSIF _acao = 'reativar' THEN
    UPDATE public.roleta_participantes
       SET ativo = true, pausado_ate = NULL, motivo_pausa = NULL
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'reativado', _motivo, _caller);

  ELSIF _acao = 'limite' THEN
    UPDATE public.roleta_participantes
       SET limite_diario = _limite
     WHERE roleta_id = _roleta_id AND corretor_id = _corretor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'corretor não participa da roleta'; END IF;
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por)
    VALUES (_roleta_id, _corretor_id, 'limite_alterado',
            'Limite diário: ' || COALESCE(_limite::text, 'padrão'), _caller);

  ELSE
    RAISE EXCEPTION 'acao invalida: %', _acao;
  END IF;

  RETURN jsonb_build_object('ok', true, 'acao', _acao, 'roleta', _slug, 'corretor_id', _corretor_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7) Permissões.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._marquinhos_ranking() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._marquinhos_ranking() TO service_role;
REVOKE ALL ON FUNCTION public._marquinhos_aplicar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._marquinhos_aplicar(text) TO service_role;
REVOKE ALL ON FUNCTION public.marquinhos_apurar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marquinhos_apurar() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.marquinhos_ranking_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marquinhos_ranking_v1() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.gerenciar_participante_roleta(text, uuid, text, text, integer, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_participante_roleta(text, uuid, text, text, integer, timestamp with time zone) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) A virada: o "Inapto" de hoje vira bloqueio (decisão do dono), e a
--    primeira apuração já monta o time. Quem fez a pausa assina o bloqueio.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  _roleta uuid := (SELECT id FROM public.roletas WHERE slug = 'marquinhos');
  _rp record;
BEGIN
  IF _roleta IS NULL THEN
    RETURN;
  END IF;
  FOR _rp IN
    SELECT rp.id, rp.corretor_id,
           (SELECT l.feito_por FROM public.roleta_participantes_log l
             WHERE l.roleta_id = rp.roleta_id AND l.corretor_id = rp.corretor_id
               AND l.acao = 'pausado' AND l.feito_por IS NOT NULL
             ORDER BY l.created_at DESC LIMIT 1) AS quem
      FROM public.roleta_participantes rp
     WHERE rp.roleta_id = _roleta AND rp.pausado_ate >= '2099-01-01'::timestamptz
  LOOP
    UPDATE public.roleta_participantes
       SET ativo = false, pausado_ate = NULL, motivo_pausa = NULL
     WHERE id = _rp.id;
    -- feito_por: quem marcou "Inapto"; sem esse registro, o primeiro admin
    -- (o bloqueio precisa de uma pessoa para valer contra a regra).
    INSERT INTO public.roleta_participantes_log (roleta_id, corretor_id, acao, motivo, feito_por, created_at)
    VALUES (_roleta, _rp.corretor_id, 'removido',
            'Era "Inapto" na Roleta Marquinhos: vira bloqueio da regra automática (13/10/2026)',
            COALESCE(_rp.quem,
                     (SELECT ur.user_id FROM public.user_roles ur
                       WHERE ur.role = 'admin'::public.app_role ORDER BY ur.user_id LIMIT 1)),
            clock_timestamp());
  END LOOP;

  IF COALESCE((public.get_dist_setting('marquinhos_regra_ativa') #>> '{}')::boolean, false) THEN
    PERFORM public._marquinhos_aplicar('migracao');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 9) O cron: todo dia às 06:50 de Brasília (09:50 UTC), antes dos check-ins.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'marquinhos-apuracao-diaria';
  PERFORM cron.schedule('marquinhos-apuracao-diaria', '50 9 * * *',
                        $cron$SELECT public.marquinhos_apurar();$cron$);
END
$$;

-- ---------------------------------------------------------------------------
-- 10) Guarda.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public._marquinhos_aplicar(text)') IS NULL
     OR to_regprocedure('public.marquinhos_ranking_v1()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marquinhos-apuracao-diaria') THEN
    RAISE EXCEPTION 'marquinhos automática: peças ausentes';
  END IF;
  IF has_function_privilege('anon', 'public.marquinhos_apurar()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.marquinhos_ranking_v1()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._marquinhos_aplicar(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'marquinhos automática: permissões abertas demais';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roleta_participantes rp
               JOIN public.roletas r ON r.id = rp.roleta_id
              WHERE r.slug = 'marquinhos' AND rp.pausado_ate >= '2099-01-01'::timestamptz) THEN
    RAISE EXCEPTION 'marquinhos automática: ainda há "Inapto" (pausa até 2099) na Marquinhos';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
