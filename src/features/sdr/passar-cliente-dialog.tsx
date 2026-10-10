// Passagem do discador (decisões do dono, 10/10/2026). O SDR passa o dia no
// discador; no CRM ele só passa o cliente adiante — para uma visita ou para a
// documentação. Uma tela, uma chamada (sdr_passar_cliente): o cadastro com
// dedup (cria ou puxa o existente), a qualificação que vai no WhatsApp do
// corretor e a visita pela roleta. Os obrigatórios são os da RPC; a tela
// trava antes e diz o que falta.
//
// Aberta com `leadId` (ficha, painel), começa com o que a ficha já sabe e não
// deixa trocar nome e telefone — trocar o telefone passaria outro cliente.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  QUEM_DECIDE,
  RESTRICAO_CPF_OPCOES,
  TIPOS_RENDA,
  camposFaltandoPassagem,
  payloadPassagem,
  sdrRegraLabel,
  zonaInteresseValida,
  type FormPassagem,
  type ModoPassagem,
} from "@/lib/sdr";
import { EscolhaHorario, amanhaAsDez } from "./escolha-horario";
import { usePassarCliente, usePrefillPassagem } from "./painel-client";
import { ZonaInteresseField } from "./zona-interesse-field";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cliente que já está na base do SDR (ficha, painel). */
  leadId?: string | null;
  modoInicial?: ModoPassagem;
  /** Depois de passar (a ficha recarrega; o hub não precisa). */
  onDone?: (leadId: string) => void;
};

function vazio(modo: ModoPassagem): FormPassagem {
  return {
    modo,
    nome: "",
    telefone: "",
    renda: "",
    tipoRenda: "",
    fgts: null,
    decisor: "",
    restricaoCpf: null,
    resumo: "",
    zona: null,
    local: "",
    inicio: amanhaAsDez(),
  };
}

/** Grupo de escolha única em botões (o mesmo padrão da zona de interesse). */
function Escolha<T extends string>({
  rotulo,
  opcoes,
  valor,
  onChange,
  livre,
}: {
  rotulo: string;
  opcoes: ReadonlyArray<{ valor: T; rotulo: string }>;
  valor: string | null;
  onChange: (v: T) => void;
  /** Valor gravado antes que não é um dos atalhos: aparece selecionado. */
  livre?: boolean;
}) {
  const extra = livre && valor && !opcoes.some((o) => o.valor === valor) ? valor : null;
  return (
    <div className="space-y-1.5">
      <Label>{rotulo} *</Label>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={rotulo}>
        {[...opcoes, ...(extra ? [{ valor: extra as T, rotulo: extra }] : [])].map((o) => (
          <Button
            key={o.valor}
            type="button"
            size="sm"
            role="radio"
            aria-checked={valor === o.valor}
            variant={valor === o.valor ? "default" : "outline"}
            className="h-8"
            onClick={() => onChange(o.valor)}
          >
            {o.rotulo}
          </Button>
        ))}
      </div>
    </div>
  );
}

const comoOpcoes = (xs: readonly string[]) => xs.map((x) => ({ valor: x, rotulo: x }));

