// Aba "Encontros": roleplay diário, maratona de objeções, crédito quinzenal e
// os demais encontros presenciais. Agenda da semana e em lista, criação por
// tipo com módulo ligado e facilitador, presença em 1 clique por corretor e
// o campo "ação registrada" (o que o encontro decidiu fazer).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDots, CheckCircle, Plus, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/ui/query-error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAuth } from "@/hooks/use-auth";
import type { AcademiaEncontroRow, AcademiaTipoEncontro } from "@/features/academia/tipos";
import { hojeBrasilia } from "../estado-modulo";
import {
  useEncontros,
  useEquipeAcademia,
  useModulosAcademia,
  useRegistrarPresenca,
  useSalvarEncontro,
  type EncontroForm,
} from "./gestao-client";
import { ROTULO_TIPO_ENCONTRO } from "./derivacao";
import { mensagemDaGestao } from "./mensagens";

const FUSO = "America/Sao_Paulo";

/** Data e hora de Brasília em ISO com o offset fixo (sem horário de verão). */
export function inicioIso(data: string, hora: string): string {
  return `${data}T${hora}:00-03:00`;
}

/** "YYYY-MM-DD" e "HH:MM" de Brasília a partir de um timestamp. */
export function partesBrasilia(iso: string): { data: string; hora: string } {
  const d = new Date(iso);
  const data = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return { data, hora };
}

