// Visitas, análises de crédito e agendamentos agrupados pelo empreendimento
// do cliente (lead.projeto → nome do cadastro; senão o nome digitado).

import { Buildings } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeadRef } from "@/features/dashboard/relatorios-nominais";
import { VazioPeriodo } from "@/features/dashboard/relatorios-partes";

type ComLead = { lead: LeadRef; status: string };

export type LinhaProjeto = {
  projeto: string;
  agendamentos: number;
  visitas: number;
  visitasRealizadas: number;
  analises: number;
  analisesAprovadas: number;
};

const nomeProjeto = (l: LeadRef) =>
  l?.projeto?.nome?.trim() || l?.projeto_nome?.trim() || "Sem projeto";

export function linhasPorProjeto(
  agendamentos: ComLead[],
  visitas: ComLead[],
  analises: ComLead[],
): LinhaProjeto[] {
  const m = new Map<string, LinhaProjeto>();
  const get = (l: LeadRef) => {
    const nome = nomeProjeto(l);
    const k = nome.toLocaleLowerCase("pt-BR");
    let r = m.get(k);
    if (!r) {
      r = {
        projeto: nome,
        agendamentos: 0,
        visitas: 0,
        visitasRealizadas: 0,
        analises: 0,
        analisesAprovadas: 0,
      };
      m.set(k, r);
    }
    return r;
  };
  for (const a of agendamentos) get(a.lead).agendamentos += 1;
  for (const v of visitas) {
    const r = get(v.lead);
    r.visitas += 1;
    if (v.status === "realizado") r.visitasRealizadas += 1;
  }
  for (const a of analises) {
    const r = get(a.lead);
    r.analises += 1;
    if (a.status === "aprovada" || a.status === "aprovada_condicionada") r.analisesAprovadas += 1;
  }
  return Array.from(m.values()).sort(
    (a, b) => b.visitas - a.visitas || b.analises - a.analises || b.agendamentos - a.agendamentos,
  );
}

export function PorProjetoCard({
  agendamentos,
  visitas,
  analises,
  loading,
}: {
  agendamentos: ComLead[];
  visitas: ComLead[];
  analises: ComLead[];
  loading: boolean;
}) {
  const linhas = linhasPorProjeto(agendamentos, visitas, analises);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Buildings className="h-4 w-4" /> Por empreendimento
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Visitas (pelo dia da visita), análises de crédito (pela última atualização) e agendamentos
          (pela data de criação), pelo empreendimento do cliente.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : linhas.length === 0 ? (
          <VazioPeriodo />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empreendimento</TableHead>
                  <TableHead className="text-right">Visitas</TableHead>
                  <TableHead className="text-right">Realizadas</TableHead>
                  <TableHead className="text-right">Análises</TableHead>
                  <TableHead className="text-right">Aprovadas</TableHead>
                  <TableHead className="text-right">Agendamentos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((r) => (
                  <TableRow key={r.projeto}>
                    <TableCell className="font-medium">{r.projeto}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.visitas}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.visitasRealizadas}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.analises}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.analisesAprovadas}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.agendamentos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
