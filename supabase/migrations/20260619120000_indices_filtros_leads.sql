-- Índices para filtros frequentes que hoje forçam sequential scan.
-- Fonte: filtros de /leads (temperatura, origem) e carregamento de corretores/
-- projetos ativos usados em várias telas.

-- Filtro por temperatura na lista de leads (quente/morno/frio).
CREATE INDEX IF NOT EXISTS idx_leads_temperatura ON public.leads (temperatura);

-- Filtro por origem na lista de leads (facebook, site, indicação, etc.).
CREATE INDEX IF NOT EXISTS idx_leads_origem ON public.leads (origem);

-- Corretores ativos são carregados em selects de quase todas as telas.
CREATE INDEX IF NOT EXISTS idx_profiles_ativo ON public.profiles (ativo) WHERE ativo = true;

-- Empreendimentos ativos em selects/filtros.
CREATE INDEX IF NOT EXISTS idx_projetos_ativo ON public.projetos (ativo) WHERE ativo = true;
