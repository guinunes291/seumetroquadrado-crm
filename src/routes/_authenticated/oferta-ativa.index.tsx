import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Archive, RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listOfertas,
  archiveOferta,
  restaurarOferta,
  statusLabel,
  statusVariant,
  type OfertaAtiva,
} from "@/lib/oferta-ativa";
import { useUserRoles } from "@/hooks/use-auth";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

// Rota legada mantida para deep-links: o conteúdo vive como aba do hub.
export const Route = createFileRoute("/_authenticated/oferta-ativa/")({
  beforeLoad: () => {
    throw redirect({ to: "/projetos", search: { tab: "oferta" } });
  },
});

export function OfertaAtivaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const [tab, setTab] = useState<"ativas" | "arquivadas">("ativas");

  useRealtimeInvalidate(
    ["ofertas_ativas", "oferta_ativa_leads"],
    [["ofertas-ativas"]],
  );

  const ativasQ = useQuery({
    queryKey: ["ofertas-ativas", "ativas"],
    queryFn: () => listOfertas(false),
  });
  const arqQ = useQuery({
    queryKey: ["ofertas-ativas", "arquivadas"],
    queryFn: () => listOfertas(true).then((all) => all.filter((o) => o.status === "arquivada")),
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

  function ListaCard({
    lista,
    arquivada = false,
  }: {
    lista: OfertaAtiva;
    arquivada?: boolean;
  }) {
    const pctContatados =
      lista.totalLeads > 0 ? Math.round((lista.totalContatados / lista.totalLeads) * 100) : 0;
    const pctAvancados =
      lista.totalLeads > 0 ? Math.round((lista.totalAvancados / lista.totalLeads) * 100) : 0;

    return (
      <div
        className={`bg-card border rounded-xl p-4 transition-shadow ${
          arquivada ? "opacity-80" : "cursor-pointer hover:shadow-md"
        }`}
        onClick={() => !arquivada && navigate({ to: "/oferta-ativa/$ofertaId", params: { ofertaId: lista.id } })}
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
              <span>Contatados</span>
              <span>
                {lista.totalContatados}/{lista.totalLeads} ({pctContatados}%)
              </span>
            </div>
            <Progress value={pctContatados} className="h-1.5" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Avançados</span>
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
          {canManage &&
            (arquivada ? (
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
            ) : (
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
            ))}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-36 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !arqQ.data || arqQ.data.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-xl mt-4">
              <Archive className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">Nenhuma lista arquivada</p>
            </div>
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
    </div>
  );
}
