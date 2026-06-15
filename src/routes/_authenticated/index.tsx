import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UsersRound, Trello, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Painel — Seu Metro Quadrado" },
      { name: "description", content: "Visão geral do CRM Seu Metro Quadrado." },
    ],
  }),
  component: DashboardPage,
});

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-3xl font-semibold mt-1">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <div className="h-10 w-10 rounded-md bg-accent text-accent-foreground flex items-center justify-center">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { roles, isAdmin, isGestor } = useUserRoles();

  const corretoresQuery = useQuery({
    queryKey: ["dash", "corretores-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const equipesQuery = useQuery({
    queryKey: ["dash", "equipes-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("equipes")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <div>
      <PageHeader
        title="Painel"
        description={
          roles.length
            ? `Você está como ${roles.join(", ")}.`
            : "Bem-vindo ao Seu Metro Quadrado."
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Corretores ativos"
          value={corretoresQuery.data ?? "—"}
          hint="Total de pessoas com acesso"
        />
        <StatCard
          icon={UsersRound}
          label="Equipes ativas"
          value={equipesQuery.data ?? "—"}
        />
        <StatCard icon={Trello} label="Leads no funil" value="—" hint="Em breve (Fase 2)" />
        <StatCard icon={CalendarClock} label="Agendamentos hoje" value="—" hint="Em breve (Fase 3)" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos passos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                1
              </div>
              <div>
                <div className="font-medium">Configure a equipe</div>
                <div className="text-muted-foreground text-xs">
                  Crie equipes e atribua gestores em{" "}
                  <Link to="/equipes" className="underline">
                    Equipes
                  </Link>
                  .
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                2
              </div>
              <div>
                <div className="font-medium">Convide os corretores</div>
                <div className="text-muted-foreground text-xs">
                  Cadastre os corretores em{" "}
                  <Link to="/corretores" className="underline">
                    Corretores
                  </Link>{" "}
                  e defina o papel de cada um.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-medium">
                3
              </div>
              <div>
                <div className="font-medium">Aguarde Fase 2</div>
                <div className="text-muted-foreground text-xs">
                  Leads, Kanban e Distribuição entram em seguida.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roteiro de portabilidade</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              Este projeto é a réplica em Lovable do CRM <strong>Seu Metro Quadrado</strong>. Estamos
              migrando o sistema módulo a módulo:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>✅ Fase 0: Fundação (layout, tema, navegação)</li>
              <li>
                ✅ Fase 1: Auth + Corretores + Equipes
                {!isAdmin && !isGestor && " (gestão visível só p/ admin/gestor)"}
              </li>
              <li>⏳ Fase 2: Leads + Kanban + Distribuição</li>
              <li>⏳ Fase 3: Agendamentos + Calendário</li>
              <li>⏳ Fases 4+: Metas, Conquistas, Projetos, Oferta Ativa, Comissões…</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
