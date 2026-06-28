import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Trash2, MessageCircle, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { buildWhatsAppUrl } from "@/lib/templates";
import {
  listarDocs,
  criarDocs,
  atualizarDoc,
  removerDoc,
  checklistPorPerfil,
  docLabel,
  docResolvido,
  DOC_STATUS,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  PERFIL_RENDA,
  PERFIL_LABEL,
  type DocStatus,
  type Documentacao,
  type PerfilRenda,
} from "@/lib/documentacao";

type Props = {
  leadId: string;
  lead: { nome: string; telefone: string; corretor_id: string | null };
};

/** Aba "Documentação" da página do lead: dá UI à tabela `documentacoes` (antes
 *  headless) com checklist por perfil, status por documento e cobrança via WhatsApp. */
export function DocumentacaoTab({ leadId, lead }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilRenda>("clt");
  const [casado, setCasado] = useState(false);
  const [usaFgts, setUsaFgts] = useState(false);
  const [declaraIr, setDeclaraIr] = useState(false);

  const { data: docs = [] } = useQuery({
    queryKey: ["documentacoes", leadId],
    queryFn: () => listarDocs(leadId),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["documentacoes", leadId] });

  const gerar = useMutation({
    mutationFn: async () => {
      const itens = checklistPorPerfil(perfil, { casado, usaFgts, declaraIr });
      const existentes = new Set(docs.map((d) => d.tipo));
      const novos = itens.map((i) => i.tipo).filter((t) => !existentes.has(t));
      return criarDocs(leadId, lead.corretor_id ?? user?.id ?? null, novos);
    },
    onSuccess: (qtd) => {
      toast.success(qtd > 0 ? `${qtd} documento(s) adicionado(s) ao checklist` : "Checklist já está completo");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: DocStatus }) => atualizarDoc(id, { status }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarUrl = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string | null }) => atualizarDoc(id, { url }),
    onSuccess: () => {
      toast.success("Link salvo");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => removerDoc(id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const { total, resolvidos, pendentes } = useMemo(() => {
    const total = docs.length;
    const resolvidos = docs.filter((d) => docResolvido(d.status)).length;
    const pendentes = docs.filter((d) => !docResolvido(d.status));
    return { total, resolvidos, pendentes };
  }, [docs]);

  const abrirWhatsapp = (linhas: Documentacao[], intro: string, vazio: string) => {
    if (linhas.length === 0) {
      toast.info(vazio);
      return;
    }
    const lista = linhas.map((d) => `• ${docLabel(d.tipo)}`).join("\n");
    const msg = `Olá ${lead.nome}! ${intro}\n\n${lista}\n\nPode me enviar por aqui mesmo? 😊`;
    window.open(buildWhatsAppUrl(lead.telefone, msg), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      {/* Gerar checklist por perfil */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4 text-primary" /> Checklist por perfil
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Perfil de renda</Label>
              <Select value={perfil} onValueChange={(v) => setPerfil(v as PerfilRenda)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERFIL_RENDA.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PERFIL_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={casado} onCheckedChange={setCasado} /> Casado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={usaFgts} onCheckedChange={setUsaFgts} /> Usa FGTS
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={declaraIr} onCheckedChange={setDeclaraIr} /> Declara IR
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
              <ListChecks className="h-4 w-4 mr-2" /> Gerar checklist
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => abrirWhatsapp(docs, "Para seguirmos com a documentação, preciso destes documentos:", "Gere o checklist primeiro.")}
            >
              <MessageCircle className="h-4 w-4 mr-2" /> Enviar checklist
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => abrirWhatsapp(pendentes, "Ainda faltam alguns documentos para darmos andamento:", "Nenhuma pendência. 🎉")}
            >
              <MessageCircle className="h-4 w-4 mr-2" /> Cobrar pendência
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de documentos */}
      {total === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Sem documentos ainda. Escolha o perfil acima e gere o checklist.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {resolvidos} de {total} recebidos
              </span>
              <span className="text-muted-foreground">{pendentes.length} pendente(s)</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", resolvidos === total ? "bg-green-500" : "bg-primary")}
                style={{ width: `${total > 0 ? (resolvidos / total) * 100 : 0}%` }}
              />
            </div>
            <div className="divide-y">
              {docs.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  onStatus={(status) => mudarStatus.mutate({ id: d.id, status })}
                  onUrl={(url) => salvarUrl.mutate({ id: d.id, url })}
                  onRemove={() => remover.mutate(d.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DocRow({
  doc,
  onStatus,
  onUrl,
  onRemove,
}: {
  doc: Documentacao;
  onStatus: (status: DocStatus) => void;
  onUrl: (url: string | null) => void;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState(doc.url ?? "");

  return (
    <div className="py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{docLabel(doc.tipo)}</span>
          <Badge variant="outline" className={cn("shrink-0", DOC_STATUS_TONE[doc.status])}>
            {DOC_STATUS_LABEL[doc.status]}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Select value={doc.status} onValueChange={(v) => onStatus(v as DocStatus)}>
            <SelectTrigger className="h-8 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_STATUS.map((s) => (
                <SelectItem key={s} value={s}>
                  {DOC_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {doc.url && (
            <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Abrir arquivo">
              <a href={doc.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onRemove}
            title="Remover"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => {
          const v = url.trim();
          if (v !== (doc.url ?? "")) onUrl(v || null);
        }}
        placeholder="Link do arquivo (Drive, etc.) — opcional"
        className="h-8 text-xs"
      />
    </div>
  );
}
