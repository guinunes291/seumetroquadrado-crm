// "Meus links de agendamento" — os links do corretor (estilo Calendly), um por
// local de visita.
//
// O corretor escolhe o stand no Mapa de Lojas (compacto, dentro do formulário)
// ou digita o endereço, define a faixa de horários e ganha um link único para
// aquele endereço — mesmo endereço, mesmo link. O cliente que abre o link
// escolhe um horário livre, preenche os dados e já cai na carteira dele em
// Agendado, com a visita na agenda (migrations 20261022120000 e
// 20261023120000). Os horários livres saem da agenda única do corretor: o que
// um link ocupa some dos outros. Gerar um link novo derruba o antigo na hora —
// a saída para link que caiu em spam.

import { Suspense, lazy, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowsClockwise,
  CaretLeft,
  Copy,
  LinkSimple,
  MapPin,
  PencilSimple,
  Plus,
  Prohibit,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNomeDoCorretor } from "@/hooks/use-nome-do-corretor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AGENDAMENTO_LINK_DEFAULTS,
  DIAS_SEMANA,
  configurarAgendamentoLinkSchema,
  mensagemConviteAgendamento,
  opcoesDeHorario,
  parseAgendamentoLinkResumo,
  parseAgendamentoLinks,
  parseLinkCriado,
  resumoAgendaDoLink,
  tituloDoLink,
  type AgendamentoLinkResumo,
} from "@/lib/agendamento-link";
import { cn } from "@/lib/utils";
import type { LocalDaVisita } from "./seletor-local-visita";

// Leaflet e a base de stands só descem quando o formulário abre.
const SeletorLocalVisita = lazy(() => import("./seletor-local-visita"));

const QUERY_KEY = ["meus-agendamento-links"] as const;
const HORARIOS = opcoesDeHorario();
const DURACOES = [30, 60, 90, 120] as const;
const ROTULO_DURACAO: Record<(typeof DURACOES)[number], string> = {
  30: "30 minutos",
  60: "1 hora",
  90: "1h30",
  120: "2 horas",
};

type Config = {
  local: LocalDaVisita;
  hora_inicio: string;
  hora_fim: string;
  dias_semana: number[];
  duracao_minutos: number;
};

type Tela = { tipo: "lista" } | { tipo: "novo" } | { tipo: "editar"; link: AgendamentoLinkResumo };

function configDe(link: AgendamentoLinkResumo | null): Config {
  if (!link) {
    const d = AGENDAMENTO_LINK_DEFAULTS;
    return {
      local: { localId: null, localNome: "", endereco: "" },
      hora_inicio: d.hora_inicio,
      hora_fim: d.hora_fim,
      dias_semana: [...d.dias_semana],
      duracao_minutos: d.duracao_minutos,
    };
  }
  return {
    local: { localId: link.local_id, localNome: link.local_nome, endereco: link.endereco },
    hora_inicio: link.hora_inicio,
    hora_fim: link.hora_fim,
    dias_semana: link.dias_semana,
    duracao_minutos: link.duracao_minutos,
  };
}

/** Erro do banco → frase para o corretor. */
function mensagemDoErro(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === "23505") return "Você já tem um link para este endereço.";
  if (err?.code === "P0002") return "Este link não existe mais. Feche e abra de novo.";
  if (err?.code === "22023" && err.message?.includes("limite"))
    return "Você já tem 20 links ativos. Desative um antes de criar outro.";
  if (err?.code === "22023") return "Confira a configuração do link.";
  if (e instanceof Error && !err?.code) return e.message;
  return "Não foi possível salvar o link. Tente de novo.";
}

export function LinkAgendamentoDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {open && <ConteudoLinks />}
    </Dialog>
  );
}

function ConteudoLinks() {
  const { user } = useAuth();
  const nomeQ = useNomeDoCorretor(user?.id);
  const qc = useQueryClient();
  const [tela, setTela] = useState<Tela | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);

  const linksQ = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("meus_agendamento_links");
      if (error) throw error;
      return parseAgendamentoLinks(data);
    },
  });
  const links = linksQ.data ?? [];
  // Sem nenhum link, o diálogo já abre no formulário.
  const atual: Tela =
    tela ?? (linksQ.isSuccess && links.length === 0 ? { tipo: "novo" } : { tipo: "lista" });

  const voltarParaLista = (destacar: string | null) => {
    setDestaque(destacar);
    setTela({ tipo: "lista" });
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Meus links de agendamento</DialogTitle>
        <DialogDescription>
          Um link para cada local de visita. O cliente escolhe um horário livre da sua agenda,
          preenche nome, telefone, e-mail e CPF e já entra na sua carteira em Agendado.
        </DialogDescription>
      </DialogHeader>

      {linksQ.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : linksQ.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar os seus links. Feche e abra de novo.
        </p>
      ) : atual.tipo === "lista" ? (
        <ListaDeLinks
          links={links}
          destaque={destaque}
          nomeCorretor={nomeQ.data ?? null}
          onNovo={() => setTela({ tipo: "novo" })}
          onEditar={(link) => setTela({ tipo: "editar", link })}
          onMudou={(lista) => qc.setQueryData(QUERY_KEY, lista)}
        />
      ) : (
        <FormularioDoLink
          key={atual.tipo === "editar" ? atual.link.id : "novo"}
          link={atual.tipo === "editar" ? atual.link : null}
          podeVoltar={links.length > 0}
          onVoltar={() => voltarParaLista(null)}
          onSalvo={(link) => {
            qc.setQueryData<AgendamentoLinkResumo[]>(QUERY_KEY, (lista = []) => [
              link,
              ...lista.filter((l) => l.id !== link.id),
            ]);
            voltarParaLista(link.id);
          }}
        />
      )}
    </DialogContent>
  );
}

