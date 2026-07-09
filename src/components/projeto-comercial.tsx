import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Pencil, Target, Wallet, Sparkles, MessageSquareQuote, Copy } from "lucide-react";

/** Campos comerciais do empreendimento. Chegam via migration 20260629140000;
 *  ficam opcionais para a UI degradar com segurança antes da coluna existir. */
export type ProjetoComercialData = {
  nome?: string | null;
  renda_minima?: number | null;
  perfil_ideal?: string | null;
  diferenciais?: string[] | null;
  argumentos_venda?: string[] | null;
  status_preco?: string | null;
  zona_smq?: string | null;
  preco_a_partir?: number | null;
};

/** Mensagem de venda pronta para o WhatsApp, montada da munição comercial. */
export function montarMensagemVenda(p: ProjetoComercialData): string {
  const linhas: string[] = [];
  linhas.push(`🏠 *${p.nome ?? "Empreendimento"}*`);
  if (p.preco_a_partir != null) linhas.push(`A partir de ${brl(p.preco_a_partir)}.`);
  const diferenciais = (p.diferenciais ?? []).slice(0, 4);
  if (diferenciais.length > 0) linhas.push(diferenciais.map((d) => `✔️ ${d}`).join("\n"));
  const argumento = (p.argumentos_venda ?? [])[0];
  if (argumento) linhas.push(argumento);
  linhas.push("Quer que eu te mande o book e simule as condições para o seu perfil?");
  return linhas.join("\n\n");
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const emLinhas = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Munição comercial do empreendimento: renda mínima, perfil ideal, diferenciais
 * (chips) e argumentos de venda (bullets). Visível a todos; editável por
 * gestor/admin. Alimenta a argumentação do corretor e o Match.
 */
export function ProjetoComercial({
  projetoId,
  projeto,
  canManage,
}: {
  projetoId: string;
  projeto: ProjetoComercialData;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const diferenciais = projeto.diferenciais ?? [];
  const argumentos = projeto.argumentos_venda ?? [];
  const temAlgo =
    projeto.renda_minima != null ||
    !!projeto.perfil_ideal ||
    diferenciais.length > 0 ||
    argumentos.length > 0;

  const salvar = useMutation({
    mutationFn: async (payload: ProjetoComercialData) => {
      const { error } = await supabase
        .from("projetos")
        .update(payload as never)
        .eq("id", projetoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Munição comercial atualizada");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["projeto", projetoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const renda = fd.get("renda_minima");
    salvar.mutate({
      renda_minima: renda && String(renda).trim() ? Number(renda) : null,
      perfil_ideal: String(fd.get("perfil_ideal") ?? "").trim() || null,
      diferenciais: emLinhas(String(fd.get("diferenciais") ?? "")),
      argumentos_venda: emLinhas(String(fd.get("argumentos_venda") ?? "")),
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" /> Munição comercial
        </CardTitle>
        <div className="flex items-center gap-2">
          {temAlgo && (
            <Button
              size="sm"
              className="bg-gradient-gold text-navy-900 hover:opacity-90"
              title="Copia uma mensagem de venda pronta (nome, preço, diferenciais e argumento) para colar no WhatsApp"
              onClick={() => {
                navigator.clipboard.writeText(montarMensagemVenda(projeto));
                toast.success("Mensagem de venda copiada — cole no WhatsApp e personalize.");
              }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar mensagem de venda
            </Button>
          )}
          {canManage && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Munição comercial do empreendimento</DialogTitle>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-3">
                  <div>
                    <Label htmlFor="renda_minima">Renda mínima sugerida (R$)</Label>
                    <Input
                      id="renda_minima"
                      name="renda_minima"
                      type="number"
                      inputMode="numeric"
                      defaultValue={projeto.renda_minima ?? ""}
                      placeholder="ex.: 3000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="perfil_ideal">Perfil ideal do cliente</Label>
                    <Textarea
                      id="perfil_ideal"
                      name="perfil_ideal"
                      rows={2}
                      defaultValue={projeto.perfil_ideal ?? ""}
                      placeholder="ex.: família jovem, primeiro imóvel, usa FGTS, busca lazer completo"
                    />
                  </div>
                  <div>
                    <Label htmlFor="diferenciais">Diferenciais (um por linha)</Label>
                    <Textarea
                      id="diferenciais"
                      name="diferenciais"
                      rows={3}
                      defaultValue={diferenciais.join("\n")}
                      placeholder={"Lazer completo\nPróximo ao metrô\nPet place"}
                    />
                  </div>
                  <div>
                    <Label htmlFor="argumentos_venda">Argumentos de venda (um por linha)</Label>
                    <Textarea
                      id="argumentos_venda"
                      name="argumentos_venda"
                      rows={3}
                      defaultValue={argumentos.join("\n")}
                      placeholder={
                        "Entrada facilitada em até 60x\nValorização da região\nEntrega em 2026"
                      }
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={salvar.isPending}>
                      {salvar.isPending ? "Salvando…" : "Salvar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!temAlgo && (
          <p className="text-xs text-muted-foreground">
            Sem munição comercial cadastrada.
            {canManage
              ? " Use “Editar” para adicionar renda mínima, perfil ideal e argumentos."
              : ""}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo icon={Wallet} label="Renda mínima sugerida">
            {projeto.renda_minima != null ? brl(projeto.renda_minima) : "—"}
          </Campo>
          <Campo icon={Target} label="Perfil ideal">
            {projeto.perfil_ideal || "—"}
          </Campo>
        </div>

        {diferenciais.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Diferenciais</div>
            <div className="flex flex-wrap gap-1.5">
              {diferenciais.map((d) => (
                <Badge key={d} variant="secondary">
                  {d}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {argumentos.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <MessageSquareQuote className="h-3.5 w-3.5" /> Argumentos de venda
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              {argumentos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Campo({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Wallet;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-0.5 font-medium">{children}</div>
    </div>
  );
}
