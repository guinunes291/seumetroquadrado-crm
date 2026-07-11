import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importarLeads, type ImportResult } from "@/lib/leads-import.functions";

type Step = "upload" | "mapear" | "resultado";

type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

const NONE = "__none__";

// heurísticas para sugerir mapeamento automaticamente
function sugerirCampo(header: string): keyof Mapping | null {
  const h = header.toLowerCase();
  if (/(nome|cliente|conta|lead)/.test(h) && !/email|empre/.test(h)) return "nome";
  if (/(telefone|fone|celular|whats|phone)/.test(h)) return "telefone";
  if (/(e-?mail)/.test(h)) return "email";
  if (/(empreend|projeto|imovel|produto|interesse)/.test(h)) return "projeto_nome";
  return null;
}

type Mapping = {
  nome: string;
  telefone: string;
  email: string;
  projeto_nome: string;
};

export function ImportLeadsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>({
    nome: "",
    telefone: "",
    email: NONE,
    projeto_nome: NONE,
  });
  const [projetoFixo, setProjetoFixo] = useState<string>(NONE);
  const [resultado, setResultado] = useState<ImportResult | null>(null);

  const importarFn = useServerFn(importarLeads);

  const { data: projetos } = useQuery({
    queryKey: ["projetos-import"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  function reset() {
    setStep("upload");
    setFileName("");
    setParsed(null);
    setMapping({ nome: "", telefone: "", email: NONE, projeto_nome: NONE });
    setProjetoFixo(NONE);
    setResultado(null);
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
        raw: false,
      });
      if (rows.length === 0) {
        toast.error("Planilha vazia");
        return;
      }
      const headers = Object.keys(rows[0]);
      setParsed({ headers, rows });
      setFileName(file.name);

      // tentar auto-mapear
      const auto: Mapping = {
        nome: "",
        telefone: "",
        email: NONE,
        projeto_nome: NONE,
      };
      for (const h of headers) {
        const campo = sugerirCampo(h);
        if (campo && !auto[campo]) auto[campo] = h;
      }
      setMapping(auto);
      setStep("mapear");
    } catch (e) {
      toast.error(`Erro ao ler arquivo: ${(e as Error).message}`);
    }
  }

  const preview = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.slice(0, 5).map((r) => ({
      nome: mapping.nome ? String(r[mapping.nome] ?? "") : "",
      telefone: mapping.telefone ? String(r[mapping.telefone] ?? "") : "",
      email: mapping.email !== NONE ? String(r[mapping.email] ?? "") : "",
      projeto_nome:
        mapping.projeto_nome !== NONE
          ? String(r[mapping.projeto_nome] ?? "")
          : "",
    }));
  }, [parsed, mapping]);

  const importar = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("Sem dados");
      if (!mapping.nome || !mapping.telefone)
        throw new Error("Mapeie ao menos Nome e Telefone");
      const rows = parsed.rows.map((r) => ({
        nome: String(r[mapping.nome] ?? "").trim(),
        telefone: String(r[mapping.telefone] ?? "").trim(),
        email:
          mapping.email !== NONE
            ? String(r[mapping.email] ?? "").trim() || null
            : null,
        projeto_nome:
          mapping.projeto_nome !== NONE
            ? String(r[mapping.projeto_nome] ?? "").trim() || null
            : null,
      }));
      return await importarFn({
        data: {
          rows,
          projeto_id: projetoFixo !== NONE ? projetoFixo : null,
        },
      });
    },
    onSuccess: (res) => {
      setResultado(res);
      setStep("resultado");
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${res.inseridos} leads importados`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar leads
          </DialogTitle>
          <DialogDescription>
            Carregue um arquivo .xlsx ou .csv. Você confirma o mapeamento das colunas antes da importação.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <Label
                  htmlFor="file-upload"
                  className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 cursor-pointer hover:border-muted-foreground/60 transition-colors"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Clique para selecionar uma planilha
                  </span>
                  <span className="text-xs text-muted-foreground">
                    .xlsx, .xls ou .csv
                  </span>
                  <Input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </Label>
              </CardContent>
            </Card>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Todos os leads importados ficam com status <strong>novo</strong> e origem <strong>importação</strong>.</p>
              <p>• Telefones que já existem na base são pulados automaticamente.</p>
              <p>• Se a coluna de empreendimento bater com um projeto cadastrado, o vínculo é feito automaticamente.</p>
            </div>
          </div>
        )}

        {step === "mapear" && parsed && (
          <div className="space-y-4">
            <div className="text-sm">
              <strong>{fileName}</strong> · {parsed.rows.length} linhas · {parsed.headers.length} colunas
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <CampoMap
                label="Nome *"
                value={mapping.nome}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, nome: v }))}
              />
              <CampoMap
                label="Telefone *"
                value={mapping.telefone}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, telefone: v }))}
              />
              <CampoMap
                label="Email"
                value={mapping.email}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, email: v }))}
                allowNone
              />
              <CampoMap
                label="Empreendimento / Projeto"
                value={mapping.projeto_nome}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, projeto_nome: v }))}
                allowNone
              />
            </div>

            <div className="space-y-2">
              <Label>Forçar projeto para todos os leads (opcional)</Label>
              <Select value={projetoFixo} onValueChange={setProjetoFixo}>
                <SelectTrigger>
                  <SelectValue placeholder="Usar mapeamento da coluna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Usar mapeamento da coluna</SelectItem>
                  {(projetos ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {preview.length > 0 && (
              <div className="space-y-2">
                <Label>Pré-visualização (5 primeiras linhas)</Label>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Nome</th>
                        <th className="text-left p-2">Telefone</th>
                        <th className="text-left p-2">Email</th>
                        <th className="text-left p-2">Empreendimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{r.nome || <em className="text-muted-foreground">—</em>}</td>
                          <td className="p-2">{r.telefone || <em className="text-muted-foreground">—</em>}</td>
                          <td className="p-2">{r.email || <em className="text-muted-foreground">—</em>}</td>
                          <td className="p-2">{r.projeto_nome || <em className="text-muted-foreground">—</em>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>
                Voltar
              </Button>
              <Button
                onClick={() => importar.mutate()}
                disabled={!mapping.nome || !mapping.telefone || importar.isPending}
              >
                {importar.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando…
                  </>
                ) : (
                  `Importar ${parsed.rows.length} leads`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "resultado" && resultado && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600">{resultado.inseridos}</div>
                  <div className="text-xs text-muted-foreground">Inseridos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-amber-600">{resultado.duplicados}</div>
                  <div className="text-xs text-muted-foreground">Duplicados</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-rose-600">{resultado.invalidos}</div>
                  <div className="text-xs text-muted-foreground">Inválidos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-muted-foreground">{resultado.total}</div>
                  <div className="text-xs text-muted-foreground">Total no arquivo</div>
                </CardContent>
              </Card>
            </div>

            {resultado.detalhes.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Linhas não importadas ({resultado.detalhes.length})
                </Label>
                <div className="border rounded-md max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Linha</th>
                        <th className="text-left p-2">Nome</th>
                        <th className="text-left p-2">Telefone</th>
                        <th className="text-left p-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.detalhes.map((d, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{d.linha}</td>
                          <td className="p-2">{d.nome ?? "—"}</td>
                          <td className="p-2">{d.telefone ?? "—"}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs">{d.motivo}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Importar outra planilha
              </Button>
              <Button onClick={() => onOpenChange(false)}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Concluir
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CampoMap({
  label,
  value,
  headers,
  onChange,
  allowNone,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value || (allowNone ? NONE : "")} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione a coluna" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>— não usar —</SelectItem>}
          {headers.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
