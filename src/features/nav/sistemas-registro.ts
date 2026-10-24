// Montagem do registro: SISTEMAS na ordem de sempre (é ela que dá o número do
// módulo e a ordem do hub) — operação, pré-venda, consulta e Configurações
// (grupo "gestao") — e os sistemas atrás de flag.
// Recortado de sistemas.ts (que reexporta tudo) sem mudança de conteúdo.

import {
  Buildings,
  GearSix,
  GraduationCap,
  Link,
  ListChecks,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import type { Sistema } from "@/features/nav/sistemas-tipos";
import { GESTAO } from "@/features/nav/sistemas-papeis";
import { SISTEMAS_OPERACAO } from "@/features/nav/sistemas-operacao";
import { SISTEMA_SDR } from "@/features/nav/sistemas-pre-venda";
import { SISTEMAS_CONSULTA } from "@/features/nav/sistemas-consulta";

export const SISTEMA_CONFIGURACOES: Sistema = {
  id: "configuracoes",
  titulo: "Configurações",
  descricao: "Integrações, pessoas, estoque e preferências da conta.",
  icon: GearSix,
  home: { to: "/configuracoes" },
  roles: ["admin"],
  cor: "config",
  grupo: "gestao",
  // As abas mais buscadas ganham endereço na sidebar e no ⌘K (antes o card
  // era mudo: 9 abas internas inalcançáveis pela navegação). A seção
  // Integrações, sem search, é dona do /configuracoes cru — o card deixa de
  // abrir uma tela sem sidebar. Demais abas seguem internas ao painel.
  secoes: [
    { id: "integracoes", label: "Integrações", icon: Link, to: "/configuracoes" },
    {
      id: "pessoas",
      label: "Pessoas",
      icon: UsersThree,
      to: "/configuracoes",
      search: { tab: "pessoas" },
    },
    {
      id: "estoque",
      label: "Estoque",
      icon: Buildings,
      to: "/configuracoes",
      search: { tab: "estoque" },
    },
  ],
};

export const SISTEMAS: Sistema[] = [
  ...SISTEMAS_OPERACAO,
  SISTEMA_SDR,
  ...SISTEMAS_CONSULTA,
  SISTEMA_CONFIGURACOES,
];

// ---------------------------------------------------------------------------
// Sistemas atrás de FLAG
// ---------------------------------------------------------------------------
// A Academia fica FORA de SISTEMAS de propósito, enquanto depender de flag.
// SISTEMAS é o registro estável — o que existe para todo mundo, sempre — e os
// testes de navegação o percorrem inteiro (mapa de grupos, "admin vê todos").
// Um sistema que aparece só com flag ligada não é "todos", então entraria como
// exceção em cada uma dessas varreduras.
//
// Quem navega usa SISTEMAS_NAV. Quando a Academia sair da flag, mova o objeto
// para dentro de SISTEMAS, apague os campos `flag` das seções e ajuste os dois
// testes que enumeram o registro.
//
// As flags ficam nas SEÇÕES, não no sistema: o aluno e a gestão entram por
// portas diferentes. `academia_menu` no conjunto = a pessoa estuda (flag
// ligada E participação ativa); `academia_gestao` = a pessoa gere (admin
// sempre, para preparar conteúdo e inscrever antes de abrir; gestor e
// superintendente só com a flag ligada). Quem monta o conjunto é useFlagsNav.
export const SISTEMA_ACADEMIA: Sistema = {
  id: "academia",
  titulo: "Academia",
  descricao: "Trilha, aulas, quiz, prática e certificados para formar o time.",
  icon: GraduationCap,
  home: { to: "/academia" },
  homePorPapel: (ctx) =>
    ctx.flagsLigadas?.has("academia_menu") ? { to: "/academia" } : { to: "/academia/gestao" },
  cor: "projetos",
  grupo: "consulta",
  secoes: [
    {
      id: "trilha",
      label: "Minha trilha",
      icon: GraduationCap,
      to: "/academia",
      flag: "academia_menu",
    },
    {
      id: "progresso",
      label: "Meu progresso",
      icon: Trophy,
      to: "/academia/progresso",
      flag: "academia_menu",
    },
    {
      id: "gestao",
      label: "Gestão da Academia",
      icon: UsersThree,
      to: "/academia/gestao",
      roles: GESTAO,
      flag: "academia_gestao",
    },
    {
      id: "conteudo",
      label: "Conteúdo",
      icon: ListChecks,
      to: "/academia/conteudo",
      roles: ["admin"],
      flag: "academia_gestao",
    },
  ],
};

/** Registro que a navegação consome: o estável mais os que dependem de flag.
 *  A visibilidade continua decidida por `sistemaVisivel`. */
export const SISTEMAS_NAV: Sistema[] = [...SISTEMAS, SISTEMA_ACADEMIA];
