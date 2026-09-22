import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserRoles } from "@/hooks/use-auth";
import { ReativacaoView } from "@/features/cadencia/reativacao-view";

// Base de reativação — quem cumpriu a cadência D1/D2/D3 sem responder. É
// trilha do SDR e do discador, nunca do corretor: devolver ao mesmo corretor
// seria repetir a conversa que acabou de ser encerrada.
//
// Sem redirect para quem não tem papel: recusa explicada, como no painel.

export const Route = createFileRoute("/_authenticated/reativacao")({
  head: () => ({
    meta: [
      { title: "Reativação — Seu Metro Quadrado" },
      {
        name: "description",
        content: "Fila de reativação da pré-venda: quem cumpriu a cadência sem responder.",
      },
    ],
  }),
  component: ReativacaoPage,
});

function ReativacaoPage() {
  const { roles, loading } = useUserRoles();
  const pode = roles.some((r) => ["sdr", "admin", "gestor", "superintendente"].includes(r));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reativação"
        description="Quem cumpriu a cadência sem responder volta aqui depois da janela de descanso — com a renda e os horários já tentados à vista."
      />
      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Carregando">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : pode ? (
        <ReativacaoView />
      ) : (
        <EmptyState
          icon={Lock}
          title="Acesso restrito à pré-venda"
          description="A fila de reativação é trabalhada pelo SDR. O lead volta para a roleta quando ele conseguir retomar a conversa."
          className="py-16"
        />
      )}
    </div>
  );
}
