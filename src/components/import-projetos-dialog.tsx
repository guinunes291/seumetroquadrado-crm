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
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  importarProjetos,
  type ImportProjetosResult,
  type ImportProjetoRow,
} from "@/lib/projetos-import.functions";

type Step = "upload" | "mapear" | "resultado";
const NONE = "__none__";

type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

type FieldKey =
  | "nome"
  | "construtora"
  | "regiao"
  | "bairro"
  | "cidade"
  | "logradouro"
  | "numero"
  | "metragem_min"
  | "metragem_max"
  | "dorms_min"
  | "dorms_max"
  | "suites"
  | "tipo_extra"
  | "vagas_min"
  | "vagas_max"
  | "vagas_observacao"
  | "preco_a_partir"
  | "sob_consulta"
  | "status_entrega"
  | "mes_entrega"
  | "ano_entrega"
  | "fonte";

type Mapping = Record<FieldKey, string>;

const EMPTY_MAPPING: Mapping = {
  nome: "",
  construtora: NONE,
  regiao: NONE,
  bairro: NONE,
  cidade: NONE,
  logradouro: NONE,
  numero: NONE,
  metragem_min: NONE,
  metragem_max: NONE,
  dorms_min: NONE,
  dorms_max: NONE,
  suites: NONE,
  tipo_extra: NONE,
  vagas_min: NONE,
  vagas_max: NONE,
  vagas_observacao: NONE,
  preco_a_partir: NONE,
  sob_consulta: NONE,
  status_entrega: NONE,
  mes_entrega: NONE,
  ano_entrega: NONE,
  fonte: NONE,
};

const FIELD_LABELS: Record<FieldKey, string> = {
  nome: "Empreendimento *",
  construtora: "Incorporadora",
  regiao: "Região / Zona",
  bairro: "Bairro / Cidade",
  cidade: "Cidade (opcional)",
  logradouro: "Logradouro",
  numero: "Número",
  metragem_min: "Metragem mín. (m²)",
  metragem_max: "Metragem máx. (m²)",
  dorms_min: "Dorms mín.",
  dorms_max: "Dorms máx.",
  suites: "Suítes",
  tipo_extra: "Tipo extra",
  vagas_min: "Vagas mín.",
  vagas_max: "Vagas máx.",
  vagas_observacao: "Observação de vagas",
  preco_a_partir: "Preço a partir de (R$)",
  sob_consulta: "Sob consulta (Sim/Não)",
  status_entrega: "Status",
  mes_entrega: "Mês de entrega",
  ano_entrega: "Ano de entrega",
  fonte: "Fonte",
};

