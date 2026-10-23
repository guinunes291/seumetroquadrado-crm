// Sistemas do dia da operação de venda, na ordem do fluxo: Central de Comando,
// Prospecção, Gestão de Carteira, Modo Visita e Follow-Up. A pré-venda (SDR),
// também do grupo "operacao", fica em sistemas-pre-venda.ts.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import {
  Archive,
  Stack,
  ArrowsClockwise,
  Briefcase,
  CalendarDots,
  ChartLineUp,
  Crosshair,
  GearSix,
  Kanban,
  ListChecks,
  MapPinArea,
  Megaphone,
  Phone,
  PhoneOutgoing,
  Shuffle,
  SunHorizon,
  UsersThree,
} from "@phosphor-icons/react";
import type { Sistema } from "@/features/nav/sistemas-tipos";
import { GESTAO, OPERACAO } from "@/features/nav/sistemas-papeis";

export const SISTEMAS_OPERACAO: Sistema[] = [
  {
    id: "central-comando",
    titulo: "Central de Comando",
    descricao: "Uma lista só, na ordem em que o dinheiro está em risco.",
    icon: SunHorizon,
    // A Fila Única é a porta para TODO papel (2026-09-12). Entre a retirada
    // da Hoje e a Fatia 2 a gestão caía no Painel do Gestor (aba Dia) porque
    // a fila era só a carteira pessoal; a Fatia 2 trouxe a tabela "a mesma
    // fila, vista pelo gestor" e o `?corretor=` na própria /fila, então não
    // há mais motivo para desviar — e o dono pediu que o card abra a página
    // nova. Sem homePorPapel aqui de propósito: quem precisar do painel
    // continua chegando por BI → Painel do Gestor.
    home: { to: "/fila" },
    roles: OPERACAO,
    cor: "central",
    grupo: "operacao",
    destaque: true,
    // Check-in de presença (2026-10-13): é o começo do dia — o corretor diz em
    // que filial está (ou se está em casa) antes de abrir a Fila. Fica SEM
    // seção de propósito: a Central já tem as 4 que o corretor pode ver (regra
    // dos 2 menus). As portas: o check-in obrigatório ao abrir o CRM (desde
    // 12/10/2026); o bloco fixo de check-in no rodapé da barra lateral (desde
    // 13/10/2026 — onde e como está hoje, com a ação do momento: Fazer
    // check-in, Trocar, Refazer check-in ou Incluir localização. A ação só
    // PEDE o check-in: abre o mesmo diálogo em qualquer tela ou, em /presenca
    // e /meu-perfil, rola até o card; "Incluir localização" lê o GPS no toque,
    // porque o navegador só pede a permissão de dentro do gesto. É painel de
    // estado, não seção nem módulo, e não conta na regra dos 2 menus); a faixa
    // do topo (no barrado sem localização, o "Incluir localização" dela também
    // abre o diálogo); o ⌘K e o Meu Perfil. Ver docs/ops/presenca-filiais.md.
    dominioExtra: ["/presenca"],
    // Fila Única é a porta do módulo (2026-09-12): a página Hoje foi retirada
    // — a fila absorveu o que ela respondia (próxima ação, SLA, follow-ups) e
    // ganhou o funil das etapas. /hoje redireciona para cá, e /atendimento
    // também desde a Fatia 3 (as seis filas de Atender são os baldes que esta
    // tela absorveu; mantê-las vivas daria dois números para a mesma
    // pergunta, um com o teto da carteira ativa e outro sem).
    //
    // A Reserva entrou na Fatia 3 como o PAR da Fila Única: lá está o que eu
    // trabalho agora (as vagas da carteira), aqui o que ficou guardado esperando vaga.
    // São duas seções num módulo que permite seis — a regra dos 2 menus segue
    // valendo. Ela não é aba da Fila (a Fila é lista de ação com desfecho de
    // um toque; a Reserva é busca e resgate) nem filtro da Base de leads (a
    // Base acha qualquer um; a Reserva responde "o que saiu de mim e por
    // quê"). Ver docs/ops/carteira-ativa-40-fatia3.md §8.2.
    secoes: [
      { id: "fila", label: "Fila Única", icon: ListChecks, to: "/fila" },
      // Regra dos 65 (Fatia 2): quem disputa as vagas de Em atendimento e a
      // escolha do corretor. "Minha base" é o nome de tela da Reserva (o que é
      // do corretor antes de Em atendimento) — decisão 2.4 do dono.
      { id: "meus-65", label: "Meus 65", icon: Crosshair, to: "/meus-65" },
      { id: "reserva", label: "Minha base", icon: Archive, to: "/reserva" },
      // O terceiro nível: o que não é de ninguém. Fila = trabalho agora;
      // Reserva = meu, esperando vaga; Bolsão = da casa, sem dono. Ver
      // docs/ops/bolsao-oportunidades-fatia4.md §1.
      { id: "bolsao", label: "Bolsão", icon: Stack, to: "/bolsao" },
    ],
  },
  {
    id: "prospeccao",
    titulo: "Prospecção",
    descricao: "Modo Foco, Oferta Ativa e Discador. Um lead por vez, sem distração.",
    icon: UsersThree,
    // Abre DIRETO no Modo Foco: o corretor escolhe a base (Aguardando
    // Atendimento / Aguardando Retorno / Em Qualificação), o sistema monta o
    // lote e o trabalho é um por um. O funil kanban e a base completa vivem
    // na Gestão de Carteira — aqui é só ferramenta de topo de funil.
    home: { to: "/prospeccao" },
    // nav_pendencias.atendimento conta `aguardando_atendimento` — literalmente
    // uma etapa de Prospecção, por isso o contador vive neste card.
    badge: (b) => b.atendimento,
    // + sdr: carteira antiga de quem virou SDR (ver nota em OPERACAO).
    roles: [...OPERACAO, "sdr"],
    cor: "prospeccao",
    grupo: "operacao",
    secoes: [
      {
        id: "modo-foco",
        label: "Modo Foco",
        icon: Crosshair,
        to: "/prospeccao",
        badge: (b) => b.atendimento,
      },
      // Regra dos 2 menus (2026-09-11): para o CORRETOR a sidebar é Modo Foco
      // + Oferta Ativa + Discador — as três ferramentas de topo de funil, e só.
      // Oferta Ativa (listas segmentadas para campanha) e Discador (3C Plus) vieram
      // do extinto hub Comunicações: são prospecção de base, não "comunicação".
      // Gated por OPERACAO: o SDR segue vendo só o Modo Foco (decisão de
      // 2026-09-04 preservada).
      {
        id: "oferta-ativa",
        label: "Oferta Ativa",
        icon: PhoneOutgoing,
        to: "/oferta-ativa",
        roles: OPERACAO,
      },
      { id: "discador", label: "Discador", icon: Phone, to: "/discador", roles: OPERACAO },
      // As seções de gestão continuam role-gated — invisíveis para o corretor,
      // e o único acesso de navegação da gestão a estas telas.
      {
        id: "distribuicao",
        label: "Distribuição",
        icon: Shuffle,
        to: "/distribuicao",
        roles: ["admin", "gestor"],
      },
      {
        id: "captacao",
        label: "Captação (Landing)",
        icon: Megaphone,
        to: "/leads-landing",
        roles: ["admin", "gestor"],
      },
    ],
  },
  {
    id: "carteira",
    titulo: "Gestão de Carteira",
    descricao: "Base de leads, kanban, agenda e tarefas num só lugar.",
    icon: Briefcase,
    // A porta da Carteira é a Base de leads (decisão 2026-09-11): a lista
    // completa, com filtros, é a visão mais geral do que o corretor tem em
    // mãos — o Kanban é a mesma base em colunas, e Agenda/Tarefas são os
    // compromissos dela. Substitui a "porta única" Atender do item 2.7c.
    home: { to: "/leads" },
    badge: (b) => b.tarefasVencidas + b.agendaHoje,
    // O SDR só enxerga a Base de leads aqui (carteira antiga; ver nota em
    // OPERACAO) — sem Agenda/Tarefas na sidebar, o badge do card não teria
    // onde cair, por isso ele também é só da operação.
    badgeRoles: OPERACAO,
    roles: [...OPERACAO, "sdr"],
    cor: "carteira",
    grupo: "operacao",
    // Rotas vivas SEM seção própria (regra dos 2 menus): /atendimento (as
    // filas por prioridade — "Trabalhar carteira") e /mensagens (a Central de
    // Mensagens, herdada do hub Comunicações) saíram da sidebar mas continuam
    // no ⌘K (ATALHOS_EXTRAS) e na barra mobile (Atender); /match virou ação
    // dentro da ficha do lead (corte 2026-08-30).
    dominioExtra: ["/atendimento", "/mensagens", "/match"],
    secoes: [
      // A base completa (lista, ações em massa, importação). A ficha
      // (/leads/$leadId) resolve pela ETAPA do lead (sistemaAtivoContextual) —
      // o prefixo daqui é só o fallback enquanto o lead carrega.
      { id: "base-leads", label: "Base de leads", icon: UsersThree, to: "/leads" },
      // O quadro COMPLETO (todas as colunas do funil): a mesma base da lista,
      // em colunas — um lead que está na Base está no Kanban. A Reta final
      // segue como aba interna do /pipeline (o 2º menu permitido) e no ⌘K.
      { id: "kanban", label: "Kanban", icon: Kanban, to: "/pipeline", roles: OPERACAO },
      // Agenda e Tarefas viraram DUAS seções (antes: "Agenda & Tarefas" +
      // abas internas repetindo a escolha). A página esconde a própria linha
      // de abas no desktop — a sidebar é o menu.
      {
        id: "agenda",
        label: "Agenda",
        icon: CalendarDots,
        to: "/agendamentos",
        roles: OPERACAO,
        badge: (b) => b.agendaHoje,
      },
      {
        id: "tarefas",
        label: "Tarefas",
        icon: ListChecks,
        to: "/agendamentos",
        search: { tab: "tarefas" },
        roles: OPERACAO,
        badge: (b) => b.tarefasVencidas,
      },
    ],
  },
  {
    // Modo Visita virou MÓDULO (decisão 2026-09-11): é um modo de trabalho
    // inteiro — em campo, no celular, com o cliente na frente — e não uma
    // seção escondida dentro da Carteira. Um card no hub, uma tela, sem menu.
    // Sem badge de propósito: `agenda_hoje` conta TODOS os compromissos do
    // dia (visitas, reuniões, ligações) e continua da Agenda, na Carteira —
    // cada contador tem UM dono.
    id: "visita",
    titulo: "Modo Visita",
    descricao: "Em campo com o cliente: rota, briefing de 30 segundos e o resultado da visita.",
    icon: MapPinArea,
    home: { to: "/modo-visita" },
    roles: OPERACAO,
    cor: "visita",
    grupo: "operacao",
    secoes: [{ id: "modo-visita", label: "Modo Visita", icon: MapPinArea, to: "/modo-visita" }],
  },
  {
    id: "follow-up",
    titulo: "Follow-Up",
    descricao: "A cadência D1, D2 e D3 até o cliente responder. Depois, a régua dos 13 toques.",
    icon: ArrowsClockwise,
    home: { to: "/follow-up" },
    // nav_pendencias.followups = tarefas de contato de hoje + vencidas — o
    // número que o corretor precisa zerar.
    badge: (b) => b.followups,
    roles: OPERACAO,
    cor: "followup",
    grupo: "operacao",
    secoes: [
      {
        // A cadência é SEÇÃO do Follow-Up, e não módulo próprio, por duas
        // razões que apontam para o mesmo lugar. A de identidade: a família
        // de cores fecha em dez tons por decisão registrada em
        // cores-modulo.ts, e um módulo novo exigiria um décimo primeiro. A de
        // produto, que é a que importa: são duas janelas do MESMO cliente —
        // a cadência até ele responder, a régua depois — e o corretor precisa
        // ver que uma entrega na outra, não escolher entre duas.
        // Primeira da lista porque é por onde o lead entra.
        //
        // O PAINEL da cadência (?tab=painel, gestão) não é seção: o Follow-Up
        // já tem as seis que o teto permite, e "Config da régua" está fixada
        // por decisão registrada. Virou atalho de ⌘K + botão no cabeçalho
        // desta mesma tela — o padrão "seção cortada vira atalho" do corte de
        // 2026-08-30. Quem cobra o time entra pela fila que está cobrando.
        id: "cadencia",
        label: "Cadência (lead novo)",
        icon: ListChecks,
        to: "/cadencia",
      },
      {
        // A cadência inteira, por etapa: Lead chegou, 1º follow-up, 2º
        // follow-up e encerramento. Entrou no lugar de "Esgotados (13/13)"
        // (removida em 2026-09-26 por decisão do dono) — o teto de 6 seções
        // continua respeitado. A Fila do Dia é onde se trabalha; o Kanban é
        // onde se vê onde está cada cliente.
        id: "cadencia-kanban",
        label: "Kanban da cadência",
        icon: Kanban,
        to: "/cadencia",
        search: { tab: "kanban" },
      },
      {
        id: "fila",
        label: "Régua (já respondeu)",
        icon: ArrowsClockwise,
        to: "/follow-up",
        badge: (b) => b.followups,
      },
      {
        id: "kpis",
        label: "Curva de resposta",
        icon: ChartLineUp,
        to: "/follow-up",
        search: { tab: "kpis" },
      },
      {
        id: "cobertura",
        label: "Cobertura do time",
        icon: UsersThree,
        to: "/follow-up",
        search: { tab: "cobertura" },
        roles: GESTAO,
      },
      {
        // A régua se configura ONDE se opera (padrão da Central de
        // Distribuição): quem vê a Cobertura esgotando não deveria caçar o
        // ajuste num hub admin sem link. Aba admin-only dentro do módulo.
        id: "config",
        label: "Config da régua",
        icon: GearSix,
        to: "/follow-up",
        search: { tab: "config" },
        roles: ["admin"],
      },
    ],
  },
];
