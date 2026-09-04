// Hub do SDR (/sdr): Minha base · Reaquecer · Entregues · Visitas & confirmações
// · Raio-X. Sem abas próprias: a sidebar contextual navega por ?tab= (mesmo
// padrão do Follow-Up). O admin enxerga o hub de qualquer SDR pelo seletor.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  CalendarDots,
  ChartLineUp,
  CheckCircle,
  Fire,
  Handshake,
  HandGrabbing,
  MagnifyingGlass,
  UploadSimple,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { PageHeader } from "@/components/page-header";
import { ImportLeadsDialog } from "@/components/import-leads-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { QueryErrorState } from "@/components/ui/query-error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TemperatureChip } from "@/components/ui/temperature-chip";
import { formatRelativeTime } from "@/lib/interacoes";
import { LEAD_STATUS_BADGE_TONE, leadStatusLabel, type LeadStatus } from "@/lib/leads";
import { SDR_ETAPAS_BASE, SDR_ETAPA_LABEL, SITUACAO_SDR_LABEL, situacaoSdr } from "@/lib/sdr";
import { cn } from "@/lib/utils";
import { useMinhaBase, usePegarLead, useRaioXSdr, useReaquecer, type LeadSdrRow } from "./client";

export type SdrTab = "reaquecer" | "entregues" | "agenda" | "raio-x";

// ---------------------------------------------------------------------------
// Seletor de SDR (admin)
// ---------------------------------------------------------------------------
function useSdrs(enabled: boolean) {
  return useQuery({
    queryKey: ["sdrs"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: roles, error: e1 } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "sdr");
      if (e1) throw e1;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [] as Array<{ id: string; nome: string }>;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", ids)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useNomesCorretores(ids: Array<string | null>) {
  const alvo = useMemo(
    () => Array.from(new Set(ids.filter((x): x is string => !!x))).sort(),
    [ids],
  );
  return useQuery({
    queryKey: ["profiles-nomes", alvo.join(",")],
    enabled: alvo.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").in("id", alvo);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.nome])) as Record<string, string>;
    },
  });
}

function EtapaBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={LEAD_STATUS_BADGE_TONE[status as LeadStatus]}>
      {SDR_ETAPA_LABEL[status as keyof typeof SDR_ETAPA_LABEL] ?? leadStatusLabel(status)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Minha base
// ---------------------------------------------------------------------------
function BaseView({ sdrId, podeImportar }: { sdrId: string; podeImportar: boolean }) {
  const navigate = useNavigate();
  const q = useMinhaBase(sdrId, "base");
  const [etapa, setEtapa] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [importar, setImportar] = useState(false);
  useRealtimeInvalidate("leads", [["sdr:base", sdrId]], { filter: `sdr_id=eq.${sdrId}` });

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (q.data ?? []).filter(
      (l) =>
        (etapa === "todas" || l.status === etapa) &&
        (!termo || l.nome.toLowerCase().includes(termo) || l.telefone.includes(termo)),
    );
  }, [q.data, etapa, busca]);

  const contagem = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of q.data ?? []) m[l.status] = (m[l.status] ?? 0) + 1;
    return m;
  }, [q.data]);

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={etapa === "todas" ? "default" : "outline"}
          onClick={() => setEtapa("todas")}
        >
          Todas <span className="ml-1 tabular-nums opacity-70">{q.data?.length ?? 0}</span>
        </Button>
        {SDR_ETAPAS_BASE.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={etapa === s ? "default" : "outline"}
            onClick={() => setEtapa(s)}
          >
            {SDR_ETAPA_LABEL[s]}{" "}
            <span className="ml-1 tabular-nums opacity-70">{contagem[s] ?? 0}</span>
          </Button>
        ))}
        <div className="relative ml-auto">
          <MagnifyingGlass className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 w-56 pl-8"
            placeholder="Nome ou telefone"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        {podeImportar && (
          <Button size="sm" variant="outline" onClick={() => setImportar(true)}>
            <UploadSimple className="mr-1.5 h-4 w-4" /> Importar base
          </Button>
        )}
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          icon={Fire}
          title="Nenhum lead nesta base"
          description="Importe uma planilha ou pegue leads parados na aba Reaquecer."
          action={
            <div className="flex gap-2">
              {podeImportar && (
                <Button size="sm" onClick={() => setImportar(true)}>
                  Importar base
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link to="/sdr" search={{ tab: "reaquecer" }}>
                  Ver leads parados
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="hidden md:table-cell">Projeto</TableHead>
                <TableHead>Último registro</TableHead>
                <TableHead className="hidden md:table-cell">Interesse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow
                  key={l.id}
                  className="cursor-pointer"
                  onClick={() => navigate({ to: "/leads/$leadId", params: { leadId: l.id } })}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <TemperatureChip temperatura={l.temperatura} size="sm" />
                      <div>
                        <div className="font-medium">{l.nome}</div>
                        <div className="text-xs text-muted-foreground">{l.telefone}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <EtapaBadge status={l.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {SITUACAO_SDR_LABEL[situacaoSdr(l)]}
                  </TableCell>
                  <TableCell className="hidden text-xs md:table-cell">
                    {l.projeto_nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.ultima_atividade_em ? formatRelativeTime(l.ultima_atividade_em) : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {l.sdr_interesse_confirmado ? (
                      <CheckCircle className="h-4 w-4 text-success" weight="fill" />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {importar && <ImportLeadsDialog open={importar} onOpenChange={setImportar} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reaquecer (leads parados de corretor)
// ---------------------------------------------------------------------------
function ReaquecerView() {
  const navigate = useNavigate();
  const q = useReaquecer();
  const pegar = usePegarLead();

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) {
    return (
      <EmptyState
        icon={ArrowsClockwise}
        title="Nenhum lead parado disponível"
        description="Aparecem aqui os leads de corretor sem registro há alguns dias, abaixo de Análise de crédito e sem visita futura."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Corretor</TableHead>
            <TableHead className="hidden md:table-cell">Projeto / zona</TableHead>
            <TableHead>Parado há</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data.map((l) => (
            <TableRow key={l.id}>
              <TableCell
                className="cursor-pointer"
                onClick={() => navigate({ to: "/leads/$leadId", params: { leadId: l.id } })}
              >
                <div className="flex items-center gap-2">
                  <TemperatureChip temperatura={l.temperatura} size="sm" />
                  <div>
                    <div className="font-medium">{l.nome}</div>
                    <div className="text-xs text-muted-foreground">{l.telefone}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]}
                >
                  {leadStatusLabel(l.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{l.corretor_nome ?? "—"}</TableCell>
              <TableCell className="hidden text-xs md:table-cell">
                {[l.projeto_nome, l.zona].filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell className="text-sm tabular-nums">{l.dias_parado} dias</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  disabled={pegar.isPending}
                  onClick={() =>
                    pegar.mutate(l.id, {
                      onSuccess: () => toast.success(`${l.nome} está na sua base para reaquecer`),
                      onError: (e: Error) => toast.error(e.message),
                    })
                  }
                >
                  <HandGrabbing className="mr-1.5 h-4 w-4" /> Pegar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entregues
// ---------------------------------------------------------------------------
function EntreguesView({ sdrId }: { sdrId: string }) {
  const navigate = useNavigate();
  const q = useMinhaBase(sdrId, "entregues");
  const nomes = useNomesCorretores((q.data ?? []).map((l) => l.corretor_id));
  useRealtimeInvalidate("leads", [["sdr:entregues", sdrId]], { filter: `sdr_id=eq.${sdrId}` });

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) {
    return (
      <EmptyState
        icon={Handshake}
        title="Nenhum lead entregue ainda"
        description="Agende uma visita ou entregue um lead qualificado com motivo: ele aparece aqui com o corretor e o andamento."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Corretor</TableHead>
            <TableHead>Etapa atual</TableHead>
            <TableHead>Entregue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data.map((l: LeadSdrRow) => (
            <TableRow
              key={l.id}
              className="cursor-pointer"
              onClick={() => navigate({ to: "/leads/$leadId", params: { leadId: l.id } })}
            >
              <TableCell>
                <div className="font-medium">{l.nome}</div>
                <div className="text-xs text-muted-foreground">{l.projeto_nome ?? l.telefone}</div>
              </TableCell>
              <TableCell className="text-sm">
                {l.corretor_id ? (nomes.data?.[l.corretor_id] ?? "…") : "—"}
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={LEAD_STATUS_BADGE_TONE[l.status as LeadStatus]}
                >
                  {leadStatusLabel(l.status)}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {l.sdr_entregue_em ? formatRelativeTime(l.sdr_entregue_em) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visitas & confirmações
// ---------------------------------------------------------------------------
function AgendaView({ sdrId }: { sdrId: string }) {
  const navigate = useNavigate();
  const tarefas = useQuery({
    queryKey: ["sdr:tarefas", sdrId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, data_vencimento, status, lead_id, leads(nome, telefone)")
        .eq("corretor_id", sdrId)
        .in("status", ["pendente", "em_andamento"])
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const visitas = useQuery({
    queryKey: ["sdr:visitas", sdrId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agendamentos")
        .select(
          "id, titulo, data_inicio, status, local, lead_id, corretor_id, leads!inner(nome, sdr_id)",
        )
        .eq("leads.sdr_id", sdrId)
        .eq("tipo", "visita")
        .is("deleted_at", null)
        .gte("data_inicio", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("data_inicio", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const nomes = useNomesCorretores((visitas.data ?? []).map((v) => v.corretor_id));
  useRealtimeInvalidate(
    ["tarefas", "agendamentos"],
    [
      ["sdr:tarefas", sdrId],
      ["sdr:visitas", sdrId],
    ],
  );

  const concluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tarefas")
        .update({ status: "concluida", data_conclusao: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Confirmação registrada");
      void tarefas.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-2">
        <h2 className="font-display text-base font-semibold">Confirmações pendentes</h2>
        {tarefas.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : tarefas.isError ? (
          <QueryErrorState error={tarefas.error} onRetry={() => tarefas.refetch()} />
        ) : !tarefas.data?.length ? (
          <EmptyState
            icon={CheckCircle}
            title="Nada a confirmar"
            description="As tarefas D-1 e D-0 das visitas que você agendar aparecem aqui."
          />
        ) : (
          <ul className="space-y-2">
            {tarefas.data.map((t) => {
              const vencida = !!t.data_vencimento && new Date(t.data_vencimento) < new Date();
              const lead = t.leads;
              return (
                <li
                  key={t.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2",
                    vencida && "border-destructive/40",
                  )}
                >
                  <button
                    type="button"
                    className="text-left"
                    onClick={() =>
                      t.lead_id && navigate({ to: "/leads/$leadId", params: { leadId: t.lead_id } })
                    }
                  >
                    <div className="text-sm font-medium">{t.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead?.nome}
                      {t.data_vencimento && ` · ${formatRelativeTime(t.data_vencimento)}`}
                    </div>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={concluir.isPending}
                    onClick={() => concluir.mutate(t.id)}
                  >
                    Confirmado
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="font-display text-base font-semibold">Visitas agendadas</h2>
        {visitas.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : visitas.isError ? (
          <QueryErrorState error={visitas.error} onRetry={() => visitas.refetch()} />
        ) : !visitas.data?.length ? (
          <EmptyState
            icon={CalendarDots}
            title="Nenhuma visita nos próximos dias"
            description="Visitas dos seus leads, com o corretor que vai atender."
          />
        ) : (
          <ul className="space-y-2">
            {visitas.data.map((v) => {
              const lead = v.leads;
              return (
                <li key={v.id} className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      className="text-left text-sm font-medium"
                      onClick={() =>
                        v.lead_id &&
                        navigate({ to: "/leads/$leadId", params: { leadId: v.lead_id } })
                      }
                    >
                      {lead?.nome ?? v.titulo}
                    </button>
                    <Badge variant="secondary">{v.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(v.data_inicio).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {v.local && ` · ${v.local}`}
                    {v.corretor_id && ` · ${nomes.data?.[v.corretor_id] ?? "corretor"}`}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Raio-X
// ---------------------------------------------------------------------------
function RaioXView({ sdrId }: { sdrId: string }) {
  const q = useRaioXSdr(sdrId);
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />;
  const x = q.data;
  const comp = x.visitas.comparecimento_pct;
  const intent = (ok: boolean | null) => (ok === null ? "neutral" : ok ? "success" : "warning");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Período: {x.periodo.de} a {x.periodo.ate} (mês atual). Metas em Central de Distribuição →
        Política.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          title="Leads na base"
          value={x.base.total}
          icon={Fire}
          hint={`${x.base.reaquecendo} reaquecendo`}
        />
        <StatTile
          title="Contatos hoje"
          value={x.contatos.hoje}
          intent={intent(x.contatos.hoje >= x.metas.contatos_dia)}
          hint={`meta ${x.metas.contatos_dia}/dia · ${x.contatos.periodo} no período`}
        />
        <StatTile
          title="Visitas agendadas na semana"
          value={x.agendamentos.semana}
          icon={CalendarDots}
          intent={intent(x.agendamentos.semana >= x.metas.agendamentos_semana)}
          hint={`meta ${x.metas.agendamentos_semana}/semana · ${x.agendamentos.periodo} no período`}
        />
        <StatTile
          title="Comparecimento"
          value={comp === null ? "—" : `${comp}%`}
          intent={intent(comp === null ? null : comp >= x.metas.comparecimento_pct)}
          hint={`meta ${x.metas.comparecimento_pct}% · ${x.visitas.realizadas} realizadas, ${x.visitas.no_show} faltas, ${x.visitas.pendentes} pendentes`}
        />
        <StatTile title="Qualificados" value={x.qualificados} icon={CheckCircle} />
        <StatTile
          title="Entregues"
          value={x.entregues.periodo}
          icon={Handshake}
          hint={`${x.entregues.ativos} ativos com corretor`}
        />
        <StatTile
          title="Devolvidos"
          value={x.devolvidos}
          intent={x.devolvidos > 0 ? "warning" : "neutral"}
        />
        <StatTile
          title="Vendas de leads seus"
          value={x.vendas.qtd}
          icon={ChartLineUp}
          hint={
            x.comissao_percentual > 0
              ? `${x.comissao_percentual}% do VGV para você · R$ ${Math.round(x.vendas.valor).toLocaleString("pt-BR")}`
              : "comissão do SDR ainda não configurada"
          }
        />
      </div>
      {Object.keys(x.base.por_status).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(x.base.por_status).map(([s, n]) => (
            <Badge key={s} variant="secondary" className={LEAD_STATUS_BADGE_TONE[s as LeadStatus]}>
              {SDR_ETAPA_LABEL[s as keyof typeof SDR_ETAPA_LABEL] ?? leadStatusLabel(s)}: {n}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export function SdrPage({ tab }: { tab?: SdrTab }) {
  const { user } = useAuth();
  const { isAdmin, isSdr } = useUserRoles();
  const sdrs = useSdrs(isAdmin);
  const [sdrEscolhido, setSdrEscolhido] = useState<string | null>(null);
  const sdrId = isAdmin ? (sdrEscolhido ?? sdrs.data?.[0]?.id ?? null) : (user?.id ?? null);

  const titulo =
    tab === "reaquecer"
      ? "Reaquecer leads parados"
      : tab === "entregues"
        ? "Leads entregues"
        : tab === "agenda"
          ? "Visitas & confirmações"
          : tab === "raio-x"
            ? "Raio-X do SDR"
            : "Minha base";

  return (
    <div className="space-y-4">
      <PageHeader
        title={titulo}
        description={
          tab === "reaquecer"
            ? "Leads de corretor sem registro há dias. Ao pegar, o corretor mantém a posse e tem prioridade na visita."
            : tab === "entregues"
              ? "Quem você entregou, com quem está e em que etapa."
              : tab === "agenda"
                ? "Você confirma a visita (D-1 e no dia); o corretor atende da visita em diante."
                : tab === "raio-x"
                  ? "Contatos, agendamentos, comparecimento e entregas contra as metas."
                  : "Esquente, qualifique e agende: o corretor recebe o lead pronto pela roleta."
        }
        actions={
          isAdmin && (sdrs.data?.length ?? 0) > 0 ? (
            <Select value={sdrId ?? ""} onValueChange={setSdrEscolhido}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="SDR" />
              </SelectTrigger>
              <SelectContent>
                {sdrs.data!.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {isAdmin && !sdrId ? (
        <EmptyState
          icon={Fire}
          title="Nenhum SDR cadastrado"
          description="Convide alguém com o papel SDR em Configurações → Pessoas e ligue a flag sdr_ativo na Central de Distribuição → Política."
        />
      ) : !sdrId ? (
        <Skeleton className="h-64 w-full" />
      ) : tab === "reaquecer" ? (
        <ReaquecerView />
      ) : tab === "entregues" ? (
        <EntreguesView sdrId={sdrId} />
      ) : tab === "agenda" ? (
        <AgendaView sdrId={sdrId} />
      ) : tab === "raio-x" ? (
        <RaioXView sdrId={sdrId} />
      ) : (
        <BaseView sdrId={sdrId} podeImportar={isAdmin || isSdr} />
      )}
    </div>
  );
}
