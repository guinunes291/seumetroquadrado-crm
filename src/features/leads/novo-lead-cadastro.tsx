// Novo lead — a etapa de cadastro: dados do cliente, origem (e ação de rua),
// bairro e zona, observações, roleta do admin e "Atribuir a" da gestão.
// Recortado de novo-lead-dialog.tsx sem mudança de comportamento.

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { maskCPF, maskPhoneBR } from "@/lib/masks";
import { origemLabel } from "@/lib/origem";
import { ZONAS_REGIAO } from "@/lib/zonas";
import { ORIGEM_OPTIONS, SEM_CORRETOR, type FormNovoLead } from "./novo-lead-criacao";

type CadastroNovoLeadProps = {
  form: FormNovoLead;
  setForm: Dispatch<SetStateAction<FormNovoLead>>;
  mostrarOportunidade: boolean;
  voltarParaBusca: () => void;
  podeDistribuir: boolean;
  distribuirAuto: boolean;
  setDistribuirAuto: Dispatch<SetStateAction<boolean>>;
  mostrarAtribuirA: boolean;
  corretorId: string;
  setCorretorId: Dispatch<SetStateAction<string>>;
  corretores: { id: string; nome: string }[] | undefined;
  canManage: boolean;
  onClose: () => void;
  create: { mutate: () => void; isPending: boolean };
};

export function CadastroNovoLead({
  form,
  setForm,
  mostrarOportunidade,
  voltarParaBusca,
  podeDistribuir,
  distribuirAuto,
  setDistribuirAuto,
  mostrarAtribuirA,
  corretorId,
  setCorretorId,
  corretores,
  canManage,
  onClose,
  create,
}: CadastroNovoLeadProps) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Novo lead</DialogTitle>
        <DialogDescription>
          {mostrarOportunidade
            ? "Cliente novo no CRM: preencha o cadastro."
            : "Adicione um lead manualmente."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {mostrarOportunidade && (
          <div
            role="status"
            className="rounded-lg border border-border-subtle bg-muted/30 p-3 text-sm"
            data-testid="cadastro-mae"
          >
            Nenhum cadastro no CRM com esses dados. <b>Este será o cadastro mãe do cliente.</b>{" "}
            <button type="button" className="underline" onClick={voltarParaBusca}>
              Voltar à busca
            </button>
          </div>
        )}
        <div>
          <Label>Nome *</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Telefone *</Label>
            <Input
              inputMode="tel"
              placeholder="(11) 98765-4321"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: maskPhoneBR(e.target.value) })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
        </div>
        {mostrarOportunidade && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CPF</Label>
              <Input
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })}
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Origem</Label>
            <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORIGEM_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {origemLabel(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Projeto de interesse</Label>
            <Input
              value={form.projeto_nome}
              onChange={(e) => setForm({ ...form, projeto_nome: e.target.value })}
            />
          </div>
        </div>
        {form.origem === "acao_rua" && (
          <div>
            <Label>Qual ação de rua?</Label>
            <Input
              placeholder="Ex.: Motoboy"
              maxLength={255}
              value={form.acao_rua}
              onChange={(e) => setForm({ ...form, acao_rua: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Opcional — entra nas observações do cliente.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Bairro de interesse</Label>
            <Input
              placeholder="Ex.: Tucuruvi"
              value={form.bairro}
              onChange={(e) => setForm({ ...form, bairro: e.target.value })}
            />
          </div>
          <div>
            <Label>Zona</Label>
            <Select
              value={form.zona || "auto"}
              onValueChange={(v) => setForm({ ...form, zona: v === "auto" ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automática (bairro/projeto)</SelectItem>
                {ZONAS_REGIAO.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea
            rows={3}
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
          />
        </div>
        {podeDistribuir && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={distribuirAuto}
              onChange={(e) => setDistribuirAuto(e.target.checked)}
            />
            Distribuir automaticamente via roleta
          </label>
        )}
        {mostrarAtribuirA ? (
          <div>
            <Label>Atribuir a</Label>
            <Select value={corretorId} onValueChange={setCorretorId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CORRETOR}>Sem corretor (triagem manual)</SelectItem>
                {(corretores ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {corretorId === SEM_CORRETOR
                ? "O lead ficará sem corretor até você atribuir — ele aparece na sua lista de leads."
                : "O lead entra direto na carteira do corretor escolhido, aguardando atendimento."}
            </p>
          </div>
        ) : (
          !canManage && (
            <p className="text-xs text-muted-foreground">
              Este lead será atribuído automaticamente a você.
            </p>
          )
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => create.mutate()} loading={create.isPending}>
          Criar lead
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
