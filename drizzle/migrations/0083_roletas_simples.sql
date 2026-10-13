-- =============================================================================
-- Roletas simples — só quatro: Campanha (Facebook Ads), Filial, SDR, Marquinhos
-- =============================================================================
-- Pedido do dono (13/10/2026): "Precisamos deixar as roletas mais simples de
-- entender quem está em qual roleta. Precisamos apenas dessas roletas no
-- sistema: Roletas por campanha Facebook ADS (independe a filial que o
-- corretor está), Roletas por Filial, Roleta SDR, Roleta Marquinhos."
--
-- Decisões na revisão (13/10/2026, docs/ops/roletas-simples.md):
--   1. Plantão, Landing e Base saem (ativo = false, NUNCA apagadas: histórico,
--      participações e rollback — a mesma convenção das zona-* em 12/10).
--   2. Lead SEM zona (site/landing sem região, indicação, cadastro manual,
--      reativação), que não é de campanha nem do Marquinhos, entra no
--      RODÍZIO ENTRE AS FILIAIS: vai para a filial há mais tempo sem receber
--      lead sem zona; filial sem ninguém apto PARA ESTE LEAD é pulada; nenhuma
--      pronta, ele espera na primeira com time e o fallback por velocidade do
--      cron entrega (sem mudança em processar_distribuicao_automatica).
--   3. Campanha: a equipe SEMPRE recebe, de qualquer zona — toda campanha
--      vira "equipe fixa" e perde a filial dona (gatilho força; o front antigo
--      continua salvando sem erro). Ninguém da equipe apto: a filial da zona,
--      ou o rodízio se o lead não tem zona.
--   4. O estoque (cron que era distribuir-estoque-plantao) passa a ser
--      entregue pelas FILIAIS, por vaga na carteira, sem contar na cota do dia
--      nem andar a posição na fila (um lote de 30 esgotaria a cota de 20 e
--      travaria o lead quente).
--   5. A cota diária padrão (limite_diario_default) sobe de 10 para 20: o
--      lead sem zona deixa de ter cota própria no Plantão/Landing.
--   (A Roleta Marquinhos automática — top 6 em vendas — é a 0084.)
--
-- Revisão técnica (13/10) — o que cada bloco [ROLETAS SIMPLES] conserta:
--   * cursor do rodízio com clock_timestamp(): o cron entrega até 200 leads
--     numa transação só e now() empatava todas as filiais (a primeira ganhava
--     sempre) — vale também para o cursor da Leste;
--   * a atribuição direta (estoque, fallback, exceção, manual) sempre rotula
--     o log com uma roleta: roleta_slug NULL conta na cota de TODAS;
--   * campanha monta a equipe ANTES da trava roleta_swrr: a campanha travava
--     a si e depois a filial, o cron trava a filial e depois a campanha
--     (deadlock possível no lote).
--
-- Ordem de aplicação em produção: em 4 blocos (marcados abaixo), na ordem.
-- O bloco 2 não muda comportamento sozinho (os dados ainda apontam para o
-- Plantão); a virada é o bloco 3. Exige a 0082 aplicada.
--
-- Idempotente. Espelhada em drizzle/migrations/0083.
-- =============================================================================

