import { createFileRoute } from "@tanstack/react-router";
import { BolsaoPage } from "@/features/bolsao/bolsao-page";

// Bolsão de oportunidades: a base geral da casa, sem dono — terceira seção da
// Central de Comando, ao lado da Fila Única e da Reserva.
//
// Sem régua de papel: o Bolsão é a base de TODO MUNDO, e é justamente esse o
// ponto. O SDR trabalha o Bolsão tanto quanto o corretor, então aqui ele não
// é redirecionado para /sdr como acontece em /fila e /reserva. O escopo real
// é decidido no banco (`is_active_member`), e o que sai é anonimizado.
export const Route = createFileRoute("/_authenticated/bolsao")({
  head: () => ({ meta: [{ title: "Bolsão de oportunidades — Seu Metro Quadrado" }] }),
  component: BolsaoPage,
});
