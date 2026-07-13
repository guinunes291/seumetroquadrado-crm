-- Métricas da aba Saúde do hub de Gestão, num RPC só (mata o P2-12).
--
-- Antes a tela baixava até 10.000 interações do período (autor_id, tipo) e
-- fazia o reduce no navegador. Agora o banco devolve exatamente os MESMOS
-- agregados que o cliente calculava: contagem de interações por autor e tipo
-- (ligação / WhatsApp / visita / outras / total) e a qualidade do cadastro da
-- base de leads ativos (total, sem corretor, sem e-mail, sem renda).
--
-- SECURITY INVOKER de propósito: a RLS de interacoes/leads decide o recorte —
-- gestor/admin agregam a operação toda; qualquer outro papel agrega apenas o
-- que suas policies já deixam ver. Nenhum dado novo é exposto: são as mesmas
-- linhas que a tela listava, agora agregadas no servidor.
--
-- O cliente consome via rpcWithFallback: sem esta migration aplicada, a tela
-- usa o caminho antigo (baixa as linhas e agrega em JS) — nada quebra.

CREATE OR REPLACE FUNCTION public.gestao_metricas(
  _periodo_start timestamptz,
  _periodo_end timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- Relatório de atividade da equipe: interações do período por autor,
    -- espelhando o reduce do cliente (mesmos baldes de tipo, mesma ordenação).
    'atividade', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'autor_id', a.autor_id,
          'ligacao', a.ligacao,
          'whatsapp', a.whatsapp,
          'visita', a.visita,
          'outras', a.outras,
          'total', a.total
        )
        ORDER BY a.total DESC
      )
      FROM (
        SELECT
          i.autor_id,
          count(*) FILTER (WHERE i.tipo = 'ligacao')  AS ligacao,
          count(*) FILTER (WHERE i.tipo = 'whatsapp') AS whatsapp,
          count(*) FILTER (WHERE i.tipo = 'visita')   AS visita,
          count(*) FILTER (WHERE i.tipo NOT IN ('ligacao', 'whatsapp', 'visita')) AS outras,
          count(*) AS total
        FROM public.interacoes i
        WHERE i.deleted_at IS NULL
          AND i.ocorreu_em >= _periodo_start
          AND i.ocorreu_em <= _periodo_end
        GROUP BY i.autor_id
      ) a
    ), '[]'::jsonb),
    -- Aderência/qualidade do CRM sobre leads ativos — mesmos filtros dos
    -- 4 counts que a tela disparava (na_lixeira = false, fora do funil não).
    'aderencia', (
      SELECT jsonb_build_object(
        'total', count(*),
        'sem_corretor', count(*) FILTER (WHERE l.corretor_id IS NULL),
        'sem_email', count(*) FILTER (WHERE l.email IS NULL),
        'sem_renda', count(*) FILTER (WHERE l.renda_informada IS NULL)
      )
      FROM public.leads l
      WHERE l.na_lixeira = false
        AND l.status NOT IN ('perdido', 'contrato_fechado', 'pos_venda')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.gestao_metricas(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gestao_metricas(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.gestao_metricas(timestamptz, timestamptz) TO authenticated;