DO $$
BEGIN
  IF to_regprocedure('public._roletas_da_zona(text)') IS NULL THEN
    RAISE EXCEPTION 'roletas simples: aplique antes a 0079 (20261018120000_roletas_por_filial)';
  END IF;
  IF position('presenca_checkins' IN
       pg_get_functiondef('public.fallback_velocidade_ranking(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roletas simples: aplique antes a 0082 (20261021120000_presenca_exigida_fallback_velocidade)';
  END IF;
END
$$;

SET LOCAL lock_timeout = '5s';

-- #############################################################################
-- BLOCO 1/4 — peças novas (tabela do rodízio, funções auxiliares, gatilho)
-- #############################################################################

-- ---------------------------------------------------------------------------
-- 1) O cursor do rodízio do lead SEM zona: uma linha por roleta de filial.
--    Tabela própria (e não coluna em roletas): roletas é lida em toda entrega
--    e prender linha dela (FOR UPDATE) brigaria com as checagens de chave
--    estrangeira. Espelho de zonas_roletas.ultimo_lead_em, sem a zona.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rodizio_sem_zona (
  roleta_slug text PRIMARY KEY REFERENCES public.roletas(slug) ON UPDATE CASCADE,
  ultimo_lead_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.rodizio_sem_zona IS
  'Rodízio do lead SEM zona entre as roletas de filial (13/10/2026): ultimo_lead_em = a última vez que a filial recebeu lead sem zona. Filial nova entra com um INSERT aqui (docs/ops/roletas-simples.md).';

ALTER TABLE public.rodizio_sem_zona ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rodizio_sem_zona_select ON public.rodizio_sem_zona;
CREATE POLICY rodizio_sem_zona_select ON public.rodizio_sem_zona
  FOR SELECT TO authenticated USING (public.is_active_member(auth.uid()));
REVOKE ALL ON public.rodizio_sem_zona FROM PUBLIC, anon;
GRANT SELECT ON public.rodizio_sem_zona TO authenticated;
GRANT ALL ON public.rodizio_sem_zona TO service_role;

INSERT INTO public.rodizio_sem_zona (roleta_slug)
SELECT r.slug
  FROM public.roletas r
 WHERE r.tipo = 'zona' AND r.filial_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug)
ON CONFLICT (roleta_slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) As roletas de filial na ordem do rodízio do lead sem zona, com "pronta
--    para ESTE lead" (ativa, no horário, alguém apto que ainda não o teve) e
--    "da vez" (a primeira pronta). Espelho de _roletas_da_zona. Filial
--    desligada continua na lista (não pronta): o lead pode esperar nela.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._roletas_sem_zona(_tentaram uuid[] DEFAULT NULL)
RETURNS TABLE(roleta_slug text, nome text, filial_slug text, filial_nome text,
              ordem integer, pronta boolean, da_vez boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH r AS (
    SELECT rs.roleta_slug,
           ro.nome,
           f.slug AS filial_slug,
           f.nome AS filial_nome,
           row_number() OVER (
             ORDER BY rs.ultimo_lead_em ASC NULLS FIRST, coalesce(f.ordem, 99), rs.roleta_slug
           )::int AS ordem,
           public._roleta_pronta_para_lead(rs.roleta_slug, _tentaram) AS pronta
      FROM public.rodizio_sem_zona rs
      JOIN public.roletas ro ON ro.slug = rs.roleta_slug
      LEFT JOIN public.filiais f ON f.id = ro.filial_id
  )
  SELECT r.roleta_slug, r.nome, r.filial_slug, r.filial_nome, r.ordem, r.pronta,
         r.pronta AND r.ordem = (SELECT min(x.ordem) FROM r x WHERE x.pronta) AS da_vez
    FROM r
   ORDER BY r.ordem;
$$;

-- A filial da vez para o lead sem zona (telas: Visão geral, painel). NULL se
-- nenhuma está pronta.
CREATE OR REPLACE FUNCTION public.roleta_sem_zona_da_vez()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT x.roleta_slug FROM public._roletas_sem_zona(NULL) x WHERE x.da_vez LIMIT 1
$$;

-- ---------------------------------------------------------------------------
-- 3) Campanha = equipe fixa, sem filial (decisão 3). O gatilho FORÇA em vez
--    de recusar (precedente: trg_roletas_presenca_obrigatoria): o front antigo
--    ainda manda equipe_fixa = false e a filial durante a publicação, e tem
--    de continuar salvando sem erro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_roletas_campanha_equipe_fixa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo = 'campanha' THEN
    NEW.equipe_fixa := true;
    NEW.filial_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roletas_campanha_equipe_fixa ON public.roletas;
CREATE TRIGGER trg_roletas_campanha_equipe_fixa
  BEFORE INSERT OR UPDATE OF tipo, equipe_fixa, filial_id ON public.roletas
  FOR EACH ROW EXECUTE FUNCTION public.tg_roletas_campanha_equipe_fixa();

-- #############################################################################
-- BLOCO 2/4 — os motores (mesmos corpos vigentes + os blocos [ROLETAS SIMPLES])
-- #############################################################################

-- ---------------------------------------------------------------------------
-- 4) O motor da roleta. Corpo vigente (20261018120000) + os blocos
--    [ROLETAS SIMPLES]: pedido de roleta desligada ignorado; Base só se
--    ativa; atribuição direta sempre rotulada; o lead sem zona no rodízio
--    das filiais (pino do repasse, origem do mapa, rodízio com SKIP LOCKED);
--    Marquinhos sem zona; estoque fora da fila e da cota; cursores com
--    clock_timestamp(); vez única também no lead sem zona.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._distribuir_lead_v3(_lead_id uuid, _tipo distribuicao_tipo DEFAULT 'automatica'::distribuicao_tipo, _roleta_slug text DEFAULT NULL::text, _corretor_id uuid DEFAULT NULL::uuid, _distribuido_por uuid DEFAULT NULL::uuid, _gatilho text DEFAULT 'manual'::text, _contexto_extra jsonb DEFAULT '{}'::jsonb, _registrar_excecao boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _lead record;
  _r record;
  _slug text;
  _regra text;
  _vencedor uuid;
  _vencedor_nome text;
  _vencedor_zonas text[];
  _tentaram uuid[];
  _aptos_ids uuid[];
  _aptos_json jsonb;
  _inaptos_json jsonb;
  _n_ativos int;
  _agora_brt time;
  _dentro_horario boolean;
  _contexto jsonb;
  _log_id uuid;
  _motivo_falha text;
  _motivo_log text;
  _excecao_id uuid;
  _zona text;
  _aptos_zona uuid[];
  _zona_fallback boolean := false;
  _divergencia_zona boolean := false;
  _roleta_tipo text;
  _origem_fallback text;
  -- [V2]
  _v2 boolean := public._modelo_v2_ativo();
  _sombra boolean := COALESCE((public.get_dist_setting('modelo_v2_sombra') #>> '{}')::boolean, false);
  _classe text;
  _inaptos_v2 jsonb := '[]'::jsonb;
  _sum_pesos int;
  _faixa_vencedor text;
  _sombra_vencedor uuid;
  _sombra_faixa text;
  -- [ZONA]
  _estrita boolean := public._zona_estrita();
  _zslug_lead text;
  _zslug_pronta text;
  _roleta_pedida text;
  _fora_regiao jsonb := '[]'::jsonb;
  _motivo_fora text;
  -- [MARQUINHOS] _marquinhos_na_zona: esta chamada tenta a Roleta
  -- Marquinhos filtrada pela zona. _marquinhos_desvio: chamada de volta para
  -- o time da zona porque ninguém da Marquinhos estava apto ali.
  _marquinhos_na_zona boolean := false;
  _marquinhos_desvio boolean :=
    COALESCE((_contexto_extra->>'marquinhos_sem_apto_na_zona')::boolean, false);
  _marquinhos_fora_horario boolean := false;
  -- [VEZ ÚNICA] (0078) A vez é uma só: quem já é o 1º da fila de uma zona
  -- mais movimentada não é o 1º desta. _vez_fora: quem saiu dos candidatos
  -- por isso (e em que zona está a vez dele); _vez_forcada: a regra pularia
  -- todo mundo, então a fila ficou como estava (e ninguém saiu: _vez_fora
  -- volta a vazio).
  _vez_unica boolean := false;
  _vez_fora_ids uuid[] := ARRAY[]::uuid[];
  _vez_fora jsonb := '[]'::jsonb;
  _vez_forcada boolean := false;
  -- [ROLETAS SIMPLES] (0083) _sem_zona_rodizio: o lead sem zona entrou no
  -- rodízio entre as filiais (grava o cursor de rodizio_sem_zona ao
  -- entregar). _marquinhos_sem_zona: lead do bot sem zona na Marquinhos
  -- inteira (sem apto, volta para o rodízio). _origem_cfg: a roleta da origem
  -- no mapa (hoje só 'marquinhos' ou NULL). _pino_fraco: pino de filial que
  -- não está pronto — o lead só espera nele se nenhuma filial estiver.
  _sem_zona_rodizio boolean := false;
  _marquinhos_sem_zona boolean := false;
  _origem_cfg text;
  _pino_fraco text;
  _prontas text[];
  _espera text[];
BEGIN
  SELECT * INTO _lead FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_nao_encontrado');
  END IF;

  -- Lead na lixeira/excluído NUNCA é distribuído; exceção aberta (se houver)
  -- é arquivada para não assombrar a fila.
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'arquivada', resolvida_em = now(),
           resolvida_por = COALESCE(_distribuido_por, auth.uid()),
           resolucao = 'Lead está na lixeira — distribuição bloqueada'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', false, 'erro', 'lead_na_lixeira');
  END IF;

  -- Idempotência: distribuição automática nunca rouba lead já atribuído.
  -- Fecha exceção aberta órfã — senão "Reprocessar" vira beco sem saída.
  IF _lead.corretor_id IS NOT NULL AND _tipo = 'automatica' AND _corretor_id IS NULL THEN
    UPDATE public.distribuicao_excecoes
       SET status = 'resolvida', resolvida_em = now(),
           resolvida_por = COALESCE(_distribuido_por, auth.uid()),
           resolucao = 'Lead já estava atribuído'
     WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');
    RETURN jsonb_build_object('ok', true, 'ja_atribuido', true, 'corretor_id', _lead.corretor_id);
  END IF;

  _tentaram := COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]);
  _zona := public.zona_do_lead(_lead_id);
  _classe := COALESCE(_lead.classe_lead, 'quente');
  -- [ROLETAS SIMPLES] (0083) Pedido de roleta DESLIGADA (Plantão, Landing e
  -- Base desde 13/10, as zona-*, filial ou campanha desligada) vale como se
  -- não houvesse pedido, em todo caminho — generaliza o "pino antigo" da
  -- 0079. O pedido fica no contexto como roleta_pedida. Uma exceção resolvida
  -- para "Plantão" pela tela antiga cai no rodízio das filiais em vez de
  -- esperar numa roleta que ninguém mais olha.
  IF _roleta_slug IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.roletas r WHERE r.slug = _roleta_slug AND NOT r.ativo) THEN
    _roleta_pedida := _roleta_slug;
    _roleta_slug := NULL;
  END IF;
  IF _zona IS NOT NULL THEN
    -- [FILIAL] (0079) A zona pode ter mais de uma roleta (Leste: Liberdade e
    -- Belém). Pino válido do lead (memória do repasse: fica no mesmo time)
    -- e pronto PARA ESTE LEAD → ele; senão a primeira do rodízio entre as
    -- filiais da zona (_roletas_da_zona) com alguém apto que ainda não teve
    -- o lead (_roleta_pronta_para_lead); nenhuma → o pino, ou a da vez, ou a
    -- primeira da ordem (o lead espera lá, nunca troca de zona).
    -- Dois leads da mesma zona ao mesmo tempo não podem ler o mesmo cursor
    -- e ir para a mesma filial (visto no harness, 12/10). A linha do par
    -- (zona, roleta) escolhida fica presa até o COMMIT e o outro lead PULA
    -- a presa (SKIP LOCKED) e vai para a outra filial — sem nunca esperar:
    -- uma trava com espera aqui dava deadlock com o cron, que entrega em
    -- lote numa transação só (revisão de 12/10). Todas presas: escolhe sem
    -- trava (no pior caso, as duas na mesma filial).
    IF _corretor_id IS NULL THEN
      SELECT zr.roleta_slug INTO _zslug_pronta
        FROM public.zonas_roletas zr
        JOIN public._roletas_da_zona(_zona) x ON x.roleta_slug = zr.roleta_slug
       WHERE zr.zona = _zona
         AND x.pronta AND public._roleta_pronta_para_lead(x.roleta_slug, _tentaram)
       ORDER BY x.ordem
       LIMIT 1
       FOR UPDATE OF zr SKIP LOCKED;
    END IF;
    IF _zslug_pronta IS NULL THEN
      SELECT x.roleta_slug INTO _zslug_pronta
        FROM public._roletas_da_zona(_zona) x
       WHERE x.pronta AND public._roleta_pronta_para_lead(x.roleta_slug, _tentaram)
       ORDER BY x.ordem
       LIMIT 1;
    END IF;
    IF _roleta_slug IS NOT NULL AND public._roleta_atende_zona(_roleta_slug, _zona)
       AND (public._roleta_pronta_para_lead(_roleta_slug, _tentaram)
            OR (_zslug_pronta IS NULL AND public._roleta_tem_time(_roleta_slug))) THEN
      _zslug_lead := _roleta_slug;
    ELSE
      -- Nenhuma pronta: espera na primeira da ordem que tem time montado
      -- (a exceção diz "ninguém apto agora"); sem time em nenhuma, na
      -- primeira da ordem ("sem time montado").
      _zslug_lead := COALESCE(
        _zslug_pronta,
        public.roleta_da_zona(_zona),
        (SELECT x.roleta_slug FROM public._roletas_da_zona(_zona) x
          ORDER BY (NOT public._roleta_tem_time(x.roleta_slug)), x.ordem LIMIT 1));
    END IF;
  END IF;

  -- Resolução da roleta. [V2] Lead de BASE vai direto para a esteira 'base'.
  -- [ZONA] Lead COM zona vai para a roleta da zona dele — sempre: pronta ou
  -- não, e por cima de slug explícito (token de zona, pino antigo, roleta
  -- escolhida na exceção, campanha delegada), que fica registrado como
  -- roleta_pedida. Sem ninguém da zona apto, o lead espera — nunca troca de
  -- zona. Lead SEM zona: [ROLETAS SIMPLES] (0083) slug explícito (o pino de
  -- filial só se ela estiver pronta para este lead); a origem do mapa (hoje
  -- só a Marquinhos), se pronta; senão o RODÍZIO ENTRE AS FILIAIS.
  -- [MARQUINHOS] Exceção: lead do Marquinhos com zona tenta antes quem da
  -- Roleta Marquinhos atende a zona (o filtro de região abaixo faz o corte);
  -- sem ninguém apto ali, volta para o time da zona (ver "sem vencedor").
  IF _v2 AND _corretor_id IS NULL AND _roleta_slug IS NULL AND _classe = 'base'
     -- [ROLETAS SIMPLES] Base desligada (13/10) não segura o lead de base.
     AND EXISTS (SELECT 1 FROM public.roletas WHERE slug = 'base' AND ativo) THEN
    _slug := 'base';
  ELSIF _estrita AND _zona IS NOT NULL AND _corretor_id IS NULL THEN
    IF _roleta_slug = 'base' THEN
      _slug := 'base';
    ELSIF NOT _marquinhos_desvio
          AND COALESCE((public.get_dist_setting('marquinhos_antes_da_zona') #>> '{}')::boolean, true)
          AND public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem) = 'marquinhos'
          AND EXISTS (SELECT 1 FROM public.roletas WHERE slug = 'marquinhos' AND ativo) THEN
      _slug := 'marquinhos';
      _marquinhos_na_zona := true;
    ELSE
      _slug := _zslug_lead;
      -- (o pedido de roleta desligada já ficou registrado lá em cima)
      IF _roleta_slug IS NOT NULL AND _roleta_slug IS DISTINCT FROM _zslug_lead THEN
        _roleta_pedida := _roleta_slug;
      END IF;
    END IF;
  ELSIF _corretor_id IS NOT NULL THEN
    -- [ROLETAS SIMPLES] Atribuição direta (estoque, fallback por velocidade,
    -- exceção resolvida, manual): o slug só rotula o log e a cota — e NUNCA
    -- pode ficar NULL (roleta_slug NULL no log conta na cota de TODAS as
    -- roletas). Antes, o rótulo caía no Plantão. Ordem: o pedido; a filial do
    -- corretor que atende a zona do lead (ou a primeira dele, sem zona); a
    -- filial da zona; a primeira do rodízio sem zona.
    _slug := COALESCE(
      _roleta_slug,
      (SELECT r.slug
         FROM public.roleta_participantes rp
         JOIN public.roletas r ON r.id = rp.roleta_id
         LEFT JOIN public.filiais f ON f.id = r.filial_id
        WHERE rp.corretor_id = _corretor_id AND rp.ativo AND r.ativo AND r.tipo = 'zona'
          AND (_zona IS NULL OR public._roleta_atende_zona(r.slug, _zona))
        ORDER BY coalesce(f.ordem, 99), r.slug
        LIMIT 1),
      _zslug_lead,
      (SELECT rs.roleta_slug
         FROM public.rodizio_sem_zona rs
         JOIN public.roletas r ON r.slug = rs.roleta_slug
        ORDER BY r.ativo DESC, rs.ultimo_lead_em ASC NULLS FIRST, rs.roleta_slug
        LIMIT 1));
  ELSE
    -- [ROLETAS SIMPLES] Lead SEM zona (ou zona com a estrita desligada).
    IF _roleta_slug IS NOT NULL THEN
      IF _zona IS NULL
         AND EXISTS (SELECT 1 FROM public.rodizio_sem_zona rs WHERE rs.roleta_slug = _roleta_slug) THEN
        -- Pino de filial (memória do repasse: o lead fica no mesmo time):
        -- vale se a filial estiver pronta PARA ESTE LEAD; senão o rodízio
        -- decide e o lead só espera no pino se nenhuma filial estiver pronta
        -- (mesma régua da zona, 0079).
        IF public._roleta_pronta_para_lead(_roleta_slug, _tentaram) THEN
          _slug := _roleta_slug;
        ELSE
          _pino_fraco := _roleta_slug;
        END IF;
      ELSE
        -- Pedido explícito (Marquinhos, campanha delegada, exceção resolvida).
        _slug := _roleta_slug;
      END IF;
    END IF;
    IF _slug IS NULL AND _pino_fraco IS NULL THEN
      _slug := public.roleta_da_zona(_zona);
    END IF;
    IF _slug IS NULL THEN
      -- A origem no mapa (distribuicao_config): depois de 13/10 só pode ser a
      -- Marquinhos (atualizar_distribuicao_config recusa o resto) ou NULL =
      -- filiais. O motor continua guiado pelos dados para o rollback ser só
      -- de dados. Origem não pronta para este lead (desligada, fora do
      -- horário, ninguém apto) não segura: vai para o rodízio.
      _origem_cfg := public._resolver_roleta_lead(_lead.canal_entrada, _lead.origem);
      IF _origem_cfg IS NOT NULL AND _pino_fraco IS NULL
         AND NOT (_origem_cfg = 'marquinhos' AND _marquinhos_desvio)
         AND public._roleta_pronta_para_lead(_origem_cfg, _tentaram) THEN
        _slug := _origem_cfg;
        _marquinhos_sem_zona := (_origem_cfg = 'marquinhos');
      ELSE
        -- (com pino de filial a origem nem foi tentada: não é "fallback")
        _origem_fallback := CASE WHEN _pino_fraco IS NULL THEN _origem_cfg END;
        _sem_zona_rodizio := true;
        -- O rodízio: a primeira filial pronta na ordem do cursor. A linha da
        -- filial escolhida fica presa até o COMMIT e o lead simultâneo a PULA
        -- (SKIP LOCKED) e vai para a próxima — sem nunca esperar (mesmo
        -- padrão da Leste: esperar aqui dava deadlock com o lote do cron).
        SELECT array_agg(x.roleta_slug ORDER BY x.ordem) FILTER (WHERE x.pronta),
               array_agg(x.roleta_slug ORDER BY (NOT public._roleta_tem_time(x.roleta_slug)), x.ordem)
          INTO _prontas, _espera
          FROM public._roletas_sem_zona(_tentaram) x;
        SELECT rs.roleta_slug INTO _slug
          FROM public.rodizio_sem_zona rs
         WHERE rs.roleta_slug = ANY (COALESCE(_prontas, ARRAY[]::text[]))
         ORDER BY array_position(_prontas, rs.roleta_slug)
         LIMIT 1
         FOR UPDATE OF rs SKIP LOCKED;
        -- Todas presas: a primeira pronta sem trava. Nenhuma pronta: espera no
        -- pino, ou na primeira com time ("ninguém apto agora"), ou na primeira
        -- ("sem time montado") — o fallback por velocidade do cron entrega.
        _slug := COALESCE(_slug, _prontas[1], _pino_fraco, _espera[1]);
      END IF;
    END IF;
  END IF;

  -- [V2] Devolução por SLA: o estouro do dono anterior conta (uma vez por
  -- lead) e alimenta a pausa automática — mesmo se este repasse falhar.
  IF _v2 AND (_contexto_extra ? 'corretor_anterior_sla') THEN
    PERFORM public._registrar_estouro_sla(
      NULLIF(_contexto_extra->>'corretor_anterior_sla','')::uuid, _lead_id, _slug);
  END IF;

  -- ------------------------- atribuição manual direta ----------------------
  IF _corretor_id IS NOT NULL THEN
    SELECT p.nome, p.zonas INTO _vencedor_nome, _vencedor_zonas
    FROM public.profiles p
    WHERE p.id = _corretor_id AND p.ativo = true;
    IF _vencedor_nome IS NULL THEN
      RAISE EXCEPTION 'corretor destino inexistente ou inativo';
    END IF;
    _vencedor := _corretor_id;
    _regra := 'manual_direta';
    _aptos_json := '[]'::jsonb;
    _inaptos_json := '[]'::jsonb;
    IF _estrita THEN
      -- [ZONA] Fora da região só como EXCEÇÃO DA GESTÃO: pedida
      -- explicitamente (forcar_fora_da_zona) e com motivo escrito.
      IF _zona IS NOT NULL
         AND public.has_role(_corretor_id, 'corretor'::public.app_role)
         AND NOT public.corretor_atende_zona(_corretor_id, _zona)
         -- [FILIAL] (0079) Lead de campanha de equipe fixa: quem está nela
         -- recebe de qualquer zona (como na transferência e no repasse).
         AND NOT public._lead_liberado_por_campanha(_lead.roleta_slug, _corretor_id) THEN
        _motivo_fora := NULLIF(btrim(COALESCE(_contexto_extra->>'motivo_fora_da_zona', '')), '');
        IF COALESCE(_contexto_extra->>'forcar_fora_da_zona', 'false') <> 'true'
           OR char_length(COALESCE(_motivo_fora, '')) < 5 THEN
          RAISE EXCEPTION USING
            ERRCODE = 'SMQZ1',
            MESSAGE = public._msg_fora_da_regiao(_zona, _corretor_id);
        END IF;
        _divergencia_zona := true;
      END IF;
    ELSIF _zona IS NOT NULL AND COALESCE(array_length(_vencedor_zonas, 1), 0) > 0
       AND NOT (_zona = ANY(_vencedor_zonas)) THEN
      -- Comportamento anterior (zona_estrita=false): só avisa.
      _divergencia_zona := true;
    END IF;
  ELSE
    -- ----------------------- caminho da roleta -----------------------------
    IF _slug IS NULL THEN
      IF _estrita AND _zona IS NOT NULL THEN
        _motivo_falha := 'zona_sem_roleta';
        _motivo_log := public._rotulo_zona(_zona) || ' sem roleta vinculada (zonas_roletas) — lead na fila de exceções';
      ELSE
        _motivo_falha := 'origem_nao_mapeada';
        _motivo_log := 'Origem sem roleta vinculada — lead na fila de exceções';
      END IF;
      _contexto := jsonb_build_object(
        'roleta', NULL, 'gatilho', _gatilho, 'origem', _lead.origem::text,
        'canal_entrada', _lead.canal_entrada, 'zona', _zona, 'zona_estrita', _estrita
      ) || COALESCE(_contexto_extra, '{}'::jsonb);
      IF _registrar_excecao THEN
        _excecao_id := public._registrar_excecao_distribuicao(
          _lead_id, _motivo_falha,
          CASE WHEN _motivo_falha = 'zona_sem_roleta' THEN _motivo_log
               ELSE 'Origem "' || _lead.origem::text || '" sem roleta vinculada' END,
          NULL, _contexto);
      END IF;
      INSERT INTO public.distribution_log
        (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
      VALUES
        (_lead_id, NULL, _tipo, _motivo_log, _distribuido_por, NULL, 'triagem', 'excecao')
      RETURNING id INTO _log_id;
      INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);
      RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha);
    END IF;

    SELECT * INTO _r FROM public.roletas WHERE slug = _slug;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'roleta % inexistente', _slug;
    END IF;
    _roleta_tipo := _r.tipo;

    -- Janela de funcionamento (BRT). Fora da janela sem permissão: o lead
    -- espera o cron — sem exceção e sem log (evita 1 registro por minuto).
    IF _r.horario_inicio IS NOT NULL AND _r.horario_fim IS NOT NULL THEN
      _agora_brt := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
      IF _r.horario_inicio <= _r.horario_fim THEN
        _dentro_horario := _agora_brt BETWEEN _r.horario_inicio AND _r.horario_fim;
      ELSE
        _dentro_horario := (_agora_brt >= _r.horario_inicio OR _agora_brt <= _r.horario_fim);
      END IF;
      IF NOT _dentro_horario AND NOT _r.permitir_fora_horario
         AND _tipo IN ('automatica','redistribuicao') AND auth.uid() IS NULL THEN
        -- [MARQUINHOS] Marquinhos fora da janela não segura o lead: ninguém
        -- dela recebe agora, e o lead segue para o time da zona.
        -- [ROLETAS SIMPLES] Sem zona também: segue para o rodízio das filiais.
        IF NOT (_marquinhos_na_zona OR _marquinhos_sem_zona) THEN
          RETURN jsonb_build_object('ok', false, 'adiado', true, 'motivo', 'fora_do_horario', 'roleta', _slug);
        END IF;
        _marquinhos_fora_horario := true;
      END IF;
    END IF;

    -- Snapshot de elegibilidade (fonte única) — vira contexto auditável.
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
          'corretor_id', e.corretor_id, 'nome', e.nome,
          'ultimo_lead_em', e.ultimo_lead_em)
        ORDER BY e.ultimo_lead_em ASC NULLS FIRST)
        FILTER (WHERE e.apto), '[]'::jsonb),
      COALESCE(jsonb_agg(jsonb_build_object(
          'corretor_id', e.corretor_id, 'nome', e.nome,
          'motivos', to_jsonb(e.motivos), 'pct_trabalhado', e.pct_trabalhado,
          'recebidos_hoje', e.recebidos_hoje, 'limite_diario', e.limite_diario)
        ORDER BY e.nome)
        FILTER (WHERE NOT e.apto), '[]'::jsonb),
      COALESCE(array_agg(e.corretor_id) FILTER (WHERE e.apto), ARRAY[]::uuid[]),
      count(*) FILTER (WHERE e.participante_ativo AND NOT e.pausado)
    INTO _aptos_json, _inaptos_json, _aptos_ids, _n_ativos
    FROM public._elegibilidade_roleta(_slug) e;

    IF NOT _r.ativo THEN
      _aptos_ids := ARRAY[]::uuid[];
      _n_ativos := 0;
    END IF;
    IF _marquinhos_fora_horario THEN
      _aptos_ids := ARRAY[]::uuid[];
    END IF;

    -- Exclui quem já teve o lead (redistribuição nunca devolve ao mesmo).
    _aptos_ids := ARRAY(SELECT unnest(_aptos_ids) EXCEPT SELECT unnest(_tentaram));

    -- [V2] Régua extra de elegibilidade: onboarding concluído, vínculo
    -- (fixo/autônomo) definido e WIP abaixo do disjuntor. Quem cai aqui fica
    -- auditado em 'inaptos_v2' no contexto da decisão.
    IF _v2 AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
      SELECT
        COALESCE(array_agg(x.corretor_id) FILTER (WHERE x.apto), ARRAY[]::uuid[]),
        COALESCE(jsonb_agg(jsonb_build_object(
            'corretor_id', x.corretor_id, 'motivos', to_jsonb(x.motivos)))
          FILTER (WHERE NOT x.apto), '[]'::jsonb)
      INTO _aptos_ids, _inaptos_v2
      FROM (
        SELECT u.corretor_id, e.apto, e.motivos
        FROM unnest(_aptos_ids) AS u(corretor_id)
        CROSS JOIN LATERAL public._apto_extra_v2(u.corretor_id) e
      ) x;
    END IF;

    IF _estrita THEN
      -- [ZONA] Filtro de região SEM fallback, em qualquer roleta (na roleta
      -- da zona é redundante; na base e nas de origem é o que segura o lead
      -- dentro da zona). Quem foi cortado fica auditado em 'fora_da_regiao'.
      IF _zona IS NOT NULL AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
        SELECT
          COALESCE(array_agg(u) FILTER (WHERE public.corretor_atende_zona(u, _zona)), ARRAY[]::uuid[]),
          COALESCE(jsonb_agg(u) FILTER (WHERE NOT public.corretor_atende_zona(u, _zona)), '[]'::jsonb)
        INTO _aptos_zona, _fora_regiao
        FROM unnest(_aptos_ids) AS u;
        _aptos_ids := _aptos_zona;
      END IF;
    ELSIF _zona IS NOT NULL AND COALESCE(_roleta_tipo, '') <> 'zona'
       AND array_length(_aptos_ids, 1) > 0 THEN
      -- Comportamento anterior (zona_estrita=false): filtro por
      -- profiles.zonas com fallback para qualquer apto.
      _aptos_zona := ARRAY(
        SELECT p.id FROM public.profiles p
         WHERE p.id = ANY(_aptos_ids)
           AND (COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas))
      );
      IF COALESCE(array_length(_aptos_zona, 1), 0) > 0 THEN
        _aptos_ids := _aptos_zona;
      ELSE
        _zona_fallback := true;
      END IF;
    END IF;

    -- [VEZ ÚNICA] (0078) Só nas roletas de zona: quem já é o 1º da fila de
    -- uma zona mais movimentada (_vez_unica_tomados: a mesma conta da tela)
    -- sai dos candidatos desta. Se isso esvaziasse a fila, ela fica como
    -- está: a vez nunca segura o lead.
    -- [ROLETAS SIMPLES] Vale também para o lead sem zona numa filial: a
    -- unidade da vez é a roleta, e a tela ("Sua vez") mostra uma fila só.
    IF _estrita AND _roleta_tipo = 'zona'
       AND public._vez_unica_ativa()
       AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
      _vez_unica := true;
      SELECT COALESCE(array_agg(t.corretor_id), ARRAY[]::uuid[]),
             COALESCE(jsonb_agg(jsonb_build_object(
               'corretor_id', t.corretor_id, 'vez_em', t.vez_em)), '[]'::jsonb)
        INTO _vez_fora_ids, _vez_fora
        FROM public._vez_unica_tomados('zona', _slug) t
       WHERE t.corretor_id = ANY(_aptos_ids);
      IF COALESCE(array_length(_vez_fora_ids, 1), 0) > 0 THEN
        IF EXISTS (SELECT 1 FROM unnest(_aptos_ids) x WHERE NOT (x = ANY(_vez_fora_ids))) THEN
          _aptos_ids := ARRAY(SELECT x FROM unnest(_aptos_ids) x
                               WHERE NOT (x = ANY(_vez_fora_ids)));
        ELSE
          _vez_forcada := true;
          _vez_fora := '[]'::jsonb;
        END IF;
      END IF;
    END IF;

    IF _v2 AND _classe = 'quente' AND _slug <> 'base' THEN
      -- [V2] QUENTE: smooth weighted round-robin por faixa de velocidade
      -- (tier A/B/C = peso 3/2/1). Advisory lock serializa o cursor SWRR;
      -- desempate: cursor maior, depois há mais tempo sem receber, depois id.
      PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _r.id::text));

      SELECT sum(CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END)
        INTO _sum_pesos
      FROM public.roleta_participantes rp
      WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids);

      IF COALESCE(_sum_pesos, 0) > 0 THEN
        UPDATE public.roleta_participantes rp
           SET wrr_current = rp.wrr_current
               + CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END
         WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids);

        SELECT rp.corretor_id, p.nome, rp.tier
          INTO _vencedor, _vencedor_nome, _faixa_vencedor
        FROM public.roleta_participantes rp
        JOIN public.profiles p ON p.id = rp.corretor_id
        WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids)
        ORDER BY rp.wrr_current DESC, rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC
        LIMIT 1;

        UPDATE public.roleta_participantes
           SET wrr_current = wrr_current - _sum_pesos
         WHERE roleta_id = _r.id AND corretor_id = _vencedor;
      END IF;

      _regra := 'ponderado_velocidade' ||
                COALESCE(':faixa' || _faixa_vencedor, '');
    ELSE
      -- Serializa o rodízio por roleta (como o SDR 'roleta_sdr:' e o SWRR
      -- 'roleta_swrr:' já fazem): sem isto, o SKIP LOCKED esvazia a fila quando
      -- a vez única deixou um só candidato e outro lead da zona está sendo
      -- entregue na mesma hora — e a vez "segura" o lead por um ciclo do cron.
      -- [ROLETAS SIMPLES] Sem candidato não há o que serializar: a Marquinhos
      -- vazia não prende a trava antes de o lead cair para a filial.
      IF COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
        PERFORM pg_advisory_xact_lock(hashtext('roleta_rodizio:' || _r.id::text));
      END IF;
      -- Rodízio por cursor: apto há mais tempo sem receber NESTA roleta,
      -- com lock no cursor para concorrência entre webhook/cron/manual.
      -- [V2] É também a mecânica da esteira BASE (rodízio puro, o piso).
      SELECT rp.corretor_id, p.nome INTO _vencedor, _vencedor_nome
      FROM public.roleta_participantes rp
      JOIN public.profiles p ON p.id = rp.corretor_id
      WHERE rp.roleta_id = _r.id
        AND rp.corretor_id = ANY(_aptos_ids)
      ORDER BY rp.ultimo_lead_em ASC NULLS FIRST, rp.incluido_em ASC
      FOR UPDATE OF rp SKIP LOCKED
      LIMIT 1;

      _regra := CASE WHEN _v2 THEN 'rodizio_base' ELSE 'rodizio_menos_recente' END;
    END IF;
  END IF;

  _contexto := jsonb_build_object(
    'roleta', _slug,
    'roleta_tipo', _roleta_tipo,
    'gatilho', _gatilho,
    'regra', _regra,
    'percentual_minimo', (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric,
    'aptos', COALESCE(_aptos_json, '[]'::jsonb),
    'inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
    'excluidos_por_tentativa', to_jsonb(_tentaram),
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'divergencia_zona', _divergencia_zona,
    'origem_fallback', _origem_fallback,
    'origem_config', _origem_cfg,
    'sem_zona_rodizio', _sem_zona_rodizio,
    'marquinhos_sem_zona', _marquinhos_sem_zona,
    'modelo_v2', _v2,
    'classe_lead', _classe,
    'inaptos_v2', _inaptos_v2,
    'faixa_vencedor', _faixa_vencedor,
    'zona_estrita', _estrita,
    'roleta_pedida', _roleta_pedida,
    'fora_da_regiao', _fora_regiao,
    'motivo_fora_da_zona', _motivo_fora,
    'marquinhos_na_zona', _marquinhos_na_zona,
    'vez_unica', _vez_unica,
    'vez_em_outra_zona', _vez_fora,
    'vez_unica_forcada', _vez_forcada
  ) || COALESCE(_contexto_extra, '{}'::jsonb);

  -- --------------------------- sem vencedor --------------------------------
  IF _vencedor IS NULL THEN
    IF _marquinhos_na_zona OR _marquinhos_sem_zona THEN
      -- [MARQUINHOS] Ninguém da Marquinhos apto na zona do lead: time da zona,
      -- nesta mesma transação (sem exceção nem log da tentativa — o que a
      -- Marquinhos tinha fica no contexto da decisão da zona). A chave
      -- marquinhos_sem_apto_na_zona impede a volta para a Marquinhos.
      -- [ROLETAS SIMPLES] Lead do bot sem zona: o rodízio das filiais
      -- (_zslug_lead é NULL sem zona).
      RETURN public._distribuir_lead_v3(
        _lead_id, _tipo, _zslug_lead, NULL, _distribuido_por, _gatilho,
        COALESCE(_contexto_extra, '{}'::jsonb) || jsonb_build_object(
          'marquinhos_sem_apto_na_zona', true,
          'roleta_pedida', 'marquinhos',
          'marquinhos_fora_do_horario', _marquinhos_fora_horario,
          'marquinhos_inaptos', COALESCE(_inaptos_json, '[]'::jsonb),
          'marquinhos_fora_da_regiao', _fora_regiao),
        _registrar_excecao);
    END IF;

    IF _estrita AND _zona IS NOT NULL AND _roleta_tipo = 'zona' AND COALESCE(_n_ativos, 0) = 0 THEN
      -- [ZONA] Time da zona não montado (ou roleta desligada): o lead ESPERA
      -- aqui (alerta à gestão) — desligar a roleta não manda o lead para
      -- outra zona.
      _motivo_falha := 'zona_sem_time';
      _motivo_log := public._rotulo_zona(_zona) || CASE
                       WHEN NOT _r.ativo THEN ' com a roleta ' || _slug || ' desativada'
                       ELSE ' sem time montado (roleta ' || _slug || ' sem participante ativo)' END
                     || ' — o lead espera o time da zona; ajuste na Central de Distribuição';
    ELSIF _estrita AND _zona IS NOT NULL THEN
      -- [ZONA] Ninguém da zona apto agora: espera — não vai para outra zona.
      _motivo_falha := 'sem_corretor_na_zona';
      _motivo_log := 'Ninguém da ' || public._rotulo_zona(_zona) || ' apto agora (roleta ' || _slug
                     || ': ausência, cota, pausa ou já teve o lead) — o lead espera o time da filial';
    ELSIF _sem_zona_rodizio THEN
      -- [ROLETAS SIMPLES] Lead sem zona e nenhuma filial pronta: espera na
      -- filial escolhida. Os dois motivos já estão na lista do fallback por
      -- velocidade do cron (20261019120000): o próximo ciclo entrega.
      _motivo_falha := CASE WHEN COALESCE(_n_ativos, 0) = 0
                            THEN 'sem_corretor_ativo' ELSE 'sem_corretor_elegivel' END;
      _motivo_log := 'Lead sem zona: nenhuma filial com corretor apto agora (rodízio entre as filiais) — o lead espera na '
                     || COALESCE(_r.nome, _slug);
    ELSIF COALESCE(_n_ativos, 0) = 0 THEN
      _motivo_falha := 'sem_corretor_ativo';
      _motivo_log := 'Roleta ' || _slug || ' sem participante ativo — lead na fila de exceções';
    ELSE
      _motivo_falha := 'sem_corretor_elegivel';
      _motivo_log := 'Roleta ' || _slug || ' sem corretor apto no momento — lead na fila de exceções';
    END IF;
    IF _marquinhos_desvio THEN
      _motivo_log := _motivo_log || CASE WHEN _zona IS NULL
                       THEN ' (a Roleta Marquinhos também não tinha ninguém apto)'
                       ELSE ' (a Roleta Marquinhos também não tinha ninguém apto na zona)' END;
    END IF;

    IF _registrar_excecao THEN
      _excecao_id := public._registrar_excecao_distribuicao(
        _lead_id, _motivo_falha, _motivo_log, _slug, _contexto);
    END IF;

    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead_id, NULL, _tipo, _motivo_log, _distribuido_por, _slug, _regra, 'sem_corretor')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

    RETURN jsonb_build_object('ok', false, 'excecao_id', _excecao_id, 'motivo', _motivo_falha,
                              'roleta', _slug, 'zona', _zona);
  END IF;

  -- ----------------------------- vencedor ----------------------------------
  _contexto := _contexto || jsonb_build_object(
    'vencedor', jsonb_build_object('corretor_id', _vencedor, 'nome', _vencedor_nome));

  -- [ZONA] Exceção da gestão (manual forçada com motivo): a guarda de
  -- leads.corretor_id é avisada só durante este UPDATE.
  IF _estrita AND _divergencia_zona THEN
    PERFORM set_config('app.zona_override', 'on', true);
  END IF;

  UPDATE public.leads
     SET corretor_anterior_id = CASE
           WHEN corretor_id IS NOT NULL AND corretor_id <> _vencedor THEN corretor_id
           ELSE corretor_anterior_id END,
         corretor_id = _vencedor,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         status = CASE WHEN status = 'novo' THEN 'aguardando_atendimento' ELSE status END,
         -- Memória da roleta de ZONA — repasse por SLA fica no mesmo time
         -- da zona (o pino de campanha continua intocado).
         roleta_slug = CASE WHEN _roleta_tipo = 'zona' THEN _slug ELSE roleta_slug END,
         corretores_que_tentaram = CASE
           WHEN _vencedor = ANY(_tentaram) THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _vencedor) END
   WHERE id = _lead_id;

  IF _estrita AND _divergencia_zona THEN
    PERFORM set_config('app.zona_override', 'off', true);
  END IF;

  -- Cursor único da roleta (se o corretor participa dela).
  -- [ROLETAS SIMPLES] O estoque (lote por vaga na carteira) não anda a
  -- posição na fila: senão um lote de 30 jogava o corretor para o fim da
  -- fila do lead quente.
  IF _slug IS NOT NULL AND _gatilho IS DISTINCT FROM 'estoque' THEN
    UPDATE public.roleta_participantes rp
       SET ultimo_lead_em = now()
      FROM public.roletas r
     WHERE r.id = rp.roleta_id AND r.slug = _slug AND rp.corretor_id = _vencedor;
  END IF;
  -- [FILIAL] (0079) O cursor do par (zona, roleta): é o que faz a Leste
  -- alternar entre Liberdade e Belém.
  -- [ROLETAS SIMPLES] clock_timestamp(), não now(): o cron entrega o lote
  -- inteiro numa transação e now() é o mesmo para todos os leads — as
  -- filiais empatavam e a primeira da ordem ganhava sempre.
  IF _zona IS NOT NULL AND _roleta_tipo = 'zona' THEN
    -- Sem esperar: presa por outra entrega (outra transação), o cursor
    -- daquela entrega já anda; esperar aqui reabria o deadlock com o lote.
    UPDATE public.zonas_roletas zr SET ultimo_lead_em = clock_timestamp()
     WHERE zr.ctid = (SELECT z.ctid FROM public.zonas_roletas z
                       WHERE z.zona = _zona AND z.roleta_slug = _slug
                       FOR UPDATE SKIP LOCKED);
  END IF;
  -- [ROLETAS SIMPLES] O cursor do rodízio do lead SEM zona entre as filiais
  -- (pela roleta: rodízio ou pino do repasse). Mesmas regras: sem esperar e
  -- com o relógio de verdade.
  IF _zona IS NULL AND _roleta_tipo = 'zona' THEN
    UPDATE public.rodizio_sem_zona z SET ultimo_lead_em = clock_timestamp()
     WHERE z.ctid = (SELECT y.ctid FROM public.rodizio_sem_zona y
                      WHERE y.roleta_slug = _slug
                      FOR UPDATE SKIP LOCKED);
  END IF;

  -- Cursor global informativo (integrações externas). Os contadores legados
  -- de fila_distribuicao NÃO são mais escritos: cota deriva do log.
  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _vencedor;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, distribuido_por_id, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _vencedor, _tipo,
     CASE
       -- [ROLETAS SIMPLES] Estoque pelas filiais (distribuir_estoque_filiais).
       WHEN _regra = 'manual_direta' AND _gatilho = 'estoque'
         THEN 'Estoque — ' || COALESCE(_slug, 'filial') || ' (lote por vaga na carteira; fora da cota do dia)'
       WHEN _regra = 'manual_direta' AND _divergencia_zona AND _motivo_fora IS NOT NULL
         THEN 'Atribuição manual FORA DA REGIÃO (corretor não atende a ' || public._rotulo_zona(_zona)
              || ') — exceção da gestão: ' || _motivo_fora
       WHEN _regra = 'manual_direta' AND _divergencia_zona
         THEN 'Atribuição manual direta (corretor fora da Zona ' || _zona || ')'
       WHEN _regra = 'manual_direta' THEN 'Atribuição manual direta'
       WHEN _regra LIKE 'ponderado_velocidade%'
         THEN 'Roleta ' || _slug || ' — ponderado por velocidade (faixa ' || COALESCE(_faixa_vencedor, 'B') || ')'
       WHEN _regra = 'rodizio_base'
         THEN 'Roleta ' || _slug || ' — rodízio universal (há mais tempo sem receber)'
       WHEN _sem_zona_rodizio AND _origem_fallback IS NOT NULL
         THEN 'Roleta ' || _slug || ' — rodízio entre as filiais (lead sem zona; roleta '
              || _origem_fallback || ' sem ninguém apto para este lead)'
       WHEN _sem_zona_rodizio
         THEN 'Roleta ' || _slug || ' — rodízio entre as filiais (lead sem zona)'
       WHEN _marquinhos_sem_zona
         THEN 'Roleta marquinhos — rodízio (lead do bot sem zona)'
       WHEN _origem_fallback IS NOT NULL
         THEN 'Roleta ' || _slug || ' — rodízio (roleta ' || _origem_fallback || ' inativa/sem time; caiu no Plantão)'
       WHEN _zona_fallback
         THEN 'Roleta ' || _slug || ' — rodízio (sem apto na Zona ' || _zona || '; fallback para qualquer apto)'
       WHEN _marquinhos_na_zona
         THEN 'Roleta marquinhos — rodízio entre quem da Marquinhos atende a ' || public._rotulo_zona(_zona)
       WHEN _marquinhos_desvio
         THEN 'Roleta ' || _slug || ' — rodízio (ninguém da Roleta Marquinhos apto na '
              || public._rotulo_zona(_zona) || ')'
       ELSE 'Roleta ' || _slug || ' — rodízio (há mais tempo sem receber)'
     END,
     -- [ROLETAS SIMPLES] O estoque fica com rótulo próprio: é o que o tira da
     -- cota do dia (_elegibilidade_roleta) e da conta da vez única.
     _distribuido_por, _slug,
     CASE WHEN _regra = 'manual_direta' AND _gatilho = 'estoque' THEN 'estoque_filial' ELSE _regra END,
     'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _contexto);

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(),
         resolvida_por = COALESCE(_distribuido_por, auth.uid()),
         resolucao = 'Distribuído para ' || _vencedor_nome ||
                     CASE WHEN _regra = 'manual_direta' THEN ' (manual)' ELSE ' (roleta ' || COALESCE(_slug,'?') || ')' END
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  -- [V2] Modo SOMBRA: com o v2 desligado, registra quem o v2 teria escolhido
  -- na MESMA roleta (régua extra + argmax de wrr_current + peso da faixa),
  -- sem tocar cursor nenhum. Nunca pode derrubar a distribuição real.
  IF NOT _v2 AND _sombra AND _regra <> 'manual_direta'
     AND COALESCE(array_length(_aptos_ids, 1), 0) > 0 THEN
    BEGIN
      SELECT rp.corretor_id, rp.tier
        INTO _sombra_vencedor, _sombra_faixa
      FROM public.roleta_participantes rp
      JOIN LATERAL public._apto_extra_v2(rp.corretor_id) e ON e.apto
      WHERE rp.roleta_id = _r.id AND rp.corretor_id = ANY(_aptos_ids)
      ORDER BY (rp.wrr_current + CASE rp.tier WHEN 'A' THEN 3 WHEN 'C' THEN 1 ELSE 2 END) DESC,
               rp.ultimo_lead_em ASC NULLS FIRST, rp.corretor_id ASC
      LIMIT 1;

      INSERT INTO public.distribuicao_sombra
        (lead_id, roleta_slug, classe_lead, vencedor_real, vencedor_v2, faixa_v2, contexto)
      VALUES
        (_lead_id, _slug, _classe, _vencedor, _sombra_vencedor, _sombra_faixa,
         jsonb_build_object('gatilho', _gatilho,
                            'seria_fila_base', _classe = 'base'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'corretor_id', _vencedor,
    'corretor_nome', _vencedor_nome,
    'roleta', _slug,
    'regra', _regra,
    'zona', _zona,
    'zona_fallback', _zona_fallback,
    'aviso_zona', CASE WHEN _divergencia_zona
      THEN 'Corretor não atende a ' || public._rotulo_zona(_zona) ELSE NULL END
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Campanha: entrega (webhook) e repasse por SLA. Corpos vigentes
--    (20261018120000) + [ROLETAS SIMPLES]: a equipe é montada antes da trava
--    do cursor; ninguém apto → filial da zona, ou o rodízio sem zona.
--    (Os ramos de "campanha comum" ficam: o gatilho os deixa sem uso, e o
--    rollback, só de dados, os traz de volta.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_lead_ponderado(_lead_id uuid, _roleta_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record; _lead record; _picked uuid; _tier_picked text; _sum_pesos int;
  _zona text; _n_zona int; _zslug text;
  _estrita boolean := public._zona_estrita();
BEGIN
  SELECT * INTO _roleta FROM public.roletas WHERE slug = _roleta_slug AND ativo;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'roleta_inexistente');
  END IF;

  SELECT id, corretor_id, status, corretores_que_tentaram INTO _lead
    FROM public.leads WHERE id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.corretor_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'motivo', 'ja_atribuido', 'corretor_id', _lead.corretor_id
    );
  END IF;

  _zona := public.zona_do_lead(_lead_id);

  IF _estrita AND _zona IS NOT NULL THEN
    -- [ZONA] Campanha comum: a distribuição é do time da zona; a campanha
    -- vira rótulo no contexto.
    IF NOT _roleta.equipe_fixa THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  ELSIF NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior (zona_estrita=false): zona primeiro só se a
    -- roleta da zona estiver pronta.
    _zslug := public.roleta_da_zona(_zona);
    IF _zslug IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, _zslug, NULL, NULL,
        'campanha_zona', jsonb_build_object('campanha', _roleta_slug), true);
    END IF;
  END IF;

  -- [ROLETAS SIMPLES] (0083) A equipe é montada ANTES da trava do cursor
  -- (roleta_swrr:). Sem ninguém apto, o lead vai para o motor (filial da
  -- zona, ou o rodízio entre filiais) sem segurar a trava da campanha: a
  -- campanha travava a si e depois a filial, enquanto o lote do cron trava a
  -- filial e depois a campanha (redistribuir_*) — deadlock possível.
  CREATE TEMP TABLE IF NOT EXISTS _dlp_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _dlp_elegiveis;

  INSERT INTO _dlp_elegiveis
  SELECT rp.id, rp.corretor_id, rp.tier,
         CASE rp.tier
           WHEN 'A' THEN _roleta.peso_tier_a
           WHEN 'C' THEN _roleta.peso_tier_c
           ELSE _roleta.peso_tier_b
         END
  FROM public.roleta_participantes rp
  JOIN public.profiles p ON p.id = rp.corretor_id
  WHERE rp.roleta_id = _roleta.id
    AND rp.ativo
    -- Regra dos 65, Fatia 3a: 60 em Em atendimento ou 150 na Minha base param
    -- a roleta (com a regra ligada; em sombra devolve true).
    AND public._em_atendimento_recebe_lead(rp.corretor_id)
    -- Registro mãe (20261010120400): quem já tem um registro ativo da pessoa
    -- não recebe outro — o filho da campanha vai para outro corretor.
    AND NOT (rp.corretor_id = ANY (COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[])))
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor'
    )
    AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    AND p.ativo = true
    AND coalesce(p.telefone,'') <> ''
    AND (NOT _roleta.exigir_presenca OR p.presente = true)
    AND (
      rp.limite_diario IS NULL OR (
        SELECT count(*) FROM public.distribution_log dl
         WHERE dl.corretor_id = rp.corretor_id
           AND dl.roleta_slug = _roleta.slug
           AND dl.resultado = 'sucesso'
           AND dl.created_at >= date_trunc('day', now())
      ) < rp.limite_diario
    );

  IF _estrita THEN
    -- [FILIAL] (0079) Equipe fixa: a campanha manda — quem está nela recebe,
    -- de qualquer zona (decisão do dono, 12/10: a campanha da filial é a
    -- válvula para receber lead de outras zonas). Sem corte por zona.
    NULL;
  ELSIF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior: filtro por profiles.zonas com fallback.
    SELECT count(*) INTO _n_zona
    FROM _dlp_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _dlp_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

  SELECT sum(peso) INTO _sum_pesos FROM _dlp_elegiveis;
  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    IF _zona IS NOT NULL THEN
      -- [ZONA] Ninguém da equipe fixa apto agora: a filial da zona do lead.
      RETURN public._distribuir_lead_v3(
        _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
        'campanha_equipe_fixa_sem_zona',
        jsonb_build_object('campanha', _roleta_slug, 'equipe_fixa', true,
                           'equipe_sem_apto_na_zona', true), true);
    END IF;
    -- [ROLETAS SIMPLES] Lead sem zona e ninguém da equipe apto: o rodízio
    -- entre as filiais, já (antes: 'sem_corretor_disponivel' e o lead só
    -- saía no próximo minuto, pela triagem do cron, para o Plantão).
    RETURN public._distribuir_lead_v3(
      _lead_id, 'automatica'::public.distribuicao_tipo, NULL, NULL, NULL,
      'campanha_equipe_sem_apto',
      jsonb_build_object('campanha', _roleta_slug, 'equipe_fixa', true,
                         'equipe_sem_apto', true), true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _dlp_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _dlp_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  UPDATE public.leads
     SET corretor_id = _picked,
         roleta_slug = _roleta.slug,
         status = CASE
           WHEN status IN ('novo'::public.lead_status,
                           'aguardando_corretor'::public.lead_status,
                           'aguardando_atendimento'::public.lead_status)
             THEN 'aguardando_atendimento'::public.lead_status
           ELSE status
         END,
         data_distribuicao = COALESCE(data_distribuicao, now())
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;

  INSERT INTO public.distribution_log(
    lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado
  )
  VALUES (
    _lead_id, _picked, 'automatica', 'roleta_ponderada',
    _roleta.slug, 'roleta:'||_roleta.slug||':tier'||_tier_picked, 'sucesso'
  );

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked,
    'tier', _tier_picked, 'roleta_slug', _roleta.slug,
    'zona', _zona
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._repassar_lead_campanha(_lead_id uuid, _roleta_slug text, _gatilho text, _contexto_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _roleta record;
  _lead record;
  _zona text;
  _estrita boolean := public._zona_estrita();
  _tentaram uuid[];
  _picked uuid;
  _picked_nome text;
  _tier_picked text;
  _sum_pesos int;
  _n_zona int;
  _ctx jsonb;
  _log_id uuid;
  _excecao_id uuid;
  _motivo_log text;
BEGIN
  SELECT l.id, l.corretor_id, l.corretores_que_tentaram, l.deleted_at, l.na_lixeira
    INTO _lead
    FROM public.leads l WHERE l.id = _lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_inexistente');
  END IF;
  IF _lead.deleted_at IS NOT NULL OR _lead.na_lixeira THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'lead_na_lixeira');
  END IF;

  _zona := public.zona_do_lead(_lead_id);
  -- Quem já teve o lead não recebe de volta — o dono atual incluído, mesmo
  -- que o chamador não o tenha posto na lista.
  _tentaram := array_append(COALESCE(_lead.corretores_que_tentaram, ARRAY[]::uuid[]),
                            _lead.corretor_id);
  _ctx := jsonb_build_object('campanha', _roleta_slug, 'repasse', true)
          || COALESCE(_contexto_extra, '{}'::jsonb);

  SELECT * INTO _roleta FROM public.roletas
   WHERE slug = _roleta_slug AND tipo = 'campanha' AND ativo;

  -- Campanha desligada (ou não é campanha): a triagem normal decide — zona
  -- estrita, pino de zona e origem, como o motor faz com qualquer repasse.
  IF NOT FOUND THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
      _ctx || jsonb_build_object('campanha_inativa', true));
  END IF;

  -- Zona estrita: campanha comum com lead de zona é do time da zona.
  IF _estrita AND _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    RETURN public._distribuir_lead_v3(
      _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho, _ctx);
  END IF;

  -- [ROLETAS SIMPLES] (0083) A equipe é montada ANTES da trava do cursor,
  -- como em distribuir_lead_ponderado: sem ninguém apto, o lead vai para o
  -- motor sem segurar a trava da campanha (ordem de travas oposta à do cron).
  CREATE TEMP TABLE IF NOT EXISTS _rlc_elegiveis (
    rp_id uuid, corretor_id uuid, tier text, peso int
  ) ON COMMIT DROP;
  TRUNCATE _rlc_elegiveis;

  -- Mesma elegibilidade da roleta ponderada (20261009120100), menos quem já
  -- teve o lead.
  INSERT INTO _rlc_elegiveis
  SELECT rp.id, rp.corretor_id, rp.tier,
         CASE rp.tier
           WHEN 'A' THEN _roleta.peso_tier_a
           WHEN 'C' THEN _roleta.peso_tier_c
           ELSE _roleta.peso_tier_b
         END
  FROM public.roleta_participantes rp
  JOIN public.profiles p ON p.id = rp.corretor_id
  WHERE rp.roleta_id = _roleta.id
    AND rp.ativo
    -- Regra dos 65, Fatia 3a: 60 em Em atendimento ou 150 na Minha base param
    -- a roleta (com a regra ligada; em sombra devolve true).
    AND public._em_atendimento_recebe_lead(rp.corretor_id)
    AND NOT (rp.corretor_id = ANY(_tentaram))
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = rp.corretor_id AND ur.role = 'corretor'
    )
    AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    AND p.ativo = true
    AND coalesce(p.telefone,'') <> ''
    AND (NOT _roleta.exigir_presenca OR p.presente = true)
    AND (
      rp.limite_diario IS NULL OR (
        SELECT count(*) FROM public.distribution_log dl
         WHERE dl.corretor_id = rp.corretor_id
           AND dl.roleta_slug = _roleta.slug
           AND dl.resultado = 'sucesso'
           AND dl.created_at >= date_trunc('day', now())
      ) < rp.limite_diario
    );

  IF _estrita THEN
    -- [FILIAL] (0079) Equipe fixa: a campanha manda — o repasse fica entre
    -- quem está nela, de qualquer zona. Sem corte por zona.
    NULL;
  ELSIF _zona IS NOT NULL AND NOT _roleta.equipe_fixa THEN
    -- Comportamento anterior (zona_estrita=false): profiles.zonas com fallback.
    SELECT count(*) INTO _n_zona
    FROM _rlc_elegiveis e
    JOIN public.profiles p ON p.id = e.corretor_id
    WHERE COALESCE(array_length(p.zonas, 1), 0) = 0 OR _zona = ANY(p.zonas);
    IF _n_zona > 0 THEN
      DELETE FROM _rlc_elegiveis e
      USING public.profiles p
      WHERE p.id = e.corretor_id
        AND COALESCE(array_length(p.zonas, 1), 0) > 0
        AND NOT (_zona = ANY(p.zonas));
    END IF;
  END IF;

  SELECT sum(peso) INTO _sum_pesos FROM _rlc_elegiveis;

  IF _sum_pesos IS NULL OR _sum_pesos = 0 THEN
    -- Equipe fixa com lead de zona e ninguém mais da equipe apto: a filial da zona.
    IF _estrita AND _zona IS NOT NULL THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
        _ctx || jsonb_build_object('equipe_fixa', true, 'equipe_sem_apto_na_zona', true));
    END IF;
    -- [ROLETAS SIMPLES] Lead sem zona e ninguém mais da equipe apto: o
    -- rodízio entre as filiais (decisão de 13/10). Quem já teve o lead — o
    -- dono que estourou incluído, os chamadores o põem na lista — fica de
    -- fora; ninguém apto em filial nenhuma, o motor abre a exceção e o lead
    -- segue com o dono atual, como antes.
    IF _estrita THEN
      RETURN public._distribuir_lead_v3(
        _lead_id, 'redistribuicao', NULL, NULL, NULL, _gatilho,
        _ctx || jsonb_build_object('equipe_fixa', true, 'equipe_sem_apto', true));
    END IF;

    -- Ninguém mais na equipe: o lead fica com o dono atual e a exceção abre
    -- (alerta à gestão + backoff do cron). Antes, o cron de parados o
    -- re-tentava a cada minuto, sem fim.
    _motivo_log := 'Repasse na campanha ' || _roleta.slug
                   || ' sem outro corretor apto — lead segue com o dono atual';
    _ctx := _ctx || jsonb_build_object('roleta', _roleta.slug, 'gatilho', _gatilho,
                                       'zona', _zona, 'excluidos_por_tentativa', to_jsonb(_tentaram));
    _excecao_id := public._registrar_excecao_distribuicao(
      _lead_id, 'sem_corretor_elegivel', _motivo_log, _roleta.slug, _ctx);
    INSERT INTO public.distribution_log
      (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
    VALUES
      (_lead_id, NULL, 'redistribuicao', _motivo_log, _roleta.slug,
       'repasse_campanha', 'sem_corretor')
    RETURNING id INTO _log_id;
    INSERT INTO public.distribuicao_log_contexto (log_id, contexto) VALUES (_log_id, _ctx);
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_corretor_elegivel',
                              'excecao_id', _excecao_id, 'roleta', _roleta.slug);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('roleta_swrr:' || _roleta.id::text));

  -- [V2] O estouro do dono que perdeu o lead conta para a pausa automática,
  -- como no repasse do motor.
  IF public._modelo_v2_ativo() AND (_contexto_extra ? 'corretor_anterior_sla') THEN
    PERFORM public._registrar_estouro_sla(
      NULLIF(_contexto_extra->>'corretor_anterior_sla','')::uuid, _lead_id, _roleta.slug);
  END IF;

  UPDATE public.roleta_participantes rp
     SET wrr_current = rp.wrr_current + e.peso
    FROM _rlc_elegiveis e
   WHERE rp.id = e.rp_id;

  SELECT rp.corretor_id, rp.tier
    INTO _picked, _tier_picked
    FROM public.roleta_participantes rp
    JOIN _rlc_elegiveis e ON e.rp_id = rp.id
   ORDER BY rp.wrr_current DESC, rp.corretor_id
   LIMIT 1;

  UPDATE public.roleta_participantes
     SET wrr_current = wrr_current - _sum_pesos,
         ultimo_lead_em = now()
   WHERE roleta_id = _roleta.id AND corretor_id = _picked;

  -- Repasse = entrega nova: relógio do SLA reinicia, dono anterior registrado,
  -- pino da campanha mantido.
  UPDATE public.leads
     SET corretor_anterior_id = corretor_id,
         corretor_id = _picked,
         roleta_slug = _roleta.slug,
         data_distribuicao = now(),
         timestamp_recebimento = now(),
         corretores_que_tentaram = CASE
           WHEN _picked = ANY(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]))
             THEN corretores_que_tentaram
           ELSE array_append(COALESCE(corretores_que_tentaram, ARRAY[]::uuid[]), _picked) END
   WHERE id = _lead_id;

  UPDATE public.profiles SET last_lead_assigned_at = now() WHERE id = _picked;
  SELECT p.nome INTO _picked_nome FROM public.profiles p WHERE p.id = _picked;

  INSERT INTO public.distribution_log
    (lead_id, corretor_id, tipo, motivo, roleta_slug, regra_aplicada, resultado)
  VALUES
    (_lead_id, _picked, 'redistribuicao',
     'Repasse na campanha ' || _roleta.slug || ' (' || _gatilho || ') — tier ' || COALESCE(_tier_picked, 'B'),
     _roleta.slug, 'repasse_campanha:' || _roleta.slug || ':tier' || COALESCE(_tier_picked, 'B'),
     'sucesso')
  RETURNING id INTO _log_id;
  INSERT INTO public.distribuicao_log_contexto (log_id, contexto)
  VALUES (_log_id, _ctx || jsonb_build_object(
    'roleta', _roleta.slug, 'gatilho', _gatilho, 'zona', _zona,
    'excluidos_por_tentativa', to_jsonb(_tentaram),
    'vencedor', jsonb_build_object('corretor_id', _picked, 'nome', _picked_nome)));

  UPDATE public.distribuicao_excecoes
     SET status = 'resolvida', resolvida_em = now(),
         resolucao = 'Repassado na campanha para ' || COALESCE(_picked_nome, '(corretor)')
   WHERE lead_id = _lead_id AND status IN ('pendente','em_analise');

  RETURN jsonb_build_object(
    'ok', true, 'corretor_id', _picked, 'corretor_nome', _picked_nome,
    'tier', _tier_picked, 'roleta', _roleta.slug, 'zona', _zona);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6) A vez única: o estoque não conta como "movimento" da filial. Corpo
