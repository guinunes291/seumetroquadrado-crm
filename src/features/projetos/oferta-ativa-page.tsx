import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Archive, RotateCcw, Users, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listOfertas,
  archiveOferta,
  restaurarOferta,
  deleteOferta,
  statusLabel,
  statusVariant,
  type OfertaAtiva,
} from "@/lib/oferta-ativa";
import { useUserRoles } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

export function OfertaAtivaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const [tab, setTab] = useState<"ativas" | "arquivadas">("ativas");
  const [confirmExcluir, setConfirmExcluir] = useState<OfertaAtiva | null>(null);

  // O avanço na carteira chega via `oferta_ativa_leads`: o trigger do banco
  // escreve no vínculo quando uma flag muda, então escutar `leads` aqui seria
  // redundante (refetch pesado a cada update de qualquer lead do CRM).
  useRealtimeInvalidate(["ofertas_ativas", "oferta_ativa_leads"], [["ofertas-ativas"]]);

  const ativasQ = useQuery({
    queryKey: ["ofertas-ativas", "ativas"],
    queryFn: async () => {
      const listas = await listOfertas(false);
      // Campanhas em andamento antes das concluídas (sort estável mantém
      // a ordenação por data dentro de cada grupo).
      const ordem: Record<string, number> = { ativa: 0, rascunho: 1, concluida: 2 };
      return [...listas].sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));
    },
  });
  const arqQ = useQuery({
    queryKey: ["ofertas-ativas", "arquivadas"],
    queryFn: () => listOfertas(true),
  });

  const archiveM = useMutation({
    mutationFn: archiveOferta,
    onSuccess: () => {
      toast.success("Lista arquivada");
      qc.invalidateQueries({ queryKey: ["ofertas-ativas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreM = useMutation({
    mutationFn: restaurarOferta,
    onSuccess: () => {
      toast.success("Lista restaurada");
      qc.invalidateQueries({ queryKey: ["ofertas-ativas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: deleteOferta,
    onSuccess: () => {
      toast.success("Lista excluída");
      setConfirmExcluir(null);
      qc.invalidateQueries({ queryKey: ["ofertas-ativas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function ListaCard({ lista, arquivada = false }: { lista: OfertaAtiva; arquivada?: boolean }) {
    const pctContatados =
      lista.totalLeads > 0 ? Math.round((lista.totalContatados / lista.totalLeads) * 100) : 0;
    const pctAvancados =
      lista.totalLeads > 0 ? Math.round((lista.totalAvancados / lista.totalLeads) * 100) : 0;

    return (
      <div
        className={`bg-card border rounded-xl p-4 transition-shadow cursor-pointer hover:shadow-md ${
          arquivada ? "opacity-80" : ""
        }`}
        onClick={() => navigate({ to: "/oferta-ativa/$ofertaId", params: { ofertaId: lista.id } })}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-semibold text-foreground leading-tight">{lista.nome}</h3>
            {lista.descricao && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{lista.descricao}</p>
            )}
          </div>
          <Badge variant={statusVariant(lista.status)}>{statusLabel(lista.status)}</Badge>
        </div>

        <div className="space-y-2 mb-3">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span title="Marcados na aba ou trabalhados na carteira desde a criação da lista">
                Contatados
              </span>
              <span>
                {lista.totalContatados}/{lista.totalLeads} ({pctContatados}%)
              </span>
            </div>
            <Progress value={pctContatados} className="h-1.5" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span title="Leads que progrediram de etapa na carteira desde a criação da lista">
                Avançados
              </span>
              <span>
                {lista.totalAvancados} ({pctAvancados}%)
              </span>
            </div>
            <Progress value={pctAvancados} className="h-1.5 [&>div]:bg-green-500" />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {new Date(lista.created_at).toLocaleDateString("pt-BR")}
          </span>
          {canManage && (
            <div className="flex items-center gap-3">
              {arquivada ? (
                <>
                  <button
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      restoreM.mutate(lista.id);
                    }}
                    disabled={restoreM.isPending}
                  >
                    <RotateCcw className="w-3 h-3" /> Restaurar
                  </button>
                  {isAdmin && (
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmExcluir(lista);
                      }}
                      disabled={deleteM.isPending}
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ to: "/oferta-ativa/nova", search: { de: lista.id } });
                    }}
                  >
                    <Copy className="w-3 h-3" /> Duplicar
                  </button>
                  <button
                    className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      archiveM.mutate(lista.id);
                    }}
                    disabled={archiveM.isPending}
                  >
                    <Archive className="w-3 h-3" /> Arquivar
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oferta Ativa"
        description="Listas segmentadas de leads para campanhas de prospecção."
        actions={
          canManage ? (
            <Button asChild>
              <Link to="/oferta-ativa/nova">
                <Plus className="w-4 h-4 mr-2" /> Nova Lista
              </Link>
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "ativas" | "arquivadas")}>
        <TabsList>
          <TabsTrigger value="ativas">
            Ativas
            {ativasQ.data && ativasQ.data.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {ativasQ.data.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="arquivadas">
            Arquivadas
            {arqQ.data && arqQ.data.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">
                {arqQ.data.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ativas">
          {ativasQ.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : ativasQ.isError ? (
            <QueryErrorState
              title="Não foi possível carregar as listas ativas."
              error={ativasQ.error}
              onRetry={() => ativasQ.refetch()}
              className="mt-4"
            />
          ) : !ativasQ.data || ativasQ.data.length === 0 ? (
            <div className="text-center py-20 border border-dashed rounded-xl mt-4">
              <Megaphone className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                Nenhuma lista criada ainda
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Crie uma lista segmentada de leads para começar uma campanha.
              </p>
              {canManage && (
                <Button asChild>
                  <Link to="/oferta-ativa/nova">
                    <Plus className="w-4 h-4 mr-2" /> Criar primeira lista
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {ativasQ.data.map((l) => (
                <ListaCard key={l.id} lista={l} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="arquivadas">
          {arqQ.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4" aria-busy="true">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : arqQ.isError ? (
            <QueryErrorState
              title="Não foi possível carregar as listas arquivadas."
              error={arqQ.error}
              onRetry={() => arqQ.refetch()}
              className="mt-4"
            />
          ) : !arqQ.data || arqQ.data.length === 0 ? (
            <EmptyState
              icon={Archive}
              title="Nenhuma lista arquivada"
              description="Ao arquivar uma campanha, ela fica guardada aqui e pode ser restaurada quando precisar."
              className="mt-4 py-16"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {arqQ.data.map((l) => (
                <ListaCard key={l.id} lista={l} arquivada />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {!canManage && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Users className="w-3 h-3" /> Você vê apenas as listas atribuídas a você.
        </p>
      )}

      <AlertDialog open={!!confirmExcluir} onOpenChange={(o) => !o && setConfirmExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{confirmExcluir?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A lista e o progresso de contato dos leads dela serão excluídos de forma permanente.
              Os leads em si não são afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmExcluir && deleteM.mutate(confirmExcluir.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
