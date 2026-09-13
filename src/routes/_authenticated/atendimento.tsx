import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { VolumeView } from "@/features/atendimento/volume-view";
import { ConsultaView } from "@/features/atendimento/consulta-view";
import { Lightning, ListChecks, MagnifyingGlass } from "@phosphor-icons/react";

// Atender — o modo PRIORIDADE foi aposentado na Fatia 3 da carteira ativa
// (2026-09-13). Suas seis filas (novos, responder, followups, esfriando,
// confirmar visita, docs) são exatamente os baldes que a Fila Única absorveu;
// com o teto de 40 valendo no banco, manter as duas telas daria DOIS números
// para a mesma pergunta — a Fila respeitando a carteira ativa, o Atender não —
// e é assim que se perde a confiança na tela nova. `/atendimento` e
// `?modo=prioridade` redirecionam para `/fila`, como `/hoje` já faz.
//
// O que NÃO foi aposentado, de propósito: Volume (um lead por vez sobre a
// carteira inteira — o antigo Modo Blitz, destino do redirect de `/blitz`) e
// Consulta (buscar e filtrar como em Meus Leads). Nenhum dos dois é uma fila
// priorizada e nenhum tem equivalente na Fila Única; retirá-los junto teria
// removido ferramenta sem substituto. Ver docs/ops/carteira-ativa-40-fatia3.md
// §8.5.
export type AtendimentoModo = "volume" | "consulta";

export const Route = createFileRoute("/_authenticated/atendimento")({
  head: () => ({ meta: [{ title: "Atendimento — Seu Metro Quadrado" }] }),
  // Whitelist do modo: só os dois que sobraram. Qualquer outro valor (e a
  // ausência de `?modo`, que era o Prioridade) cai no redirect abaixo, então
  // link antigo e atalho salvo continuam chegando em algum lugar útil.
  validateSearch: (search: Record<string, unknown>): { modo?: AtendimentoModo } => ({
    modo: search.modo === "volume" || search.modo === "consulta" ? search.modo : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.modo !== "volume" && search.modo !== "consulta") {
      throw redirect({ to: "/fila" });
    }
  },
  component: AtendimentoPage,
});

const MODOS: { key: AtendimentoModo; label: string; hint: string; icon: typeof Lightning }[] = [
  { key: "volume", label: "Volume", hint: "um lead por vez, a carteira inteira", icon: Lightning },
  {
    key: "consulta",
    label: "Consulta",
    hint: "buscar e filtrar como em Meus Leads",
    icon: MagnifyingGlass,
  },
];

function AtendimentoPage() {
  const { modo } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Atender"
        description="Volume (um lead por vez) e Consulta (busca e filtros). As filas por prioridade agora são a Fila Única."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/fila">
              <ListChecks className="h-4 w-4" />
              <span className="ml-1">Fila Única</span>
            </Link>
          </Button>
        }
      />

      <div
        className="flex w-fit items-center gap-1 rounded-lg border bg-muted/40 p-1"
        role="tablist"
        aria-label="Modo de atendimento"
      >
        {MODOS.map((m) => (
          <Button
            key={m.key}
            role="tab"
            aria-selected={modo === m.key}
            variant={modo === m.key ? "default" : "ghost"}
            size="sm"
            className="h-7"
            title={m.hint}
            onClick={() => void navigate({ search: { modo: m.key } })}
          >
            <m.icon className="h-3.5 w-3.5" />
            {m.label}
          </Button>
        ))}
      </div>

      {modo === "volume" && <VolumeView />}
      {modo === "consulta" && <ConsultaView />}
    </div>
  );
}
