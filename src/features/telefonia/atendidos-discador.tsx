// Aba "Atendidos" do Discador: os leads do Bolsão que atenderam o discador
// deste corretor. Não são dele — seguem no Bolsão, discáveis por outros — mas
// são a lista de quem já disse "alô" para ele, e é daqui que ele avança o
// cliente: nota na timeline (sem posse), ligar de novo pelo CRM, ou assumir
// para agendar a visita — só aí o lead entra na carteira (e nos 65).
//
// O que a tela deliberadamente NÃO mostra: o telefone inteiro (a discagem
// passa pelo CRM), quem mais atendeu o cliente e quem ficou com ele (só
// "outro corretor avançou") — anonimato do Bolsão, §5.2 do documento.

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck, ChatText, Info, Phone, UsersThree } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AsyncBoundary } from "@/components/ui/async-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useLigarLead } from "@/hooks/use-ligar-lead";
import { formatRelativeTime } from "@/lib/interacoes";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/leads";
import {
  ATENDIDOS_KEY,
  MOTIVO_ASSUMIR,
  MOTIVO_ENCERRAMENTO,
  assumirAtendido,
  registrarNotaAtendido,
  separarAtendidos,
  useMeusAtendidos,
  type LinhaAtendido,
  type TipoNota,
} from "./discador-atendidos-client";
import { DISCAGEM_KEY } from "./bolsao-discagem-client";

