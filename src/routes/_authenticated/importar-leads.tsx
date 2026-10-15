import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RequireRole } from "@/components/require-role";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { parseDelimitedText } from "@/lib/spreadsheets";
import {
  importarLeadsCsvLote,
  type CsvLeadRow,
  type CsvLoteErro,
} from "@/lib/leads-import-csv.functions";

export const Route = createFileRoute("/_authenticated/importar-leads")({
  head: () => ({
    meta: [
      { title: "Importar leads (CSV) · CRM SMQ" },
      { name: "description", content: "Importação de leads por planilha CSV, só para administradores." },
      { property: "og:title", content: "Importar leads (CSV) · CRM SMQ" },
      { property: "og:description", content: "Importação de leads por planilha CSV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireRole allow={["admin"]}>
      <ImportarLeadsPage />
    </RequireRole>
  ),
});

const LOTE = 500;

const ZONAS: Record<string, string> = {
  "zona leste": "Leste",
  leste: "Leste",
  "zona oeste": "Oeste",
  oeste: "Oeste",
  "zona norte": "Norte",
  norte: "Norte",
  "zona sul": "Sul",
  sul: "Sul",
  centro: "Centro",
  "grande sp": "Grande SP",
};

const vazio = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

function pegar(row: Record<string, unknown>, nome: string) {
  const k = Object.keys(row).find((c) => c.trim().toLowerCase() === nome);
  return k ? vazio(row[k]) : null;
}

function baixarErros(erros: CsvLoteErro[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const linhas = [
    "Linha,Nome,Telefone,Email,Motivo",
    ...erros.map((e) => [e.linha, e.nome, e.telefone, e.email, e.motivo].map(esc).join(",")),
  ];
  const blob = new Blob(["\ufeff" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "erros-importacao.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function ImportarLeadsPage() {
  const importar = useServerFn(importarLeadsCsvLote);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [rodando, setRodando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [total, setTotal] = useState(0);
  const [resumo, setResumo] = useState<{
    inseridos: number;
    duplicados: number;
    erros: CsvLoteErro[];
  } | null>(null);

  async function iniciar() {
    if (!arquivo) return;
    setResumo(null);
    let rows: CsvLeadRow[];
    try {
      const brutas = parseDelimitedText(await arquivo.text());
      rows = brutas.map((r, i) => {
        const zona = pegar(r, "zona");
        return {
          linha: i + 2,
          nome: pegar(r, "nome"),
          telefone: pegar(r, "telefone"),
          email: pegar(r, "email"),
          zona: zona ? (ZONAS[zona.toLowerCase()] ?? null) : null,
          renda: pegar(r, "renda"),
        };
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      return;
    }
    if (rows.length === 0) {
      toast.error("O arquivo não tem linhas.");
      return;
    }

    const batchId = crypto.randomUUID();
    const acc = { inseridos: 0, duplicados: 0, erros: [] as CsvLoteErro[] };
    setTotal(rows.length);
    setFeitos(0);
    setRodando(true);
    for (let i = 0; i < rows.length; i += LOTE) {
      const lote = rows.slice(i, i + LOTE);
      try {
        const r = await importar({ data: { rows: lote, batchId } });
        acc.inseridos += r.inseridos;
        acc.duplicados += r.duplicados;
        acc.erros.push(...r.erros);
      } catch (e) {
        const motivo = e instanceof Error ? e.message : "falha no lote";
        lote.forEach((l) =>
          acc.erros.push({ linha: l.linha, nome: l.nome, telefone: l.telefone, email: l.email, motivo }),
        );
      }
      setFeitos(Math.min(i + LOTE, rows.length));
    }
    setRodando(false);
    setResumo({ ...acc });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Importar leads (CSV)"
        description="Colunas: Nome, Telefone, Email, Zona, Renda. Os leads entram na base sem corretor e sem passar pela roleta. Quem já existe é pulado, então pode importar o mesmo arquivo de novo."
      />
      <Card>
        <CardContent className="space-y-4 p-6">
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={rodando}
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
          />
          <Button onClick={iniciar} disabled={!arquivo || rodando}>
            {rodando ? "Importando…" : "Importar"}
          </Button>
          {total > 0 && (
            <div className="space-y-1">
              <Progress value={(feitos / total) * 100} />
              <p className="text-sm text-muted-foreground">
                {feitos.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} linhas
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {resumo && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="font-display text-lg font-bold">Resumo</h3>
            <ul className="space-y-1 text-sm">
              <li>Inseridos: {resumo.inseridos.toLocaleString("pt-BR")}</li>
              <li>Pulados por duplicidade: {resumo.duplicados.toLocaleString("pt-BR")}</li>
              <li>Com erro: {resumo.erros.length.toLocaleString("pt-BR")}</li>
            </ul>
            {resumo.erros.length > 0 && (
              <Button variant="outline" onClick={() => baixarErros(resumo.erros)}>
                Baixar lista de erros (CSV)
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
