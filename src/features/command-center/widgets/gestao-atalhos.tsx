// Widget da visão Operação: atalhos diretos para relatórios, gráficos e
// ferramentas de gestão — o gestor chega em 1 clique, sem caçar no menu.

import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  Compass,
  Filter,
  Settings2,
  Shuffle,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRoles } from "@/hooks/use-auth";
import type { WidgetProps } from "@/features/command-center/widget-registry";

type Atalho = {
  titulo: string;
  descricao: string;
  icon: LucideIcon;
  to: string;
  search?: Record<string, string>;
  adminOnly?: boolean;
};

const ATALHOS: Atalho[] = [
  {
    titulo: "Painel do Dia",
    descricao: "Exceções e ação em lote",
    icon: AlertTriangle,
    to: "/painel-gestor",
  },
  {
    titulo: "Funil",
    descricao: "Coorte × snapshot",
    icon: Filter,
    to: "/inteligencia",
    search: { tab: "funil" },
  },
  {
    titulo: "Gargalos",
    descricao: "Problemas por impacto R$",
    icon: Compass,
    to: "/inteligencia",
    search: { tab: "gargalos" },
  },
  {
    titulo: "Time",
    descricao: "Performance por corretor",
    icon: Users,
    to: "/inteligencia",
    search: { tab: "performance" },
  },
  {
    titulo: "Relatórios",
    descricao: "KPIs e gráficos",
    icon: BarChart3,
    to: "/inteligencia",
  },
  {
    titulo: "Metas & Ritmo",
    descricao: "Pacing e gap por corretor",
    icon: Target,
    to: "/ranking",
    search: { tab: "metas" },
  },
  {
    titulo: "Distribuição",
    descricao: "Roleta e exceções",
    icon: Shuffle,
    to: "/distribuicao",
  },
  {
    titulo: "Config. da gestão",
    descricao: "Limiares, SLA e pacing",
    icon: Settings2,
    to: "/configuracoes",
    search: { tab: "gestao" },
    adminOnly: true,
  },
];

export function GestaoAtalhosWidget(_props: WidgetProps) {
  const { isAdmin } = useUserRoles();
  const atalhos = ATALHOS.filter((a) => !a.adminOnly || isAdmin);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ferramentas de gestão</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {atalhos.map((a) => (
            <Link
              key={a.titulo}
              to={a.to}
              search={a.search ?? {}}
              className="group flex min-h-11 items-center gap-2.5 rounded-lg border border-border-subtle bg-card p-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <a.icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{a.titulo}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {a.descricao}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