--    vigente (20261018120000) + o filtro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._vez_unica_unidades(_familia text)
RETURNS TABLE(unidade text, rotulo text, roleta_slug text, zona text, ordem integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH janela AS (
    SELECT date_trunc('week', now()) - interval '30 days' AS ini,
           date_trunc('week', now()) AS fim
  ),
  n_zona AS (
    SELECT c.contexto ->> 'zona' AS zona, count(*)::int AS leads
      FROM public.distribution_log dl
      JOIN public.distribuicao_log_contexto c ON c.log_id = dl.id
      CROSS JOIN janela j
     WHERE _familia = 'sdr'
       AND dl.created_at >= j.ini AND dl.created_at < j.fim
       AND dl.resultado = 'sucesso'
       AND c.contexto ? 'zona'
     GROUP BY 1
  ),
  n_roleta AS (
    SELECT dl.roleta_slug, count(*)::int AS leads
      FROM public.distribution_log dl
      CROSS JOIN janela j
     WHERE _familia = 'zona'
       AND dl.created_at >= j.ini AND dl.created_at < j.fim
       AND dl.resultado = 'sucesso'
       AND dl.roleta_slug IS NOT NULL
       -- [ROLETAS SIMPLES] (0083) O estoque não é "movimento" da filial.
       AND dl.regra_aplicada IS DISTINCT FROM 'estoque_filial'
     GROUP BY 1
  ),
  sdr AS (
    SELECT DISTINCT zr.zona AS unidade, zr.zona AS rotulo, 'agendados-sdr'::text AS roleta_slug, zr.zona,
           coalesce(n.leads, 0) AS leads,
           coalesce(array_position(public._zonas_canonicas(), zr.zona), 99) AS desempate,
           zr.zona AS desempate2
      FROM public.zonas_roletas zr
      LEFT JOIN n_zona n ON n.zona = zr.zona
     WHERE _familia = 'sdr'
  ),
  filiais AS (
    SELECT r.slug AS unidade,
           coalesce(f.nome, r.nome) AS rotulo,
           r.slug AS roleta_slug,
           (SELECT min(zr.zona) FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug) AS zona,
           coalesce(n.leads, 0) AS leads,
           coalesce(f.ordem, 99) AS desempate,
           r.slug AS desempate2
      FROM public.roletas r
      LEFT JOIN public.filiais f ON f.id = r.filial_id
      LEFT JOIN n_roleta n ON n.roleta_slug = r.slug
     WHERE _familia = 'zona' AND r.tipo = 'zona' AND r.ativo
       AND EXISTS (SELECT 1 FROM public.zonas_roletas zr WHERE zr.roleta_slug = r.slug)
  ),
  todas AS (
    SELECT * FROM sdr UNION ALL SELECT * FROM filiais
  )
  SELECT t.unidade, t.rotulo, t.roleta_slug, t.zona,
         row_number() OVER (ORDER BY t.leads DESC, t.desempate, t.desempate2)::int AS ordem
    FROM todas t;
$$;

-- ---------------------------------------------------------------------------
-- 7) A régua da roleta (_elegibilidade_roleta). Corpo vigente
--    (20261010120700) + o estoque fora da cota do dia.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._elegibilidade_roleta(_slug text, _corretor_id uuid DEFAULT NULL)
RETURNS TABLE (
  corretor_id uuid,
  nome text,
  apto boolean,
  motivos text[],
  pct_trabalhado numeric,
  carteira_total integer,
  aguardando integer,
  recebidos_hoje integer,
  recebidos_mes integer,
  limite_diario integer,
  presente boolean,
  pausado boolean,
  motivo_pausa text,
  participante_ativo boolean,
  ultimo_lead_em timestamptz,
  incluido_por uuid,
  incluido_em timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT (public.get_dist_setting('percentual_minimo_trabalhado') #>> '{}')::numeric AS pct_min,
           (public.get_dist_setting('limite_diario_default') #>> '{}')::int            AS lim_default,
           (public.get_dist_setting('cota_conta_redistribuicao') #>> '{}')::boolean    AS conta_redist,
           ARRAY(SELECT jsonb_array_elements_text(public.get_dist_setting('statuses_aguardando'))) AS st_aguardando,
           ARRAY(SELECT jsonb_array_elements_text(public.get_dist_setting('statuses_encerrados'))) AS st_encerrados,
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje_brt
  ),
  r AS (
    SELECT * FROM public.roletas WHERE slug = _slug
  ),
  base AS (
    SELECT rp.corretor_id,
           p.nome,
           rp.ativo AS participante_ativo,
           (rp.pausado_ate IS NOT NULL AND rp.pausado_ate > now()) AS pausado,
           rp.motivo_pausa,
           rp.ultimo_lead_em,
           rp.incluido_por,
           rp.incluido_em,
           COALESCE(rp.limite_diario, cfg.lim_default) AS limite,
           p.ativo AS perfil_ativo,
           (p.telefone IS NOT NULL AND btrim(p.telefone) <> '') AS tem_telefone,
           (p.presente AND p.presente_em IS NOT NULL
             AND (p.presente_em AT TIME ZONE 'America/Sao_Paulo')::date = cfg.hoje_brt) AS presente_hoje,
           EXISTS (
             SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = p.id AND ur.role = 'corretor'::app_role
           ) AS eh_corretor,
           -- Regra dos 65, Fatia 3a: com a regra ligada, 60 em Em atendimento
           -- ou 150 na Minha base param a entrada de lead novo (decisão 10).
           public._em_atendimento_recebe_lead(rp.corretor_id) AS recebe_65,
           r.exigir_presenca,
           r.criterio_participacao,
           cfg.pct_min,
           cfg.st_aguardando,
           cfg.st_encerrados,
           cfg.conta_redist,
           cfg.hoje_brt
    FROM public.roleta_participantes rp
    JOIN r ON r.id = rp.roleta_id
    JOIN public.profiles p ON p.id = rp.corretor_id
    CROSS JOIN cfg
    WHERE lower(coalesce(p.nome, '')) <> 'docs-bot'
      AND (_corretor_id IS NULL OR rp.corretor_id = _corretor_id)
  ),
  carteira AS (
    SELECT b.corretor_id,
           count(l.id)::int AS total,
           (count(l.id) FILTER (WHERE l.status::text = ANY(b.st_aguardando)))::int AS aguardando
    FROM base b
    LEFT JOIN public.leads l
      ON l.corretor_id = b.corretor_id
     AND l.deleted_at IS NULL
     AND l.na_lixeira = false
     AND NOT (l.status::text = ANY(b.st_encerrados))
    GROUP BY b.corretor_id
  ),
  recebidos AS (
    -- Contadores derivados do LOG (fonte auditável) em dia/mês BRT — nada de
    -- contador mutável com cron de reset. Linhas legadas (roleta_slug NULL,
    -- anteriores ao cutover) contam em TODAS as roletas: conservador — impede
    -- cota dupla no dia da virada; param de crescer após o cutover.
    SELECT b.corretor_id,
           (count(dl.id) FILTER (
              WHERE (dl.created_at AT TIME ZONE 'America/Sao_Paulo')::date = b.hoje_brt))::int AS hoje_n,
           count(dl.id)::int AS mes_n
    FROM base b
    LEFT JOIN public.distribution_log dl
      ON dl.corretor_id = b.corretor_id
     AND dl.resultado = 'sucesso'
     AND (dl.roleta_slug = _slug OR dl.roleta_slug IS NULL)
     -- [ROLETAS SIMPLES] (0083) O estoque entregue pelas filiais (lote por
     -- vaga na carteira) não conta na cota do dia: um lote de 30 esgotava a
     -- cota da filial e travava o lead quente do corretor.
     AND dl.regra_aplicada IS DISTINCT FROM 'estoque_filial'
     AND (dl.tipo IN ('automatica','inicial')
          OR (b.conta_redist AND dl.tipo = 'redistribuicao'))
     AND dl.created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
                           AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY b.corretor_id
  )
  SELECT
    b.corretor_id,
    b.nome,
    -- apto = passa em TODOS os critérios da roleta
    ( b.participante_ativo
      AND NOT b.pausado
      AND b.perfil_ativo
      AND b.eh_corretor
      AND b.tem_telefone
      AND b.recebe_65
      AND (NOT b.exigir_presenca OR b.presente_hoje)
      AND rec.hoje_n < b.limite
      AND (b.criterio_participacao <> 'automatica_presenca'
           OR c.total = 0
           OR round(100.0 * (c.total - c.aguardando) / c.total, 1) >= b.pct_min)
    ) AS apto,
    array_remove(ARRAY[
      CASE WHEN NOT b.participante_ativo THEN 'participacao_inativa' END,
      CASE WHEN b.pausado THEN 'pausado' END,
      CASE WHEN NOT b.perfil_ativo THEN 'perfil_inativo' END,
      CASE WHEN NOT b.eh_corretor THEN 'sem_role_corretor' END,
      CASE WHEN NOT b.tem_telefone THEN 'sem_telefone' END,
      CASE WHEN NOT b.recebe_65 THEN 'regra_65_sem_vaga' END,
      CASE WHEN b.exigir_presenca AND NOT b.presente_hoje THEN 'ausente_hoje' END,
      CASE WHEN rec.hoje_n >= b.limite THEN 'cota_diaria_atingida' END,
      CASE WHEN b.criterio_participacao = 'automatica_presenca'
                AND c.total > 0
                AND round(100.0 * (c.total - c.aguardando) / c.total, 1) < b.pct_min
           THEN 'pct_trabalhado_abaixo_minimo' END
    ], NULL) AS motivos,
    CASE WHEN c.total = 0 THEN 100
         ELSE round(100.0 * (c.total - c.aguardando) / c.total, 1) END AS pct_trabalhado,
    c.total AS carteira_total,
    c.aguardando,
    rec.hoje_n AS recebidos_hoje,
    rec.mes_n AS recebidos_mes,
    b.limite AS limite_diario,
    b.presente_hoje AS presente,
    b.pausado,
    b.motivo_pausa,
    b.participante_ativo,
    b.ultimo_lead_em,
    b.incluido_por,
    b.incluido_em
  FROM base b
  JOIN carteira c ON c.corretor_id = b.corretor_id
  JOIN recebidos rec ON rec.corretor_id = b.corretor_id;
$$;

-- ---------------------------------------------------------------------------
-- 9) O estoque pelas FILIAIS (decisão 4). Corpo vigente de
--    distribuir_estoque_roleta (20261009120100) com:
--      * uma linha por CORRETOR (não por roleta): quem está em duas filiais
--        recebe um lote só — nunca acima das vagas da carteira;
--      * o corretor recebe o estoque das zonas das filiais em que está APTO
--        (pausado na Liberdade e apto na Belém: só Leste e Grande SP), mais o
--        estoque sem zona;
--      * a parte do SDR roda UMA vez por rodada;
--      * cron e botão nunca rodam juntos (trava sem espera);
--      * a entrega vai rotulada 'estoque_filial' (o motor faz isso pelo
--        gatilho 'estoque'): fora da cota do dia e sem andar a fila.
--    Ordem dos corretores: há mais tempo sem receber lead de qualquer tipo
--    (profiles.last_lead_assigned_at, que o estoque também anda) — o lote
--    gira entre o time; empate, quem entrou primeiro no time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.distribuir_estoque_filiais(_limite integer DEFAULT 30, _roletas text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _lead record;
  _res jsonb;
  _ok int := 0;
  _corretores int := 0;
  _sem_vaga int := 0;
  _uid uuid := auth.uid();
  _por_corretor int;
  _lote int;
  _vagas int;
  _entregues int;
  _sdr jsonb := NULL;
  _teto int;
  _base_sdr int;
  _estrita boolean := public._zona_estrita();
  _zonas text[];
  _slug text;
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  -- Cron e botão nunca na mesma hora: a segunda rodada desiste (sem esperar).
  IF NOT pg_try_advisory_xact_lock(hashtext('estoque_filiais')) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'escoamento_em_andamento');
  END IF;

  _por_corretor := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);

  IF public._sdr_ativo() THEN
    _teto := public._sdr_setting_int('sdr_teto_leads_ativos', 0);
    SELECT count(*) INTO _base_sdr
      FROM public.leads l
     WHERE l.deleted_at IS NULL
       AND COALESCE(l.na_lixeira, false) = false
       AND l.sdr_id IS NOT NULL
       AND l.sdr_entregue_em IS NULL
       AND l.corretor_id IS NULL;

    IF _teto <= 0 OR _base_sdr < _teto THEN
      _sdr := public.distribuir_estoque_sdr(
        CASE WHEN _teto > 0 THEN LEAST(_por_corretor, _teto - _base_sdr) ELSE _por_corretor END);
    ELSE
      _sdr := jsonb_build_object('ok', true, 'modelo', 'sdr', 'distribuidos', 0,
                                 'motivo', 'teto_base_sdr_atingido', 'base_ativa', _base_sdr, 'teto', _teto);
    END IF;
  END IF;

  -- [ZONA] Estoque com a zona já resolvida (uma vez por rodada).
  CREATE TEMP TABLE IF NOT EXISTS _estoque_zona (
    lead_id uuid PRIMARY KEY, created_at timestamptz, zona text
  ) ON COMMIT DROP;
  TRUNCATE _estoque_zona;
  INSERT INTO _estoque_zona (lead_id, created_at, zona)
  SELECT l.id, l.created_at,
         CASE WHEN _estrita THEN public._zona_do_lead_campos(l.zona, l.bairro, l.projeto_id) END
    FROM public.leads l
   WHERE l.deleted_at IS NULL
     AND COALESCE(l.na_lixeira, false) = false
     AND l.corretor_id IS NULL
     AND l.sdr_id IS NULL
     AND l.status = 'aguardando_corretor';

  FOR _c IN
    WITH fil AS (
      SELECT r.slug, coalesce(f.ordem, 99) AS ordem
        FROM public.roletas r
        LEFT JOIN public.filiais f ON f.id = r.filial_id
       WHERE r.ativo AND r.tipo = 'zona' AND r.filial_id IS NOT NULL
         AND (_roletas IS NULL OR r.slug = ANY (_roletas))
    ),
    e AS (
      SELECT fil.slug, fil.ordem, el.corretor_id, el.incluido_em
        FROM fil
        CROSS JOIN LATERAL public._elegibilidade_roleta(fil.slug) el
       -- Como antes: a cota do dia não barra o estoque (que não conta nela).
       WHERE el.apto
          OR (COALESCE(el.motivos, ARRAY[]::text[]) <@ ARRAY['cota_diaria_atingida']
              AND COALESCE(array_length(el.motivos, 1), 0) > 0)
    )
    SELECT e.corretor_id,
           array_agg(e.slug ORDER BY e.ordem, e.slug) AS roletas
      FROM e
      JOIN public.profiles p ON p.id = e.corretor_id
     GROUP BY e.corretor_id, p.last_lead_assigned_at
     -- Empate: quem entrou primeiro no time (o desempate de sempre).
     ORDER BY p.last_lead_assigned_at ASC NULLS FIRST, min(e.incluido_em) ASC, e.corretor_id
  LOOP
    _vagas := public.carteira_vagas_entrada_v1(_c.corretor_id);
    IF _vagas <= 0 THEN
      _sem_vaga := _sem_vaga + 1;
      CONTINUE;
    END IF;

    _corretores := _corretores + 1;
    _entregues := 0;
    _lote := LEAST(_por_corretor, _vagas);
    -- Só as zonas das filiais em que ele está APTO agora.
    _zonas := ARRAY(SELECT DISTINCT zr.zona FROM public.zonas_roletas zr
                     WHERE zr.roleta_slug = ANY (_c.roletas));

    FOR _lead IN
      SELECT ez.lead_id AS id, ez.zona
        FROM _estoque_zona ez
        JOIN public.leads l ON l.id = ez.lead_id
       WHERE l.deleted_at IS NULL
         AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL
         AND l.sdr_id IS NULL
         AND l.status = 'aguardando_corretor'
         AND (NOT _estrita OR ez.zona IS NULL OR ez.zona = ANY (_zonas))
       ORDER BY ez.created_at ASC
       LIMIT _lote
       FOR UPDATE OF l SKIP LOCKED
    LOOP
      -- O rótulo da entrega: a filial dele que atende a zona do lead (sem
      -- zona: a primeira dele). Só rotula o log — fora da cota, ver o motor.
      _slug := CASE
        WHEN _lead.zona IS NULL THEN _c.roletas[1]
        ELSE (SELECT s FROM unnest(_c.roletas) s
               WHERE public._roleta_atende_zona(s, _lead.zona) LIMIT 1) END;

      _res := public._distribuir_lead_v3(
        _lead.id, 'automatica'::distribuicao_tipo, _slug, _c.corretor_id, _uid,
        'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_filiais',
                                      'lote_por_corretor', _lote,
                                      'vagas_na_carteira', _vagas), false);

      IF COALESCE((_res->>'ok')::boolean, false) THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento'
         WHERE id = _lead.id AND status = 'aguardando_corretor';
        _ok := _ok + 1;
        _entregues := _entregues + 1;
      END IF;
    END LOOP;

    -- Sem zona estrita, "nada entregue" = estoque vazio. Com ela, pode ser só
    -- a região DESTE corretor sem estoque — o próximo segue na fila.
    EXIT WHEN _entregues = 0 AND NOT _estrita;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', 'filiais',
    'roletas', COALESCE(to_jsonb(_roletas), 'null'::jsonb),
    'distribuidos', _ok,
    'sdr', _sdr,
    'corretores_aptos', _corretores,
    'corretores_sem_vaga', _sem_vaga,
    'lote_por_corretor', _por_corretor,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.sdr_id IS NULL AND l.status = 'aguardando_corretor'),
    'restante_por_zona', (
      SELECT COALESCE(jsonb_object_agg(COALESCE(t.zona, 'sem_zona'), t.n), '{}'::jsonb)
        FROM (SELECT ez.zona, count(*) AS n
                FROM _estoque_zona ez
                JOIN public.leads l ON l.id = ez.lead_id
               WHERE l.corretor_id IS NULL AND l.status = 'aguardando_corretor'
               GROUP BY ez.zona) t)
  );
