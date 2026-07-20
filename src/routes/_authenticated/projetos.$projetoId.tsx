import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PROJETO_CRM_SELECT } from "@/lib/projetos-query";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { usePreference } from "@/hooks/use-preference";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Building2, LayoutGrid, Plus, Table2 } from "lucide-react";
import { UNIDADE_STATUS_LABEL, type UnidadeStatus, formatBRL, calcStats } from "@/lib/unidades";
import { ProjetoComercial } from "@/components/projeto-comercial";
import { ProjetoHero } from "@/features/projetos/projeto-hero";
import { ProjetoFichaTecnica } from "@/features/projetos/projeto-ficha-tecnica";
import {
  UnidadesGrid,
  UNIDADE_STATUS_OPCOES,
  type UnidadeRow,
} from "@/features/projetos/unidades-grid";
import { UnidadesTable } from "@/features/projetos/unidades-table";
import { UnidadeFormDialog, type UnidadePayload } from "@/features/projetos/unidade-form-dialog";
import { HistoricoPrecos } from "@/features/projetos/historico-precos";
import { ProjetoFocoPanel, type FocoPayload } from "@/features/projetos/projeto-foco-panel";

export const Route = createFileRoute("/_authenticated/projetos/$projetoId")({
  head: () => ({ meta: [{ title: "Detalhe do projeto — Seu Metro Quadrado" }] }),
  component: ProjetoDetalhePage,
});

