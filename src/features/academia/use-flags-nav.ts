// Resolve quais flags de SISTEMA estão ligadas para a pessoa logada.
//
// Não basta a flag estar ligada em app_flags: as flags são GLOBAIS e a
// Academia é individual. "academia_menu" só entra no conjunto se a flag
// estiver ligada E a pessoa for participante ativa. O admin entra junto,
// mesmo sem participar, para conseguir pré-visualizar a tela antes de abrir
// a trilha para o time.
//
// Enquanto carrega, o conjunto sai vazio: o menu aparecer e sumir é pior do
// que aparecer meio segundo depois.

import { useMemo } from "react";
import { useUserRoles } from "@/hooks/use-auth";
import { useAppFlag } from "@/hooks/use-app-flags";
import { useEhParticipante } from "./academia-client";

export function useFlagsNav(): Set<string> {
  const menu = useAppFlag("academia_menu");
  const card = useAppFlag("academia_card_inicio");
  const { participa } = useEhParticipante();
  const { isAdmin } = useUserRoles();

  return useMemo(() => {
    const ligadas = new Set<string>();
    if (menu.ligada && (participa || isAdmin)) ligadas.add("academia_menu");
    // O card do /inicio é só para quem estuda: admin que não participa não
    // tem "próxima aula" nenhuma para ver.
    if (card.ligada && participa) ligadas.add("academia_card_inicio");
    return ligadas;
  }, [menu.ligada, card.ligada, participa, isAdmin]);
}
