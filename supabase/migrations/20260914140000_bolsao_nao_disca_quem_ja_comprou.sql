-- ============================================================================
-- Bolsão — não se disca quem já comprou, nem quem nunca teve perfil
-- ============================================================================
-- Motivado pela reconciliação de 13/09/2026 (§12.4 do documento): a diferença
-- de 2.452 leads entre duas medições não era crescimento da base — era filtro
-- meu. A consulta do §3 não contava `perdido` (2.354) nem `contrato_fechado`
-- (94) entre os leads com dono. Somados, 2.448: a conta fecha.
--
-- Isso trouxe à tona um número que o desenho nunca tratou: **2.354 leads
-- `perdido` COM dono**. Eles vão para o Bolsão na virada — foi o próprio
-- corretor que os deu por perdidos, então soltá-los não é confisco — mas nem
-- todo perdido é material de discador.
--
-- O motor de SDR (20260904102000) já resolveu essa pergunta e a resposta está
-- lá desde setembro: ao reciclar perdidos, ele pula
-- `ja_possui_imovel`, `comprou_concorrente` e `sem_perfil`. São os três
-- motivos em que reabordar não é oportunidade, é incômodo — ligar para quem
-- acabou de comprar apartamento (nosso ou do concorrente) queima a marca.
--
-- O Bolsão reusa a MESMA lista. A alternativa seria o discador e o SDR
-- trabalharem populações diferentes por acidente de escrita.
--
-- NOTA DE DÍVIDA: o motor de SDR carrega a lista inline, e esta migration a
-- coloca numa função. Enquanto as duas existirem, são duas fontes para a
-- mesma regra. Unificar o motor sobre `motivo_perda_sem_retrabalho` é o
-- passo seguinte, e está fora do escopo desta fatia porque mexer no motor de
-- SDR pede a suíte dele junto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.motivo_perda_sem_retrabalho(_motivo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(_motivo, 'outro')
    IN ('ja_possui_imovel', 'comprou_concorrente', 'sem_perfil');
$$;

COMMENT ON FUNCTION public.motivo_perda_sem_retrabalho(text) IS
  'Motivos de perda em que reabordar é incômodo, não oportunidade. Mesma '
  'lista que o motor de SDR (20260904102000) aplica ao reciclar perdidos.';

CREATE OR REPLACE FUNCTION public.bolsao_v1(
  _busca text DEFAULT NULL,
  _limite integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  lead_id uuid,
  nome text,
  telefone_mascarado text,
  status public.lead_status,
  origem public.lead_origem,
  projeto_nome text,
  bairro text,
  zona text,
  parado_desde timestamptz,
  dias_parado integer,
  tem_interacao boolean,
  tem_contato boolean,
  em_triagem_sdr boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    l.id,
    l.nome,
    public.telefone_mascarado(l.telefone),
    l.status,
    l.origem,
    l.projeto_nome,
    l.bairro,
    l.zona,
    COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato), l.created_at),
    GREATEST(0, (EXTRACT(day FROM now()
      - COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato),
                 l.created_at)))::integer),
    l.ultima_interacao IS NOT NULL,
    l.ultimo_contato IS NOT NULL,
    l.sdr_id IS NOT NULL
  FROM public.leads AS l
  WHERE public.is_active_member(auth.uid())
    AND l.corretor_id IS NULL
    AND l.deleted_at IS NULL
    AND NOT l.na_lixeira
    AND NOT COALESCE(l.opt_out, false)
    AND public.telefone_discavel(l.telefone)
    AND NOT public._lead_venda_viva(l.id)
    -- Discagem: o CRM ainda chama este lead de fechado. Mesmo que a venda
    -- tenha caído, quem olha a tela não sabe disso — e um robô ligando para
    -- "contrato fechado" é constrangimento com o cliente, não oportunidade.
    AND l.status NOT IN ('contrato_fechado'::public.lead_status,
                         'pos_venda'::public.lead_status)
    -- Perdido entra no Bolsão, menos por estes três motivos: quem já tem
    -- imóvel, quem comprou do concorrente e quem nunca teve perfil. Mesma
    -- régua do motor de SDR.
    AND NOT (
      l.status = 'perdido'::public.lead_status
      AND public.motivo_perda_sem_retrabalho(l.motivo_perda_categoria)
    )
    AND (
      NULLIF(btrim(COALESCE(_busca, '')), '') IS NULL
      OR l.search_text ILIKE '%' || btrim(_busca) || '%'
      OR public.telefone_digits(l.telefone)
           LIKE '%' || public.telefone_digits(_busca) || '%'
    )
  ORDER BY COALESCE(GREATEST(l.ultima_interacao, l.ultimo_contato),
                    l.created_at) ASC,
           l.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(_limite, 50), 200))
  OFFSET GREATEST(0, COALESCE(_offset, 0));