function ListaDeLinks({
  links,
  destaque,
  nomeCorretor,
  onNovo,
  onEditar,
  onMudou,
}: {
  links: AgendamentoLinkResumo[];
  destaque: string | null;
  nomeCorretor: string | null;
  onNovo: () => void;
  onEditar: (link: AgendamentoLinkResumo) => void;
  onMudou: (lista: AgendamentoLinkResumo[]) => void;
}) {
  const [confirmar, setConfirmar] = useState<{
    acao: "trocar" | "desativar";
    link: AgendamentoLinkResumo;
  } | null>(null);

  const trocar = useMutation({
    mutationFn: async (link: AgendamentoLinkResumo) => {
      const { data, error } = await supabase.rpc("trocar_agendamento_link", { _link_id: link.id });
      if (error) throw error;
      return { antigo: link.id, novo: parseAgendamentoLinkResumo(data) };
    },
    onSuccess: ({ antigo, novo }) => {
      onMudou(links.map((l) => (l.id === antigo ? novo : l)));
      toast.success("Link novo gerado. O anterior parou de funcionar.");
    },
    onError: (e) => toast.error(mensagemDoErro(e)),
  });

  const desativar = useMutation({
    mutationFn: async (link: AgendamentoLinkResumo) => {
      const { error } = await supabase.rpc("desativar_agendamento_link", { _link_id: link.id });
      if (error) throw error;
      return link.id;
    },
    onSuccess: (id) => {
      onMudou(links.filter((l) => l.id !== id));
      toast.success("Link desativado.");
    },
    onError: (e) => toast.error(mensagemDoErro(e)),
  });

  return (
    <div className="space-y-3">
      <ul className="space-y-2.5" aria-label="Seus links">
        {links.map((link) => (
          <CartaoDoLink
            key={link.id}
            link={link}
            destacado={link.id === destaque}
            nomeCorretor={nomeCorretor}
            onEditar={() => onEditar(link)}
            onTrocar={() => setConfirmar({ acao: "trocar", link })}
            onDesativar={() => setConfirmar({ acao: "desativar", link })}
          />
        ))}
      </ul>

      <Button type="button" variant="outline" className="w-full" onClick={onNovo}>
        <Plus className="mr-1.5 h-4 w-4" /> Novo link para outro local
      </Button>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar?.acao === "trocar" ? "Gerar um link novo?" : "Desativar este link?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.acao === "trocar"
                ? "O link atual para de funcionar na hora — quem tiver o endereço antigo não consegue mais agendar. Use se o link caiu em mãos erradas ou está recebendo agendamentos falsos."
                : "Quem tiver este link não consegue mais agendar. Para voltar a usar o local, crie um link novo."}{" "}
              As visitas já marcadas continuam na agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmar) return;
                if (confirmar.acao === "trocar") trocar.mutate(confirmar.link);
                else desativar.mutate(confirmar.link);
              }}
            >
              {confirmar?.acao === "trocar" ? "Gerar link novo" : "Desativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CartaoDoLink({
  link,
  destacado,
  nomeCorretor,
  onEditar,
  onTrocar,
  onDesativar,
}: {
  link: AgendamentoLinkResumo;
  destacado: boolean;
  nomeCorretor: string | null;
  onEditar: () => void;
  onTrocar: () => void;
  onDesativar: () => void;
}) {
  const url = `${window.location.origin}${link.path}`;
  const titulo = tituloDoLink(link);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  };

  return (
    <li
      aria-label={titulo}
      className={cn(
        "space-y-2 rounded-lg border p-3",
        destacado ? "border-primary bg-primary/5" : "bg-muted/30",
      )}
    >
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{titulo}</p>
          {link.local_nome && link.endereco && (
            <p className="text-xs text-muted-foreground">{link.endereco}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{resumoAgendaDoLink(link)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          aria-label={`Editar o link de ${titulo}`}
          onClick={onEditar}
        >
          <PencilSimple className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <LinkSimple className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          readOnly
          value={url}
          aria-label={`Endereço do link de ${titulo}`}
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copiar()}>
          <Copy className="mr-1.5 h-4 w-4" /> Copiar
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              mensagemConviteAgendamento(url, nomeCorretor, link.local_nome || null),
            )}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <WhatsappLogo className="mr-1.5 h-4 w-4" /> WhatsApp
          </a>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
        <span>
          {link.total_agendamentos === 0
            ? "Nenhum agendamento ainda."
            : `${link.total_agendamentos} agendamento${link.total_agendamentos > 1 ? "s" : ""} pelo link.`}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={onTrocar}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-foreground"
          >
            <ArrowsClockwise className="h-3.5 w-3.5" /> Gerar novo
          </button>
          <button
            type="button"
            onClick={onDesativar}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-destructive"
          >
            <Prohibit className="h-3.5 w-3.5" /> Desativar
          </button>
        </span>
      </div>
    </li>
  );
}