function ProjetoDetalhePage() {
  const { projetoId } = Route.useParams();
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin;
  const qc = useQueryClient();
  const [unidadeOpen, setUnidadeOpen] = useState(false);
  const [editing, setEditing] = useState<UnidadeRow | null>(null);
  const [focoOpen, setFocoOpen] = useState(false);
  const [unidadeBusca, setUnidadeBusca] = useState("");
  const [unidadeStatusFiltro, setUnidadeStatusFiltro] = useState<string>("todos");
  // Sub-visão das unidades (grade de disponibilidade OU tabela) — por usuário.
  const [unidadesView, setUnidadesView] = usePreference<"grade" | "tabela">(
    "projetos:unidades-view",
    "grade",
  );

  const projetoQ = useQuery({
    queryKey: ["projeto", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select(PROJETO_CRM_SELECT)
        .eq("id", projetoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const unidadesQ = useQuery({
    queryKey: ["unidades", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unidades")
        .select("*")
        .eq("projeto_id", projetoId)
        .is("deleted_at", null)
        .order("bloco", { ascending: true })
        .order("identificador", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const historicoQ = useQuery({
    queryKey: ["historico-precos", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico_precos")
        .select("*, unidade:unidades!inner(identificador, bloco, projeto_id)")
        .eq("unidade.projeto_id", projetoId)
        .order("alterado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const focoQ = useQuery({
    queryKey: ["projeto-foco", projetoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projeto_foco")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const focoAtivo = (focoQ.data ?? []).find((f) => f.ativo);

  const saveUnidade = useMutation({
    mutationFn: async (payload: UnidadePayload) => {
      if (editing?.id) {
        const { error } = await supabase.from("unidades").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("unidades").insert({
          ...payload,
          projeto_id: projetoId,
          criado_por: user?.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Unidade atualizada" : "Unidade criada");
      setUnidadeOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["unidades", projetoId] });
      qc.invalidateQueries({ queryKey: ["historico-precos", projetoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: UnidadeStatus }) => {
      const { error } = await supabase.from("unidades").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unidades", projetoId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteUnidade = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("unidades")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unidade movida para a lixeira");
      qc.invalidateQueries({ queryKey: ["unidades", projetoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ativarFoco = useMutation({
    mutationFn: async (payload: FocoPayload) => {
      // Desativa foco anterior do projeto
      await supabase
        .from("projeto_foco")
        .update({ ativo: false, fim: new Date().toISOString() })
        .eq("projeto_id", projetoId)
        .eq("ativo", true);
      const { error } = await supabase.from("projeto_foco").insert({
        projeto_id: projetoId,
        ...payload,
        criado_por: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projeto em foco ativado");
      setFocoOpen(false);
      qc.invalidateQueries({ queryKey: ["projeto-foco", projetoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desativarFoco = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("projeto_foco")
        .update({ ativo: false, fim: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Foco desativado");
      qc.invalidateQueries({ queryKey: ["projeto-foco", projetoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unidades = unidadesQ.data ?? [];
  const buscaUni = unidadeBusca.trim().toLowerCase();
  const unidadesFiltradas = unidades.filter((u) => {
    if (unidadeStatusFiltro !== "todos" && u.status !== unidadeStatusFiltro) return false;
    if (!buscaUni) return true;
    return [u.identificador, u.bloco, u.andar, u.tipologia]
      .filter(Boolean)
      .some((c) => String(c).toLowerCase().includes(buscaUni));
  });
  const stats = calcStats(unidades);
  const projeto = projetoQ.data;

  const voltar = (
    <Button
      variant="outline"
      size="sm"
      className={
        projeto
          ? "border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          : undefined
      }
      asChild
    >
      <Link to="/projetos">
        <ArrowLeft className="mr-1 h-4 w-4" />
        Projetos
      </Link>
    </Button>
  );

  const unidadesEmpty = (
    <EmptyState
      icon={Building2}
      title={
        unidades.length === 0
          ? "Nenhuma unidade cadastrada ainda."
          : "Nenhuma unidade corresponde aos filtros."
      }
      description={
        unidades.length === 0
          ? canManage
            ? "Use “Nova unidade” para começar o espelho de vendas."
            : undefined
          : "Ajuste a busca ou o filtro de status."
      }
    />
  );

  return (
    <div className="p-6 space-y-6">
      {projeto ? (
        <ProjetoHero
          projeto={projeto}
          emFoco={!!focoAtivo}
          focoMotivo={focoAtivo?.motivo}
          actions={voltar}
        />
      ) : (
        <PageHeader
          title="Projeto"
          description="Gestão completa do empreendimento"
          actions={voltar}
        />
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile title="Total" value={stats.total} loading={unidadesQ.isLoading} />
        <StatTile title="Disponíveis" value={stats.disponivel} loading={unidadesQ.isLoading} />
        <StatTile title="Reservadas" value={stats.reservada} loading={unidadesQ.isLoading} />
        <StatTile title="Vendidas" value={stats.vendida} loading={unidadesQ.isLoading} />
        <StatTile
          title="VGV disponível"
          // Moeda em text-2xl para caber na malha de 5 colunas sem quebrar.
          value={
            <AnimatedNumber value={stats.vgvDisponivel} format={formatBRL} className="text-2xl" />
          }
          loading={unidadesQ.isLoading}
          className="col-span-2 md:col-span-1"
        />
      </div>

      {projeto && <ProjetoFichaTecnica projeto={projeto} />}

      <Tabs defaultValue="unidades" className="space-y-4">
        <TabsList>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="historico">Histórico de preços</TabsTrigger>
          <TabsTrigger value="foco">Projeto em foco</TabsTrigger>
        </TabsList>

        <TabsContent value="unidades" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border bg-card p-0.5">
              <Button
                size="sm"
                variant={unidadesView === "grade" ? "default" : "ghost"}
                onClick={() => setUnidadesView("grade")}
              >
                <LayoutGrid className="mr-1 h-4 w-4" /> Grade
              </Button>
              <Button
                size="sm"
                variant={unidadesView === "tabela" ? "default" : "ghost"}
                onClick={() => setUnidadesView("tabela")}
              >
                <Table2 className="mr-1 h-4 w-4" /> Tabela
              </Button>
            </div>

            {unidades.length > 0 && (
              <>
                <Input
                  placeholder="Buscar unidade (identificador, bloco, tipologia)…"
                  value={unidadeBusca}
                  onChange={(e) => setUnidadeBusca(e.target.value)}
                  className="max-w-xs"
                />
                <Select value={unidadeStatusFiltro} onValueChange={setUnidadeStatusFiltro}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    {UNIDADE_STATUS_OPCOES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {UNIDADE_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {canManage && (
              <Button size="sm" className="ml-auto" onClick={() => setUnidadeOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Nova unidade
              </Button>
            )}
          </div>

          {unidadesView === "grade" ? (
            <UnidadesGrid
              unidades={unidadesFiltradas}
              loading={unidadesQ.isLoading}
              canManage={canManage}
              onChangeStatus={(id, status) => updateStatus.mutate({ id, status })}
              empty={unidadesEmpty}
            />
          ) : (
            <UnidadesTable
              unidades={unidadesFiltradas}
              loading={unidadesQ.isLoading}
              canManage={canManage}
              onChangeStatus={(id, status) => updateStatus.mutate({ id, status })}
              onEdit={(u) => {
                setEditing(u);
                setUnidadeOpen(true);
              }}
              onDelete={(u) => {
                if (confirm("Remover unidade?")) deleteUnidade.mutate(u.id);
              }}
              empty={unidadesEmpty}
            />
          )}

          {canManage && (
            <UnidadeFormDialog
              open={unidadeOpen}
              onOpenChange={(o) => {
                setUnidadeOpen(o);
                if (!o) setEditing(null);
              }}
              editing={editing}
              pending={saveUnidade.isPending}
              onSubmit={(payload) => saveUnidade.mutate(payload)}
            />
          )}
        </TabsContent>

        <TabsContent value="comercial">
          {projeto && (
            <ProjetoComercial projetoId={projetoId} projeto={projeto} canManage={canManage} />
          )}
        </TabsContent>

        <TabsContent value="historico">
          <HistoricoPrecos historico={historicoQ.data ?? []} loading={historicoQ.isLoading} />
        </TabsContent>

        <TabsContent value="foco">
          <ProjetoFocoPanel
            focos={focoQ.data ?? []}
            loading={focoQ.isLoading}
            canManage={canManage}
            open={focoOpen}
            onOpenChange={setFocoOpen}
            onAtivar={(payload) => ativarFoco.mutate(payload)}
            ativarPending={ativarFoco.isPending}
            onDesativar={(id) => desativarFoco.mutate(id)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
