import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  importarProjetos,
  type ImportProjetosResult,
} from "@/lib/projetos-import.functions";

type Step = "upload" | "mapear" | "resultado";
const NONE = "__none__";

type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

type Mapping = {
  nome: string;
  construtora: string;
  regiao: string;
  bairro: string;
  cidade: string;
  endereco: string;
  tipologia: string;
  vagas: string;
  preco_inicial: string;
  entrega_status: string;
};

const EMPTY_MAPPING: Mapping = {
  nome: "",
  construtora: NONE,
  regiao: NONE,
  bairro: NONE,
  cidade: NONE,
  endereco: NONE,
  tipologia: NONE,
  vagas: NONE,
  preco_inicial: NONE,
  entrega_status: NONE,
};

function sugerirCampo(header: string): keyof Mapping | null {
  const h = header.toLowerCase();
  if (/empreend|projeto|nome/.test(h)) return "nome";
  if (/incorpor|construt/.test(h)) return "construtora";
  if (/regi[aã]o|zona/.test(h)) return "regiao";
  if (/bairro/.test(h) && !/cidade/.test(h)) return "bairro";
  if (/cidade/.test(h)) return "cidade";
  if (/endere[cç]o|rua|avenida/.test(h)) return "endereco";
  if (/tipologia|metragem|dorm/.test(h)) return "tipologia";
  if (/vaga/.test(h)) return "vagas";
  if (/pre[cç]o|valor/.test(h)) return "preco_inicial";
  if (/entrega|status/.test(h)) return "entrega_status";
  return null;
}

