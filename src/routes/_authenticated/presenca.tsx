// Check-in — presença por filial (migration 20261013120000).
//
// Corretor: diz onde está trabalhando hoje (Barra Funda, Liberdade, Belém ou
// em casa). Filial libera a roleta; em casa, só com o mínimo de vendas
// aprovadas no mês (hoje 3). Gestão: o quadro do dia por filial e o cadastro
// das filiais. A regra mora no banco — esta tela só pergunta e explica.

import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useUserRoles } from "@/hooks/use-auth";
import { CheckinCard } from "@/features/presenca/checkin-card";
import { FiliaisConfig } from "@/features/presenca/filiais-config";
import { PresencaQuadro } from "@/features/presenca/presenca-quadro";

export const Route = createFileRoute("/_authenticated/presenca")({
  head: () => ({ meta: [{ title: "Check-in — Seu Metro Quadrado" }] }),
  component: PresencaPage,
});

function PresencaPage() {
  const { isAdmin, isGestor, isSuperintendente, isCorretor, loading } = useUserRoles();
  const gestao = isAdmin || isGestor || isSuperintendente;
  const operaGestao = isAdmin || isGestor;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-in"
        description={
          gestao
            ? "Quem está em cada filial hoje, quem está em casa e quem ainda não fez check-in."
            : "Marque onde você está trabalhando hoje para entrar nas roletas de leads."
        }
      />

      {/* Gestão sem papel de corretor não entra em roleta — não tem o que marcar. */}
      {(isCorretor || (!loading && !gestao)) && <CheckinCard />}

      {gestao && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">Presença de hoje</h2>
          <PresencaQuadro podeOperar={operaGestao} />
        </section>
      )}

      {operaGestao && <FiliaisConfig />}
    </div>
  );
}
