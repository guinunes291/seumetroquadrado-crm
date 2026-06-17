import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  MessageCircle,
  Phone,
  CheckCircle2,
  Circle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getOferta,
  marcarContatado,
  statusLabel,
  statusVariant,
} from "@/lib/oferta-ativa";
import { buildWhatsAppUrl } from "@/lib/templates";
import { leadStatusLabel, type LeadStatus } from "@/lib/leads";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";

export const Route = createFileRoute("/_authenticated/oferta-ativa/$ofertaId")({
  head: () => ({ meta: [{ title: "Lista de Oferta Ativa — Seu Metro Quadrado" }] }),
  component: OfertaDetailPage,
});

function OfertaDetailPage() {
  const { ofertaId } = Route.useParams();
  const qc = useQueryClient();

  useRealtimeInvalidate("oferta_ativa_leads", [["oferta-detail", ofertaId]]);

  const q = useQuery({
    queryKey: ["oferta-detail", ofertaId],
    queryFn: () => getOferta(ofertaId),
  });

  const marcarM = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: boolean }) => marcarContatado(id, valor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oferta-detail", ofertaId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <div className="h-40 animate-pulse bg-muted rounded-xl" />;
  }
  if (!q.data) return <p>Lista não encontrada</p>;

  const { oferta, leads } = q.data;
  const total = leads.length;
  const contatados = leads.filter((l) => l.contatado).length;
  const avancados = leads.filter((l) => l.avancado).length;
  const pctCont = total ? Math.round((contatados / total) * 100) : 0;
  const pctAv = total ? Math.round((avancados / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/oferta-ativa">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <PageHeader
          title={oferta.nome}
          description={oferta.descricao ?? undefined}
          actions={<Badge variant={statusVariant(oferta.status)}>{statusLabel(oferta.status)}</Badge>}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Total de leads</p>
          <p className="text-2xl font-semibold">{total}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Contatados</p>
          <p className="text-2xl font-semibold">
            {contatados} <span className="text-sm text-muted-foreground">({pctCont}%)</span>
          </p>
          <Progress value={pctCont} className="h-1.5 mt-2" />
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Avançados</p>
          <p className="text-2xl font-semibold">
            {avancados} <span className="text-sm text-muted-foreground">({pctAv}%)</span>
          </p>
          <Progress value={pctAv} className="h-1.5 mt-2 [&>div]:bg-green-500" />
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Projeto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum lead nesta lista.
                </TableCell>
              </TableRow>
            )}
            {leads.map((row) => {
              const l = row.lead as {
                id: string;
                nome: string;
                telefone: string;
                projeto_nome: string | null;
                status: LeadStatus;
              } | null;
              if (!l) return null;
              const primeiroNome = l.nome.split(" ")[0] ?? l.nome;
              const projeto = l.projeto_nome ? ` sobre o ${l.projeto_nome}` : "";
              const msg = `Olá, ${primeiroNome}! Aqui é da Seu Metro Quadrado${projeto}. Recebemos seu contato e gostaríamos de te ajudar. Posso te chamar agora?`;
              return (
                <TableRow key={row.id} className={row.contatado ? "opacity-70" : ""}>
                  <TableCell>
                    <button
                      onClick={() => marcarM.mutate({ id: row.id, valor: !row.contatado })}
                      title={row.contatado ? "Marcar como não contatado" : "Marcar como contatado"}
                    >
                      {row.contatado ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{l.nome}</div>
                    <div className="text-xs text-muted-foreground">{l.telefone}</div>
                  </TableCell>
                  <TableCell className="text-sm">{l.projeto_nome ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{leadStatusLabel(l.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          window.open(buildWhatsAppUrl(l.telefone, msg), "_blank", "noopener,noreferrer");
                          if (!row.contatado) marcarM.mutate({ id: row.id, valor: true });
                        }}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`tel:${l.telefone}`}>
                          <Phone className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/leads/$leadId" params={{ leadId: l.id }}>
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
