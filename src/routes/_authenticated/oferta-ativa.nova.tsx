import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserRoles } from "@/hooks/use-auth";
import {
  STATUS_LEAD_OPTIONS,
  TEMPERATURA_OPTIONS,
  ORIGEM_OPTIONS_OA,
  ZONA_OPTIONS,
  previewFiltros,
  createOferta,
  type OfertaFiltros,
} from "@/lib/oferta-ativa";

export const Route = createFileRoute("/_authenticated/oferta-ativa/nova")({
  head: () => ({ meta: [{ title: "Nova Lista — Oferta Ativa" }] }),
  component: NovaOfertaPage,
});

function useDebounce<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

function NovaOfertaPage() {
  const navigate = useNavigate();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [corretorId, setCorretorId] = useState<string | undefined>();
  const [projetoSearch, setProjetoSearch] = useState("");
  const [filtros, setFiltros] = useState<OfertaFiltros>({
    status: [],
    temperatura: [],
    projetoId: [],
    origem: [],
    zona: [],
  });


  const debounced = useDebounce(filtros, 400);
  const debouncedCorretor = useDebounce(corretorId, 400);

  const projetosQ = useQuery({
    queryKey: ["projetos-oa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const corretoresQ = useQuery({
    queryKey: ["corretores-oa"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const previewQ = useQuery({
    queryKey: ["oa-preview", debounced, debouncedCorretor],
    queryFn: () => previewFiltros(debounced, debouncedCorretor),
  });

  const createM = useMutation({
    mutationFn: () =>
      createOferta({
        nome: nome.trim(),
        descricao: descricao.trim(),
        filtros,
        corretorId: canManage ? corretorId : undefined,
      }),
    onSuccess: (id) => {
      toast.success("Lista criada");
      navigate({ to: "/oferta-ativa/$ofertaId", params: { ofertaId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggleMulti(field: "status" | "temperatura" | "origem" | "zona", v: string) {
    setFiltros((prev) => {
      const cur = prev[field];
      return {
        ...prev,
        [field]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v],
      };
    });
  }
  function toggleProjeto(id: string) {
    setFiltros((prev) => ({
      ...prev,
      projetoId: prev.projetoId.includes(id)
        ? prev.projetoId.filter((v) => v !== id)
        : [...prev.projetoId, id],
    }));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/oferta-ativa">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <PageHeader title="Nova Lista de Oferta Ativa" />
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <Label>Nome da Lista *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Leads quentes terça 20/05"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Objetivo da campanha..."
              className="mt-1"
            />
          </div>
          {canManage && (
            <div>
              <Label>Corretor destinatário</Label>
              <Select
                value={corretorId ?? "all"}
                onValueChange={(v) => setCorretorId(v === "all" ? undefined : v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos / carteira geral" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os leads</SelectItem>
                  {(corretoresQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome ?? "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div>
          <h2 className="font-semibold mb-3">Filtros de leads</h2>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Status no CRM</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {STATUS_LEAD_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={filtros.status.includes(opt.value)}
                      onCheckedChange={() => toggleMulti("status", opt.value)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Temperatura</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {TEMPERATURA_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleMulti("temperatura", opt.value)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      filtros.temperatura.includes(opt.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:border-primary/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Origem</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {ORIGEM_OPTIONS_OA.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                      checked={filtros.origem.includes(opt.value)}
                      onCheckedChange={() => toggleMulti("origem", opt.value)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Zona</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {ZONA_OPTIONS.map((z) => {
                  const active = filtros.zona.includes(z);
                  return (
                    <button
                      key={z}
                      type="button"
                      onClick={() => toggleMulti("zona", z)}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border hover:border-primary/50"
                      }`}
                    >
                      {z}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Filtra leads pelos projetos cadastrados nessas zonas (inclui projetos vindos por importação).
              </p>
            </div>

            {projetosQ.data && projetosQ.data.length > 0 && (
              <div>
                <Label className="text-sm font-medium">Projetos</Label>
                <Input
                  value={projetoSearch}
                  onChange={(e) => setProjetoSearch(e.target.value)}
                  placeholder="Buscar projeto..."
                  className="mt-2 mb-2 max-w-sm"
                />
                {filtros.projetoId.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {filtros.projetoId.length} selecionado(s) •{" "}
                    <button
                      type="button"
                      className="underline hover:text-foreground"
                      onClick={() => setFiltros((p) => ({ ...p, projetoId: [] }))}
                    >
                      limpar
                    </button>
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-2 mt-1 max-h-60 overflow-y-auto p-1 border rounded-md">
                  {projetosQ.data
                    .filter((p) =>
                      projetoSearch.trim() === ""
                        ? true
                        : p.nome.toLowerCase().includes(projetoSearch.trim().toLowerCase()),
                    )
                    .map((p) => (
                      <label key={p.id} className="flex items-center gap-1.5 cursor-pointer">
                        <Checkbox
                          checked={filtros.projetoId.includes(p.id)}
                          onCheckedChange={() => toggleProjeto(p.id)}
                        />
                        <span className="text-sm">{p.nome}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}


            <div>
              <Label className="text-sm font-medium">Sem interação há (dias)</Label>
              <Input
                type="number"
                min={0}
                value={filtros.semInteracaoHaDias ?? ""}
                onChange={(e) =>
                  setFiltros((prev) => ({
                    ...prev,
                    semInteracaoHaDias: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
                placeholder="Ex: 7"
                className="mt-1 max-w-32"
              />
            </div>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 flex items-center gap-3">
          <Users className="w-5 h-5 text-muted-foreground shrink-0" />
          {previewQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Calculando...
            </div>
          ) : previewQ.data ? (
            <div>
              <p className="text-sm font-medium">{previewQ.data.count} leads encontrados</p>
              {previewQ.data.sample.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ex: {previewQ.data.sample.map((l) => l.nome).join(", ")}
                  {previewQ.data.count > 5 ? "..." : ""}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Defina os filtros para ver a contagem</p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link to="/oferta-ativa">Cancelar</Link>
          </Button>
          <Button
            onClick={() => createM.mutate()}
            disabled={!nome.trim() || createM.isPending || (previewQ.data?.count ?? 0) === 0}
          >
            {createM.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" /> Criar Lista
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
