import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InteracaoTipo } from "@/lib/interacoes";
import { garantirFollowUpAberto } from "@/lib/follow-up";

// Resultado do contato vira o título da interação na timeline.
const RESULTADOS = [
  { key: "atendeu", label: "Atendeu", titulo: "Contato — atendeu" },
  { key: "nao_atendeu", label: "Não atendeu", titulo: "Contato — não atendeu" },
  { key: "interessado", label: "Interessado", titulo: "Contato — interessado" },
  { key: "sem_interesse", label: "Sem interesse", titulo: "Contato — sem interesse" },
  { key: "pediu_retorno", label: "Pediu retorno", titulo: "Contato — pediu retorno" },
] as const;

// Próximo follow-up: cria a tarefa e marca proximo_followup do lead num gesto só.
const FOLLOWUPS = [
  { key: "amanha", label: "Amanhã", dias: 1 },
  { key: "2d", label: "+2 dias", dias: 2 },
  { key: "1sem", label: "+1 semana", dias: 7 },
  { key: "nenhum", label: "Sem follow-up", dias: null },
] as const;

const CANAIS: { value: InteracaoTipo; label: string }[] = [
  { value: "ligacao", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "visita", label: "Visita" },
  { value: "reuniao", label: "Reunião" },
  { value: "email", label: "E-mail" },
  { value: "sms", label: "SMS" },
  { value: "outro", label: "Outro" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: { id: string; nome: string; corretor_id: string | null };
  defaultTipo?: InteracaoTipo;
  onDone?: () => void;
};

/**
 * Registra um contato (interação) E agenda o próximo follow-up de uma só vez —
 * o "registrar ligação + marcar retorno" que antes eram dois fluxos separados.
 */
export function RegistrarContatoDialog({
  open,
  onOpenChange,
  lead,
  defaultTipo = "ligacao",
  onDone,
}: Props) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<InteracaoTipo>(defaultTipo);
  const [resultado, setResultado] = useState<string>("atendeu");
  const [conteudo, setConteudo] = useState("");
  const [followup, setFollowup] = useState<string>("amanha");

  const salvar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const res = RESULTADOS.find((r) => r.key === resultado) ?? RESULTADOS[0];

      // 1) Interação na timeline.
      const { error: iErr } = await supabase.from("interacoes").insert({
        lead_id: lead.id,
        autor_id: uid,
        tipo,
        direcao: "saida",
        titulo: res.titulo,
        conteudo: conteudo.trim() || res.label,
      });
      if (iErr) throw iErr;

      // 2) Próximo follow-up: só a tarefa. `leads.proximo_followup` é espelho
      //    derivado no banco (trigger em `tarefas`) — não escrevemos direto.
      const fu = FOLLOWUPS.find((f) => f.key === followup) ?? FOLLOWUPS[0];
      let comFollowUp = false;
      if (fu.dias != null) {
        const venc = new Date();
        venc.setDate(venc.getDate() + fu.dias);
        // Dedup por (lead, tipo=follow_up, ±1 dia) — fonte única compartilhada.
        await garantirFollowUpAberto({
          leadId: lead.id,
          tipo: "follow_up",
          titulo: `Follow-up com ${lead.nome}`,
          prioridade: "media",
          vencimento: venc.toISOString(),
          corretorId: lead.corretor_id ?? uid,
          criadoPorId: uid,
        });
        comFollowUp = true;
      }
      return { comFollowUp };
    },
    onSuccess: (r) => {
      toast.success(
        r?.comFollowUp ? "Contato registrado · follow-up agendado" : "Contato registrado",
      );
      setConteudo("");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["tarefas-lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:sem-acao"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
      qc.invalidateQueries({ queryKey: ["blitz-queue"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar contato — {lead.nome}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>Canal</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as InteracaoTipo)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANAIS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Resultado</Label>
            <div className="flex flex-wrap gap-1.5">
              {RESULTADOS.map((r) => (
                <Button
                  key={r.key}
                  type="button"
                  size="sm"
                  variant={resultado === r.key ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setResultado(r.key)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Observações (opcional)</Label>
            <Textarea
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="O que foi conversado, objeções, próximos passos…"
            />
          </div>
          <div>
            <Label>Próximo follow-up</Label>
            <div className="flex flex-wrap gap-1.5">
              {FOLLOWUPS.map((f) => (
                <Button
                  key={f.key}
                  type="button"
                  size="sm"
                  variant={followup === f.key ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setFollowup(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
