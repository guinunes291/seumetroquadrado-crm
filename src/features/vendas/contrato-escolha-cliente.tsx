// Venda por contrato — "Cliente no CRM": o que a busca achou e a escolha do
// usuário (é ele / cadastrar novo / qual dos candidatos). Só apresentação.

import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rotuloMatch } from "@/features/leads/oportunidade";
import { formatPhoneBR } from "@/lib/masks";
import type { ClienteAchado, LeadCandidato } from "./cliente-contrato";

/** Escolha do usuário diante do que a busca achou. */
export type Escolha =
  | { tipo: "pendente" }
  | { tipo: "existente"; leadId: string; corretorId: string | null; nome: string; meu: boolean }
  | { tipo: "registro_filho"; clienteId: string; nome: string }
  | { tipo: "novo" };

export function EscolhaCliente({
  buscando,
  leadFixo,
  achado,
  escolha,
  bloqueado,
  cpfDivergente,
  gestao,
  corretores,
  corretorNovo,
  setCorretorNovo,
  onNovo,
  onConfirmarOportunidade,
  onEscolherCandidato,
  onTrocar,
}: {
  buscando: boolean;
  leadFixo: boolean;
  achado: ClienteAchado | null;
  escolha: Escolha;
  bloqueado: boolean;
  cpfDivergente: boolean;
  gestao: boolean;
  corretores: { id: string; nome: string }[] | undefined;
  corretorNovo: string;
  setCorretorNovo: (id: string) => void;
  onNovo: () => void;
  onConfirmarOportunidade: () => void;
  onEscolherCandidato: (l: LeadCandidato) => void;
  onTrocar: () => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Cliente no CRM</h3>
      {buscando && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleNotch className="h-4 w-4 animate-spin" /> Procurando por CPF, telefone e e-mail…
        </p>
      )}

      {!buscando && !leadFixo && achado?.tipo === "nenhum" && escolha.tipo === "pendente" && (
        <div className="rounded-md border px-3 py-2 text-sm">
          Nenhum cliente com este CPF, telefone ou e-mail. Ele será cadastrado ao registrar a venda.
          <Button size="sm" className="mt-2 w-full" onClick={onNovo}>
            Cadastrar cliente novo
          </Button>
        </div>
      )}

      {!buscando && achado?.tipo === "oportunidade" && escolha.tipo === "pendente" && (
        <div className="space-y-2 rounded-md border px-3 py-2 text-sm">
          <p>
            Encontramos{" "}
            <span className="font-medium">{achado.oportunidade.nome ?? "um cliente"}</span>{" "}
            {rotuloMatch(achado.matchPor)}
            {achado.oportunidade.ja_na_carteira
              ? ", na sua carteira."
              : achado.oportunidade.em_outra_carteira
                ? ", na carteira de outro corretor."
                : "."}{" "}
            É ele?
          </p>
          {bloqueado ? (
            <p className="flex items-start gap-1.5 text-destructive">
              <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Este cliente está em negociação avançada com outro corretor. Fale com a gestão para
              registrar a venda.
            </p>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={onConfirmarOportunidade}>
                Sim, é ele
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={onNovo}>
                Não, cadastrar novo
              </Button>
            </div>
          )}
        </div>
      )}

      {!buscando && achado?.tipo === "candidatos" && escolha.tipo === "pendente" && (
        <div className="space-y-1.5">
          <p className="text-sm">
            Encontramos {achado.candidatos.length === 1 ? "este cliente" : "estes clientes"}{" "}
            {rotuloMatch(achado.matchPor)}. É algum deles?
          </p>
          {achado.candidatos.map((l) => (
            <button
              key={l.id}
              onClick={() => onEscolherCandidato(l)}
              className="w-full rounded-md border px-3 py-2 text-left hover:bg-muted"
            >
              <div className="font-medium">{l.nome}</div>
              <div className="text-xs text-muted-foreground">
                {[
                  l.corretor_nome ? `Corretor: ${l.corretor_nome}` : "Sem corretor",
                  l.telefone ? formatPhoneBR(l.telefone) : null,
                  l.projeto_nome,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </button>
          ))}
          <Button size="sm" variant="outline" className="w-full" onClick={onNovo}>
            Não é nenhum: cadastrar novo
          </Button>
        </div>
      )}

      {escolha.tipo !== "pendente" && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            {escolha.tipo === "novo"
              ? "Cliente novo: será cadastrado ao registrar a venda."
              : escolha.tipo === "registro_filho"
                ? `${escolha.nome}: entra na sua carteira ao registrar a venda.`
                : `${escolha.nome}${escolha.meu ? "" : " (carteira do corretor dele)"}.`}
          </span>
          {!leadFixo && (
            <Button size="sm" variant="ghost" onClick={onTrocar}>
              Trocar
            </Button>
          )}
        </div>
      )}

      {cpfDivergente && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" />O CPF do contrato é diferente do CPF
          cadastrado neste cliente. Confira se é o cliente certo.
        </p>
      )}

      {escolha.tipo === "novo" && gestao && (
        <div className="space-y-1">
          <Label className="text-xs">Corretor responsável *</Label>
          <Select value={corretorNovo} onValueChange={setCorretorNovo}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha o corretor da venda" />
            </SelectTrigger>
            <SelectContent>
              {(corretores ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </section>
  );
}