END;
$function$;

-- O corpo antigo (por UMA roleta) fica guardado para campanha ativa e para o
-- rollback (Plantão religado pelo script).
CREATE OR REPLACE FUNCTION public._distribuir_estoque_roleta_legado(_roleta text, _limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _c record;
  _lead record;
  _res jsonb;
  _ok int := 0;
  _corretores int := 0;
  _sem_vaga int := 0;
  _uid uuid := auth.uid();
  _por_corretor int;
  _lote int;
  _vagas int;
  _entregues int;
  _sdr jsonb := NULL;
  _teto int;
  _base_sdr int;
  _estrita boolean := public._zona_estrita();
  _regiao text[];
BEGIN
  IF _uid IS NOT NULL
     AND NOT (public.has_role(_uid, 'admin') OR public.has_role(_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para escoar o estoque de leads';
  END IF;

  _por_corretor := LEAST(GREATEST(COALESCE(_limite, 30), 1), 200);

  IF public._sdr_ativo() THEN
    _teto := public._sdr_setting_int('sdr_teto_leads_ativos', 0);
    SELECT count(*) INTO _base_sdr
      FROM public.leads l
     WHERE l.deleted_at IS NULL
       AND COALESCE(l.na_lixeira, false) = false
       AND l.sdr_id IS NOT NULL
       AND l.sdr_entregue_em IS NULL
       AND l.corretor_id IS NULL;

    IF _teto <= 0 OR _base_sdr < _teto THEN
      _sdr := public.distribuir_estoque_sdr(
        CASE WHEN _teto > 0 THEN LEAST(_por_corretor, _teto - _base_sdr) ELSE _por_corretor END);
    ELSE
      _sdr := jsonb_build_object('ok', true, 'modelo', 'sdr', 'distribuidos', 0,
                                 'motivo', 'teto_base_sdr_atingido', 'base_ativa', _base_sdr, 'teto', _teto);
    END IF;
  END IF;

  -- [ZONA] Estoque com a zona já resolvida (uma vez por rodada).
  CREATE TEMP TABLE IF NOT EXISTS _estoque_zona (
    lead_id uuid PRIMARY KEY, created_at timestamptz, zona text
  ) ON COMMIT DROP;
  TRUNCATE _estoque_zona;
  INSERT INTO _estoque_zona (lead_id, created_at, zona)
  SELECT l.id, l.created_at,
         CASE WHEN _estrita THEN public._zona_do_lead_campos(l.zona, l.bairro, l.projeto_id) END
    FROM public.leads l
   WHERE l.deleted_at IS NULL
     AND COALESCE(l.na_lixeira, false) = false
     AND l.corretor_id IS NULL
     AND l.sdr_id IS NULL
     AND l.status = 'aguardando_corretor';

  FOR _c IN
    SELECT e.corretor_id
      FROM public._elegibilidade_roleta(_roleta) e
     WHERE e.apto
        OR (COALESCE(e.motivos, ARRAY[]::text[]) <@ ARRAY['cota_diaria_atingida']
            AND COALESCE(array_length(e.motivos, 1), 0) > 0)
     ORDER BY e.ultimo_lead_em ASC NULLS FIRST, e.incluido_em ASC
  LOOP
    _vagas := public.carteira_vagas_entrada_v1(_c.corretor_id);
    IF _vagas <= 0 THEN
      _sem_vaga := _sem_vaga + 1;
      CONTINUE;
    END IF;

    _corretores := _corretores + 1;
    _entregues := 0;
    _lote := LEAST(_por_corretor, _vagas);
    _regiao := public.regiao_do_corretor(_c.corretor_id);

    FOR _lead IN
      SELECT ez.lead_id AS id
        FROM _estoque_zona ez
        JOIN public.leads l ON l.id = ez.lead_id
       WHERE l.deleted_at IS NULL
         AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL
         AND l.sdr_id IS NULL
         AND l.status = 'aguardando_corretor'
         AND (NOT _estrita OR ez.zona IS NULL OR ez.zona = ANY (_regiao))
       ORDER BY ez.created_at ASC
       LIMIT _lote
    LOOP
      _res := public._distribuir_lead_v3(
        _lead.id, 'automatica'::distribuicao_tipo, _roleta, _c.corretor_id, _uid,
        'estoque', jsonb_build_object('origem_rotina', 'distribuir_estoque_roleta',
                                      'lote_por_corretor', _lote,
                                      'vagas_na_carteira', _vagas), false);

      IF COALESCE((_res->>'ok')::boolean, false) THEN
        UPDATE public.leads
           SET status = 'aguardando_atendimento'
         WHERE id = _lead.id AND status = 'aguardando_corretor';
        _ok := _ok + 1;
        _entregues := _entregues + 1;
      END IF;
    END LOOP;

    -- Sem zona estrita, "nada entregue" = estoque vazio. Com ela, pode ser só
    -- a região DESTE corretor sem estoque — o próximo segue na fila.
    EXIT WHEN _entregues = 0 AND NOT _estrita;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'roleta', _roleta,
    'distribuidos', _ok,
    'sdr', _sdr,
    'corretores_aptos', _corretores,
    'corretores_sem_vaga', _sem_vaga,
    'lote_por_corretor', _por_corretor,
    'restante_estoque', (
      SELECT count(*) FROM public.leads l
       WHERE l.deleted_at IS NULL AND COALESCE(l.na_lixeira, false) = false
         AND l.corretor_id IS NULL AND l.sdr_id IS NULL AND l.status = 'aguardando_corretor'),
    'restante_por_zona', (
      SELECT COALESCE(jsonb_object_agg(COALESCE(t.zona, 'sem_zona'), t.n), '{}'::jsonb)
        FROM (SELECT ez.zona, count(*) AS n
                FROM _estoque_zona ez
                JOIN public.leads l ON l.id = ez.lead_id
               WHERE l.corretor_id IS NULL AND l.status = 'aguardando_corretor'
               GROUP BY ez.zona) t)
  );
END;
$function$;

-- Mesma assinatura (o botão da tela antiga e os testes chamam por nome):
-- filial ativa → o estoque daquela filial; outra roleta ATIVA (campanha, ou
-- o Plantão religado no rollback) → o corpo antigo; roleta desligada ou
-- desconhecida (o 'plantao' padrão) → todas as filiais.
CREATE OR REPLACE FUNCTION public.distribuir_estoque_roleta(_roleta text DEFAULT 'plantao'::text, _limite integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.roletas r
              WHERE r.slug = _roleta AND r.ativo AND r.tipo = 'zona' AND r.filial_id IS NOT NULL) THEN
    RETURN public.distribuir_estoque_filiais(_limite, ARRAY[_roleta]);
  ELSIF EXISTS (SELECT 1 FROM public.roletas r WHERE r.slug = _roleta AND r.ativo) THEN
    RETURN public._distribuir_estoque_roleta_legado(_roleta, _limite);
  END IF;
  RETURN public.distribuir_estoque_filiais(_limite);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 10) O check-in acorda também o lead SEM zona que espera (o rodízio das
--     filiais o entrega a quem acabou de chegar). Corpo vigente
--     (20261009120100) + a condição da zona.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._zona_destravar_espera(_corretor uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  _n integer;
  _regiao text[] := public.regiao_do_corretor(_corretor);
BEGIN
  IF cardinality(_regiao) = 0 THEN
    RETURN 0;
  END IF;
  UPDATE public.distribuicao_excecoes e
     SET tentativas = 0, updated_at = now()
   WHERE e.status IN ('pendente', 'em_analise')
     AND e.motivo IN ('sem_corretor_na_zona', 'zona_sem_time',
                      'sem_corretor_elegivel', 'sem_corretor_ativo')
     AND e.tentativas > 0
     -- [ROLETAS SIMPLES] (0083) sem zona = rodízio entre as filiais.
     AND (public.zona_do_lead(e.lead_id) IS NULL
          OR public.zona_do_lead(e.lead_id) = ANY (_regiao));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 11) Painel da Central: os cartões passam a ser Filiais, Marquinhos e SDR.
--     aptos_filiais conta PESSOAS (quem está em duas filiais conta uma vez).
--     As chaves antigas (aptos_plantao, aptos_landing) seguem existindo com o
--     número das filiais: a tela antiga continua de pé até a publicação.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.painel_distribuicao_resumo()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _max_min int := (public.get_dist_setting('max_minutos_sem_atendimento') #>> '{}')::int;
  -- Fronteiras do dia BRT como timestamptz: predicados sargáveis no log.
  _dia_ini timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                          AT TIME ZONE 'America/Sao_Paulo';
  _dia_fim timestamptz := (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                           + interval '1 day') AT TIME ZONE 'America/Sao_Paulo';
  _aptos_filiais int;
  _aptos_por_filial jsonb;
  _pct_medio numeric;
  _out jsonb;
BEGIN
  IF _caller IS NOT NULL
     AND NOT public.has_role(_caller, 'admin')
     AND NOT public.has_role(_caller, 'gestor')
     AND NOT public.has_role(_caller, 'superintendente') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Uma única passada nas filiais alimenta os três números.
  WITH fil AS (
    SELECT r.slug FROM public.roletas r
     WHERE r.ativo AND r.tipo = 'zona' AND r.filial_id IS NOT NULL
  ),
  e AS (
    SELECT fil.slug, el.corretor_id, el.apto, el.participante_ativo, el.pct_trabalhado
      FROM fil CROSS JOIN LATERAL public._elegibilidade_roleta(fil.slug) el
  ),
  por AS (
    SELECT e.slug, (count(*) FILTER (WHERE e.apto))::int AS n FROM e GROUP BY e.slug
  )
  SELECT (SELECT count(DISTINCT e.corretor_id) FROM e WHERE e.apto)::int,
         (SELECT COALESCE(jsonb_object_agg(por.slug, por.n), '{}'::jsonb) FROM por),
         (SELECT COALESCE(round(avg(e.pct_trabalhado) FILTER (WHERE e.participante_ativo), 1), 100) FROM e)
    INTO _aptos_filiais, _aptos_por_filial, _pct_medio;

  SELECT jsonb_build_object(
    'distribuidos_hoje', (
      SELECT count(*) FROM public.distribution_log dl
      WHERE dl.resultado = 'sucesso'
        AND dl.created_at >= _dia_ini AND dl.created_at < _dia_fim
    ),
    'aguardando_distribuicao', (
      SELECT count(*) FROM public.leads l
      WHERE l.corretor_id IS NULL
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.status IN ('novo','aguardando_atendimento')
    ),
    'excecoes_pendentes', (
      SELECT count(*) FROM public.distribuicao_excecoes e
      WHERE e.status IN ('pendente','em_analise')
    ),
    'aptos_filiais', _aptos_filiais,
    'aptos_por_filial', _aptos_por_filial,
    'aptos_marquinhos', (
      SELECT count(*) FROM public._elegibilidade_roleta('marquinhos') e WHERE e.apto
    ),
    -- O SDR entrega por agenda (apto depende do horário da visita): o número
    -- é o time ativo e sem pausa.
    'time_sdr', (
      SELECT count(*) FROM public.roleta_participantes rp
        JOIN public.roletas r ON r.id = rp.roleta_id
        JOIN public.profiles p ON p.id = rp.corretor_id
       WHERE r.slug = 'agendados-sdr' AND r.ativo AND rp.ativo AND p.ativo
         AND (rp.pausado_ate IS NULL OR rp.pausado_ate < now())
    ),
    'sem_zona_da_vez', public.roleta_sem_zona_da_vez(),
    -- Compatibilidade com a tela antiga (até a publicação do front).
    'aptos_plantao', _aptos_filiais,
    'aptos_landing', _aptos_filiais,
    'sem_atendimento', (
      SELECT count(*) FROM public.leads l
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL
        AND COALESCE(l.data_distribuicao, l.created_at) < now() - (_max_min || ' minutes')::interval
    ),
    'parados_timeout', (
      SELECT count(*) FROM public.leads l
      LEFT JOIN public.distribuicao_config dc ON dc.origem = l.origem
      WHERE l.status = 'aguardando_atendimento'
        AND l.deleted_at IS NULL AND l.na_lixeira = false
        AND l.corretor_id IS NOT NULL
        AND COALESCE(l.data_distribuicao, l.created_at)
              < now() - (COALESCE(dc.timeout_horas, 24) || ' hours')::interval
    ),
    'pct_medio_trabalhado', _pct_medio,
    'erros_24h', (
      SELECT count(*) FROM public.distribution_log dl
      WHERE dl.resultado IN ('sem_corretor','erro','excecao')
        AND dl.created_at > now() - interval '24 hours'
    ),
    'atualizado_em', now()
  ) INTO _out;

  RETURN _out;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 12) O mapa origem → roleta: depois de 13/10 só a Roleta Marquinhos ou
--     NENHUMA (= as filiais: zona do lead; sem zona, o rodízio). Sem CHECK
--     na tabela de propósito: ela é lida pelas views de leads o tempo todo e
--     o rollback tem de ser só de dados. Corpo vigente (20260709120400) + a
--     recusa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atualizar_distribuicao_config(_origem lead_origem, _roleta_slug text DEFAULT NULL::text, _limpar_roleta boolean DEFAULT false, _timeout_horas integer DEFAULT NULL::integer, _timeout_minutos integer DEFAULT NULL::integer, _limpar_timeout_minutos boolean DEFAULT false, _sla_minutos integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _roleta_slug IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.roletas WHERE slug = _roleta_slug) THEN
    RAISE EXCEPTION 'roleta % inexistente', _roleta_slug;
  END IF;
  -- [ROLETAS SIMPLES] (0083) Só existem quatro roletas: a origem vai para a
  -- Marquinhos ou para as filiais (NULL). Campanha entra pelo token dela.
  IF _roleta_slug IS NOT NULL AND _roleta_slug <> 'marquinhos' AND NOT _limpar_roleta THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A origem vai para a Roleta Marquinhos ou para as roletas de filial (deixe sem roleta): '
                || _roleta_slug || ' não é mais destino de origem desde 13/10/2026.';
  END IF;

  SELECT to_jsonb(c) INTO _antes FROM public.distribuicao_config c WHERE c.origem = _origem;

  INSERT INTO public.distribuicao_config (origem) VALUES (_origem)
  ON CONFLICT (origem) DO NOTHING;

  UPDATE public.distribuicao_config c SET
    roleta_slug = CASE WHEN _limpar_roleta THEN NULL ELSE COALESCE(_roleta_slug, c.roleta_slug) END,
    timeout_horas = COALESCE(_timeout_horas, c.timeout_horas),
    timeout_minutos = CASE WHEN _limpar_timeout_minutos THEN NULL ELSE COALESCE(_timeout_minutos, c.timeout_minutos) END,
    sla_minutos = COALESCE(_sla_minutos, c.sla_minutos),
    updated_at = now()
  WHERE c.origem = _origem;

  SELECT to_jsonb(c) INTO _depois FROM public.distribuicao_config c WHERE c.origem = _origem;

  -- Sem mudança efetiva (blur sem edição) → sem ruído na auditoria.
  -- (updated_at muda em todo UPDATE — fica fora da comparação.)
  IF (_antes - 'updated_at') IS DISTINCT FROM (_depois - 'updated_at') THEN
    INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
    VALUES ('distribuicao_config', gen_random_uuid(), 'UPDATE', _caller, _antes, _depois);
  END IF;

  RETURN jsonb_build_object('ok', true, 'config', _depois);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 13) Criar e editar roleta. Mesmas assinaturas (o front antigo chama por
--     nome): a campanha nasce sempre de equipe fixa e sem filial (o gatilho
--     garante; aqui só a descrição e a recusa de filial inexistente somem),
--     e Plantão, Landing e Base não voltam a ser ligadas pela tela.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_roleta_campanha(
  _nome text, _slug text DEFAULT NULL, _projeto_id uuid DEFAULT NULL,
  _equipe_fixa boolean DEFAULT false, _filial_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _caller uuid := auth.uid();
  _base text;
  _slug_final text;
  _n int := 1;
  _linha jsonb;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF btrim(COALESCE(_nome, '')) = '' THEN
    RAISE EXCEPTION 'nome obrigatorio';
  END IF;

  IF _projeto_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = _projeto_id) THEN
    RAISE EXCEPTION 'projeto inexistente';
  END IF;

  -- [ROLETAS SIMPLES] (0083) _equipe_fixa e _filial_slug ficam na assinatura
  -- só pela tela antiga: a campanha é sempre da equipe, de qualquer filial.

  -- Mesma regra de slug que vivia no cliente, agora no servidor (sem
  -- depender de unaccent: translate cobre os acentos do pt-BR).
  _base := left(
    btrim(regexp_replace(
      translate(lower(btrim(COALESCE(_slug, _nome))),
                'áàâãäéèêëíìîïóòôõöúùûüçñ',
                'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9]+', '-', 'g'), '-'),
    60);
  IF _base = '' THEN
    RAISE EXCEPTION 'slug invalido';
  END IF;

  _slug_final := _base;
  WHILE EXISTS (SELECT 1 FROM public.roletas r WHERE r.slug = _slug_final) LOOP
    _n := _n + 1;
    _slug_final := left(_base, 56) || '-' || _n;
  END LOOP;

  INSERT INTO public.roletas
    (slug, nome, descricao, ativo, criterio_participacao, exigir_presenca,
     tipo, equipe_fixa, projeto_id, webhook_token, filial_id)
  VALUES
    (_slug_final, btrim(_nome),
     'Campanha Facebook Ads — a equipe recebe sempre, de qualquer zona e de qualquer filial.',
     true, 'manual', true, 'campanha', true, _projeto_id,
     encode(gen_random_bytes(24), 'hex'), NULL);

  SELECT to_jsonb(r) INTO _linha FROM public.roletas r WHERE r.slug = _slug_final;

  INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
  VALUES ('roletas', (_linha->>'id')::uuid, 'INSERT', _caller, NULL, _linha);

  RETURN jsonb_build_object('ok', true, 'roleta', _linha);
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_roleta(
  _slug text, _ativo boolean DEFAULT NULL, _exigir_presenca boolean DEFAULT NULL,
  _horario_inicio text DEFAULT NULL, _horario_fim text DEFAULT NULL,
  _permitir_fora_horario boolean DEFAULT NULL, _equipe_fixa boolean DEFAULT NULL,
  _projeto_id uuid DEFAULT NULL, _limpar_projeto boolean DEFAULT false,
  _filial_slug text DEFAULT NULL, _limpar_filial boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _antes jsonb;
  _depois jsonb;
  _filial_id uuid;
BEGIN
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _projeto_id IS NOT NULL AND NOT _limpar_projeto
     AND NOT EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = _projeto_id) THEN
    RAISE EXCEPTION 'projeto % inexistente', _projeto_id;
  END IF;
  IF _filial_slug IS NOT NULL AND NOT _limpar_filial THEN
    SELECT f.id INTO _filial_id FROM public.filiais f WHERE f.slug = _filial_slug AND f.ativa;
    IF _filial_id IS NULL THEN
      RAISE EXCEPTION 'filial % inexistente', _filial_slug;
    END IF;
  END IF;

  SELECT to_jsonb(r) INTO _antes FROM public.roletas r WHERE r.slug = _slug;
  IF _antes IS NULL THEN
    RAISE EXCEPTION 'roleta % inexistente', _slug;
  END IF;
  -- equipe_fixa, projeto e filial são semântica de CAMPANHA — nas demais
  -- roletas o pedido é erro, não silêncio. É a guarda de 20260827100000, que
  -- está em produção (a 20260827180000 a tinha perdido no repositório); a
  -- roleta de filial não troca de filial por aqui.
  IF (_equipe_fixa IS NOT NULL OR _projeto_id IS NOT NULL OR _limpar_projeto
      OR _filial_slug IS NOT NULL OR _limpar_filial)
     AND (_antes ->> 'tipo') IS DISTINCT FROM 'campanha' THEN
    RAISE EXCEPTION 'equipe_fixa/projeto/filial valem apenas para roletas de campanha';
  END IF;
  -- [ROLETAS SIMPLES] (0083) Plantão, Landing e Base saíram em 13/10/2026:
  -- religar só pelo script de rollback (docs/ops/roletas-simples.md).
  IF _ativo IS TRUE AND _slug IN ('plantao', 'landing', 'base') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A roleta ' || _slug || ' foi desligada em 13/10/2026 (só existem Campanhas, Filiais, SDR e Marquinhos).';
  END IF;

  UPDATE public.roletas r SET
    ativo = COALESCE(_ativo, r.ativo),
    exigir_presenca = COALESCE(_exigir_presenca, r.exigir_presenca),
    horario_inicio = CASE
      WHEN _horario_inicio IS NULL THEN r.horario_inicio
      WHEN btrim(_horario_inicio) = '' THEN NULL
      ELSE _horario_inicio::time END,
    horario_fim = CASE
      WHEN _horario_fim IS NULL THEN r.horario_fim
      WHEN btrim(_horario_fim) = '' THEN NULL
      ELSE _horario_fim::time END,
    permitir_fora_horario = COALESCE(_permitir_fora_horario, r.permitir_fora_horario),
    -- (na campanha, o gatilho força equipe fixa e sem filial)
    equipe_fixa = COALESCE(_equipe_fixa, r.equipe_fixa),
    projeto_id = CASE
      WHEN _limpar_projeto THEN NULL
      WHEN _projeto_id IS NOT NULL THEN _projeto_id
      ELSE r.projeto_id END,
    filial_id = CASE
      WHEN _limpar_filial THEN NULL
      WHEN _filial_id IS NOT NULL THEN _filial_id
      ELSE r.filial_id END
  WHERE r.slug = _slug;

  SELECT to_jsonb(r) INTO _depois FROM public.roletas r WHERE r.slug = _slug;

  -- Sem mudança efetiva (blur sem edição) → sem ruído na auditoria.
  -- (updated_at muda em todo UPDATE — fica fora da comparação.)
  IF (_antes - 'updated_at') IS DISTINCT FROM (_depois - 'updated_at') THEN
    INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
    VALUES ('roletas', (_depois->>'id')::uuid, 'UPDATE', _caller, _antes, _depois);
  END IF;

  RETURN jsonb_build_object('ok', true, 'roleta', _depois);
END;
$$;

-- #############################################################################
-- BLOCO 3/4 — a virada (dados + cron). Cada linha mexida ganha um registro em
-- audit_log com valores_novos->>'_migracao' = '0083': é a fonte do rollback
-- (docs/ops/roletas-simples.md §Rollback).
-- #############################################################################

-- 3a) Campanhas: equipe fixa e sem filial (o gatilho também força).
WITH antes AS (
  SELECT r.id, to_jsonb(r) AS j
    FROM public.roletas r
   WHERE r.tipo = 'campanha' AND (NOT r.equipe_fixa OR r.filial_id IS NOT NULL)
),
upd AS (
  UPDATE public.roletas r
     SET equipe_fixa = true, filial_id = NULL
    FROM antes a
   WHERE r.id = a.id
  RETURNING r.id, to_jsonb(r) AS depois
)
INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
SELECT 'roletas', u.id, 'UPDATE', NULL, a.j, u.depois || jsonb_build_object('_migracao', '0083')
  FROM upd u JOIN antes a ON a.id = u.id;