const FIELD_ORDER: FieldKey[] = [
  "nome",
  "construtora",
  "regiao",
  "bairro",
  "cidade",
  "logradouro",
  "numero",
  "metragem_min",
  "metragem_max",
  "dorms_min",
  "dorms_max",
  "suites",
  "tipo_extra",
  "vagas_min",
  "vagas_max",
  "vagas_observacao",
  "preco_a_partir",
  "sob_consulta",
  "status_entrega",
  "mes_entrega",
  "ano_entrega",
  "fonte",
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sugerirCampo(header: string): FieldKey | null {
  const h = norm(header);
  if (/^empreend|^projeto|^nome/.test(h)) return "nome";
  if (/incorpor|construt/.test(h)) return "construtora";
  if (/^regi|zona/.test(h)) return "regiao";
  if (/bairro/.test(h)) return "bairro";
  if (/^cidade$/.test(h)) return "cidade";
  if (/logradouro|^rua|avenida/.test(h)) return "logradouro";
  if (/^numero$|^num$|^n\b/.test(h)) return "numero";
  if (/metragem.*min/.test(h)) return "metragem_min";
  if (/metragem.*max/.test(h)) return "metragem_max";
  if (/dorms.*min|dorm.*min/.test(h)) return "dorms_min";
  if (/dorms.*max|dorm.*max/.test(h)) return "dorms_max";
  if (/^suite/.test(h)) return "suites";
  if (/tipo.*extra/.test(h)) return "tipo_extra";
  if (/vagas.*min/.test(h)) return "vagas_min";
  if (/vagas.*max/.test(h)) return "vagas_max";
  if (/vagas.*obs|obs.*vaga/.test(h)) return "vagas_observacao";
  if (/preco|pre[cç]o|valor/.test(h)) return "preco_a_partir";
  if (/sob.*consulta|consulta/.test(h)) return "sob_consulta";
  if (/^status$|entrega.*status/.test(h)) return "status_entrega";
  if (/mes.*entrega/.test(h)) return "mes_entrega";
  if (/ano.*entrega/.test(h)) return "ano_entrega";
  if (/fonte/.test(h)) return "fonte";
  return null;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/r\$/gi, "").replace(/\s/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  // mantém apenas dígitos, vírgulas e pontos
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;

  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;

  let normalized: string;
  if (commas === 0 && dots === 0) {
    normalized = s;
  } else if (commas > 0 && dots > 0) {
    // mistura: o separador da direita é o decimal
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // BR: pontos = milhar, vírgula = decimal
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: vírgulas = milhar, ponto = decimal
      normalized = s.replace(/,/g, "");
    }
  } else {
    // só um tipo de separador
    const sep = commas > 0 ? "," : ".";
    const count = commas > 0 ? commas : dots;
    const parts = s.split(sep);
    const lastLen = parts[parts.length - 1].length;
    if (count > 1) {
      // múltiplos → todos são milhar
      normalized = parts.join("");
    } else if (lastLen === 3) {
      // único separador com 3 dígitos depois → milhar
      normalized = parts.join("");
    } else {
      // decimal
      normalized = parts.join(".");
    }
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}


function toBool(v: unknown): boolean {
  if (v == null) return false;
  const s = norm(String(v));
  return s === "sim" || s === "s" || s === "true" || s === "yes" || s === "y" || s === "1";
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
      const wb = XLSX.read(buf, { type: "array", raw: false, FS: ";" });
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
      const headers = Object.keys(rows[0]).map((h) => h.replace(/^\ufeff/, ""));
      // re-key rows w/o BOM
      const cleanRows = rows.map((r) => {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(r)) out[k.replace(/^\ufeff/, "")] = r[k];
        return out;
      });
      setParsed({ headers, rows: cleanRows });
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
      dorms: [val(r, mapping.dorms_min), val(r, mapping.dorms_max)].filter(Boolean).join("–"),
      metr: [val(r, mapping.metragem_min), val(r, mapping.metragem_max)].filter(Boolean).join("–"),
      preco: val(r, mapping.preco_a_partir),
    }));
  }, [parsed, mapping]);

  const importar = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("Sem dados");
      if (!mapping.nome) throw new Error("Mapeie ao menos o Empreendimento");
      const get = (r: Record<string, unknown>, key: string) =>
        key && key !== NONE ? String(r[key] ?? "").trim() || null : null;
      const getNum = (r: Record<string, unknown>, key: string) =>
        key && key !== NONE ? toNum(r[key]) : null;
      const getBool = (r: Record<string, unknown>, key: string) =>
        key && key !== NONE ? toBool(r[key]) : false;

      const rows: ImportProjetoRow[] = parsed.rows.map((r) => ({
        nome: String(r[mapping.nome] ?? "").trim(),
        construtora: get(r, mapping.construtora),
        regiao: get(r, mapping.regiao),
        bairro: get(r, mapping.bairro),
        cidade: get(r, mapping.cidade),
        logradouro: get(r, mapping.logradouro),
        numero: get(r, mapping.numero),
        metragem_min: getNum(r, mapping.metragem_min),
        metragem_max: getNum(r, mapping.metragem_max),
        dorms_min: getNum(r, mapping.dorms_min),
        dorms_max: getNum(r, mapping.dorms_max),
        suites: getNum(r, mapping.suites),
        tipo_extra: get(r, mapping.tipo_extra),
        vagas_min: getNum(r, mapping.vagas_min),
        vagas_max: getNum(r, mapping.vagas_max),
        vagas_observacao: get(r, mapping.vagas_observacao),
        preco_a_partir: getNum(r, mapping.preco_a_partir),
        sob_consulta: getBool(r, mapping.sob_consulta),
        status_entrega: get(r, mapping.status_entrega),
        mes_entrega: getNum(r, mapping.mes_entrega),
        ano_entrega: getNum(r, mapping.ano_entrega),
        fonte: get(r, mapping.fonte),
      }));
      return await importarFn({ data: { rows, atualizarExistentes: atualizar } });
    },
    onSuccess: (res) => {
      setResultado(res);
      setStep("resultado");
      qc.invalidateQueries({ queryKey: ["projetos"] });
      toast.success(`${res.inseridos} inseridos · ${res.atualizados} atualizados`);
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
            Importar empreendimentos
          </DialogTitle>
          <DialogDescription>
            Carregue a planilha (.xlsx ou .csv com separador ;) com os 21 campos do Tabelão.
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
                    .xlsx, .xls ou .csv (UTF-8, separador ;)
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
              <p>• Cada linha vira um empreendimento.</p>
              <p>
                • Slug = Incorporadora + Nome. Empreendimentos existentes são pulados a menos que
                "Atualizar existentes" esteja ligado.
              </p>
              <p>• Webhook próprio é gerado automaticamente.</p>
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
              {FIELD_ORDER.map((key) => (
                <CampoMap
                  key={key}
                  label={FIELD_LABELS[key]}
                  value={mapping[key] || (key === "nome" ? "" : NONE)}
                  headers={parsed.headers}
                  onChange={(v) => setMapping((m) => ({ ...m, [key]: v }))}
                  allowNone={key !== "nome"}
                />
              ))}
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Atualizar empreendimentos existentes</Label>
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
                        <th className="text-left p-2">Incorporadora</th>
                        <th className="text-left p-2">Bairro</th>
                        <th className="text-left p-2">Dorms</th>
                        <th className="text-left p-2">Metragem</th>
                        <th className="text-left p-2">Preço</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{r.nome || <em className="text-muted-foreground">—</em>}</td>
                          <td className="p-2">{r.construtora || <em className="text-muted-foreground">—</em>}</td>
                          <td className="p-2">{r.bairro || <em className="text-muted-foreground">—</em>}</td>
                          <td className="p-2">{r.dorms || <em className="text-muted-foreground">—</em>}</td>
                          <td className="p-2">{r.metr || <em className="text-muted-foreground">—</em>}</td>
                          <td className="p-2">{r.preco || <em className="text-muted-foreground">—</em>}</td>
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
                  `Importar ${parsed.rows.length} empreendimentos`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "resultado" && resultado && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
              <Card><CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{resultado.inseridos}</div>
                <div className="text-xs text-muted-foreground">Inseridos</div>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <div className="text-2xl font-bold text-blue-600">{resultado.atualizados}</div>
                <div className="text-xs text-muted-foreground">Atualizados</div>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <div className="text-2xl font-bold text-amber-600">{resultado.duplicados}</div>
                <div className="text-xs text-muted-foreground">Duplicados</div>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <div className="text-2xl font-bold text-rose-600">
                  {resultado.invalidos + resultado.erros}
                </div>
                <div className="text-xs text-muted-foreground">Inválidos / erros</div>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <div className="text-2xl font-bold text-muted-foreground">{resultado.total}</div>
                <div className="text-xs text-muted-foreground">Total no arquivo</div>
              </CardContent></Card>
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
                          <td className="p-2">{d.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
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
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value || (allowNone ? NONE : "")} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione a coluna…" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>— Não importar —</SelectItem>}
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
