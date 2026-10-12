// /mensagens — Central de Mensagens (Fase 7b, modo simulado até a decisão
// D1 ligar o provedor). O conteúdo vive em features/mensagens.
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { CentralMensagens } from "@/features/mensagens/central-mensagens";

export const Route = createFileRoute("/_authenticated/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens — Seu Metro Quadrado" }] }),
  component: MensagensPage,
});

function MensagensPage() {
  // No desktop a página ocupa a altura da tela (menos o header de 4rem e o
  // respiro de 2rem em cima e embaixo do shell): a lista e a thread crescem
  // até o fim e só elas rolam — o composer fica sempre à vista. A nota do
  // modo simulado mora no tooltip do Enviar.
  return (
    <div className="flex flex-col md:h-[calc(100dvh-8rem)] md:min-h-[560px]">
      <PageHeader
        title="Mensagens"
        description="A conversa de WhatsApp de cada lead, num lugar só."
      />
      <CentralMensagens />
    </div>
  );
}
