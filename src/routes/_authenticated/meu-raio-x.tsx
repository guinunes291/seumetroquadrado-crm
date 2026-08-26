import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";

// Recharts (~105KB gz) só desce quando a página abre — mesmo padrão do
// /painel-gestor: o entry não paga pelo BI.
const MeuRaioX = lazy(() =>
  import("@/features/inteligencia/meu-raio-x").then(({ MeuRaioX }) => ({ default: MeuRaioX })),
);

// SEM gate de papel de propósito: "Meu Raio-X" são os números do PRÓPRIO
// usuário — gestor abrindo vê os dele, coerente com o nome. O recorte de dado
// é do banco (self-clause do drill, auto-escopo das dashboard_*, policy de
// comissoes), não da rota.
export const Route = createFileRoute("/_authenticated/meu-raio-x")({
  head: () => ({ meta: [{ title: "Meu Raio-X — Seu Metro Quadrado" }] }),
  component: MeuRaioXPage,
});

function MeuRaioXPage() {
  const { user } = useAuth();
  // Sessão ainda hidratando: segura no skeleton em vez de montar sem id.
  if (!user) {
    return <Skeleton className="h-96 w-full" />;
  }
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <MeuRaioX corretorId={user.id} />
    </Suspense>
  );
}
