// Atalhos do ⌘K que as seções não expressam.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import {
  Briefcase,
  ChartLineUp,
  Layout,
  Link,
  ListChecks,
  Storefront,
  Target,
  UsersThree,
  WhatsappLogo,
  type Icon as IconComponent,
} from "@phosphor-icons/react";
import { SamiMark } from "@/components/ui/sami-mark";
import type { AppRole } from "@/hooks/use-auth";
import { GESTAO, OPERACAO } from "@/features/nav/sistemas-papeis";

/** Atalhos do ⌘K que as seções não expressam: pulos direto a uma ABA
 *  interna e as portas que saíram da sidebar nos cortes de 2026-08-30 (Reta
 *  final, Match IA, Links Úteis) e de 2026-09-11 (Trabalhar carteira,
 *  Mensagens) — rotas vivas via dominioExtra. Moram no REGISTRO, não na
 *  paleta, para o invariante de destino único (tests/sistemas.test.ts)
 *  cobrir seções e atalhos juntos. */
export type AtalhoExtra = {
  label: string;
  icon: IconComponent;
  to: string;
  search?: Record<string, string>;
  roles?: AppRole[];
};

export const ATALHOS_EXTRAS: AtalhoExtra[] = [
  { label: "Comissões", icon: ListChecks, to: "/financeiro", search: { tab: "comissoes" } },
  // Visão de gestão da cadência. Fora da sidebar pelo teto de 6 seções do
  // Follow-Up (ver a seção "cadencia"): a porta visível é o botão no cabeçalho
  // da própria Fila do Dia, e este atalho é o caminho curto de quem já sabe.
  {
    label: "Painel da cadência",
    icon: UsersThree,
    to: "/cadencia",
    search: { tab: "painel" },
    roles: GESTAO,
  },
  {
    // "Reta final" é a leitura de fechamento DA CARTEIRA (auditoria
    // 2026-08-27) — por isso o atalho fixa fase=carteira, mesmo vindo do
    // quadro completo.
    label: "Reta final (fechamento do funil)",
    icon: Target,
    to: "/pipeline",
    search: { tab: "fechamento", fase: "carteira" },
  },
  // Portas que saíram da sidebar na regra dos 2 menus (2026-09-11): o modo
  // Volume de Atender e a Central de Mensagens seguem vivos (dominioExtra da
  // Carteira) — sem menu, mas a um ⌘K de distância. Só operação: o SDR nunca
  // os teve (2026-09-04).
  //
  // O atalho apontava para as "filas por prioridade" (/atendimento sem modo).
  // Esse modo foi aposentado na Fatia 3 e a rota agora redireciona para a Fila
  // Única — o atalho viraria um caminho duplicado para a seção que já está no
  // menu. Passa a apontar o que de fato só existe ali: o trabalho em volume.
  {
    label: "Trabalhar carteira (um lead por vez)",
    icon: Briefcase,
    to: "/atendimento",
    search: { modo: "volume" },
    roles: OPERACAO,
  },
  { label: "Mensagens (WhatsApp)", icon: WhatsappLogo, to: "/mensagens", roles: OPERACAO },
  // Presença por filial (2026-10-13): o corretor faz o check-in; a gestão vê
  // quem está em cada filial. Dono: Central de Comando (dominioExtra).
  { label: "Check-in (presença na filial)", icon: Storefront, to: "/presenca", roles: OPERACAO },
  { label: "Match IA", icon: SamiMark, to: "/match" },
  { label: "Links Úteis", icon: Link, to: "/links-uteis" },
  // Saiu da sidebar quando a seção virou "Simuladores" (2026-10-11): a porta
  // visível é o botão no cabeçalho dos Simuladores e o link no dossiê.
  {
    label: "Planilha de amortização (SAC x PRICE)",
    icon: ChartLineUp,
    to: "/simulador-amortizacao",
  },
  {
    label: "Relatórios (Operação)",
    icon: Layout,
    to: "/painel-gestor",
    search: { tab: "relatorios" },
    roles: ["admin", "gestor", "superintendente"],
  },
  {
    label: "Metas & Ritmo",
    icon: Layout,
    to: "/painel-gestor",
    search: { tab: "metas" },
    roles: ["admin", "gestor", "superintendente"],
  },
];

// A antiga searchDaSecao (que injetava fase=carteira no link da Reta final)
// morreu com a seção Fechamento (corte 2026-08-30): o alternador interno do
// /pipeline preserva a fase sozinho, e os links de seção usam `secao.search`
// direto.