function FormularioDoLink({
  link,
  podeVoltar,
  onVoltar,
  onSalvo,
}: {
  link: AgendamentoLinkResumo | null;
  podeVoltar: boolean;
  onVoltar: () => void;
  onSalvo: (link: AgendamentoLinkResumo) => void;
}) {
  const [config, setConfig] = useState<Config>(() => configDe(link));
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: async (c: Config) => {
      const parsed = configurarAgendamentoLinkSchema.safeParse({
        endereco: c.local.endereco,
        local_id: c.local.localId,
        local_nome: c.local.localNome,
        hora_inicio: c.hora_inicio,
        hora_fim: c.hora_fim,
        dias_semana: c.dias_semana,
        duracao_minutos: c.duracao_minutos,
      });
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Configuração inválida.");
      const args = {
        _endereco: parsed.data.endereco,
        _local_id: parsed.data.local_id ?? "",
        _local_nome: parsed.data.local_nome,
        _hora_inicio: parsed.data.hora_inicio,
        _hora_fim: parsed.data.hora_fim,
        _dias_semana: parsed.data.dias_semana,
        _duracao_minutos: parsed.data.duracao_minutos,
      };
      if (link) {
        const { data, error } = await supabase.rpc("atualizar_agendamento_link", {
          ...args,
          _link_id: link.id,
        });
        if (error) throw error;
        return { link: parseAgendamentoLinkResumo(data), jaExistia: false };
      }
      const { data, error } = await supabase.rpc("criar_agendamento_link", args);
      if (error) throw error;
      return parseLinkCriado(data);
    },
    onSuccess: ({ link: salvo, jaExistia }) => {
      setErro(null);
      if (jaExistia) toast.info("Você já tem um link para este endereço — é este aqui.");
      else toast.success(link ? "Link atualizado" : `Link criado: ${tituloDoLink(salvo)}`);
      onSalvo(salvo);
    },
    onError: (e) => setErro(mensagemDoErro(e)),
  });

  return (
    <div className="space-y-4">
      {podeVoltar && (
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <CaretLeft className="h-4 w-4" /> Meus links
        </button>
      )}

      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <SeletorLocalVisita
          valor={config.local}
          onChange={(local) => setConfig((c) => ({ ...c, local }))}
        />
      </Suspense>

      <div className="grid grid-cols-2 gap-3">
        <SelectHorario
          id="link-hora-inicio"
          rotulo="Primeiro horário"
          valor={config.hora_inicio}
          onChange={(v) => setConfig((c) => ({ ...c, hora_inicio: v }))}
        />
        <SelectHorario
          id="link-hora-fim"
          rotulo="Último horário"
          valor={config.hora_fim}
          onChange={(v) => setConfig((c) => ({ ...c, hora_fim: v }))}
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Dias de atendimento</legend>
        <div className="flex flex-wrap gap-1.5">
          {DIAS_SEMANA.map((rotulo, dia) => {
            const ativo = config.dias_semana.includes(dia);
            return (
              <button
                key={rotulo}
                type="button"
                aria-pressed={ativo}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    dias_semana: ativo
                      ? c.dias_semana.filter((d) => d !== dia)
                      : [...c.dias_semana, dia].sort((a, b) => a - b),
                  }))
                }
                className={cn(
                  "h-9 min-w-11 rounded-md border px-2 text-sm font-medium transition-colors",
                  ativo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {rotulo}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="link-duracao">Duração da visita</Label>
        <Select
          value={String(config.duracao_minutos)}
          onValueChange={(v) => setConfig((c) => ({ ...c, duracao_minutos: Number(v) }))}
        >
          <SelectTrigger id="link-duracao">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DURACOES.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {ROTULO_DURACAO[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Horários que batem com visitas e reuniões da sua agenda não aparecem para o cliente — em
          nenhum dos seus links.
        </p>
      </div>

      {!config.local.endereco.trim() && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Sem local escolhido: o cliente informa o endereço na hora de agendar.
        </p>
      )}
      {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}

      <Button
        type="button"
        className="w-full"
        disabled={salvar.isPending}
        onClick={() => salvar.mutate(config)}
      >
        {salvar.isPending
          ? "Salvando..."
          : link
            ? "Salvar alterações"
            : config.local.localNome
              ? `Criar link para ${config.local.localNome}`
              : "Criar link"}
      </Button>
    </div>
  );
}

function SelectHorario({
  id,
  rotulo,
  valor,
  onChange,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Select value={valor} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {HORARIOS.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
