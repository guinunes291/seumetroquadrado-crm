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
  return (
    <div className="space-y-4">
      <PageHeader
        title="Mensagens"
        description="A conversa de WhatsApp de cada lead, num lugar só — em modo simulado: cada envio registra na conversa e abre o WhatsApp com o texto pronto."
      />
      <CentralMensagens />
    </div>
  );
}
