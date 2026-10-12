import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { CaretRight } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VolumeView } from "@/features/atendimento/volume-view";
import { ConsultaView } from "@/features/atendimento/consulta-view";

// Atender — o modo PRIORIDADE foi aposentado na Fatia 3 da carteira ativa
// (2026-09-13). Suas seis filas (novos, responder, followups, esfriando,
// confirmar visita, docs) são exatamente os baldes que a Fila Única absorveu;
// com o teto da carteira valendo no banco, manter as duas telas daria DOIS números
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

// O "como estou agora" de cada modo mora dentro dele (os três números do
// Volume, a contagem da Consulta); aqui ficam só o título, a frase e a pílula.
const MODOS: { key: AtendimentoModo; label: string; hint: string }[] = [
  { key: "volume", label: "Volume", hint: "um lead por vez, a carteira inteira" },
  { key: "consulta", label: "Consulta", hint: "buscar e filtrar como em Meus Leads" },
];

function AtendimentoPage() {
  const { modo } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Atender"
        description="Um lead por vez, a carteira inteira — ou busque alguém."
        actions={
          // A Fila Única tem seção própria na sidebar: aqui é só um atalho
          // discreto, sem competir com o trabalho da página.
          <Link
            to="/fila"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ir para a Fila Única
            <CaretRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      {/* Pílula Volume/Consulta: o controle segmentado das outras telas. O
          modo continua na URL (?modo=) e cada modo só monta quando é o
          escolhido. Ativação manual: com o foco na pílula, ← → continuam
          andando na fila do Volume em vez de trocar de modo. */}
      <Tabs
        value={modo}
        activationMode="manual"
        onValueChange={(v) => void navigate({ search: { modo: v as AtendimentoModo } })}
        className="space-y-4"
      >
        <TabsList aria-label="Modo de atendimento" className="h-11 md:h-9">
          {MODOS.map((m) => (
            <TabsTrigger key={m.key} value={m.key} title={m.hint} className="h-9 px-4 md:h-7">
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="volume" className="mt-0">
          {modo === "volume" && <VolumeView />}
        </TabsContent>
        <TabsContent value="consulta" className="mt-0">
          {modo === "consulta" && <ConsultaView />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
