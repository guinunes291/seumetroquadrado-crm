// O hub da pré-venda (SDR): o único sistema do papel sdr.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import { ArrowsClockwise, CalendarDots, ChartLineUp, Fire, Handshake } from "@phosphor-icons/react";
import type { Sistema } from "@/features/nav/sistemas-tipos";

export const SISTEMA_SDR: Sistema = {
  // Pré-venda (SDR): carteira própria de base (importação, estoque,
  // devolvidos, perdidos), reaquecimento de lead parado de corretor e
  // entrega pela roleta de agendados. Só o papel sdr vê este card (admin
  // enxerga tudo, como sempre). Decisões em docs/politica-sdr-v1.md.
  // Desde 10/10/2026 a porta é o Painel: o SDR trabalha no discador e entra
  // no CRM para passar o cliente adiante; a Minha base inteira fica a um
  // clique dentro do painel (?tab=base) — o teto de seis seções não cabe uma
  // sétima.
  id: "sdr",
  titulo: "Pré-venda (SDR)",
  descricao: "Passe o cliente do discador. O corretor recebe o lead pronto pela roleta.",
  icon: Fire,
  home: { to: "/sdr" },
  roles: ["sdr"],
  cor: "sdr",
  grupo: "operacao",
  secoes: [
    { id: "base", label: "Painel", icon: Fire, to: "/sdr" },
    {
      // Reativação: base de quem cumpriu a cadência sem responder. É trilha
      // do SDR/discador, nunca do corretor — por isso vive aqui.
      id: "reativacao",
      label: "Reativação",
      icon: ArrowsClockwise,
      to: "/reativacao",
    },
    {
      id: "reaquecer",
      label: "Reaquecer (parados)",
      icon: ArrowsClockwise,
      to: "/sdr",
      search: { tab: "reaquecer" },
    },
    {
      id: "entregues",
      label: "Entregues",
      icon: Handshake,
      to: "/sdr",
      search: { tab: "entregues" },
    },
    {
      id: "agenda",
      label: "Tarefas & visitas",
      icon: CalendarDots,
      to: "/sdr",
      search: { tab: "agenda" },
    },
    {
      id: "raio-x",
      label: "Raio-X do SDR",
      icon: ChartLineUp,
      to: "/sdr",
      search: { tab: "raio-x" },
    },
  ],
};
