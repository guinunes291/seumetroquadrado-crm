import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, ChevronsUpDown, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const hoje = () => new Date().toISOString().slice(0, 10);

type LeadOption = {
  id: string;
  nome: string;
  corretor_id: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
  status: string;
};

/**
 * Botão global "Registrar venda": atalho para corretores criarem uma venda
 * vinculada a um lead existente sem precisar arrastar o card no Kanban.
 * Internamente faz o mesmo que o ContractSaleDialog (insert em `vendas` +
 * move o lead para `contrato_fechado`).
 */
export function RegistrarVendaDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [lead, setLead] = useState<LeadOption | null>(null);
  const [valor, setValor] = useState("");
  const [dataAssinatura, setDataAssinatura] = useState(hoje());
  const [projetoId, setProjetoId] = useState<string>("none");
  const [observacoes, setObservacoes] = useState("");
  const [pComissao, setPComissao] = useState("3.50");
  const [pCorretor, setPCorretor] = useState("1.85");
  const [pGerente, setPGerente] = useState("0.50");
  const [pSuper, setPSuper] = useState("0.30");

  const reset = () => {
    setLead(null);
    setValor("");
    setDataAssinatura(hoje());
    setProjetoId("none");
    setObservacoes("");
  };

  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["leads-para-venda"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome, corretor_id, projeto_id, projeto_nome, status")
        .neq("status", "perdido")
        .is("deleted_at", null)
        .order("ultima_interacao", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as LeadOption[];
    },
  });

  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-min"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("projetos").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error("Selecione o lead que comprou");
      const valorNum = Number(valor.replace(",", "."));
      if (!Number.isFinite(valorNum) || valorNum <= 0) {
        throw new Error("Informe um valor de venda válido");
      }
      if (dataAssinatura > hoje()) {
        throw new Error("A data de assinatura não pode ser futura");
      }

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const projetoFinal = projetoId !== "none" ? projetoId : lead.projeto_id;
      const projetoNome =
        projetoId !== "none"
          ? (projetos.find((p) => p.id === projetoId)?.nome ?? null)
          : lead.projeto_nome;

      const { error: insErr } = await supabase.from("vendas" as never).insert({
        lead_id: lead.id,
        corretor_id: lead.corretor_id ?? uid,
        criado_por_id: uid,
        projeto_id: projetoFinal,
        projeto_nome: projetoNome,
        valor_venda: valorNum,
        data_assinatura: dataAssinatura,
        percentual_comissao: Number(pComissao.replace(",", ".")) || 0,
        percentual_corretor: Number(pCorretor.replace(",", ".")) || 0,
        percentual_gerente: Number(pGerente.replace(",", ".")) || 0,
        percentual_superintendente: Number(pSuper.replace(",", ".")) || 0,
        observacoes: observacoes.trim() || null,
      } as never);
      if (insErr) throw insErr;

      const { error: updErr } = await supabase
        .from("leads")
        .update({
          status: "contrato_fechado",
          ultima_interacao: new Date().toISOString(),
        } as never)
        .eq("id", lead.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success("Venda registrada · lead movido para Contrato fechado 🎉");
      qc.invalidateQueries({ queryKey: ["vendas"] });
      qc.invalidateQueries({ queryKey: ["comissoes"] });
      qc.invalidateQueries({ queryKey: ["leads-kanban"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads-para-venda"] });
      reset();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
        aria-label="Registrar venda"
      >
        <DollarSign className="h-4 w-4" />
        <span className="hidden sm:inline">Registrar venda</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar venda</DialogTitle>
            <DialogDescription>
              Vincule a venda a um lead existente. O lead será movido para "Contrato fechado".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Lead *</Label>
              <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={leadPickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {lead ? lead.nome : "Selecione o lead que comprou…"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput placeholder="Buscar lead por nome…" />
                    <CommandList>
                      <CommandEmpty>
                        {loadingLeads ? "Carregando…" : "Nenhum lead encontrado."}
                      </CommandEmpty>
                      <CommandGroup>
                        {leads.map((l) => (
                          <CommandItem
                            key={l.id}
                            value={`${l.nome} ${l.id}`}
                            onSelect={() => {
                              setLead(l);
                              setProjetoId(l.projeto_id ?? "none");
                              setLeadPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "h-4 w-4",
                                lead?.id === l.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{l.nome}</span>
                              {l.projeto_nome && (
                                <span className="text-xs text-muted-foreground">
                                  {l.projeto_nome}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor da venda (VGV) *</Label>
                <Input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="Ex.: 350000"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de assinatura *</Label>
                <Input
                  type="date"
                  max={hoje()}
                  value={dataAssinatura}
                  onChange={(e) => setDataAssinatura(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={projetoId} onValueChange={setProjetoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o projeto (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem projeto vinculado —</SelectItem>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Comissão (%)</Label>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Total</Label>
                  <Input
                    inputMode="decimal"
                    value={pComissao}
                    onChange={(e) => setPComissao(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Corretor</Label>
                  <Input
                    inputMode="decimal"
                    value={pCorretor}
                    onChange={(e) => setPCorretor(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Gerente</Label>
                  <Input
                    inputMode="decimal"
                    value={pGerente}
                    onChange={(e) => setPGerente(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Superint.</Label>
                  <Input
                    inputMode="decimal"
                    value={pSuper}
                    onChange={(e) => setPSuper(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !lead}>
              {mut.isPending ? "Salvando…" : "Registrar venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