-- 3b) Plantão, Landing e Base desligadas — nunca apagadas (participações,
--     histórico e tokens ficam).
WITH antes AS (
  SELECT r.id, to_jsonb(r) AS j
    FROM public.roletas r
   WHERE r.slug IN ('plantao', 'landing', 'base') AND r.ativo
),
upd AS (
  UPDATE public.roletas r
     SET ativo = false,
         descricao = COALESCE(r.descricao, '')
                     || ' [Desativada em 13/10/2026: só existem Campanhas, Filiais, SDR e Marquinhos.]'
    FROM antes a
   WHERE r.id = a.id
  RETURNING r.id, to_jsonb(r) AS depois
)
INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
SELECT 'roletas', u.id, 'UPDATE', NULL, a.j, u.depois || jsonb_build_object('_migracao', '0083')
  FROM upd u JOIN antes a ON a.id = u.id;

-- 3c) Origem → roleta: só a Marquinhos (chatbot) sobra; o resto vai para as
--     filiais (NULL).
WITH antes AS (
  SELECT c.origem, to_jsonb(c) AS j
    FROM public.distribuicao_config c
   WHERE c.roleta_slug IS NOT NULL AND c.roleta_slug <> 'marquinhos'
),
upd AS (
  UPDATE public.distribuicao_config c
     SET roleta_slug = NULL, updated_at = now()
    FROM antes a
   WHERE c.origem = a.origem
  RETURNING c.origem, to_jsonb(c) AS depois
)
INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
SELECT 'distribuicao_config', gen_random_uuid(), 'UPDATE', NULL, a.j,
       u.depois || jsonb_build_object('_migracao', '0083')
  FROM upd u JOIN antes a ON a.origem = u.origem;

