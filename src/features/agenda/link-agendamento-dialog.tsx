// "Meu link de agendamento" — o link fixo do corretor (estilo Calendly).
//
// O corretor copia o link (ou manda direto no WhatsApp), define o endereço da
// visita e a faixa de horários. O cliente que abre o link escolhe um horário
// livre, preenche os dados e já cai na carteira dele em Agendado, com a visita
// na agenda (migration 20261022120000). Gerar um link novo derruba o antigo
// na hora — a saída para link que caiu em spam.

import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowsClockwise, Copy, LinkSimple, WhatsappLogo } from "@phosphor-icons/react";
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
import { Input } from "@/components/ui/input";
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
  type AgendamentoLinkResumo,
} from "@/lib/agendamento-link";
import { cn } from "@/lib/utils";

// RPCs do link de agendamento ainda fora dos tipos gerados (migration pendente).
type RpcSolto = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;

const QUERY_KEY = ["meu-agendamento-link"] as const;
const HORARIOS = opcoesDeHorario();
const DURACOES = [30, 60, 90, 120] as const;
const ROTULO_DURACAO: Record<(typeof DURACOES)[number], string> = {
  30: "30 minutos",
  60: "1 hora",
  90: "1h30",
  120: "2 horas",
};

type Config = {
  endereco: string;
  hora_inicio: string;
  hora_fim: string;
  dias_semana: number[];
  duracao_minutos: number;
};

function configDe(link: AgendamentoLinkResumo | null): Config {
  if (!link)
    return {
      ...AGENDAMENTO_LINK_DEFAULTS,
      dias_semana: [...AGENDAMENTO_LINK_DEFAULTS.dias_semana],
    };
  return {
    endereco: link.endereco,
    hora_inicio: link.hora_inicio,
    hora_fim: link.hora_fim,
    dias_semana: link.dias_semana,
    duracao_minutos: link.duracao_minutos,
  };
}

export function LinkAgendamentoDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      {open && <ConteudoLink />}
    </Dialog>
  );
}

function ConteudoLink() {
  const { user } = useAuth();
  const nomeQ = useNomeDoCorretor(user?.id);
  const qc = useQueryClient();
  const [confirmarTroca, setConfirmarTroca] = useState(false);

  const linkQ = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as RpcSolto)("meu_agendamento_link");
      if (error) throw error;
      return parseAgendamentoLinkResumo(data);
    },
  });

  const [config, setConfig] = useState<Config>(() => configDe(null));
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (linkQ.isSuccess) setConfig(configDe(linkQ.data));
  }, [linkQ.isSuccess, linkQ.data]);

  const salvar = useMutation({
    mutationFn: async (c: Config) => {
      const parsed = configurarAgendamentoLinkSchema.safeParse(c);
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message ?? "Configuração inválida.");
      const { data, error } = await (supabase.rpc as unknown as RpcSolto)("salvar_meu_agendamento_link", {
        _endereco: parsed.data.endereco,
        _hora_inicio: parsed.data.hora_inicio,
        _hora_fim: parsed.data.hora_fim,
        _dias_semana: parsed.data.dias_semana,
        _duracao_minutos: parsed.data.duracao_minutos,
      });
      if (error) throw new Error("Não foi possível salvar o link. Tente de novo.");
      return parseAgendamentoLinkResumo(data);
    },
    onSuccess: (link) => {
      setErro(null);
      qc.setQueryData(QUERY_KEY, link);
      toast.success(linkQ.data ? "Link atualizado" : "Seu link de agendamento está pronto");
    },
    onError: (e) => setErro(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const trocar = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as RpcSolto)("gerar_novo_agendamento_link");
      if (error) throw error;
      return parseAgendamentoLinkResumo(data);
    },
    onSuccess: (link) => {
      qc.setQueryData(QUERY_KEY, link);
      toast.success("Link novo gerado. O anterior parou de funcionar.");
    },
    onError: () => toast.error("Não foi possível gerar um link novo."),
  });

  const link = linkQ.data ?? null;
  const url = link ? `${window.location.origin}${link.path}` : null;

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Meu link de agendamento</DialogTitle>
        <DialogDescription>
          O cliente escolhe um horário livre da sua agenda, preenche nome, telefone, e-mail e CPF e
          já entra na sua carteira em Agendado, com a visita marcada aqui.
        </DialogDescription>
      </DialogHeader>

      {linkQ.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : linkQ.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar o seu link. Feche e abra de novo.
        </p>
      ) : (
        <div className="space-y-5">
          {link && url && (
            <section aria-label="Seu link" className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <LinkSimple className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  readOnly
                  value={url}
                  aria-label="Endereço do seu link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => void copiar()}>
                  <Copy className="mr-1.5 h-4 w-4" /> Copiar
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      mensagemConviteAgendamento(url, nomeQ.data ?? null),
                    )}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <WhatsappLogo className="mr-1.5 h-4 w-4" /> WhatsApp
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {link.total_agendamentos === 0
                  ? "Nenhum agendamento pelo link ainda."
                  : `${link.total_agendamentos} agendamento${link.total_agendamentos > 1 ? "s" : ""} pelo link.`}
              </p>
            </section>
          )}

          <section aria-label="Configuração" className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="link-endereco">Endereço da visita</Label>
              <Input
                id="link-endereco"
                value={config.endereco}
                maxLength={300}
                placeholder="Ex.: Stand do Residencial Aurora — Av. Paulista, 1000"
                onChange={(e) => setConfig((c) => ({ ...c, endereco: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Aparece para o cliente e vai para o evento da agenda dele. Em branco, o cliente
                informa o endereço.
              </p>
            </div>

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
                        ativo
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent",
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
                Horários que batem com visitas e reuniões da sua agenda não aparecem para o cliente.
              </p>
            </div>

            {erro && <p className="text-sm font-medium text-destructive">{erro}</p>}

            <Button
              type="button"
              className="w-full"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate(config)}
            >
              {salvar.isPending ? "Salvando..." : link ? "Salvar alterações" : "Criar meu link"}
            </Button>
          </section>

          {link && (
            <div className="border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={trocar.isPending}
                onClick={() => setConfirmarTroca(true)}
              >
                <ArrowsClockwise className="mr-1.5 h-4 w-4" /> Gerar um link novo
              </Button>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmarTroca} onOpenChange={setConfirmarTroca}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar um link novo?</AlertDialogTitle>
            <AlertDialogDescription>
              O link atual para de funcionar na hora — quem tiver o endereço antigo não consegue
              mais agendar. Use se o link caiu em mãos erradas ou está recebendo agendamentos
              falsos. As visitas já marcadas continuam na agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => trocar.mutate()}>Gerar link novo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
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
