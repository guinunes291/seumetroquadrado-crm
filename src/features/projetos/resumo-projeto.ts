// Projetos em Foco — o resumo do empreendimento que o corretor cola no WhatsApp.
// Recortado de projetos-foco-page.tsx sem mudança de comportamento.

import { montarMensagemVenda } from "@/components/projeto-comercial";
import type { ProjetoRow } from "@/components/projeto-card";
import { formatDormsRange, formatEntrega, formatM2Range, formatVagasRange } from "@/lib/projetos";
import { saneiaLocal, saneiaMetragem } from "@/lib/projetos-saneamento";
import { rotuloZona, zonaDoProjeto } from "@/lib/zonas";

/**
 * Resumo pronto para colar no WhatsApp do cliente: identificação, números do
 * produto e os links do material. Reaproveita a munição comercial da ficha
 * (montarMensagemVenda) e acrescenta o que o corretor precisa mandar junto.
 * Passa pelo mesmo saneamento da prateleira: o cliente nunca recebe "240 m²".
 */
export function montarResumoProjeto(p: ProjetoRow): string {
  const linhas: string[] = [];
  const local = saneiaLocal(p.bairro, p.cidade);
  const metragem = saneiaMetragem(p.metragem_min, p.metragem_max, p.preco_a_partir);
  const zona = zonaDoProjeto({
    zona_smq: p.zona_smq,
    regiao: p.regiao,
    cidade: local.cidade,
    bairro: local.bairro,
  });
  const lugar = [
    [local.bairro, local.cidade].filter(Boolean).join(", ") || null,
    zona ? rotuloZona(zona) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (lugar) linhas.push(`📍 ${lugar}`);

  const ficha = [
    formatDormsRange(p.dorms_min, p.dorms_max),
    formatM2Range(metragem.metragem_min, metragem.metragem_max),
    formatVagasRange(p.vagas_min, p.vagas_max, p.vagas_observacao),
  ].filter(Boolean);
  if (ficha.length > 0) linhas.push(`🛏️ ${ficha.join(" · ")}`);

  const entrega = formatEntrega(p.status_entrega, p.mes_entrega, p.ano_entrega);
  if (entrega) linhas.push(`🔑 Entrega: ${entrega}`);

  const material: string[] = [];
  if (p.book_url) material.push(`📘 Book: ${p.book_url}`);
  if (p.tabela_precos_url) material.push(`📊 Tabela: ${p.tabela_precos_url}`);
  if (material.length > 0) linhas.push(material.join("\n"));

  // A mensagem de venda já abre com nome + preço + diferenciais; o bloco acima
  // entra logo depois, antes da pergunta de fechamento.
  const venda = montarMensagemVenda({
    nome: p.nome,
    preco_a_partir: p.sob_consulta ? null : p.preco_a_partir,
    diferenciais: p.diferenciais ?? null,
    argumentos_venda: p.argumentos_venda ?? null,
  }).split("\n\n");
  const fechamento = venda.pop();

  return [...venda, ...linhas, fechamento].filter(Boolean).join("\n\n");
}