export function ImportProjetosDialog({
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
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [atualizar, setAtualizar] = useState(false);
  const [resultado, setResultado] = useState<ImportProjetosResult | null>(null);

  const importarFn = useServerFn(importarProjetos);

  function reset() {
    setStep("upload");
    setFileName("");
    setParsed(null);
    setMapping(EMPTY_MAPPING);
    setAtualizar(false);
    setResultado(null);
  }

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", raw: false });
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

      const auto: Mapping = { ...EMPTY_MAPPING };
      for (const h of headers) {
        const campo = sugerirCampo(h);
        if (campo && (auto[campo] === "" || auto[campo] === NONE)) {
          auto[campo] = h;
        }
      }
      setMapping(auto);
      setStep("mapear");
    } catch (e) {
      toast.error(`Erro ao ler arquivo: ${(e as Error).message}`);
    }
  }

  const preview = useMemo(() => {
    if (!parsed) return [];
    const val = (r: Record<string, unknown>, key: string) =>
      key && key !== NONE ? String(r[key] ?? "") : "";
    return parsed.rows.slice(0, 5).map((r) => ({
      nome: val(r, mapping.nome),
      construtora: val(r, mapping.construtora),
      bairro: val(r, mapping.bairro),
      tipologia: val(r, mapping.tipologia),
      preco_inicial: val(r, mapping.preco_inicial),
    }));
  }, [parsed, mapping]);

  const importar = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("Sem dados");
      if (!mapping.nome) throw new Error("Mapeie ao menos o Nome");
      const get = (r: Record<string, unknown>, key: string) =>
        key && key !== NONE ? String(r[key] ?? "").trim() || null : null;
      const rows = parsed.rows.map((r) => ({
        nome: String(r[mapping.nome] ?? "").trim(),
        construtora: get(r, mapping.construtora),
        regiao: get(r, mapping.regiao),
        bairro: get(r, mapping.bairro),
        cidade: get(r, mapping.cidade),
        endereco: get(r, mapping.endereco),
        tipologia: get(r, mapping.tipologia),
        vagas: get(r, mapping.vagas),
        preco_inicial: get(r, mapping.preco_inicial),
        entrega_status: get(r, mapping.entrega_status),
      }));
      return await importarFn({
        data: { rows, atualizarExistentes: atualizar },
      });
    },
    onSuccess: (res) => {
      setResultado(res);
      setStep("resultado");
      qc.invalidateQueries({ queryKey: ["projetos"] });
      toast.success(
        `${res.inseridos} inseridos · ${res.atualizados} atualizados`,
      );
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
            Importar projetos
          </DialogTitle>
          <DialogDescription>
            Carregue uma planilha .xlsx ou .csv com os empreendimentos.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <Label
                  htmlFor="file-upload-projetos"
                  className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 cursor-pointer hover:border-muted-foreground/60 transition-colors"
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    Clique para selecionar uma planilha
                  </span>
                  <span className="text-xs text-muted-foreground">
                    .xlsx, .xls ou .csv (separador ; ou ,)
                  </span>
                  <Input
                    id="file-upload-projetos"
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
              <p>
                • Cada linha vira um <strong>projeto/empreendimento</strong>.
              </p>
              <p>
                • Projetos cujo slug (Construtora + Nome) já existir são pulados — marque
                "Atualizar existentes" para sobrescrever.
              </p>
              <p>
                • Webhook próprio é gerado automaticamente para cada projeto criado.
              </p>
            </div>
          </div>
        )}

        {step === "mapear" && parsed && (
          <div className="space-y-4">
            <div className="text-sm">
              <strong>{fileName}</strong> · {parsed.rows.length} linhas ·{" "}
              {parsed.headers.length} colunas
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <CampoMap
                label="Nome do empreendimento *"
                value={mapping.nome}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, nome: v }))}
              />
              <CampoMap
                label="Construtora / Incorporadora"
                value={mapping.construtora}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, construtora: v }))}
                allowNone
              />
              <CampoMap
                label="Região / Zona"
                value={mapping.regiao}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, regiao: v }))}
                allowNone
              />
              <CampoMap
                label="Bairro"
                value={mapping.bairro}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, bairro: v }))}
                allowNone
              />
              <CampoMap
                label="Cidade"
                value={mapping.cidade}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, cidade: v }))}
                allowNone
              />
              <CampoMap
                label="Endereço"
                value={mapping.endereco}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, endereco: v }))}
                allowNone
              />
              <CampoMap
                label="Tipologia / Metragem"
                value={mapping.tipologia}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, tipologia: v }))}
                allowNone
              />
              <CampoMap
                label="Vagas"
                value={mapping.vagas}
                headers={parsed.headers}
                onChange={(v) => setMapping((m) => ({ ...m, vagas: v }))}
                allowNone
              />
              <CampoMap
                label="Preço a partir de"
                value={mapping.preco_inicial}
                headers={parsed.headers}
                onChange={(v) =>
                  setMapping((m) => ({ ...m, preco_inicial: v }))
                }
                allowNone
              />
              <CampoMap
                label="Entrega / Status"
                value={mapping.entrega_status}
                headers={parsed.headers}
                onChange={(v) =>
                  setMapping((m) => ({ ...m, entrega_status: v }))
                }
                allowNone
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Atualizar projetos existentes</Label>
                <p className="text-xs text-muted-foreground">
                  Sobrescreve dados de projetos cujo slug já existe.
                </p>
              </div>
              <Switch checked={atualizar} onCheckedChange={setAtualizar} />
            </div>

            {preview.length > 0 && (
              <div className="space-y-2">
                <Label>Pré-visualização (5 primeiras linhas)</Label>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Nome</th>
                        <th className="text-left p-2">Construtora</th>
                        <th className="text-left p-2">Bairro</th>
                        <th className="text-left p-2">Tipologia</th>
                        <th className="text-left p-2">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">
                            {r.nome || (
                              <em className="text-muted-foreground">—</em>
                            )}
                          </td>
                          <td className="p-2">
                            {r.construtora || (
                              <em className="text-muted-foreground">—</em>
                            )}
                          </td>
                          <td className="p-2">
                            {r.bairro || (
                              <em className="text-muted-foreground">—</em>
                            )}
                          </td>
                          <td className="p-2">
                            {r.tipologia || (
                              <em className="text-muted-foreground">—</em>
                            )}
                          </td>
                          <td className="p-2">
                            {r.preco_inicial || (
                              <em className="text-muted-foreground">—</em>
                            )}
                          </td>
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
                disabled={!mapping.nome || importar.isPending}
              >
                {importar.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando…
                  </>
                ) : (
                  `Importar ${parsed.rows.length} projetos`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "resultado" && resultado && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600">
                    {resultado.inseridos}
                  </div>
                  <div className="text-xs text-muted-foreground">Inseridos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-blue-600">
                    {resultado.atualizados}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Atualizados
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-amber-600">
                    {resultado.duplicados}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Duplicados
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-rose-600">
                    {resultado.invalidos + resultado.erros}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Inválidos / erros
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-muted-foreground">
                    {resultado.total}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total no arquivo
                  </div>
                </CardContent>
              </Card>
            </div>

            {resultado.detalhes.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Linhas com observação ({resultado.detalhes.length})
                </Label>
                <div className="border rounded-md max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Linha</th>
                        <th className="text-left p-2">Nome</th>
                        <th className="text-left p-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.detalhes.map((d, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{d.linha}</td>
                          <td className="p-2">{d.nome ?? "—"}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs">
                              {d.motivo}
                            </Badge>
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
      <Select
        value={value || (allowNone ? NONE : "")}
        onValueChange={onChange}
      >
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
