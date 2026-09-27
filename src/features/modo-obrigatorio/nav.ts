// O menu do corretor travado no Modo Obrigatório: o processo e os projetos.
// A sidebar, o ⌘K e a barra de baixo trocam o menu inteiro por esta lista —
// oferecer uma porta que o redirect não deixa abrir só confunde.

import { Buildings, LockSimple } from "@phosphor-icons/react";
import type { Secao } from "@/features/nav/sistemas";

export const SECOES_TRAVADO: Secao[] = [
  { id: "obrigatorio", label: "Processo obrigatório", icon: LockSimple, to: "/obrigatorio" },
  { id: "projetos", label: "Projetos", icon: Buildings, to: "/projetos" },
];
