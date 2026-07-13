// Diálogo de WhatsApp do dossiê: template + rascunho por IA + envio com
// registro garantido na timeline (abre a aba no gesto do clique e só navega
// depois de confirmar o insert — nada de "mensagem enviada sem histórico").
// Controlado pelo shell da rota porque o StickyActionRail mobile também abre.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MessageCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { buildWhatsAppUrl, renderTemplate } from "@/lib/templates";
import { sugerirMensagemLeadIA } from "@/lib/lead-mensagem-ia.functions";
import { OBJETIVOS_MENSAGEM, type ObjetivoMensagem } from "@/lib/lead-mensagem";
import type { DossieLead } from "@/features/leads/dossie/types";

export function WhatsappLeadDialog({
  open,
  onOpenChange,
  leadId,
  lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  lead: Pick<DossieLead, "nome" | "telefone" | "projeto_nome" | "objecoes">;
}) {
  const qc = useQueryClient();
  const [waTemplateId, setWaTemplateId] = useState<string>("");
  const [waMensagem, setWaMensagem] = useState("");
  const [waObjetivo, setWaObjetivo] = useState<ObjetivoMensagem>("primeiro_contato");
  const [waObjecao, setWaObjecao] = useState<string>("");

  // Templates só são usados dentro do diálogo de WhatsApp — não buscar antes.
  const { data: templatesWa = [] } = useQuery({
    queryKey: ["templates-whatsapp"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates_mensagem")
        .select("id, nome, conteudo")
        .eq("canal", "whatsapp")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const enviarWhatsapp = useMutation({
    mutationFn: async () => {
      const msg = waMensagem.trim();
      if (msg.length === 0) throw new Error("Escreva a mensagem.");
      const url = buildWhatsAppUrl(lead.telefone ?? "", msg);
      // Abre uma aba em branco JÁ, no gesto do clique (não é bloqueada pelo
      // popup blocker), mas só navega para o WhatsApp DEPOIS de confirmar o
      // registro. Se o insert falhar, fecha a aba e lança — nada de "mensagem
      // enviada sem histórico" (falso sucesso parcial).
      const win = window.open("about:blank", "_blank");
      try {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("interacoes").insert({
          lead_id: leadId,
          autor_id: u.user?.id ?? null,
          tipo: "whatsapp",
          direcao: "saida",
          titulo: "Mensagem enviada via WhatsApp",
          conteudo: msg,
        });
        if (error) throw error;
      } catch (e) {
        win?.close();
        throw e;
      }
      if (win) win.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer"); // fallback se bloqueou
    },
    onSuccess: () => {
      toast.success("WhatsApp aberto e interação registrada");
      onOpenChange(false);
      setWaMensagem("");
      setWaTemplateId("");
      qc.invalidateQueries({ queryKey: ["interacoes", leadId] });
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sugerirMsg = useServerFn(sugerirMensagemLeadIA);
  const sugerirMensagem = useMutation({
    mutationFn: () =>
      sugerirMsg({
        data: { leadId, objetivo: waObjetivo, objecao: waObjecao.trim() || undefined },
      }),
    onSuccess: (r) => {
      setWaMensagem(r.mensagem);
      toast.success("Rascunho gerado — revise antes de enviar");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 text-white hover:bg-emerald-700">
          <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>Template (opcional)</Label>
            <Select
              value={waTemplateId}
              onValueChange={(v) => {
                setWaTemplateId(v);
                const t = templatesWa.find((x) => x.id === v);
                if (t) {
                  setWaMensagem(
                    renderTemplate(t.conteudo, {
                      nome: lead.nome,
                      primeiro_nome: lead.nome.trim().split(/\s+/)[0] || lead.nome,
                      projeto: lead.projeto_nome ?? "",
                    }),
                  );
                }
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    templatesWa.length === 0 ? "Nenhum template ativo" : "Escolha um modelo"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {templatesWa.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Sugerir com IA
            </div>
            <Select value={waObjetivo} onValueChange={(v) => setWaObjetivo(v as ObjetivoMensagem)}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJETIVOS_MENSAGEM.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(lead.objecoes ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[11px] text-muted-foreground self-center">Objeção:</span>
                {(lead.objecoes ?? []).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setWaObjecao(waObjecao === o ? "" : o)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      waObjecao === o
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-full"
              onClick={() => sugerirMensagem.mutate()}
              disabled={sugerirMensagem.isPending}
            >
              {sugerirMensagem.isPending ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Gerando…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> Gerar rascunho
                </>
              )}
            </Button>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea
              value={waMensagem}
              onChange={(e) => setWaMensagem(e.target.value)}
              rows={6}
              maxLength={2000}
              placeholder={`Olá ${lead.nome}, tudo bem?`}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => enviarWhatsapp.mutate()} disabled={enviarWhatsapp.isPending}>
            Abrir WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
