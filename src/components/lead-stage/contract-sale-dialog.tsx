import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjetosParaSelecao } from "@/lib/projetos";
import { maskCurrencyBRL, parseCurrencyBRL } from "@/lib/masks";
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
import { ComissaoSplitFields } from "@/components/comissao-split-fields";
import { parseSplit, type SplitTexto } from "@/lib/comissoes";
import { validarVenda, registrarVenda } from "@/lib/vendas";

const hoje = () => new Date().toISOString().slice(0, 10);

type Props = {
  lead: StageLead;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

/** Modal de proposta de fechamento: registra a venda para aprovação gerencial. */
export function ContractSaleDialog({ lead, onOpenChange, onDone }: Props) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const [dataAssinatura, setDataAssinatura] = useState(hoje());
  const [projetoId, setProjetoId] = useState<string>(lead.projeto_id ?? "none");
  const [observacoes, setObservacoes] = useState("");
  const [percentuais, setPercentuais] = useState<SplitTexto>({
    total: "3.50",
    corretor: "1.85",
    gerente: "0.50",
    superintendente: "0.30",
  });

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
      const valorNum = parseCurrencyBRL(valor) ?? NaN;
      const split = parseSplit(percentuais);
      const erro = validarVenda({ valorVenda: valorNum, dataAssinatura, hoje: hoje(), split });
      if (erro) throw new Error(erro);

      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      const corretorDaVenda = lead.corretor_id ?? uid;
      if (!lead.corretor_id) {
        throw new Error(
          "Este lead ainda não tem corretor responsável. Clique em \"Iniciar atendimento\" antes de registrar a venda.",
        );
      }
      if (!corretorDaVenda) {
        throw new Error("Não foi possível identificar o corretor responsável pela venda.");
      }
      const projetoNome =
        projetoId !== "none"
          ? (projetosOpcoes.find((p) => p.id === projetoId)?.nome ?? null)
          : (lead.projeto_nome ?? null);

      await registrarVenda({
        leadId: lead.id,
        corretorId: corretorDaVenda,
        criadoPorId: uid,
        projetoId: projetoId !== "none" ? projetoId : (lead.projeto_id ?? null),
        projetoNome,
        valorVenda: valorNum,
        dataAssinatura,
        split: split!,
        observacoes,
      });
    },
    onSuccess: () => {
      toast.success("Venda enviada para aprovação da gestão");
      qc.invalidateQueries({ queryKey: ["vendas"] });
      qc.invalidateQueries({ queryKey: ["comissoes"] });
      qc.invalidateQueries({ queryKey: ["comissoes-vendas"] });
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
            Registre o valor da venda (VGV). O lead só será fechado após aprovação da gestão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor da venda (VGV) *</Label>
              <Input
                inputMode="numeric"
                value={valor}
                onChange={(e) => setValor(maskCurrencyBRL(e.target.value))}
                placeholder="R$ 350.000,00"
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

          <ComissaoSplitFields
            valorVenda={parseCurrencyBRL(valor)}
            valores={percentuais}
            onChange={(campo, v) => setPercentuais((prev) => ({ ...prev, [campo]: v }))}
          />

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
            {mut.isPending ? "Enviando…" : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
