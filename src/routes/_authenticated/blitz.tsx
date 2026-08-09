// /blitz virou o modo Volume de Atender (item 2.7c) — o conteúdo é o MESMO
// componente (features/atendimento/volume-view), então o redirect não perde
// função nenhuma. URL nenhuma morre: links e atalhos antigos continuam
// caindo no lugar certo.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/blitz")({
  beforeLoad: () => {
    throw redirect({ to: "/atendimento", search: { modo: "volume" } });
  },
});
