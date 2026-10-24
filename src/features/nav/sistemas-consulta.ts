// Sistemas de consulta (referência ocasional): Documentação & Projetos,
// Assinaturas & Comissões e BI.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import {
  Broom,
  Buildings,
  Calculator,
  ChartBar,
  ChartLineUp,
  Funnel,
  MapTrifold,
  Megaphone,
  Star,
  Storefront,
  Trophy,
  Wallet,
} from "@phosphor-icons/react";
import { PAPEIS_CATALOGO } from "@/lib/projetos";
import type { Sistema } from "@/features/nav/sistemas-tipos";
import { GESTAO, OPERACAO, temPapel } from "@/features/nav/sistemas-papeis";

export const SISTEMAS_CONSULTA: Sistema[] = [
  {
    id: "docs-projetos",
    titulo: "Documentação & Projetos",
    descricao: "Books, tabelas e catálogo. E só o que cabe na renda do cliente.",
    icon: Buildings,
    home: { to: "/projetos-foco" },
    cor: "projetos",
    grupo: "consulta",
    // /links-uteis saiu da sidebar (corte 2026-08-30) mas a rota segue viva
    // com dono — o acesso é o botão em Projetos em Foco e o ⌘K. A Planilha de
    // amortização saiu na chegada dos Simuladores (2026-10-11, ver a seção).
    dominioExtra: ["/links-uteis", "/simulador-amortizacao"],
    secoes: [
      { id: "projetos-foco", label: "Projetos em Foco", icon: Star, to: "/projetos-foco" },
      // Catálogo completo é da gestão — o corretor trabalha só os produtos em
      // foco (Projetos em Foco + Vitrine). A rota também é gateada.
      {
        id: "catalogo",
        label: "Catálogo completo",
        icon: Buildings,
        to: "/projetos",
        roles: PAPEIS_CATALOGO,
      },
      { id: "vitrine", label: "Vitrine (mapa)", icon: MapTrifold, to: "/vitrine" },
      // Mapa de Lojas (2026-10-08): os stands de vendas das construtoras, para
      // o atendimento ("qual o stand mais perto de mim?"). É PÁGINA, não aba
      // da Vitrine: a Vitrine mostra onde está o produto, este mapa mostra onde
      // o cliente é atendido — e o stand costuma ficar longe da obra. Todos os
      // papéis, SDR incluso: quem agenda visita precisa saber para onde mandar.
      { id: "mapa-lojas", label: "Mapa de Lojas", icon: Storefront, to: "/mapa-lojas" },
      // Simuladores (2026-10-11): o fluxo de pagamento das construtoras
      // (Vibra, Direcional, Longitude, Mundo Apto) — ato, mensais contadas até
      // a entrega, intermediárias e chaves. Todos os papéis.
      //
      // O módulo já estava no teto de 6 seções, e a Planilha de amortização
      // (2026-10-10) é a outra metade da mesma pergunta ("quanto o cliente
      // paga?" — à construtora aqui, ao banco lá). Em vez de esticar o teto,
      // a seção virou "Simuladores" e a planilha seguiu o padrão do corte de
      // 2026-08-30: rota viva (dominioExtra), botão no cabeçalho dos
      // Simuladores como porta visível, atalho no ⌘K e o link do dossiê.
      { id: "simuladores", label: "Simuladores", icon: Calculator, to: "/simuladores" },
      {
        id: "materiais",
        label: "Materiais (gestão)",
        icon: Megaphone,
        to: "/projetos-materiais",
        roles: ["admin", "gestor"],
      },
    ],
  },
  {
    id: "financeiro",
    titulo: "Assinaturas & Comissões",
    descricao: "Fechamento, aprovação e comissão. Cada papel vê o seu recorte.",
    icon: Wallet,
    home: { to: "/financeiro", search: { tab: "comissoes" } },
    badge: (b) => b.aprovacoes,
    badgeRoles: GESTAO,
    roles: OPERACAO,
    cor: "financeiro",
    grupo: "consulta",
    secoes: [
      // As abas internas (fechamento|comissoes|dre) são o segundo nível; o
      // guard por aba do /financeiro já recorta por papel.
      {
        id: "financeiro",
        label: "Fechamento, Comissões & DRE",
        icon: Wallet,
        to: "/financeiro",
      },
    ],
  },
  {
    id: "bi",
    titulo: "BI · Relatórios",
    descricao: "Seu Raio-X individual e os painéis da operação, ao vivo.",
    icon: ChartLineUp,
    home: { to: "/meu-raio-x" },
    homePorPapel: (ctx) =>
      temPapel(GESTAO, ctx) ? { to: "/painel-gestor" } : { to: "/meu-raio-x" },
    roles: OPERACAO,
    cor: "bi",
    grupo: "consulta",
    secoes: [
      { id: "meu-raio-x", label: "Meu Raio-X", icon: ChartLineUp, to: "/meu-raio-x" },
      // Estudo obrigatório do corretor às quintas (abre sozinho na 1ª tela);
      // a seção deixa reabrir o funil a qualquer hora.
      { id: "meu-funil", label: "Meu Funil", icon: Funnel, to: "/meu-funil" },
      { id: "desempenho", label: "Desempenho", icon: Trophy, to: "/ranking" },
      {
        id: "operacao",
        label: "Operação",
        icon: ChartBar,
        to: "/painel-gestor",
        roles: GESTAO,
      },
      // Higiene do Funil mora no BI e não na Central de Distribuição porque a
      // pergunta que ela responde é de diagnóstico ("o que está parado e
      // custando dinheiro"), não de configuração. GESTAO: ver a carteira
      // parada dos colegas muda o clima do time, então corretor não alcança.
      {
        id: "higiene-funil",
        label: "Higiene do Funil",
        icon: Broom,
        to: "/higiene-funil",
        roles: GESTAO,
      },
    ],
  },
];