$$;

-- ---------------------------------------------------------------------------
-- Diagnóstico: o perdido ganha colunas próprias
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.bolsao_diagnostico_v1();

CREATE OR REPLACE FUNCTION public.bolsao_diagnostico_v1()
RETURNS TABLE (
  base_viva integer,
  com_dono integer,
  sem_dono integer,
  congelados_por_venda integer,
  status_de_venda integer,
  status_de_venda_sem_venda_viva integer,
  perdidos_com_dono integer,
  perdidos_sem_retrabalho integer,
  bolsao_elegivel integer,
  sem_dono_sem_telefone integer,
  sem_dono_opt_out integer,
  estoque_com_dono integer,
  estoque_com_dono_no_fundo integer,
  estoque_com_dono_congelado integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH vivos AS (
    SELECT
      l.id,
      l.corretor_id,
      l.status,
      l.origem,
      COALESCE(l.opt_out, false)           AS opt_out,
      public.telefone_discavel(l.telefone) AS discavel,
      l.status IN ('contrato_fechado'::public.lead_status,
                   'pos_venda'::public.lead_status) AS status_de_venda,
      l.status = 'perdido'::public.lead_status      AS perdido,
      public.motivo_perda_sem_retrabalho(l.motivo_perda_categoria)
                                                    AS sem_retrabalho,
      public._lead_venda_viva(l.id)                 AS congelado
    FROM public.leads AS l
    WHERE l.deleted_at IS NULL
      AND NOT l.na_lixeira
      AND (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'gestor')
        OR public.has_role(auth.uid(), 'superintendente')
      )
      AND public.is_active_member(auth.uid())
  ),
  estoque AS (
    SELECT v.*
    FROM vivos AS v
    WHERE v.corretor_id IS NOT NULL
      AND v.origem IN ('importacao'::public.lead_origem,
                       'google_sheets'::public.lead_origem,
                       'outro'::public.lead_origem)
  )
  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE corretor_id IS NOT NULL)::integer,
    count(*) FILTER (WHERE corretor_id IS NULL)::integer,
    count(*) FILTER (WHERE congelado)::integer,
    count(*) FILTER (WHERE status_de_venda)::integer,
    count(*) FILTER (WHERE status_de_venda AND NOT congelado)::integer,
    -- O grupo que a reconciliação do §12.4 revelou.
    count(*) FILTER (WHERE perdido AND corretor_id IS NOT NULL)::integer,
    -- Perdidos que o discador não deve tocar, com dono ou sem.
    count(*) FILTER (WHERE perdido AND sem_retrabalho)::integer,
    count(*) FILTER (WHERE corretor_id IS NULL AND discavel
                       AND NOT opt_out AND NOT congelado
                       AND NOT status_de_venda
                       AND NOT (perdido AND sem_retrabalho))::integer,
    count(*) FILTER (WHERE corretor_id IS NULL AND NOT discavel)::integer,
    count(*) FILTER (WHERE corretor_id IS NULL AND opt_out)::integer,
    (SELECT count(*) FROM estoque)::integer,
    (SELECT count(*) FROM estoque
      WHERE status IN ('agendado'::public.lead_status,
                       'visita_realizada'::public.lead_status,
                       'proposta_enviada'::public.lead_status,
                       'analise_credito'::public.lead_status))::integer,
    (SELECT count(*) FROM estoque WHERE congelado)::integer
  FROM vivos;
$$;

REVOKE ALL ON FUNCTION public.bolsao_diagnostico_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bolsao_diagnostico_v1()
  TO authenticated, service_role;