/** Nota na timeline de um atendido, sem posse (RPC discador_atendido_nota_v1). */
export function NotaAtendidoDialog({
  lead,
  open,
  onOpenChange,
  onDone,
}: {
  lead: { id: string; nome: string } | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoNota>("ligacao");
  const [conteudo, setConteudo] = useState("");
  const salvar = useMutation({
    mutationFn: async () => {
      if (!lead) return;
      await registrarNotaAtendido(lead.id, conteudo, tipo);
    },
    onSuccess: () => {
      toast.success("Nota registrada na timeline do cliente.");
      setConteudo("");
      qc.invalidateQueries({ queryKey: [ATENDIDOS_KEY] });
      qc.invalidateQueries({ queryKey: ["interacoes", lead?.id] });
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar contato com {lead?.nome ?? "o cliente"}</DialogTitle>
          <DialogDescription>
            O lead continua no Bolsão (não é seu ainda). A nota entra na timeline dele com a sua
            autoria; para agendar visita, use "Assumir e agendar".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoNota)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ligacao">Ligação</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="nota">Nota interna</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="nota-atendido" className="text-xs">
              O que rolou
            </Label>
            <Textarea
              id="nota-atendido"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              placeholder="Ex.: interessado em 2 dormitórios na Zona Norte, pediu para ligar sábado."
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!conteudo.trim() || salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? "Salvando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Assumir para avançar: o lead entra na carteira e a visita é agendada no dossiê. */
export function useAssumirAtendido() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (leadId: string) => assumirAtendido(leadId),
    onSuccess: (r, leadId) => {
      qc.invalidateQueries({ queryKey: [ATENDIDOS_KEY] });
      qc.invalidateQueries({ queryKey: [DISCAGEM_KEY] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      const msg = MOTIVO_ASSUMIR[r.motivo] ?? r.motivo;
      if (r.ok) {
        toast.success(msg);
        void navigate({ to: "/leads/$leadId", params: { leadId } });
      } else {
        toast.error(msg);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function AtendidosDiscador() {
  const atendidosQ = useMeusAtendidos();
  const { ligar, discando } = useLigarLead();
  const assumir = useAssumirAtendido();
  const [notaPara, setNotaPara] = useState<LinhaAtendido | null>(null);
  const [assumirPara, setAssumirPara] = useState<LinhaAtendido | null>(null);

  const linhas = atendidosQ.data ?? [];
  const { abertos, encerrados } = separarAtendidos(linhas);

  if (atendidosQ.data === null) {
    return (
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            A aba Atendidos depende da migration <code>discador_atendimentos</code>, ainda não
            aplicada neste ambiente.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quem atendeu o seu discador. Esses leads <strong>não são seus</strong>: seguem no Bolsão e
        outros corretores também podem discá-los. Quem avançar o cliente de fase (agendar a visita)
        fica com ele — só então ele entra na sua carteira.
      </p>

      <AsyncBoundary
        isLoading={atendidosQ.isLoading}
        isError={atendidosQ.isError}
        error={atendidosQ.error}
        errorTitle="Não foi possível carregar os atendidos."
        onRetry={() => void atendidosQ.refetch()}
        loadingLabel="Carregando atendidos"
        loadingFallback={
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        }
      >
        {abertos.length === 0 && encerrados.length === 0 ? (
          <EmptyState
            icon={Phone}
            title="Ninguém atendeu ainda."
            description="Quando um cliente do Bolsão atender o seu discador, ele aparece aqui para você registrar o contato e, se avançar, assumir."
          />
        ) : (
          <div className="space-y-2">
            {abertos.map((l) => (
              <Card key={l.lead_id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-semibold">{l.nome}</span>
                      <span className="tabular-nums text-sm text-muted-foreground">
                        {l.telefone_mascarado ?? "—"}
                      </span>
                      <Badge variant="secondary">
                        {LEAD_STATUS_LABEL[l.status as LeadStatus] ?? l.status}
                      </Badge>
                      {l.outros_corretores > 0 && (
                        <Badge
                          variant="outline"
                          className="gap-1"
                          title="Outros corretores também falaram com este cliente."
                        >
                          <UsersThree className="h-3 w-3" /> +{l.outros_corretores}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {l.projeto_nome ? `${l.projeto_nome} · ` : ""}
                      atendeu {l.atendimentos === 1 ? "1 vez" : `${l.atendimentos} vezes`}, a última{" "}
                      {formatRelativeTime(l.ultimo_atendimento_em)}
                      {l.dias_parado > 0 ? ` · sem movimento há ${l.dias_parado} d` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={discando}
                      onClick={() => ligar({ id: l.lead_id, nome: l.nome, telefone: null })}
                    >
                      <Phone className="h-3.5 w-3.5 mr-1.5" /> Ligar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setNotaPara(l)}>
                      <ChatText className="h-3.5 w-3.5 mr-1.5" /> Registrar contato
                    </Button>
                    <Button
                      size="sm"
                      disabled={assumir.isPending || !l.ainda_no_bolsao}
                      title={
                        l.ainda_no_bolsao
                          ? "O lead entra na sua carteira e você agenda a visita no dossiê."
                          : "Este lead saiu do Bolsão."
                      }
                      onClick={() => setAssumirPara(l)}
                    >
                      <CalendarCheck className="h-3.5 w-3.5 mr-1.5" /> Assumir e agendar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {encerrados.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Já ganharam dono (últimos 30 dias)
                </div>
                {encerrados.map((l) => (
                  <Card key={l.lead_id} className="bg-muted/30">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        {l.dono_sou_eu ? (
                          <Link
                            to="/leads/$leadId"
                            params={{ leadId: l.lead_id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {l.nome}
                          </Link>
                        ) : (
                          <span className="font-medium">{l.nome}</span>
                        )}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {MOTIVO_ENCERRAMENTO[l.encerrado_motivo ?? ""] ??
                            l.encerrado_motivo ??
                            "encerrado"}
                          {l.encerrado_em ? ` ${formatRelativeTime(l.encerrado_em)}` : ""}
                        </span>
                      </div>
                      <Badge variant={l.dono_sou_eu ? "default" : "outline"}>
                        {l.dono_sou_eu ? "na sua carteira" : "com outro corretor"}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </AsyncBoundary>

      <NotaAtendidoDialog
        lead={notaPara ? { id: notaPara.lead_id, nome: notaPara.nome } : null}
        open={!!notaPara}
        onOpenChange={(o) => !o && setNotaPara(null)}
      />

      <Dialog open={!!assumirPara} onOpenChange={(o) => !o && setAssumirPara(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assumir {assumirPara?.nome ?? "o lead"}?</DialogTitle>
            <DialogDescription>
              O lead sai do Bolsão e entra na sua carteira (e na conta dos 65). Faça isso só para
              avançar de fase — o próximo passo é agendar a visita no dossiê, que abre em seguida.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssumirPara(null)}>
              Cancelar
            </Button>
            <Button
              disabled={assumir.isPending}
              onClick={() => {
                const id = assumirPara?.lead_id;
                setAssumirPara(null);
                if (id) assumir.mutate(id);
              }}
            >
              <CalendarCheck className="h-3.5 w-3.5 mr-1.5" />
              {assumir.isPending ? "Assumindo…" : "Assumir e agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