function quando(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formVazio(): EncontroForm {
  return {
    id: null,
    tipo: "roleplay_diario",
    titulo: "",
    inicio: inicioIso(hojeBrasilia(), "08:30"),
    duracaoMin: 30,
    facilitadorId: null,
    moduloId: null,
    descricao: "",
    acaoRegistrada: "",
  };
}

function formDe(e: AcademiaEncontroRow): EncontroForm {
  return {
    id: e.id,
    tipo: e.tipo,
    titulo: e.titulo,
    inicio: e.inicio,
    duracaoMin: e.duracao_min,
    facilitadorId: e.facilitador_id,
    moduloId: e.modulo_id,
    descricao: e.descricao ?? "",
    acaoRegistrada: e.acao_registrada ?? "",
  };
}

export function AbaEncontros() {
  const { user } = useAuth();
  const dados = useEncontros();
  const equipe = useEquipeAcademia();
  const modulos = useModulosAcademia();
  const salvar = useSalvarEncontro();
  const presenca = useRegistrarPresenca();
  const [visao, setVisao] = useState<"semana" | "lista">("semana");
  const [form, setForm] = useState<EncontroForm | null>(null);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [acao, setAcao] = useState("");
  const hoje = hojeBrasilia();

  const semana = useMemo(() => {
    const dias: string[] = [];
    const base = new Date(`${hoje}T12:00:00Z`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() + i);
      dias.push(d.toISOString().slice(0, 10));
    }
    return dias;
  }, [hoje]);

  const erro = dados.error ?? equipe.error;
  if (erro) {
    return (
      <QueryErrorState
        title="Não foi possível carregar os encontros."
        error={erro}
        onRetry={() => {
          void dados.refetch();
          void equipe.refetch();
        }}
      />
    );
  }
  if (!dados.data || !equipe.data) return <Skeleton className="h-64 w-full" />;

  const { encontros, presencas } = dados.data;
  const corretores = equipe.data.corretores;
  const titulos = new Map((modulos.data ?? []).map((m) => [m.id, `${m.codigo} · ${m.titulo}`]));
  const presencaDe = new Map(
    presencas.map((p) => [`${p.encontro_id}:${p.corretor_id}`, p.presente]),
  );
  const agoraIso = new Date().toISOString();
  const proximos = encontros.filter((e) => e.inicio >= agoraIso);
  const passados = encontros.filter((e) => e.inicio < agoraIso).reverse();

  async function enviarForm() {
    if (!form) return;
    try {
      await salvar.mutateAsync(form);
      toast.success(form.id ? "Encontro atualizado." : "Encontro criado.");
      setForm(null);
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  async function marcar(encontroId: string, corretorId: string, presente: boolean | null) {
    try {
      await presenca.mutateAsync({ encontroId, corretorId, presente });
    } catch (e) {
      toast.error(mensagemDaGestao(e));
    }
  }

  async function salvarAcao(e: AcademiaEncontroRow) {
    try {
      await salvar.mutateAsync({ ...formDe(e), acaoRegistrada: acao });
      toast.success("Ação registrada.");
    } catch (err) {
      toast.error(mensagemDaGestao(err));
    }
  }

  // Função de render, não componente: componente declarado aqui dentro seria
  // um tipo novo a cada render e o campo de ação perderia o foco a cada letra.
  function cartao(e: AcademiaEncontroRow) {
    const aberto = abertoId === e.id;
    const presentes = corretores.filter(
      (c) => presencaDe.get(`${e.id}:${c.corretor_id}`) === true,
    ).length;
    return (
      <Card key={e.id}>
        <CardContent className="space-y-2 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{e.titulo}</p>
            <StatusBadge intent="info">{ROTULO_TIPO_ENCONTRO[e.tipo]}</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground">
            {quando(e.inicio)}
            {e.duracao_min ? ` · ${e.duracao_min} min` : ""}
            {e.modulo_id ? ` · ${titulos.get(e.modulo_id) ?? "módulo ligado"}` : ""}
            {` · ${presentes} presente${presentes === 1 ? "" : "s"}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={aberto ? "default" : "outline"}
              onClick={() => {
                setAbertoId(aberto ? null : e.id);
                setAcao(e.acao_registrada ?? "");
              }}
            >
              {aberto ? "Fechar" : "Presença e ação"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(formDe(e))}>
              Editar
            </Button>
          </div>
          {aberto && (
            <div className="space-y-3 border-t pt-3">
              {corretores.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ninguém da sua equipe está na Academia.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {corretores.map((c) => {
                    const estado = presencaDe.get(`${e.id}:${c.corretor_id}`);
                    return (
                      <li key={c.corretor_id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm">{c.corretor_nome}</span>
                        <Button
                          size="sm"
                          variant={estado === true ? "default" : "outline"}
                          aria-pressed={estado === true}
                          onClick={() =>
                            void marcar(e.id, c.corretor_id, estado === true ? null : true)
                          }
                        >
                          <CheckCircle className="mr-1 h-4 w-4" /> Presente
                        </Button>
                        <Button
                          size="sm"
                          variant={estado === false ? "destructive" : "outline"}
                          aria-pressed={estado === false}
                          onClick={() =>
                            void marcar(e.id, c.corretor_id, estado === false ? null : false)
                          }
                        >
                          <XCircle className="mr-1 h-4 w-4" /> Faltou
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={`acao-${e.id}`}>Ação registrada</Label>
                <Textarea
                  id={`acao-${e.id}`}
                  value={acao}
                  onChange={(ev) => setAcao(ev.target.value)}
                  placeholder="O que o time combinou fazer a partir deste encontro."
                  rows={2}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void salvarAcao(e)}
                  disabled={salvar.isPending}
                >
                  Salvar ação
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          type="single"
          value={visao}
          onValueChange={(v) => (v === "semana" || v === "lista") && setVisao(v)}
          aria-label="Visão da agenda"
        >
          <ToggleGroupItem value="semana">Próximos 7 dias</ToggleGroupItem>
          <ToggleGroupItem value="lista">Lista</ToggleGroupItem>
        </ToggleGroup>
        <Button
          size="sm"
          onClick={() => setForm({ ...formVazio(), facilitadorId: user?.id ?? null })}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Novo encontro
        </Button>
      </div>

      {visao === "semana" ? (
        <div className="space-y-3">
          {semana.map((dia) => {
            const doDia = encontros.filter((e) => partesBrasilia(e.inicio).data === dia);
            return (
              <section key={dia} aria-label={dia}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR", {
                    timeZone: "UTC",
                    weekday: "long",
                    day: "2-digit",
                    month: "2-digit",
                  }).format(new Date(`${dia}T12:00:00Z`))}
                </h3>
                {doDia.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem encontro.</p>
                ) : (
                  <div className="space-y-2">{doDia.map((e) => cartao(e))}</div>
                )}
              </section>
            );
          })}
        </div>
      ) : encontros.length === 0 ? (
        <EmptyState
          icon={CalendarDots}
          title="Nenhum encontro nos últimos 30 dias nem marcado."
          description="Crie o primeiro: o roleplay da manhã, por exemplo."
        />
      ) : (
        <div className="space-y-4">
          {proximos.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Próximos</h3>
              {proximos.map((e) => cartao(e))}
            </section>
          )}
          {passados.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Últimos 30 dias</h3>
              {passados.map((e) => cartao(e))}
            </section>
          )}
        </div>
      )}

      <Dialog open={form !== null} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar encontro" : "Novo encontro"}</DialogTitle>
            <DialogDescription>Horário de Brasília.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="enc-tipo">Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v as AcademiaTipoEncontro })}
                >
                  <SelectTrigger id="enc-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROTULO_TIPO_ENCONTRO) as AcademiaTipoEncontro[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {ROTULO_TIPO_ENCONTRO[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enc-titulo">Título</Label>
                <Input
                  id="enc-titulo"
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Roleplay da manhã: objeção de preço"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="enc-data">Data</Label>
                  <Input
                    id="enc-data"
                    type="date"
                    value={partesBrasilia(form.inicio).data}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        inicio: inicioIso(e.target.value, partesBrasilia(form.inicio).hora),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enc-hora">Hora</Label>
                  <Input
                    id="enc-hora"
                    type="time"
                    value={partesBrasilia(form.inicio).hora}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        inicio: inicioIso(partesBrasilia(form.inicio).data, e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enc-duracao">Minutos</Label>
                  <Input
                    id="enc-duracao"
                    type="number"
                    min={5}
                    value={form.duracaoMin ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        duracaoMin: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enc-modulo">Módulo ligado (opcional)</Label>
                <Select
                  value={form.moduloId ?? "nenhum"}
                  onValueChange={(v) => setForm({ ...form, moduloId: v === "nenhum" ? null : v })}
                >
                  <SelectTrigger id="enc-modulo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum</SelectItem>
                    {(modulos.data ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.codigo} · {m.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="enc-descricao">Descrição (opcional)</Label>
                <Textarea
                  id="enc-descricao"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void enviarForm()}
              disabled={salvar.isPending || !form || form.titulo.trim() === ""}
            >
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
