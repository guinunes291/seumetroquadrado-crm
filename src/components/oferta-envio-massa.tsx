import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, SkipForward, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildMensagemOferta, type OfertaLeadRow } from "@/lib/oferta-ativa";
import { buildWhatsAppUrl } from "@/lib/templates";
import { leadStatusLabel } from "@/lib/leads";

const TEMPLATE_PADRAO = "padrao";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vínculos selecionados (com lead embutido). */
  rows: OfertaLeadRow[];
  /** Marca o vínculo como contatado (chamado ao abrir o WhatsApp). */
  onMarcarContatado: (vinculoId: string) => void;
};

type Etapa = "config" | "fila" | "resumo";

/**
 * Fila sequencial de envio de template por WhatsApp: o navegador não permite
 * abrir vários wa.me de uma vez (popup-block) e não há WhatsApp Business API
 * conectada, então o corretor percorre lead a lead — abrir, enviar, próximo.
 */
export function OfertaEnvioMassa({ open, onOpenChange, rows, onMarcarContatado }: Props) {
  const [etapa, setEtapa] = useState<Etapa>("config");
  const [templateId, setTemplateId] = useState(TEMPLATE_PADRAO);
  const [conteudo, setConteudo] = useState("");
  const [indice, setIndice] = useState(0);
  const [enviados, setEnviados] = useState(0);
  const [pulados, setPulados] = useState(0);

  useEffect(() => {
    if (open) {
      setEtapa("config");
      setTemplateId(TEMPLATE_PADRAO);
      setConteudo("");
      setIndice(0);
      setEnviados(0);
      setPulados(0);
    }
  }, [open]);

  const templatesQ = useQuery({
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

  const fila = useMemo(() => rows.filter((r) => r.lead && r.lead.telefone.trim() !== ""), [rows]);
  const semTelefone = rows.length - fila.length;
  const conteudoEfetivo = templateId === TEMPLATE_PADRAO ? undefined : conteudo;

  const atual = fila[indice];

  function avancar(pulou: boolean) {
    if (pulou) setPulados((n) => n + 1);
    else setEnviados((n) => n + 1);
    if (indice + 1 >= fila.length) setEtapa("resumo");
    else setIndice((i) => i + 1);
  }

  function abrirWhatsApp() {
    const l = atual?.lead;
    if (!atual || !l) return;
    window.open(
      buildWhatsAppUrl(l.telefone, buildMensagemOferta(l, conteudoEfetivo)),
      "_blank",
      "noopener,noreferrer",
    );
    if (!atual.contatado) onMarcarContatado(atual.id);
    avancar(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {etapa === "config" && (
          <>
            <DialogHeader>
              <DialogTitle>Enviar template por WhatsApp</DialogTitle>
              <DialogDescription>
                {fila.length} lead(s) na fila
                {semTelefone > 0 ? ` · ${semTelefone} sem telefone será(ão) pulado(s)` : ""}. Você
                envia um a um: o WhatsApp abre com a mensagem pronta e o lead é marcado como
                contatado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Template</Label>
                <Select
                  value={templateId}
                  onValueChange={(v) => {
                    setTemplateId(v);
                    if (v === TEMPLATE_PADRAO) {
                      setConteudo("");
                    } else {
                      const t = (templatesQ.data ?? []).find((x) => x.id === v);
                      setConteudo(t?.conteudo ?? "");
                    }
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TEMPLATE_PADRAO}>Mensagem padrão da campanha</SelectItem>
                    {(templatesQ.data ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {templateId !== TEMPLATE_PADRAO && (
                <div>
                  <Label htmlFor="oferta-template-conteudo">Mensagem</Label>
                  <Textarea
                    id="oferta-template-conteudo"
                    value={conteudo}
                    onChange={(e) => setConteudo(e.target.value)}
                    rows={4}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Variáveis: {"{{nome}}"}, {"{{primeiro_nome}}"} e {"{{projeto}}"}.
                  </p>
                </div>
              )}
              {fila[0]?.lead && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">
                    Prévia para {fila[0].lead.nome}:
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {buildMensagemOferta(fila[0].lead, conteudoEfetivo)}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => setEtapa("fila")} disabled={fila.length === 0}>
                <MessageCircle className="w-4 h-4 mr-2" /> Iniciar envio
              </Button>
            </DialogFooter>
          </>
        )}

        {etapa === "fila" && atual?.lead && (
          <>
            <DialogHeader>
              <DialogTitle>
                Enviando {indice + 1} de {fila.length}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Progress value={(indice / fila.length) * 100} className="h-1.5" />
              <div className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{atual.lead.nome}</p>
                  <Badge variant="outline">{leadStatusLabel(atual.lead.status)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{atual.lead.telefone}</p>
                {atual.contatado && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-600" /> Já contatado antes
                  </p>
                )}
              </div>
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-sm whitespace-pre-wrap">
                  {buildMensagemOferta(atual.lead, conteudoEfetivo)}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => avancar(true)}>
                <SkipForward className="w-4 h-4 mr-2" /> Pular
              </Button>
              <Button onClick={abrirWhatsApp}>
                <MessageCircle className="w-4 h-4 mr-2" /> Abrir WhatsApp
              </Button>
            </DialogFooter>
          </>
        )}

        {etapa === "resumo" && (
          <>
            <DialogHeader>
              <DialogTitle>Envio concluído</DialogTitle>
              <DialogDescription>
                {enviados} enviado(s) · {pulados} pulado(s)
                {semTelefone > 0 ? ` · ${semTelefone} sem telefone` : ""}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
