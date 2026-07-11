/**
 * Projeção autenticada explícita. `webhook_token` nunca deve cruzar a fronteira
 * do browser; gestão o obtém apenas pela RPC auditável dedicada.
 */
export const PROJETO_CRM_SELECT =
  "id,nome,slug,construtora,cidade,regiao,bairro,endereco,logradouro,numero,observacoes,ativo,metragem_min,metragem_max,dorms_min,dorms_max,suites,tipologia,tipo_extra,vagas,vagas_min,vagas_max,vagas_observacao,preco_a_partir,preco_inicial,sob_consulta,status_entrega,mes_entrega,ano_entrega,fonte,zona_smq,perfil_ideal,argumentos_venda,diferenciais,renda_minima,status_preco,entrega_status,book_url,tabela_precos_url,lat,lng,created_at,updated_at,criado_por,deleted_at,capa_url,galeria_urls,percentual_comissao,disponibilidade_resumo" as const;
