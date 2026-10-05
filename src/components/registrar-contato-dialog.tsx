import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { rpc } from "@/features/dashboard/queries";
import {
  antesDeEmAtendimento,
  clienteRespondeu,
  parseContatoRegistrado,
  type ResultadoContatoLead,
} from "@/lib/em-atendimento";
import { invalidarEmAtendimento } from "@/features/em-atendimento/use-em-atendimento";
import { useJanelaTroca } from "@/features/em-atendimento/janela-troca-context";

// Resultado do contato vira o título da interação na timeline (o banco usa o
// mesmo vocabulário: registrar_contato_lead).
const RESULTADOS: { key: ResultadoContatoLead; label: string }[] = [
  { key: "atendeu", label: "Atendeu" },
  { key: "nao_atendeu", label: "Não atendeu" },
  { key: "interessado", label: "Interessado" },
  { key: "sem_interesse", label: "Sem interesse" },
  { key: "pediu_retorno", label: "Pediu retorno" },
];

// Próximo follow-up: a tarefa do passo (leads.proximo_followup é espelho dela).
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
  lead: { id: string; nome: string; corretor_id: string | null; status?: string | null };
  defaultTipo?: InteracaoTipo;
  /** "Cliente respondeu…" abre já com o resultado certo. */
  defaultResultado?: ResultadoContatoLead;
  onDone?: () => void;
};

/**
 * Registra um contato (interação) E o próximo passo (tarefa) numa RPC só —
 * registrar_contato_lead. Regra dos 65, Fatia 3a.2: o corretor não escolhe
 * "Em atendimento"; quando o cliente RESPONDEU (atendeu, interessado, pediu
 * retorno) e o lead ainda está antes de Em atendimento, o banco o põe lá, com
 * o passo com data — pela cadência quando o lead está em D0–D3. Com o teto
 * cheio o contato fica gravado e a janela "entra um, sai um" abre.
 */
export function RegistrarContatoDialog({
  open,
  onOpenChange,
  lead,
  defaultTipo = "ligacao",
  defaultResultado = "atendeu",
  onDone,
}: Props) {
  const qc = useQueryClient();
  const janela = useJanelaTroca();
  const [tipo, setTipo] = useState<InteracaoTipo>(defaultTipo);
  const [resultado, setResultado] = useState<ResultadoContatoLead>(defaultResultado);
  const [conteudo, setConteudo] = useState("");
  const [followup, setFollowup] = useState<string>("amanha");

  const prospeccao = antesDeEmAtendimento(lead.status);
  const respondeu = clienteRespondeu(resultado);
  // A entrada em Em atendimento exige passo com data: sem follow-up não há
  // como o cliente ter respondido "para nada".
  const vaiEntrar = prospeccao && respondeu;
  const semPasso = vaiEntrar && followup === "nenhum";

  const salvar = useMutation({
    mutationFn: async () => {
      const fu = FOLLOWUPS.find((f) => f.key === followup) ?? FOLLOWUPS[0];
      let vencimento: string | null = null;
      if (fu.dias != null) {
        const venc = new Date();
        venc.setDate(venc.getDate() + fu.dias);
        vencimento = venc.toISOString();
      }
      const { data, error } = await rpc("registrar_contato_lead", {
        _lead_id: lead.id,
        _tipo: tipo,
        _resultado: resultado,
        _conteudo: conteudo.trim() || null,
        _proxima_acao: `Follow-up com ${lead.nome}`,
        _proximo_followup: vencimento,
      });
      if (error) throw error;
      return parseContatoRegistrado(data);
    },
    onSuccess: (r) => {
      if (r.entrou) {
        toast.success(`Contato registrado · ${lead.nome} entrou em atendimento`);
      } else if (r.lotado) {
        toast.success(
          "Contato registrado. O lead entra em atendimento quando você liberar uma vaga.",
        );
      } else {
        toast.success(
          r.tarefa_id ? "Contato registrado · follow-up agendado" : "Contato registrado",
        );
      }
      setConteudo("");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["lead-detail"] });
      qc.invalidateQueries({ queryKey: ["tarefas-lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:sem-acao"] });
      qc.invalidateQueries({ queryKey: ["meu-dia:tarefas"] });
      qc.invalidateQueries({ queryKey: ["blitz-queue"] });
      // Registrar contato tira o lead das filas de "responder"/"esfriando" —
      // sem isto o card só sumia quando o realtime chegasse (ou não chegasse).
      qc.invalidateQueries({ queryKey: ["atendimento:inbox"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-status-counts"] });
      if (r.entrou || r.lotado) invalidarEmAtendimento(qc);
      if (r.lotado && !r.entrou && janela) {
        janela.abrir({
          id: lead.id,
          nome: lead.nome,
          onDone: () => {
            invalidarEmAtendimento(qc);
            qc.invalidateQueries({ queryKey: ["leads"] });
            qc.invalidateQueries({ queryKey: ["lead-detail"] });
          },
        });
      }
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar contato — {lead.nome}</DialogTitle>
          {prospeccao && (
            <DialogDescription data-testid="contato-consequencia">
              Atendeu, Interessado ou Pediu retorno põem {lead.nome} em atendimento, com o próximo
              passo. Em atendimento não se escolhe: é o que acontece quando o cliente responde.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>Canal</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as InteracaoTipo)}>
              <SelectTrigger aria-label="Canal">
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
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Resultado">
              {RESULTADOS.map((r) => (
                <Button
                  key={r.key}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={resultado === r.key}
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
            <Label>{vaiEntrar ? "Próximo passo com data *" : "Próximo follow-up"}</Label>
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Próximo follow-up"
            >
              {FOLLOWUPS.map((f) => (
                <Button
                  key={f.key}
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={followup === f.key}
                  variant={followup === f.key ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setFollowup(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            {semPasso && (
              <p className="mt-1 text-xs text-destructive" data-testid="contato-sem-passo">
                Quando o cliente responde, o próximo passo com data é obrigatório.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || semPasso}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
