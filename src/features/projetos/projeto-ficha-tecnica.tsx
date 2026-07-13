// Ficha técnica do empreendimento — a grade de dados comerciais/estruturais da
// rota, preservada campo a campo e revestida com o design system (hairline +
// elev-1) sob um SectionHeader.

import { SectionHeader } from "@/components/ui/section-header";
import { formatBRL } from "@/lib/unidades";

export type ProjetoFichaData = {
  metragem_min: number | null;
  metragem_max: number | null;
  dorms_min: number | null;
  dorms_max: number | null;
  suites: number | null;
  vagas_min: number | null;
  vagas_max: number | null;
  vagas_observacao: string | null;
  sob_consulta: boolean;
  preco_a_partir: number | null;
  status_entrega: string | null;
  mes_entrega: number | null;
  ano_entrega: number | null;
  tipo_extra: string | null;
  status_preco: string;
  zona_smq: string | null;
  logradouro: string | null;
  numero: string | null;
  endereco: string | null;
  fonte: string | null;
};

function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{children}</div>
    </div>
  );
}

export function ProjetoFichaTecnica({ projeto }: { projeto: ProjetoFichaData }) {
  return (
    <section aria-label="Ficha técnica do empreendimento">
      <SectionHeader eyebrow="Empreendimento" title="Ficha técnica" />
      <div className="grid gap-3 rounded-xl border border-border-subtle bg-card px-5 py-4 text-sm shadow-elev-1 sm:grid-cols-2 lg:grid-cols-4">
        <InfoLine label="Metragem">
          {projeto.metragem_min != null || projeto.metragem_max != null
            ? `${projeto.metragem_min ?? "?"}–${projeto.metragem_max ?? "?"} m²`
            : "—"}
        </InfoLine>
        <InfoLine label="Dorms / Suítes">
          {projeto.dorms_min != null || projeto.dorms_max != null
            ? `${projeto.dorms_min ?? "?"}–${projeto.dorms_max ?? "?"} dorms`
            : "—"}
          {projeto.suites ? ` · ${projeto.suites} suíte${projeto.suites === 1 ? "" : "s"}` : ""}
        </InfoLine>
        <InfoLine label="Vagas">
          {projeto.vagas_min != null || projeto.vagas_max != null
            ? `${projeto.vagas_min ?? "?"}–${projeto.vagas_max ?? "?"}`
            : projeto.vagas_observacao || "—"}
        </InfoLine>
        <InfoLine label="Preço a partir de">
          {projeto.sob_consulta
            ? "Sob consulta"
            : projeto.preco_a_partir != null
              ? formatBRL(projeto.preco_a_partir)
              : "—"}
        </InfoLine>
        <InfoLine label="Status entrega">
          {[
            projeto.status_entrega,
            projeto.ano_entrega
              ? `${projeto.mes_entrega ? String(projeto.mes_entrega).padStart(2, "0") + "/" : ""}${projeto.ano_entrega}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </InfoLine>
        <InfoLine label="Tipo extra">{projeto.tipo_extra || "—"}</InfoLine>
        <InfoLine label="Status do preço">{projeto.status_preco || "—"}</InfoLine>
        <InfoLine label="Zona SMQ">{projeto.zona_smq || "—"}</InfoLine>
        <InfoLine label="Endereço">
          {[projeto.logradouro, projeto.numero].filter(Boolean).join(", ") ||
            projeto.endereco ||
            "—"}
        </InfoLine>
        <InfoLine label="Fonte">{projeto.fonte || "—"}</InfoLine>
      </div>
    </section>
  );
}