-- 3d) Cota diária padrão: 10 → 20 (decisão 5). Só se ainda estiver no
--     padrão antigo: um valor ajustado pela gestão não é atropelado.
WITH antes AS (
  SELECT s.chave, to_jsonb(s) AS j
    FROM public.distribuicao_settings s
   WHERE s.chave = 'limite_diario_default' AND s.valor = '10'::jsonb
),
upd AS (
  UPDATE public.distribuicao_settings s
     SET valor = '20'::jsonb, updated_at = now()
    FROM antes a
   WHERE s.chave = a.chave
  RETURNING s.chave, to_jsonb(s) AS depois
)
INSERT INTO public.audit_log (tabela, registro_id, operacao, usuario_id, valores_antigos, valores_novos)
SELECT 'distribuicao_settings', gen_random_uuid(), 'UPDATE', NULL, a.j,
       u.depois || jsonb_build_object('_migracao', '0083')
  FROM upd u JOIN antes a ON a.chave = u.chave;

-- 3e) O cron do estoque: sai o do Plantão, entra o das filiais.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'distribuir-estoque-plantao';
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'distribuir-estoque-filiais';
  PERFORM cron.schedule('distribuir-estoque-filiais', '*/10 * * * *',
                        $cron$SELECT public.distribuir_estoque_filiais(30);$cron$);
