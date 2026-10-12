import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarPlus } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgendaPage, NovoAgendamentoDialog } from "@/features/agenda/agenda-page";
import { TarefasPage } from "@/features/agenda/tarefas-page";

type CompromissosTab = "agenda" | "tarefas";

export const Route = createFileRoute("/_authenticated/agendamentos")({
  // `tab` permite abrir a aba Tarefas; padrão é a Agenda (preserva /agendamentos).
  validateSearch: (search: Record<string, unknown>): { tab?: CompromissosTab } => ({
    tab: search.tab === "tarefas" ? "tarefas" : undefined,
  }),
  head: () => ({ meta: [{ title: "Agenda & Tarefas — Seu Metro Quadrado" }] }),
  component: CompromissosPage,
});

// Agenda e Tarefas dividem a rota (?tab=), cada uma reaproveitando a página
// existente; /agendamentos e /tarefas seguem válidas para deep-link.
//
// Regra dos 2 menus (2026-09-11): Agenda e Tarefas são DUAS seções da sidebar
// da Gestão de Carteira. No desktop a linha de abas interna repetiria a
// escolha que a sidebar acabou de fazer (3º menu) — por isso ela só aparece
// abaixo de `md`, onde a sidebar vira gaveta e a aba é o jeito rápido de
// alternar com o polegar.
//
// Padrão Lançamento (2026-10): um título só por tela, o da aba aberta
// ("Agenda" — o mesmo rótulo da sidebar — ou "Tarefas"), e no celular ele vem
// ANTES da linha de abas. Por isso o cabeçalho mora aqui no hub e não dentro
// de cada aba. "Novo agendamento" é a única ação do cabeçalho da Agenda; a
// das Tarefas é a linha de criar, dentro da aba.
function CompromissosPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: CompromissosTab = tab ?? "agenda";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "tarefas" ? "tarefas" : undefined } });
  const [novoAgendamento, setNovoAgendamento] = useState(false);

  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      {activeTab === "agenda" ? (
        <PageHeader
          title="Agenda"
          description="Suas visitas e compromissos, e o que falta confirmar."
          actions={
            <NovoAgendamentoDialog open={novoAgendamento} onOpenChange={setNovoAgendamento}>
              <Button>
                <CalendarPlus className="mr-1 h-4 w-4" /> Novo agendamento
              </Button>
            </NovoAgendamentoDialog>
          }
        />
      ) : (
        <PageHeader
          title="Tarefas"
          description="O que você combinou fazer, na ordem do vencimento."
        />
      )}
      <TabsList
        aria-label="Agenda e tarefas"
        className="mb-4 grid h-auto w-full grid-cols-2 md:hidden"
      >
        <TabsTrigger value="agenda" className="min-h-10">
          Agenda
        </TabsTrigger>
        <TabsTrigger value="tarefas" className="min-h-10">
          Tarefas
        </TabsTrigger>
      </TabsList>
      <TabsContent value="agenda" className="mt-0">
        <AgendaPage onNovo={() => setNovoAgendamento(true)} />
      </TabsContent>
      <TabsContent value="tarefas" className="mt-0">
        <TarefasPage />
      </TabsContent>
    </Tabs>
  );
}
