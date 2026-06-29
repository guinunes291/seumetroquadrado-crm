import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Merge, Phone, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/duplicatas")({
  component: DuplicatasPage,
});

type Grupo = {
  grupo_chave: string;
  tipo: "telefone" | "email";
  quantidade: number;
  lead_ids: string[];
};

type LeadResumo = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  status: string | null;
  created_at: string;
};

export function DuplicatasPage() {
  const { isAdmin, isGestor } = useUserRoles();
  const podeMesclar = isAdmin || isGestor;

  const { data: grupos, isLoading } = useQuery({
    queryKey: ["duplicatas-leads"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("detectar_duplicatas_leads");
      if (error) throw error;
      return (data ?? []) as Grupo[];
    },
  });

  const todosIds = (grupos ?? []).flatMap((g) => g.lead_ids);

  const { data: leadsMap } = useQuery({
    queryKey: ["duplicatas-leads-detalhes", todosIds],
    enabled: todosIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, telefone, email, status, created_at")
        .in("id", todosIds);
      if (error) throw error;
      const m = new Map<string, LeadResumo>();
      (data ?? []).forEach((l) => m.set(l.id, l as LeadResumo));
      return m;
    },
  });

  if (!podeMesclar) {
    return (
      <div className="space-y-6">
        <PageHeader title="Duplicatas" description="Detector de leads duplicados." />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Apenas administradores e gestores podem mesclar duplicatas.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detector de duplicatas"
        description="Leads com mesmo telefone ou e-mail. Escolha o lead-base e mescle os demais."
      />
      {isLoading && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Procurando duplicatas...
          </CardContent>
        </Card>
      )}
      {!isLoading && (!grupos || grupos.length === 0) && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhuma duplicata encontrada. 🎉
          </CardContent>
        </Card>
      )}
      {grupos?.map((g) => (
        <GrupoCard key={`${g.tipo}-${g.grupo_chave}`} grupo={g} leadsMap={leadsMap ?? new Map()} />
      ))}
    </div>
  );
}

function GrupoCard({ grupo, leadsMap }: { grupo: Grupo; leadsMap: Map<string, LeadResumo> }) {
  const qc = useQueryClient();
  const mesclarMut = useMutation({
    mutationFn: async ({ destino, origem }: { destino: string; origem: string }) => {
      const { error } = await supabase.rpc("mesclar_leads", {
        _lead_destino: destino,
        _lead_origem: origem,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["duplicatas-leads"] });
      qc.invalidateQueries({ queryKey: ["duplicatas-leads-detalhes"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead mesclado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leads = grupo.lead_ids
    .map((id) => leadsMap.get(id))
    .filter((l): l is LeadResumo => !!l)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const principal = leads[0];
  const demais = leads.slice(1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          {grupo.tipo === "telefone" ? <Phone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          <span className="font-mono">{grupo.grupo_chave}</span>
          <Badge variant="secondary">{grupo.quantidade} leads</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {principal && (
          <div className="rounded-lg border bg-emerald-500/10 border-emerald-500/30 p-3">
            <div className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
              Lead-base (mais antigo)
            </div>
            <LeadLinha lead={principal} />
          </div>
        )}
        {demais.map((l) => (
          <div key={l.id} className="rounded-lg border bg-card p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <LeadLinha lead={l} />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={mesclarMut.isPending || !principal}
              onClick={() =>
                principal && mesclarMut.mutate({ destino: principal.id, origem: l.id })
              }
            >
              <Merge className="h-3.5 w-3.5 mr-1" />
              Mesclar no base
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LeadLinha({ lead }: { lead: LeadResumo }) {
  return (
    <div className="min-w-0">
      <Link
        to="/leads/$leadId"
        params={{ leadId: lead.id }}
        className="text-sm font-medium hover:underline truncate block"
      >
        {lead.nome ?? "Sem nome"}
      </Link>
      <div className="text-[11px] text-muted-foreground truncate">
        {lead.telefone ?? "—"} · {lead.email ?? "—"} · {lead.status ?? "—"} ·{" "}
        {new Date(lead.created_at).toLocaleDateString("pt-BR")}
      </div>
    </div>
  );
}
