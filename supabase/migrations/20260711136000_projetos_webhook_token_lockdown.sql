-- Privilégios de coluna são aditivos: revogar apenas
-- SELECT(webhook_token)/UPDATE(webhook_token) não neutraliza o antigo grant na
-- tabela inteira. Substituímos os grants por allowlists sem o segredo.

REVOKE SELECT, INSERT, UPDATE ON TABLE public.projetos FROM authenticated;

GRANT SELECT (
  id, nome, slug, construtora, cidade, regiao, bairro, endereco, logradouro,
  numero, observacoes, ativo, metragem_min, metragem_max, dorms_min, dorms_max,
  suites, tipologia, tipo_extra, vagas, vagas_min, vagas_max, vagas_observacao,
  preco_a_partir, preco_inicial, sob_consulta, status_entrega, mes_entrega,
  ano_entrega, fonte, zona_smq, perfil_ideal, argumentos_venda, diferenciais,
  renda_minima, status_preco, entrega_status, book_url, tabela_precos_url, lat,
  lng, created_at, updated_at, criado_por, deleted_at, capa_url, galeria_urls,
  percentual_comissao, disponibilidade_resumo
) ON TABLE public.projetos TO authenticated;

GRANT INSERT (
  id, nome, slug, construtora, cidade, regiao, bairro, endereco, logradouro,
  numero, observacoes, ativo, metragem_min, metragem_max, dorms_min, dorms_max,
  suites, tipologia, tipo_extra, vagas, vagas_min, vagas_max, vagas_observacao,
  preco_a_partir, preco_inicial, sob_consulta, status_entrega, mes_entrega,
  ano_entrega, fonte, zona_smq, perfil_ideal, argumentos_venda, diferenciais,
  renda_minima, status_preco, entrega_status, book_url, tabela_precos_url, lat,
  lng, created_at, updated_at, criado_por, deleted_at, capa_url, galeria_urls,
  percentual_comissao, disponibilidade_resumo
) ON TABLE public.projetos TO authenticated;

GRANT UPDATE (
  nome, slug, construtora, cidade, regiao, bairro, endereco, logradouro, numero,
  observacoes, ativo, metragem_min, metragem_max, dorms_min, dorms_max, suites,
  tipologia, tipo_extra, vagas, vagas_min, vagas_max, vagas_observacao,
  preco_a_partir, preco_inicial, sob_consulta, status_entrega, mes_entrega,
  ano_entrega, fonte, zona_smq, perfil_ideal, argumentos_venda, diferenciais,
  renda_minima, status_preco, entrega_status, book_url, tabela_precos_url, lat,
  lng, updated_at, deleted_at, capa_url, galeria_urls, percentual_comissao,
  disponibilidade_resumo
) ON TABLE public.projetos TO authenticated;

COMMENT ON COLUMN public.projetos.webhook_token IS
  'Segredo server-side: leitura/regeneração somente pelas RPCs de gestão; nunca por SELECT do browser.';
