import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Phone,
  MessageCircle,
  CalendarCheck,
  MapPin,
  FileText,
  Trophy,
  Star,
  DollarSign,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/meu-painel")({
  head: () => ({ meta: [{ title: "Meu Painel — Seu Metro Quadrado" }] }),
  component: MeuPainelPage,
});

type Periodo = "hoje" | "semana" | "mes";
type Atividade = {
  dia: string;
  ligacoes: number;
  whatsapps: number;
  agendamentos: number;
  visitas: number;
  documentacoes: number;
  vendas: number;
  vgv_dia: number;
  pontuacao_total: number;
};
type MetaDiaria = {
  meta_ligacoes: number;
  meta_whatsapps: number;
  meta_agendamentos: number;
  meta_visitas: number;
  meta_vendas: number;
};

const toDate = (d: Date) => d.toISOString().slice(0, 10);
function intervalo(p: Periodo): { di: string; df: string } {
  const now = new Date();
  if (p === "hoje") return { di: toDate(now), df: toDate(now) };
  if (p === "semana") {
    const s = new Date(now);
    s.setDate(now.getDate() - 6);
    return { di: toDate(s), df: toDate(now) };
  }
  return { di: toDate(new Date(now.getFullYear(), now.getMonth(), 1)), df: toDate(now) };
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function MeuPainelPage() {
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const { di, df } = useMemo(() => intervalo(periodo), [periodo]);

  const atividadesQ = useQuery({
    queryKey: ["meu-painel:atividades", user?.id, di, df],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atividades_diarias" as never)
        .select(
          "dia, ligacoes, whatsapps, agendamentos, visitas, documentacoes, vendas, vgv_dia, pontuacao_total",
        )
        .eq("corretor_id", user!.id)
        .gte("dia", di)
        .lte("dia", df);
      if (error) throw error;
      return (data ?? []) as unknown as Atividade[];
    },
  });

  const metaQ = useQuery({
    queryKey: ["meu-painel:meta", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("metas_diarias" as never)
        .select("meta_ligacoes, meta_whatsapps, meta_agendamentos, meta_visitas, meta_vendas")
        .eq("corretor_id", user!.id)
        .maybeSingle();
      return (data ?? null) as unknown as MetaDiaria | null;
    },
  });

  const conquistasQ = useQuery({
    queryKey: ["meu-painel:conquistas", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [minhas, tipos] = await Promise.all([
        supabase
          .from("conquistas" as never)
          .select("id")
          .eq("corretor_id", user!.id),
        supabase
          .from("tipos_conquista" as never)
          .select("id")
          .eq("ativo", true),
      ]);
      return {
        ganhas: minhas.data?.length ?? 0,
        total: tipos.data?.length ?? 0,
      };
    },
  });

  const totais = useMemo(() => {
    const acc = {
      ligacoes: 0,
      whatsapps: 0,
      agendamentos: 0,
      visitas: 0,
      documentacoes: 0,
      vendas: 0,
      vgv: 0,
      pontos: 0,
    };
    (atividadesQ.data ?? []).forEach((r) => {
      acc.ligacoes += r.ligacoes;
      acc.whatsapps += r.whatsapps;
      acc.agendamentos += r.agendamentos;
      acc.visitas += r.visitas;
      acc.documentacoes += r.documentacoes;
      acc.vendas += r.vendas;
      acc.vgv += Number(r.vgv_dia) || 0;
      acc.pontos += r.pontuacao_total;
    });
    return acc;
  }, [atividadesQ.data]);

  const cards = [
    {
      key: "ligacoes",
      label: "Ligações",
      icon: Phone,
      value: totais.ligacoes,
      meta: metaQ.data?.meta_ligacoes,
    },
    {
      key: "whatsapps",
      label: "WhatsApp",
      icon: MessageCircle,
      value: totais.whatsapps,
      meta: metaQ.data?.meta_whatsapps,
    },
    {
      key: "agendamentos",
      label: "Agendamentos",
      icon: CalendarCheck,
      value: totais.agendamentos,
      meta: metaQ.data?.meta_agendamentos,
    },
    {
      key: "visitas",
      label: "Visitas",
      icon: MapPin,
      value: totais.visitas,
      meta: metaQ.data?.meta_visitas,
    },
    {
      key: "documentacoes",
      label: "Documentações",
      icon: FileText,
      value: totais.documentacoes,
      meta: undefined,
    },
    {
      key: "vendas",
      label: "Vendas",
      icon: Trophy,
      value: totais.vendas,
      meta: metaQ.data?.meta_vendas,
    },
  ];

  // Metas são diárias: só mostramos progresso de meta no período "hoje".
  const mostrarMeta = periodo === "hoje" && !!metaQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meu Painel"
        description="Sua produtividade, pontuação e metas."
        actions={
          <div className="inline-flex rounded-md border bg-card p-0.5">
            {(["hoje", "semana", "mes"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={periodo === p ? "default" : "ghost"}
                onClick={() => setPeriodo(p)}
                className="capitalize"
              >
                {p === "mes" ? "Mês" : p}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-primary/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Star className="h-4 w-4 text-amber-500" /> Pontuação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totais.pontos.toLocaleString("pt-BR")}</div>
            <div className="text-xs text-muted-foreground">pontos no período</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-emerald-500" /> VGV
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtBRL(totais.vgv)}</div>
            <div className="text-xs text-muted-foreground">{totais.vendas} venda(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-violet-500" /> Conquistas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {conquistasQ.data?.ganhas ?? 0}
              <span className="text-base text-muted-foreground">
                /{conquistasQ.data?.total ?? 0}
              </span>
            </div>
            <Button asChild variant="link" className="h-auto p-0 text-xs">
              <a href="/conquistas">ver medalhas</a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Atividades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totais.ligacoes + totais.whatsapps + totais.agendamentos + totais.visitas}
            </div>
            <div className="text-xs text-muted-foreground">contatos + agendas + visitas</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const pct =
            mostrarMeta && c.meta ? Math.min(100, Math.round((c.value / c.meta) * 100)) : null;
          return (
            <Card key={c.key}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icon className="h-4 w-4" /> {c.label}
                  </div>
                  {pct !== null && (
                    <Badge
                      variant="secondary"
                      className={cn(pct >= 100 && "bg-emerald-500/15 text-emerald-700")}
                    >
                      {pct}% da meta
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {c.value}
                  {mostrarMeta && c.meta ? (
                    <span className="text-sm font-normal text-muted-foreground"> / {c.meta}</span>
                  ) : null}
                </div>
                {pct !== null && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        pct >= 100 ? "bg-emerald-500" : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!metaQ.data && (
        <p className="text-sm text-muted-foreground">
          Defina suas metas diárias para acompanhar o progresso (peça ao gestor em “Metas”).
        </p>
      )}
    </div>
  );
}
