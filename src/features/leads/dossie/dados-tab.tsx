// Aba Dados do dossiê do lead: ficha cadastral (leitura) + handoff do
// qualificador quando houver. Edição acontece no diálogo "Editar dados" do
// cabeçalho da rota — aqui é só consulta.

import {
  ArrowRight,
  Building2,
  Calendar,
  Mail,
  MapPin,
  Phone,
  User,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DossieLead } from "@/features/leads/dossie/types";

function DataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div>{value || "—"}</div>
      </div>
    </div>
  );
}

export function DadosTab({ lead }: { lead: DossieLead }) {
  return (
    <>
      <div className="grid gap-4 rounded-xl border border-border-subtle bg-card p-6 text-sm shadow-elev-1 md:grid-cols-2">
        <DataRow icon={User} label="Nome" value={lead.nome} />
        <DataRow icon={Phone} label="Telefone" value={lead.telefone} />
        <DataRow icon={Mail} label="E-mail" value={lead.email} />
        <DataRow icon={Building2} label="Empreendimento" value={lead.projeto_nome} />
        <DataRow
          icon={Calendar}
          label="Próximo follow-up"
          value={
            lead.proximo_followup ? new Date(lead.proximo_followup).toLocaleString("pt-BR") : null
          }
        />
        <DataRow icon={MapPin} label="Renda informada" value={lead.renda_informada} />
        <DataRow icon={User} label="Tipo de renda" value={lead.tipo_renda} />
        <DataRow icon={User} label="CPF" value={lead.cpf} />
        <DataRow icon={User} label="Entrada disponível" value={lead.entrada_disponivel} />
        <DataRow icon={User} label="Usa FGTS" value={lead.usa_fgts ? "Sim" : "Não"} />
        <DataRow icon={User} label="Faixa MCMV" value={lead.faixa_mcmv} />
        <DataRow icon={User} label="Decisor" value={lead.decisor} />
        {lead.observacoes && (
          <div className="md:col-span-2">
            <div className="text-xs uppercase text-muted-foreground mb-1">Resumo / Observações</div>
            <p className="whitespace-pre-wrap">{lead.observacoes}</p>
          </div>
        )}
      </div>

      {(lead.desfecho ||
        lead.fase ||
        lead.visita_data ||
        (lead.docs_recebidos?.length ?? 0) > 0 ||
        (lead.docs_pendentes?.length ?? 0) > 0) && (
        <div className="mt-4 rounded-xl border border-border-subtle bg-card shadow-elev-1">
          <div className="p-6">
            <h3 className="text-base font-semibold leading-none tracking-tight">
              Handoff do qualificador
            </h3>
          </div>
          <div className="grid gap-4 p-6 pt-0 text-sm md:grid-cols-2">
            <DataRow icon={ArrowRight} label="Desfecho" value={lead.desfecho} />
            <DataRow icon={ArrowRight} label="Fase" value={lead.fase} />
            <DataRow icon={Calendar} label="Visita — data" value={lead.visita_data} />
            <DataRow icon={Calendar} label="Visita — hora" value={lead.visita_hora} />
            <DataRow
              icon={Building2}
              label="Visita — empreendimento"
              value={lead.visita_empreendimento}
            />
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Docs recebidos</div>
              {lead.docs_recebidos && lead.docs_recebidos.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {lead.docs_recebidos.map((d) => (
                    <Badge key={d} variant="secondary" className="text-[10px]">
                      {d}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Docs pendentes</div>
              {lead.docs_pendentes && lead.docs_pendentes.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {lead.docs_pendentes.map((d) => (
                    <Badge key={d} variant="outline" className="text-[10px]">
                      {d}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