export function PassarClienteDialog({ open, onOpenChange, leadId, modoInicial, onDone }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormPassagem>(() => vazio(modoInicial ?? "visita"));
  const [tentou, setTentou] = useState(false);
  const prefill = usePrefillPassagem(leadId, open);
  const passar = usePassarCliente();

  // O que a ficha já sabe entra uma vez, sem apagar o que o SDR digitou.
  useEffect(() => {
    if (prefill.data)
      setForm((f) => ({ ...f, ...prefill.data, zona: prefill.data.zona ?? f.zona }));
  }, [prefill.data]);

  const set = <K extends keyof FormPassagem>(k: K, v: FormPassagem[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const faltam = camposFaltandoPassagem(form);
  const visita = form.modo === "visita";
  const comLead = !!leadId;

  const enviar = () => {
    setTentou(true);
    if (faltam.length > 0) return;
    if (visita && new Date(form.inicio).getTime() <= Date.now()) {
      toast.error("A visita precisa estar no futuro.");
      return;
    }
    // Aberta da ficha ou do painel, o banco usa o próprio registro (nada de
    // procurar pelo telefone).
    passar.mutate(
      { ...payloadPassagem(form), lead_id: leadId ?? null },
      {
        onSuccess: (res) => {
          if (res.modo === "visita") {
            const corretor = res.corretor_nome ?? "o corretor";
            const voltou = res.regra === "sdr_retorno_corretor_origem";
            toast.success(
              voltou ? `Cliente voltou para ${corretor}` : `Visita marcada com ${corretor}`,
              {
                description: voltou
                  ? `${corretor} falou com o cliente nos últimos dias: a visita é dele. Você confirma no D-1 e no dia.`
                  : `${sdrRegraLabel(res.regra)} · o corretor recebe o WhatsApp com a renda, o FGTS e o endereço; você confirma no D-1 e no dia.`,
              },
            );
          } else {
            toast.success("Cliente na sua base para a documentação", {
              description:
                "A gestão acompanha com você até a visita. Anexe os documentos na ficha.",
            });
            if (!comLead) void navigate({ to: "/leads/$leadId", params: { leadId: res.lead_id } });
          }
          onOpenChange(false);
          onDone?.(res.lead_id);
        },
        onError: (e: Error) =>
          toast.error("Não foi possível passar o cliente", { description: e.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Passar cliente do discador</DialogTitle>
          <DialogDescription>
            O mínimo que o corretor precisa para atender. Se o cliente já existe no CRM, ele vem
            para a sua base; se um corretor falou com ele nos últimos dias, a visita volta para esse
            corretor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div
            role="radiogroup"
            aria-label="O que você está passando"
            className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
          >
            {(
              [
                ["visita", "Agendar visita"],
                ["documentacao", "Só documentação"],
              ] as const
            ).map(([m, rotulo]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={form.modo === m}
                onClick={() => set("modo", m)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                  form.modo === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>

          <section className="space-y-3" aria-label="Cliente">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="passagem-telefone">Telefone *</Label>
                <Input
                  id="passagem-telefone"
                  inputMode="tel"
                  value={form.telefone}
                  disabled={comLead}
                  placeholder="(11) 98765-4321"
                  onChange={(e) => set("telefone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="passagem-nome">Nome *</Label>
                <Input
                  id="passagem-nome"
                  value={form.nome}
                  disabled={comLead}
                  onChange={(e) => set("nome", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3" aria-label="Qualificação">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              O que vai para o corretor
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="passagem-renda">Renda familiar *</Label>
              <Input
                id="passagem-renda"
                inputMode="decimal"
                value={form.renda}
                placeholder="Ex.: 3.200"
                className="sm:max-w-56"
                onChange={(e) => set("renda", e.target.value)}
              />
            </div>
            <Escolha
              rotulo="Tipo de renda"
              opcoes={comoOpcoes(TIPOS_RENDA)}
              valor={form.tipoRenda || null}
              onChange={(v) => set("tipoRenda", v)}
              livre
            />
            <Escolha
              rotulo="FGTS"
              opcoes={[
                { valor: "sim" as const, rotulo: "Tem FGTS" },
                { valor: "nao" as const, rotulo: "Não tem" },
              ]}
              valor={form.fgts}
              onChange={(v) => set("fgts", v)}
            />
            <Escolha
              rotulo="Quem decide"
              opcoes={comoOpcoes(QUEM_DECIDE)}
              valor={form.decisor || null}
              onChange={(v) => set("decisor", v)}
              livre
            />
            <div className="space-y-1">
              <Escolha
                rotulo="Restrição no CPF"
                opcoes={RESTRICAO_CPF_OPCOES.map((o) => ({ valor: o.valor, rotulo: o.rotulo }))}
                valor={form.restricaoCpf}
                onChange={(v) => set("restricaoCpf", v)}
              />
              <p className="text-xs text-muted-foreground">
                Não impede a visita: o corretor fica sabendo antes de atender.
              </p>
            </div>
          </section>

          {visita && (
            <section className="space-y-3" aria-label="Visita">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                A visita
              </h3>
              <ZonaInteresseField
                value={zonaInteresseValida(form.zona) ? form.zona : null}
                onChange={(z) => set("zona", z)}
                carregando={prefill.isFetching && !form.zona}
                faltou={tentou}
              />
              <EscolhaHorario
                value={form.inicio}
                onChange={(v) => set("inicio", v)}
                idPrefixo="passagem"
              />
              <div className="space-y-1.5">
                <Label htmlFor="passagem-local">Endereço da visita *</Label>
                <Input
                  id="passagem-local"
                  value={form.local}
                  placeholder="Estande, decorado ou endereço do empreendimento"
                  onChange={(e) => set("local", e.target.value)}
                />
              </div>
            </section>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="passagem-resumo">Resumo da ligação</Label>
            <Textarea
              id="passagem-resumo"
              rows={3}
              value={form.resumo}
              placeholder="O que o cliente quer, o que já foi combinado, objeções…"
              onChange={(e) => set("resumo", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Vai no WhatsApp do corretor.</p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={cn(
              "text-xs",
              tentou && faltam.length > 0 ? "text-destructive" : "text-muted-foreground",
            )}
            data-testid="passagem-falta"
          >
            {faltam.length > 0 ? `Falta: ${faltam.join(", ")}.` : "Tudo certo para passar."}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={passar.isPending} onClick={enviar}>
              {passar.isPending
                ? visita
                  ? "Rodando a roleta…"
                  : "Registrando…"
                : visita
                  ? "Agendar e passar ao corretor"
                  : "Registrar para documentação"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
