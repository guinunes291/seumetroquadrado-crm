import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjetosParaSelecao } from "@/lib/projetos";
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
import type { StageLead } from "@/lib/leads";

const hoje = () => new Date().toISOString().slice(0, 10);

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** Modal de "Contrato fechado": registra a venda (VGV) na tabela `vendas` e move
 *  o lead para `contrato_fechado`. */
export function ContractSaleDialog({ lead, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const [dataAssinatura, setDataAssinatura] = useState(hoje());
  const [projetoId, setProjetoId] = useState<string>(lead.projeto_id ?? "none");
  const [observacoes, setObservacoes] = useState("");
  const [pComissao, setPComissao] = useState("3.50");
  const [pCorretor, setPCorretor] = useState("1.85");
  const [pGerente, setPGerente] = useState("0.50");
  const [pSuper, setPSuper] = useState("0.30");

  // Só projetos ativos entram em uma nova venda (regra central em
  // fetchProjetosParaSelecao). Arquivados/inativos não são oferecidos.
  const { data: projetos = [] } = useQuery({
    queryKey: ["projetos-select"],
    queryFn: () => fetchProjetosParaSelecao(supabase),
  });

  // Mantém o projeto já vinculado ao lead selecionável mesmo se ficou inativo.
  const projetosOpcoes = useMemo(() => {
    if (lead.projeto_id && !projetos.some((p) => p.id === lead.projeto_id)) {
      return [
        { id: lead.projeto_id, nome: lead.projeto_nome ?? "Projeto vinculado", ativo: false },
        ...projetos,
      ];
    }
    return projetos;
  }, [projetos, lead.projeto_id, lead.projeto_nome]);

  const mut = useMutation({
    mutationFn: async () => {
      const valorNum = Number(valor.replace(",", "."));
      if (!Number.isFinite(valorNum) || valorNum <= 0) {
        throw new Error("Informe um valor de venda válido");
      }
      if (dataAssinatura > hoje()) {
        throw new Error("A data de assinatura não pode ser futura");
      }

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const projetoNome =
        projetoId !== "none"
          ? (projetosOpcoes.find((p) => p.id === projetoId)?.nome ?? null)
          : (lead.projeto_nome ?? null);

      const { error: insErr } = await supabase.from("vendas" as never).insert({
        lead_id: lead.id,
        corretor_id: lead.corretor_id ?? uid,
        criado_por_id: uid,
        projeto_id: projetoId !== "none" ? projetoId : (lead.projeto_id ?? null),
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
        .update({ status: "contrato_fechado", ultima_interacao: new Date().toISOString() } as never)
        .eq("id", lead.id);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success("Venda registrada · lead movido para Contrato fechado 🎉");
      qc.invalidateQueries({ queryKey: ["vendas"] });
      qc.invalidateQueries({ queryKey: ["comissoes"] });
      qc.invalidateQueries({ queryKey: ["leads-para-venda"] });
      qc.invalidateQueries({ queryKey: ["leads-kanban"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["interacoes", lead.id] });
      onDone?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fechar contrato — {lead.nome}</DialogTitle>
          <DialogDescription>
            Registre o valor da venda (VGV). O lead será movido para "Contrato fechado".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
                {projetosOpcoes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                    {p.ativo === false ? " · inativo" : ""}
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvando…" : "Fechar contrato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
