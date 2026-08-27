import { createFileRoute } from "@tanstack/react-router";
import { ModoFocoProspeccaoPage } from "@/features/prospeccao/modo-foco-page";

// Home do sistema Prospecção: o corretor cai direto no Modo Foco — escolhe a
// base do dia (Aguardando Atendimento / Aguardando Retorno / Em Qualificação),
// o sistema monta o lote e o trabalho é um lead por vez. A base completa
// continua em /leads (seção "Base de leads" da sidebar).
export const Route = createFileRoute("/_authenticated/prospeccao")({
  head: () => ({ meta: [{ title: "Prospecção — Seu Metro Quadrado" }] }),
  component: ModoFocoProspeccaoPage,
});
