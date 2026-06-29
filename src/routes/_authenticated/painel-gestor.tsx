import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { leadStatusLabel } from "@/lib/leads";
import { useDashboardPorCorretor, useDashboardLeadsUrgentes } from "@/features/dashboard/queries";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  ShieldAlert,
  PhoneCall,
  MessageCircle,
  MapPin,
  BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/painel-gestor")({
  head: () => ({ meta: [{ title: "Painel do Gestor — Seu Metro Quadrado" }] }),
  component: PainelGestorPage,
});

type Periodo = "hoje" | "semana" | "mes";
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

// Status fora do funil ativo — usados para filtrar a base de "leads ativos".
const FORA_DO_FUNIL = "(perdido,contrato_fechado,pos_venda)";

function PainelGestorPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const podeVer = isAdmin || isGestor;
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const range = useMemo(() => intervalo(periodo), [periodo]);

  const porCorretorQ = useDashboardPorCorretor(range, podeVer);
  const urgentesQ = useDashboardLeadsUrgentes(null, podeVer);

  // Aderência / qualidade do cadastro — contagens org-wide (gestor enxerga tudo).
  const aderenciaQ = useQuery({
    queryKey: ["gestor:aderencia"],
    enabled: podeVer,
    staleTime: 60_000,
    queryFn: async () => {
      const base = () =>
        supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("na_lixeira", false)
          .not("status", "in", FORA_DO_FUNIL);
      const [tot, semCorr, semEmail, semRenda] = await Promise.all([
        base(),
        base().is("corretor_id", null),
        base().is("email", null),
        base().is("renda_informada", null),
      ]);
      return {
        total: tot.count ?? 0,
        semCorretor: semCorr.count ?? 0,
        semEmail: semEmail.count ?? 0,
        semRenda: semRenda.count ?? 0,
      };
    },
  });

  // Nomes dos corretores (autor das interações) para o relatório de atividade.
  const nomesQ = useQuery({
    queryKey: ["gestor:nomes-corretores"],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) throw error;
      const m = new Map<string, string>();
      (data ?? []).forEach((p: { id: string; nome: string }) => m.set(p.id, p.nome));
      return m;
    },
  });

  // Relatório de atividade: interações do período agregadas por autor + tipo.
  // (Ligações / WhatsApp / Visitas — hoje não medidos no dashboard.)
  const LIMITE_ATIVIDADE = 10000;
  const atividadeQ = useQuery({
    queryKey: ["gestor:atividade", range.di, range.df],
    enabled: podeVer,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interacoes")
        .select("autor_id, tipo")
        .is("deleted_at", null)
        .gte("ocorreu_em", `${range.di}T00:00:00`)
        .lte("ocorreu_em", `${range.df}T23:59:59`)
        .order("ocorreu_em", { ascending: false })
        .limit(LIMITE_ATIVIDADE);
      if (error) throw error;
      const rows = (data ?? []) as { autor_id: string | null; tipo: string }[];
      return { rows, truncado: rows.length >= LIMITE_ATIVIDADE };
    },
  });

  const atividade = useMemo(() => {
    const rows = atividadeQ.data?.rows ?? [];
    const nomes = nomesQ.data;
    type Lin = {
      autor: string;
      nome: string;
      ligacao: number;
      whatsapp: number;
      visita: number;
      outras: number;
      total: number;
    };
    const m = new Map<string, Lin>();
    const tot = { ligacao: 0, whatsapp: 0, visita: 0, total: 0 };
    for (const r of rows) {
      const autor = r.autor_id ?? "—";
      let lin = m.get(autor);
      if (!lin) {
        lin = {
          autor,
          nome: (r.autor_id && nomes?.get(r.autor_id)) || "Sem autor",
          ligacao: 0,
          whatsapp: 0,
          visita: 0,
          outras: 0,
          total: 0,
        };
        m.set(autor, lin);
      }
      if (r.tipo === "ligacao") {
        lin.ligacao++;
        tot.ligacao++;
      } else if (r.tipo === "whatsapp") {
        lin.whatsapp++;
        tot.whatsapp++;
      } else if (r.tipo === "visita") {
        lin.visita++;
        tot.visita++;
      } else {
        lin.outras++;
      }
      lin.total++;
      tot.total++;
    }
    const linhas = Array.from(m.values()).sort((a, b) => b.total - a.total);
    return { linhas, tot, truncado: atividadeQ.data?.truncado ?? false };
  }, [atividadeQ.data, nomesQ.data]);

  // Leads parados (>30 min sem atendimento) agregados por corretor.
  const paradosPorCorretor = useMemo(() => {
    const m = new Map<string, number>();
    (urgentesQ.data ?? []).forEach((u) => {
      if (u.corretor_id) m.set(u.corretor_id, (m.get(u.corretor_id) ?? 0) + 1);
    });
    return m;
  }, [urgentesQ.data]);

  if (!podeVer) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <ShieldAlert className="h-10 w-10" />
          <div className="font-medium">Acesso restrito</div>
          <div className="text-sm">Esta área é exclusiva para gestores e administradores.</div>
        </CardContent>
      </Card>
    );
  }

  const corretores = porCorretorQ.data ?? [];
  const urgentes = urgentesQ.data ?? [];
  const ad = aderenciaQ.data;

  const pctAderencia = (faltando: number) =>
    ad && ad.total > 0 ? Math.round((1 - faltando / ad.total) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel do Gestor"
        description="Saúde da operação: produtividade por corretor, qualidade do CRM e leads parados."
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

      {/* Bloco 1 — Saúde por corretor */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary" /> Saúde por corretor
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {corretores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-2">Corretor</th>
                  <th className="py-2 px-2 text-right">Leads</th>
                  <th className="py-2 px-2 text-right">Agend.</th>
                  <th className="py-2 px-2 text-right">Visitas</th>
                  <th className="py-2 px-2 text-right">Análise</th>
                  <th className="py-2 px-2 text-right">Vendas</th>
                  <th className="py-2 px-2 text-right">Perdidos</th>
                  <th className="py-2 px-2 text-right">Parados</th>
                  <th className="py-2 pl-2 text-right">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {corretores.map((c) => {
                  const parados = paradosPorCorretor.get(c.corretor_id) ?? 0;
                  return (
                    <tr key={c.corretor_id} className="border-b last:border-0">
                      <td className="py-2 pr-2 font-medium">{c.nome}</td>
                      <td className="py-2 px-2 text-right">{c.leads}</td>
                      <td className="py-2 px-2 text-right">{c.agendamentos}</td>
                      <td className="py-2 px-2 text-right">{c.visitas}</td>
                      <td className="py-2 px-2 text-right">{c.analise}</td>
                      <td className="py-2 px-2 text-right font-semibold text-emerald-600">
                        {c.fechados}
                      </td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{c.perdidos}</td>
                      <td
                        className={cn(
                          "py-2 px-2 text-right",
                          parados > 0 ? "font-semibold text-rose-600" : "text-muted-foreground",
                        )}
                      >
                        {parados}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <Badge variant="outline">{c.conversao}%</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Bloco 2 — Relatório de atividade (ligações / WhatsApp / visitas) */}
      <div>
        <div className="grid gap-4 sm:grid-cols-3 mb-3">
          <AtividadeCard icon={PhoneCall} titulo="Ligações" valor={atividade.tot.ligacao} />
          <AtividadeCard icon={MessageCircle} titulo="WhatsApp" valor={atividade.tot.whatsapp} />
          <AtividadeCard icon={MapPin} titulo="Visitas" valor={atividade.tot.visita} />
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" /> Atividade da equipe no período
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {atividadeQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : atividade.linhas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma interação registrada no período.
              </p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-2">Corretor</th>
                      <th className="py-2 px-2 text-right">Ligações</th>
                      <th className="py-2 px-2 text-right">WhatsApp</th>
                      <th className="py-2 px-2 text-right">Visitas</th>
                      <th className="py-2 px-2 text-right">Outras</th>
                      <th className="py-2 pl-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {atividade.linhas.map((l) => (
                      <tr key={l.autor} className="border-b last:border-0">
                        <td className="py-2 pr-2 font-medium">{l.nome}</td>
                        <td className="py-2 px-2 text-right">{l.ligacao}</td>
                        <td className="py-2 px-2 text-right">{l.whatsapp}</td>
                        <td className="py-2 px-2 text-right">{l.visita}</td>
                        <td className="py-2 px-2 text-right text-muted-foreground">{l.outras}</td>
                        <td className="py-2 pl-2 text-right font-semibold">{l.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {atividade.truncado && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Mostrando as {LIMITE_ATIVIDADE.toLocaleString("pt-BR")} interações mais recentes
                    do período (limite de exibição) — os totais podem estar subestimados.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bloco 3 — Aderência / qualidade do CRM */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
          <ClipboardCheck className="h-4 w-4" /> Qualidade do CRM (leads ativos)
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AderenciaCard titulo="Leads ativos" valor={ad?.total} />
          <AderenciaCard
            titulo="Sem corretor"
            valor={ad?.semCorretor}
            alerta={(ad?.semCorretor ?? 0) > 0}
            href="/leads"
          />
          <AderenciaCard
            titulo="Sem e-mail"
            valor={ad?.semEmail}
            sub={pctAderencia(ad?.semEmail ?? 0)}
          />
          <AderenciaCard
            titulo="Sem renda informada"
            valor={ad?.semRenda}
            sub={pctAderencia(ad?.semRenda ?? 0)}
          />
        </div>
      </div>

      {/* Bloco 3 — Leads parados por corretor (acionável) */}
      <Card className="border-amber-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Leads parados (+30 min sem atendimento)
            {urgentes.length > 0 && (
              <Badge variant="secondary" className="bg-amber-500/15 text-amber-700">
                {urgentes.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {urgentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead parado agora. 👏</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {urgentes.slice(0, 20).map((u) => (
                <Link
                  key={u.lead_id}
                  to="/leads/$leadId"
                  params={{ leadId: u.lead_id }}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{u.nome}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {leadStatusLabel(u.status)} · {u.corretor_nome || "sem corretor"}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 bg-rose-500/15 text-rose-700">
                    {u.minutos_parado} min
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AtividadeCard({
  icon: Icon,
  titulo,
  valor,
}: {
  icon: typeof Activity;
  titulo: string;
  valor: number;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {titulo}
        </div>
        <div className="mt-1 text-2xl font-bold">{valor.toLocaleString("pt-BR")}</div>
      </CardContent>
    </Card>
  );
}

function AderenciaCard({
  titulo,
  valor,
  sub,
  alerta,
  href,
}: {
  titulo: string;
  valor: number | undefined;
  sub?: number | null;
  alerta?: boolean;
  href?: string;
}) {
  const inner = (
    <Card className={cn(alerta && "border-amber-500/40")}>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{titulo}</div>
        <div className={cn("mt-1 text-2xl font-bold", alerta && "text-amber-600")}>
          {valor ?? "—"}
        </div>
        {sub != null && <div className="text-xs text-muted-foreground">{sub}% preenchido</div>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link to={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
