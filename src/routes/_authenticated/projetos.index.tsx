import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PROJETO_CRM_SELECT } from "@/lib/projetos-query";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Building2, Upload, Sparkles, AlertTriangle, RefreshCw, X } from "lucide-react";
import { webhookUrl } from "@/lib/projetos";
import { ImportProjetosDialog } from "@/components/import-projetos-dialog";
import { ProjetoFormDialog } from "@/components/projeto-form-dialog";
import { ProjetoCard, type ProjetoRow } from "@/components/projeto-card";
import {
  ProjetosFilters,
  applyFilters,
  emptyFilters,
  type Filters,
} from "@/components/projetos-filters";
import { OfertaAtivaPage } from "@/features/projetos/oferta-ativa-page";
import { ComissoesPage } from "@/features/comissoes/comissoes-page";
import { LinksUteisPage } from "@/features/projetos/links-uteis-page";

// O antigo "Radar" virou o Modo Fechamento do /pipeline.
type NegociosTab = "catalogo" | "oferta" | "comissoes" | "links";
const NEGOCIOS_TABS: NegociosTab[] = ["catalogo", "oferta", "comissoes", "links"];

export const Route = createFileRoute("/_authenticated/projetos/")({
  // `tab` permite abrir/linkar direto uma aba do hub de Negócios & Carteira.
  validateSearch: (search: Record<string, unknown>): { tab?: NegociosTab } => ({
    tab: NEGOCIOS_TABS.includes(search.tab as NegociosTab)
      ? (search.tab as NegociosTab)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Negócios & Carteira — Seu Metro Quadrado" }] }),
  component: NegociosPage,
});

// Hub de Negócios & Carteira: catálogo de empreendimentos, oferta ativa, radar de
// fechamento, comissões e links úteis em abas internas (Fase 2). O Match IA fica
// como rota própria (usa search params próprios) acessível pelo botão ao lado das
// abas e pela página do lead. As rotas antigas seguem válidas para deep-link.
function NegociosPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const activeTab: NegociosTab = tab ?? "catalogo";
  const onTabChange = (v: string) =>
    navigate({ search: { tab: v === "catalogo" ? undefined : (v as NegociosTab) } });

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="oferta">Oferta Ativa</TabsTrigger>
          <TabsTrigger value="comissoes">Comissões</TabsTrigger>
          <TabsTrigger value="links">Links Úteis</TabsTrigger>
        </TabsList>
        <Button asChild variant="outline" size="sm">
          <Link to="/match">
            <Sparkles className="mr-1 h-4 w-4" /> Match IA
          </Link>
        </Button>
      </div>
      <TabsContent value="catalogo">
        <CatalogoPanel />
      </TabsContent>
      <TabsContent value="oferta">
        <OfertaAtivaPage />
      </TabsContent>
      <TabsContent value="comissoes">
        <ComissoesPage />
      </TabsContent>
      <TabsContent value="links">
        <LinksUteisPage />
      </TabsContent>
    </Tabs>
  );
}

function CatalogoPanel() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ProjetoRow | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const projetosQ = useQuery({
    queryKey: ["projetos", canManage ? "all" : "ativos"],
    queryFn: async () => {
      let q = supabase.from("projetos").select(PROJETO_CRM_SELECT).is("deleted_at", null);
      if (!canManage) q = q.eq("ativo", true);
      const { data, error } = await q.order("nome");
      if (error) throw error;
      return (data ?? []) as ProjetoRow[];
    },
  });

  const all = useMemo(() => projetosQ.data ?? [], [projetosQ.data]);
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  // Gestores enxergam inativos em `all`; mostramos a contagem ao lado do total.
  const inativos = useMemo(() => all.filter((p) => !p.ativo).length, [all]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (editing?.id) {
        const { error } = await supabase
          .from("projetos")
          .update(payload as never)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("projetos")
          .insert({ ...payload, criado_por: user?.id } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Projeto atualizado" : "Projeto criado");
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["projetos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loadToken = async (id: string): Promise<string | null> => {
    if (tokens[id]) return tokens[id];
    const { data, error } = await supabase.rpc("get_projeto_webhook_token", { _projeto_id: id });
    if (error) {
      toast.error(error.message);
      return null;
    }
    const t = (data as string) ?? "";
    setTokens((s) => ({ ...s, [id]: t }));
    return t;
  };

  const regenMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("regenerar_webhook_token", { _projeto_id: id });
      if (error) throw error;
      setTokens((s) => ({ ...s, [id]: (data as string) ?? "" }));
    },
    onSuccess: () => {
      toast.success("Token regenerado");
      qc.invalidateQueries({ queryKey: ["projetos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("projetos").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projetos"] }),
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Projetos / Empreendimentos"
        description={
          canManage
            ? "Catálogo de empreendimentos. Cada projeto tem seu próprio webhook para receber leads externos."
            : "Catálogo de empreendimentos disponíveis para indicação."
        }
        actions={
          canManage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar projetos
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo projeto
              </Button>
            </div>
          )
        }
      />

      <ImportProjetosDialog open={importOpen} onOpenChange={setImportOpen} />

      {canManage && (
        <ProjetoFormDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
          editing={editing}
          isPending={saveMutation.isPending}
          onSubmit={(payload) => saveMutation.mutate(payload)}
        />
      )}

      {projetosQ.isLoading ? (
        <CatalogoSkeleton />
      ) : projetosQ.isError ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive opacity-70" />
            <p className="text-sm text-muted-foreground">
              Não foi possível carregar os projetos. Verifique sua conexão e tente novamente.
            </p>
            <Button variant="outline" size="sm" onClick={() => projetosQ.refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : all.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-3">
            <Building2 className="h-10 w-10 mx-auto opacity-40" />
            <p>Nenhum projeto cadastrado ainda.</p>
            {canManage && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo projeto
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <ProjetosFilters projetos={all} filters={filters} onChange={setFilters} />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {filtered.length} {filtered.length === 1 ? "projeto" : "projetos"}
              {filtered.length !== all.length && ` de ${all.length}`}
              {canManage && inativos > 0 && ` · ${inativos} inativo${inativos === 1 ? "" : "s"}`}
            </span>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                <Building2 className="h-10 w-10 mx-auto opacity-40" />
                <p>Nenhum projeto corresponde aos filtros aplicados.</p>
                <Button variant="outline" size="sm" onClick={() => setFilters(emptyFilters)}>
                  <X className="h-4 w-4 mr-2" />
                  Limpar filtros
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => {
                const token = tokens[p.id];
                return (
                  <ProjetoCard
                    key={p.id}
                    projeto={p}
                    canManage={canManage}
                    origin={origin}
                    token={token}
                    revealed={!!revealed[p.id]}
                    onToggleAtivo={(ativo) => toggleAtivo.mutate({ id: p.id, ativo })}
                    onEdit={() => {
                      setEditing(p);
                      setOpen(true);
                    }}
                    onLoadToken={() => loadToken(p.id)}
                    onRegen={() => regenMutation.mutate(p.id)}
                    onToggleReveal={() => setRevealed((r) => ({ ...r, [p.id]: !r[p.id] }))}
                    onCopyUrl={async () => {
                      const t = await loadToken(p.id);
                      if (t) copy(webhookUrl(origin, t));
                    }}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Skeleton do catálogo: evita piscar lista vazia enquanto a query carrega.
function CatalogoSkeleton() {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 flex-1 min-w-[240px]" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    </>
  );
}
