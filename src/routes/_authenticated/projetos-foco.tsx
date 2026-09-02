import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ProjetosFocoPage } from "@/features/projetos/projetos-foco-page";

// Destino de consulta diária do corretor: a PRATELEIRA de empreendimentos —
// campanhas, construtoras parceiras e o resto do estoque, com book, tabela,
// "cabe na renda?" e envio ao cliente a um toque. O catálogo completo
// (/projetos) continua sendo o cadastro; aqui é a loja.
//
// ?leadId: aberta pelo dossiê de um lead, a prateleira já sabe para quem está
// montando a seleção (renda pré-preenchida, envio direto, link da Vitrine).
const searchSchema = z.object({ leadId: z.string().optional() });

export const Route = createFileRoute("/_authenticated/projetos-foco")({
  head: () => ({ meta: [{ title: "Projetos em Foco — Seu Metro Quadrado" }] }),
  validateSearch: searchSchema,
  component: ProjetosFocoRoute,
});

function ProjetosFocoRoute() {
  const { leadId } = Route.useSearch();
  return <ProjetosFocoPage leadId={leadId} />;
}
