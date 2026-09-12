// Fábrica de ProjetoRow para os testes: todos os campos nulos por padrão, o
// teste sobrescreve só o que importa para o caso. Compartilhada porque o tipo
// tem dezenas de colunas e repeti-lo por arquivo esconde o que cada teste testa.

import type { ProjetoRow } from "@/components/projeto-card";

export function mkProjeto(over: Partial<ProjetoRow> = {}): ProjetoRow {
  return {
    id: "x",
    nome: "Projeto",
    slug: "projeto",
    construtora: null,
    cidade: null,
    regiao: null,
    bairro: null,
    endereco: null,
    logradouro: null,
    numero: null,
    observacoes: null,
    ativo: true,
    metragem_min: null,
    metragem_max: null,
    dorms_min: null,
    dorms_max: null,
    suites: null,
    tipologia: null,
    tipo_extra: null,
    vagas_min: null,
    vagas_max: null,
    vagas_observacao: null,
    preco_a_partir: null,
    sob_consulta: false,
    status_entrega: null,
    mes_entrega: null,
    ano_entrega: null,
    fonte: null,
    zona_smq: null,
    ...over,
  };
}
