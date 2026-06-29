import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  ExternalLink,
  Trash2,
  MessageCircle,
  ListChecks,
  Paperclip,
  Loader2,
  FileText,
  X,
} from "lucide-react";
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
  isLinkExterno,
  nomeArquivo,
  uploadDocArquivo,
  urlAssinadaDoc,
  removerDocArquivo,
  DOC_STATUS,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  PERFIL_RENDA,
  PERFIL_LABEL,
  type DocStatus,
  type Documentacao,
  type PerfilRenda,
} from "@/lib/documentacao";
import { FUNNEL_STAGES, type LeadStatus } from "@/lib/leads";
import { useLeadStatusMutation } from "@/hooks/use-lead-status";

type Props = {
  leadId: string;
  lead: { nome: string; telefone: string; corretor_id: string | null; status: string };
};

/** Aba "Documentação" da página do lead: dá UI à tabela `documentacoes` (antes
 *  headless) — checklist por perfil, status, anexos (Storage ou link) e cobrança. */
export function DocumentacaoTab({ leadId, lead }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<PerfilRenda>("clt");
  const [casado, setCasado] = useState(false);
  const [usaFgts, setUsaFgts] = useState(false);
  const [declaraIr, setDeclaraIr] = useState(false);

  const { data: docs = [], isSuccess: docsCarregados } = useQuery({
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

  const anexar = useMutation({
    mutationFn: async ({ doc, file }: { doc: Documentacao; file: File }) => {
      if (doc.url && !isLinkExterno(doc.url)) await removerDocArquivo(doc.url).catch(() => {});
      const path = await uploadDocArquivo(leadId, doc.id, file);
      await atualizarDoc(doc.id, {
        url: path,
        status: doc.status === "pendente" ? "recebido" : doc.status,
      });
    },
    onSuccess: () => {
      toast.success("Arquivo anexado");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const limparArquivo = useMutation({
    mutationFn: async (doc: Documentacao) => {
      if (doc.url && !isLinkExterno(doc.url)) await removerDocArquivo(doc.url).catch(() => {});
      await atualizarDoc(doc.id, { url: null });
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (doc: Documentacao) => {
      if (doc.url && !isLinkExterno(doc.url)) await removerDocArquivo(doc.url).catch(() => {});
      await removerDoc(doc.id);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const { total, resolvidos, pendentes } = useMemo(() => {
    const total = docs.length;
    const resolvidos = docs.filter((d) => docResolvido(d.status)).length;
    const pendentes = docs.filter((d) => !docResolvido(d.status));
    return { total, resolvidos, pendentes };
  }, [docs]);

  // Auto-avanço: assim que o corretor envia o 3º documento (recebido/aprovado), o
  // lead passa para "análise de crédito" — desde que ainda esteja antes dessa
  // etapa no funil (não anda para trás nem re-dispara). Reaproveita o motor de
  // status, que registra a transição no histórico e cria o follow-up de crédito.
  const avancarCredito = useLeadStatusMutation({
    invalidateKeys: [["lead", leadId], ["leads"], ["leads-kanban"], ["leads-status-counts"]],
    onSuccess: () => toast.success("3 documentos recebidos — lead movido para Análise de Crédito"),
  });
  const baselineDocs = useRef<number | null>(null);
  const jaAvancou = useRef(false);
  useEffect(() => {
    if (!docsCarregados) return; // espera a 1ª carga concluir
    if (baselineDocs.current === null) {
      // Fixa o baseline na 1ª carga: não dispara só por abrir um lead que já
      // tinha 3+ documentos — apenas quando novos documentos chegam a partir daqui.
      baselineDocs.current = resolvidos;
      return;
    }
    if (jaAvancou.current || resolvidos < 3) return;
    const ordem = FUNNEL_STAGES.indexOf(lead.status as LeadStatus);
    const alvo = FUNNEL_STAGES.indexOf("analise_credito");
    if (ordem < 0 || ordem >= alvo) return; // só avança se está antes da etapa
    jaAvancou.current = true;
    avancarCredito.mutate({ id: leadId, status: "analise_credito" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsCarregados, resolvidos, lead.status, leadId]);

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
                  uploading={anexar.isPending}
                  onStatus={(status) => mudarStatus.mutate({ id: d.id, status })}
                  onUrl={(url) => salvarUrl.mutate({ id: d.id, url })}
                  onUpload={(file) => anexar.mutate({ doc: d, file })}
                  onClearArquivo={() => limparArquivo.mutate(d)}
                  onRemove={() => remover.mutate(d)}
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
  uploading,
  onStatus,
  onUrl,
  onUpload,
  onClearArquivo,
  onRemove,
}: {
  doc: Documentacao;
  uploading: boolean;
  onStatus: (status: DocStatus) => void;
  onUrl: (url: string | null) => void;
  onUpload: (file: File) => void;
  onClearArquivo: () => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(doc.url ?? "");
  const [abrindo, setAbrindo] = useState(false);

  const temArquivo = !!doc.url && !isLinkExterno(doc.url);

  const abrirArquivo = async () => {
    if (!doc.url) return;
    setAbrindo(true);
    try {
      const signed = await urlAssinadaDoc(doc.url);
      if (signed) window.open(signed, "_blank", "noopener,noreferrer");
      else toast.error("Não foi possível gerar o link do arquivo.");
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao abrir o arquivo.");
    } finally {
      setAbrindo(false);
    }
  };

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
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onRemove}
            title="Remover documento"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {temArquivo ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate flex-1">{nomeArquivo(doc.url!)}</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={abrirArquivo} disabled={abrindo}>
            {abrindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={onClearArquivo}
            title="Remover arquivo"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
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
          {isLinkExterno(doc.url) && (
            <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Abrir link">
              <a href={doc.url!} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Anexar</span>
          </Button>
        </div>
      )}
    </div>
  );
}
