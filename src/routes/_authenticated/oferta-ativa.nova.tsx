import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Lock, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryErrorState } from "@/components/ui/query-error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserRoles } from "@/hooks/use-auth";
import { useDebounce } from "@/hooks/use-debounce";
import {
  STATUS_LEAD_OPTIONS,
  TEMPERATURA_OPTIONS,
  ORIGEM_OPTIONS_OA,
  ZONA_OPTIONS,
  previewFiltros,
  createOferta,
  getOfertaResumo,
  type OfertaFiltros,
} from "@/lib/oferta-ativa";

export const Route = createFileRoute("/_authenticated/oferta-ativa/nova")({
  // `de` = id de uma lista existente a duplicar (prefill do formulário).
  validateSearch: (search: Record<string, unknown>): { de?: string } => ({
    de: typeof search.de === "string" ? search.de : undefined,
  }),
  head: () => ({ meta: [{ title: "Nova Lista — Oferta Ativa" }] }),
  component: NovaOfertaPage,
});

function NovaOfertaPage() {
  const navigate = useNavigate();
  const { de } = Route.useSearch();
  const { isAdmin, isGestor, loading: rolesLoading } = useUserRoles();
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

  // Duplicar: pré-preenche o builder com os dados da lista de origem (uma vez).
  const origemQ = useQuery({
    queryKey: ["oferta-origem", de],
    enabled: !!de,
    queryFn: () => getOfertaResumo(de!),
  });
  const seeded = useRef(false);
  useEffect(() => {
    if (!de || seeded.current || !origemQ.data) return;
    seeded.current = true;
    setNome(`${origemQ.data.nome} (cópia)`);
    setDescricao(origemQ.data.descricao ?? "");
    setCorretorId(origemQ.data.corretor_id ?? undefined);
    setFiltros(origemQ.data.filtros);
  }, [de, origemQ.data]);
  useEffect(() => {
    if (origemQ.isError) {
      toast.error("Não foi possível carregar a lista de origem", {
        description:
          "Ela pode ter sido excluída ou você não tem acesso. Preencha o formulário manualmente.",
      });
    }
  }, [origemQ.isError]);

  const debounced = useDebounce(filtros, 400);

  const projetosQ = useQuery({
    queryKey: ["projetos-oa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projetos")
        .select("id, nome")
        .is("deleted_at", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const corretoresQ = useQuery({
    queryKey: ["corretores-oa"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // O corretor destinatário define APENAS o dono da lista — não filtra o
  // universo de leads. O preview considera todos os leads que casam com os
  // filtros, independente de quem é o corretor responsável.
  const previewQ = useQuery({
    queryKey: ["oa-preview", debounced],
    queryFn: () => previewFiltros(debounced),
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

  // Espera os papéis para não piscar "Acesso restrito" para gestor no 1º paint.
  if (rolesLoading || (de && canManage && origemQ.isLoading)) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Criar listas é ação de gestão (o RPC create_oferta_ativa rejeita os demais).
  if (!canManage) {
    return (
      <EmptyState
        icon={Lock}
        title="Acesso restrito"
        description="A criação de listas de Oferta Ativa é exclusiva para gestores e administradores. Você trabalha as listas atribuídas a você na aba Oferta Ativa."
        action={
          <Button asChild variant="outline">
            <Link to="/projetos" search={{ tab: "oferta" }}>
              Voltar para Oferta Ativa
            </Link>
          </Button>
        }
        className="py-20"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/oferta-ativa" aria-label="Voltar para Oferta Ativa">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <PageHeader title={de ? "Duplicar Lista de Oferta Ativa" : "Nova Lista de Oferta Ativa"} />
      </div>

      <div className="bg-card border rounded-xl p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="oa-nome">Nome da Lista *</Label>
            <Input
              id="oa-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Leads quentes terça 20/05"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="oa-descricao">Descrição (opcional)</Label>
            <Input
              id="oa-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Objetivo da campanha..."
              className="mt-1"
            />
          </div>
          {canManage && (
            <div>
              <Label htmlFor="oa-corretor">Corretor destinatário</Label>
              <Select
                value={corretorId ?? "all"}
                onValueChange={(v) => setCorretorId(v === "all" ? undefined : v)}
              >
                <SelectTrigger id="oa-corretor" className="mt-1">
                  <SelectValue placeholder="Carteira geral (sem dono)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Carteira geral (sem dono)</SelectItem>
                  {(corretoresQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome ?? "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {corretoresQ.isError && (
                <p role="alert" className="text-xs text-destructive mt-1">
                  Não foi possível carregar os corretores.{" "}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => corretoresQ.refetch()}
                  >
                    Tentar novamente
                  </button>
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Define quem será o dono desta lista. Não filtra os leads — use os filtros abaixo
                para escolher quais leads entram.
              </p>
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
                Filtra leads pelos projetos cadastrados nessas zonas (inclui projetos vindos por
                importação).
              </p>
            </div>

            {projetosQ.isLoading && (
              <div aria-busy="true">
                <Label className="text-sm font-medium">Projetos</Label>
                <Skeleton className="mt-2 h-24 w-full rounded-md" />
              </div>
            )}

            {projetosQ.isError && (
              <div>
                <Label className="text-sm font-medium">Projetos</Label>
                <QueryErrorState
                  title="Não foi possível carregar os projetos."
                  error={projetosQ.error}
                  onRetry={() => projetosQ.refetch()}
                  className="mt-2 py-6"
                />
              </div>
            )}

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
              <Label htmlFor="oa-sem-interacao" className="text-sm font-medium">
                Sem interação há (dias)
              </Label>
              <Input
                id="oa-sem-interacao"
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
          ) : previewQ.isError ? (
            <div role="alert" className="text-sm">
              <p className="font-medium text-destructive">
                Não foi possível calcular a contagem de leads.
              </p>
              <button
                type="button"
                className="text-xs text-muted-foreground underline hover:text-foreground"
                onClick={() => previewQ.refetch()}
              >
                Tentar novamente
              </button>
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

        <div className="flex flex-col items-end gap-2">
          {(nome.trim().length < 2 || (previewQ.data?.count ?? 0) === 0) && (
            <p className="text-xs text-muted-foreground">
              {nome.trim().length < 2
                ? "Dê um nome com pelo menos 2 caracteres à lista."
                : "Ajuste os filtros: a lista precisa conter ao menos 1 lead."}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" asChild>
              <Link to="/oferta-ativa">Cancelar</Link>
            </Button>
            <Button
              onClick={() => createM.mutate()}
              loading={createM.isPending}
              disabled={nome.trim().length < 2 || (previewQ.data?.count ?? 0) === 0}
            >
              {!createM.isPending && <Plus className="w-4 h-4 mr-2" />} Criar Lista
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