END
$$;

-- #############################################################################
-- BLOCO 4/4 — permissões e a guarda final
-- #############################################################################

REVOKE ALL ON FUNCTION public._roletas_sem_zona(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._roletas_sem_zona(uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.roleta_sem_zona_da_vez() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roleta_sem_zona_da_vez() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.tg_roletas_campanha_equipe_fixa() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.distribuir_lead_ponderado(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribuir_lead_ponderado(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public._repassar_lead_campanha(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._repassar_lead_campanha(uuid, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public._elegibilidade_roleta(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._elegibilidade_roleta(text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public._vez_unica_unidades(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._vez_unica_unidades(text) TO service_role;
REVOKE ALL ON FUNCTION public._zona_destravar_espera(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._zona_destravar_espera(uuid) TO service_role;
REVOKE ALL ON FUNCTION public._distribuir_estoque_roleta_legado(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._distribuir_estoque_roleta_legado(text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.distribuir_estoque_filiais(integer, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_estoque_filiais(integer, text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.distribuir_estoque_roleta(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribuir_estoque_roleta(text, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.painel_distribuicao_resumo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_distribuicao_resumo() TO authenticated;
REVOKE ALL ON FUNCTION public.atualizar_distribuicao_config(public.lead_origem, text, boolean, integer, integer, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_distribuicao_config(public.lead_origem, text, boolean, integer, integer, boolean, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.criar_roleta_campanha(text, text, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_roleta_campanha(text, text, uuid, boolean, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_roleta(text, boolean, boolean, text, text, boolean, boolean, uuid, boolean, text, boolean) TO authenticated, service_role;

DO $$
DECLARE
  _n int;
BEGIN
  -- As três saíram, mas continuam lá (com as participações).
  SELECT count(*) INTO _n FROM public.roletas
   WHERE slug IN ('plantao', 'landing', 'base') AND NOT ativo;
  IF _n <> (SELECT count(*) FROM public.roletas WHERE slug IN ('plantao', 'landing', 'base')) THEN
    RAISE EXCEPTION 'roletas simples: Plantão/Landing/Base deveriam estar desligadas';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roletas
              WHERE tipo = 'campanha' AND (NOT equipe_fixa OR filial_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'roletas simples: campanha sem equipe fixa ou com filial';
  END IF;
  IF EXISTS (SELECT 1 FROM public.distribuicao_config
              WHERE roleta_slug IS NOT NULL AND roleta_slug <> 'marquinhos') THEN
    RAISE EXCEPTION 'roletas simples: origem apontando para roleta que não é a Marquinhos';
  END IF;
  IF (SELECT count(*) FROM public.rodizio_sem_zona rs
        JOIN public.roletas r ON r.slug = rs.roleta_slug
       WHERE r.tipo = 'zona' AND r.filial_id IS NOT NULL) = 0 THEN
    RAISE EXCEPTION 'roletas simples: rodizio_sem_zona sem nenhuma filial';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'distribuir-estoque-filiais')
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'distribuir-estoque-plantao') THEN
    RAISE EXCEPTION 'roletas simples: cron do estoque não trocado';
  END IF;
  IF position('rodizio_sem_zona' IN pg_get_functiondef(
       'public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean)'::regprocedure)) = 0
     OR position('clock_timestamp()' IN pg_get_functiondef(
       'public._distribuir_lead_v3(uuid, public.distribuicao_tipo, text, uuid, uuid, text, jsonb, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'roletas simples: motor sem o rodízio do lead sem zona';
  END IF;
  IF to_regprocedure('public.distribuir_estoque_filiais(integer, text[])') IS NULL
     OR has_function_privilege('anon', 'public.distribuir_estoque_filiais(integer, text[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.roleta_sem_zona_da_vez()', 'EXECUTE') THEN
    RAISE EXCEPTION 'roletas simples: funções novas ausentes ou executáveis por anon';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
