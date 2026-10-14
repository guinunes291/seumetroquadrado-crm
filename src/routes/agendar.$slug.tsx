import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AppleLogo,
  CalendarCheck,
  CheckCircle,
  Clock,
  GoogleLogo,
  MapPin,
  NavigationArrow,
  UserCircle,
  Warning,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AGENDAMENTO_LINK_SLUG_RE,
  LEMBRETES_CLIENTE_MINUTOS,
  agendarPeloLinkSchema,
  chipDia,
  descricaoEventoCliente,
  mensagemErroAgendamento,
  rotuloDia,
  rotuloInstante,
  tituloEventoCliente,
  type AgendamentoConfirmado,
  type AgendamentoLinkPublico,
} from "@/lib/agendamento-link";
import { buildGoogleCalendarUrl } from "@/lib/calendar-links";
import { maskCPF, maskPhoneBR } from "@/lib/masks";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/agendar/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Agende sua visita — Seu Metro Quadrado" },
      { name: "description", content: "Escolha o melhor dia e horário para a sua visita." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AgendarPage,
});

class AgendarHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "AgendarHttpError";
  }
}

async function publicApi<T>(payload: unknown): Promise<T> {
  const response = await fetch("/api/public/agendamento", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const code =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "request_failed";
    throw new AgendarHttpError(response.status, code);
  }
  return data as T;
}

/** Confirmação guardada na aba: recarregar a página não perde os botões de calendário. */
const chaveConfirmacao = (slug: string) => `smq:agendar:${slug}`;

function lerConfirmacao(slug: string): AgendamentoConfirmado | null {
  try {
    const raw = sessionStorage.getItem(chaveConfirmacao(slug));
    return raw ? (JSON.parse(raw) as AgendamentoConfirmado) : null;
  } catch {
    return null;
  }
}

function guardarConfirmacao(slug: string, c: AgendamentoConfirmado | null) {
  try {
    if (c) sessionStorage.setItem(chaveConfirmacao(slug), JSON.stringify(c));
    else sessionStorage.removeItem(chaveConfirmacao(slug));
  } catch {
    // Modo privado sem storage: a confirmação vale só nesta tela.
  }
}

type Campos = {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  endereco: string;
  consentimento: boolean;
  website: string;
};

const CAMPOS_VAZIOS: Campos = {
  nome: "",
  telefone: "",
  email: "",
  cpf: "",
  endereco: "",
  consentimento: false,
  website: "",
};

function AgendarPage() {
  const { slug } = Route.useParams();
  const slugValido = AGENDAMENTO_LINK_SLUG_RE.test(slug);
  // `ssr: false`: o storage já existe no primeiro render — a confirmação
  // aparece direto, sem piscar o formulário nem pedir a agenda à toa.
  const [confirmado, setConfirmado] = useState<AgendamentoConfirmado | null>(() =>
    slugValido ? lerConfirmacao(slug) : null,
  );

  const linkQ = useQuery({
    queryKey: ["agendar-publico", slug],
    enabled: slugValido && !confirmado,
    retry: false,
    queryFn: () => publicApi<{ ok: true } & AgendamentoLinkPublico>({ action: "load", slug }),
  });

  const indisponivel =
    !slugValido || (linkQ.error instanceof AgendarHttpError && linkQ.error.status === 404);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.12),_transparent_42%)] px-4 py-6 md:py-10">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 flex items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl object-contain" />
          <div>
            <p className="text-sm font-semibold">Seu Metro Quadrado</p>
            <p className="text-xs text-muted-foreground">Agendamento de visita</p>
          </div>
        </header>

        {confirmado ? (
          <Confirmacao
            confirmado={confirmado}
            onNovo={() => {
              guardarConfirmacao(slug, null);
              setConfirmado(null);
            }}
          />
        ) : indisponivel ? (
          <Aviso
            titulo="Este link de agendamento não está mais disponível"
            texto="O link pode ter sido trocado pelo corretor. Peça um link novo a ele."
          />
        ) : linkQ.isPending ? (
          <PaginaSkeleton />
        ) : linkQ.isError || !linkQ.data ? (
          <Aviso
            titulo={
              linkQ.error instanceof AgendarHttpError && linkQ.error.status === 429
                ? "Muitos acessos agora"
                : "Não foi possível carregar agora"
            }
            texto="Verifique a conexão e tente novamente em instantes."
            acao={
              <Button
                type="button"
                className="min-h-11"
                disabled={linkQ.isFetching}
                onClick={() => void linkQ.refetch()}
              >
                {linkQ.isFetching ? "Tentando novamente..." : "Tentar novamente"}
              </Button>
            }
          />
        ) : (
          <Formulario
            slug={slug}
            link={linkQ.data}
            onRecarregar={() => void linkQ.refetch()}
            onConfirmado={(c) => {
              guardarConfirmacao(slug, c);
              setConfirmado(c);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        <footer className="mt-10 border-t py-6 text-center text-xs text-muted-foreground">
          Seus dados são usados só para o atendimento da sua visita pela Seu Metro Quadrado.
        </footer>
      </div>
    </main>
  );
}

function Formulario({
  slug,
  link,
  onRecarregar,
  onConfirmado,
}: {
  slug: string;
  link: AgendamentoLinkPublico;
  onRecarregar: () => void;
  onConfirmado: (c: AgendamentoConfirmado) => void;
}) {
  const [dia, setDia] = useState<string | null>(link.disponibilidade[0]?.data ?? null);
  const [horario, setHorario] = useState<string | null>(null);
  const [campos, setCampos] = useState<Campos>(CAMPOS_VAZIOS);
  const [erros, setErros] = useState<Partial<Record<keyof Campos | "horario", string>>>({});
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  // Uma chave por tentativa de agendamento: o reenvio (rede ruim, duplo toque)
  // devolve a mesma visita em vez de criar outra.
  const idempotencia = useRef(crypto.randomUUID());

  const horarios = useMemo(
    () => link.disponibilidade.find((d) => d.data === dia)?.horarios ?? [],
    [link.disponibilidade, dia],
  );

  // A disponibilidade mudou (outro cliente pegou o horário): limpa a escolha.
  useEffect(() => {
    if (horario && !horarios.includes(horario)) setHorario(null);
  }, [horario, horarios]);

  const enviar = useMutation({
    mutationFn: async (dados: Record<string, unknown>) =>
      publicApi<{ ok: true } & AgendamentoConfirmado>({ action: "agendar", ...dados }),
    onSuccess: (data) => {
      const { ok: _ok, ...confirmacao } = data;
      onConfirmado(confirmacao);
    },
    onError: (error) => {
      const code = error instanceof AgendarHttpError ? error.code : null;
      setErroEnvio(mensagemErroAgendamento(code));
      if (code === "horario_indisponivel") {
        setHorario(null);
        onRecarregar();
      }
    },
  });

  const set = <K extends keyof Campos>(k: K, v: Campos[K]) => {
    setCampos((atual) => ({ ...atual, [k]: v }));
    setErros((atual) => ({ ...atual, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErroEnvio(null);
    const payload = {
      slug,
      idempotency_key: idempotencia.current,
      nome: campos.nome,
      telefone: campos.telefone,
      email: campos.email,
      cpf: campos.cpf,
      data: dia ?? "",
      horario: horario ?? "",
      endereco: link.endereco ? undefined : campos.endereco,
      consentimento: campos.consentimento,
      website: campos.website || undefined,
    };
    const parsed = agendarPeloLinkSchema.safeParse(payload);
    const novosErros: typeof erros = {};
    if (!dia || !horario) novosErros.horario = "Escolha o dia e o horário da visita.";
    if (!link.endereco && campos.endereco.trim().length < 5) {
      novosErros.endereco = "Informe o endereço da visita.";
    }
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0];
        if (campo === "consentimento") novosErros.consentimento = "Marque para continuar.";
        else if (campo === "nome" || campo === "telefone" || campo === "email" || campo === "cpf") {
          novosErros[campo] ??=
            issue.message && !issue.message.startsWith("Invalid")
              ? issue.message
              : "Confira este campo.";
        }
      }
    }
    if (Object.keys(novosErros).length > 0) {
      setErros(novosErros);
      return;
    }
    enviar.mutate(payload);
  };

  const semHorarios = link.disponibilidade.length === 0;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-xs font-medium text-aviso-700">Agende sua visita</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              Escolha o melhor dia e horário
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Leva menos de 1 minuto. No final, você salva a visita na sua agenda do celular.
            </p>
          </div>
          <dl className="space-y-2 text-sm">
            <Linha icon={UserCircle} rotulo="Corretor responsável">
              {link.corretor_nome}
            </Linha>
            {link.endereco && (
              <Linha icon={MapPin} rotulo="Local da visita">
                {link.endereco}
              </Linha>
            )}
            <Linha icon={Clock} rotulo="Duração">
              {link.duracao_minutos} minutos
            </Linha>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">1. Dia e horário</h2>
          {semHorarios ? (
            <p className="text-sm text-muted-foreground">
              Não há horários livres nos próximos 30 dias. Fale direto com {link.corretor_nome}.
            </p>
          ) : (
            <>
              <div
                role="radiogroup"
                aria-label="Dia da visita"
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
              >
                {link.disponibilidade.map((d) => {
                  const chip = chipDia(d.data);
                  const ativo = d.data === dia;
                  return (
                    <button
                      key={d.data}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      aria-label={rotuloDia(d.data)}
                      onClick={() => {
                        setDia(d.data);
                        setErros((atual) => ({ ...atual, horario: undefined }));
                      }}
                      className={cn(
                        "flex min-h-14 min-w-[64px] shrink-0 flex-col items-center justify-center rounded-lg border px-2 text-sm transition-colors",
                        ativo
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-accent",
                      )}
                    >
                      <span className="text-xs">{chip.semana}</span>
                      <span className="font-semibold tabular-nums">{chip.dia}</span>
                    </button>
                  );
                })}
              </div>
              {dia && (
                <p className="text-sm font-medium first-letter:uppercase">{rotuloDia(dia)}</p>
              )}
              <div
                role="radiogroup"
                aria-label="Horário da visita"
                className="grid grid-cols-3 gap-2 sm:grid-cols-4"
              >
                {horarios.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={h === horario}
                    onClick={() => {
                      setHorario(h);
                      setErros((atual) => ({ ...atual, horario: undefined }));
                    }}
                    className={cn(
                      "min-h-11 rounded-lg border text-sm font-semibold tabular-nums transition-colors",
                      h === horario
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Horário de Brasília.</p>
            </>
          )}
          {erros.horario && <Erro>{erros.horario}</Erro>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">2. Seus dados</h2>
          <Campo id="ag-nome" rotulo="Nome completo" erro={erros.nome}>
            <Input
              id="ag-nome"
              autoComplete="name"
              value={campos.nome}
              maxLength={120}
              onChange={(e) => set("nome", e.target.value)}
            />
          </Campo>
          <Campo id="ag-telefone" rotulo="Telefone (WhatsApp)" erro={erros.telefone}>
            <Input
              id="ag-telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 98765-4321"
              value={campos.telefone}
              onChange={(e) => set("telefone", maskPhoneBR(e.target.value))}
            />
          </Campo>
          <Campo id="ag-email" rotulo="E-mail" erro={erros.email}>
            <Input
              id="ag-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={campos.email}
              maxLength={160}
              onChange={(e) => set("email", e.target.value)}
            />
          </Campo>
          <Campo id="ag-cpf" rotulo="CPF" erro={erros.cpf}>
            <Input
              id="ag-cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={campos.cpf}
              onChange={(e) => set("cpf", maskCPF(e.target.value))}
            />
          </Campo>
          {!link.endereco && (
            <Campo id="ag-endereco" rotulo="Endereço da visita" erro={erros.endereco}>
              <Input
                id="ag-endereco"
                autoComplete="street-address"
                value={campos.endereco}
                maxLength={300}
                onChange={(e) => set("endereco", e.target.value)}
              />
            </Campo>
          )}
          <Campo id="ag-corretor" rotulo="Corretor responsável">
            <Input id="ag-corretor" value={link.corretor_nome} readOnly disabled />
          </Campo>

          {/* Honeypot: invisível para pessoas, preenchido por robôs. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="ag-website">Site</label>
            <input
              id="ag-website"
              tabIndex={-1}
              autoComplete="off"
              value={campos.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
            <Checkbox
              id="ag-consentimento"
              checked={campos.consentimento}
              onCheckedChange={(v) => set("consentimento", v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="ag-consentimento" className="text-sm font-normal leading-snug">
              Autorizo a Seu Metro Quadrado a usar estes dados para agendar e confirmar a minha
              visita e entrar em contato comigo sobre ela.
            </Label>
          </div>
          {erros.consentimento && <Erro>{erros.consentimento}</Erro>}
        </CardContent>
      </Card>

      {erroEnvio && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-aviso-300 bg-aviso-50 p-3 text-sm text-aviso-900"
        >
          <Warning className="mt-0.5 h-4 w-4 shrink-0" />
          {erroEnvio}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="min-h-12 w-full text-base"
        disabled={enviar.isPending || semHorarios}
      >
        <CalendarCheck className="mr-2 h-5 w-5" />
        {enviar.isPending ? "Agendando..." : "Confirmar agendamento"}
      </Button>
    </form>
  );
}

function ehIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function Confirmacao({
  confirmado,
  onNovo,
}: {
  confirmado: AgendamentoConfirmado;
  onNovo: () => void;
}) {
  const evento = {
    titulo: tituloEventoCliente(confirmado.corretor_nome),
    inicio: confirmado.inicio,
    fim: confirmado.fim,
    local: confirmado.endereco,
    descricao: descricaoEventoCliente(confirmado),
    lembretesMinutos: LEMBRETES_CLIENTE_MINUTOS,
  };
  const google = buildGoogleCalendarUrl(evento);
  const ics = `/api/public/agendamento-ics?c=${encodeURIComponent(confirmado.comprovante)}`;
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(confirmado.endereco)}`;
  const whatsapp = confirmado.corretor_whatsapp
    ? `https://wa.me/${confirmado.corretor_whatsapp}?text=${encodeURIComponent(
        `Olá! Acabei de agendar uma visita pelo seu link para ${rotuloInstante(confirmado.inicio)}.`,
      )}`
    : null;
  // No iPhone o .ics abre direto no Calendário; no Android, o Google Agenda.
  const iosPrimeiro = ehIos();

  const botaoIcs = (
    <a
      key="ics"
      href={ics}
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
        iosPrimeiro
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border hover:bg-accent",
      )}
    >
      <AppleLogo className="h-5 w-5" /> iPhone, Outlook e outros (.ics)
    </a>
  );
  const botaoGoogle = (
    <a
      key="google"
      href={google}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
        iosPrimeiro
          ? "border hover:bg-accent"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      <GoogleLogo className="h-5 w-5" /> Google Agenda
    </a>
  );

  return (
    <div className="space-y-5">
      <Card className="border-t-4 border-t-exito-500">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-10 w-10 shrink-0 text-exito-600" weight="fill" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Visita agendada!</h1>
              <p className="text-sm text-muted-foreground">
                {confirmado.corretor_nome} já recebeu o seu agendamento.
              </p>
            </div>
          </div>
          <dl className="space-y-2 text-sm">
            <Linha icon={CalendarCheck} rotulo="Quando">
              <span className="first-letter:uppercase">{rotuloInstante(confirmado.inicio)}</span>
            </Linha>
            <Linha icon={MapPin} rotulo="Onde">
              {confirmado.endereco}
            </Linha>
            <Linha icon={UserCircle} rotulo="Corretor responsável">
              {confirmado.corretor_nome}
            </Linha>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-5">
          <h2 className="font-semibold">Salve na sua agenda para não esquecer</h2>
          <p className="text-sm text-muted-foreground">
            O arquivo da agenda já vem com dois lembretes: <strong>1 dia antes</strong> e{" "}
            <strong>5 horas antes</strong> da visita.
          </p>
          <div className="space-y-2">
            {iosPrimeiro ? [botaoIcs, botaoGoogle] : [botaoGoogle, botaoIcs]}
          </div>
          <p className="text-xs text-muted-foreground">
            No Google Agenda, os lembretes seguem o padrão da sua agenda: depois de salvar, toque em
            "Adicionar notificação" e escolha 1 dia e 5 horas antes.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors hover:bg-accent"
          >
            <WhatsappLogo className="h-5 w-5" /> Falar com o corretor
          </a>
        )}
        <a
          href={mapa}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors hover:bg-accent"
        >
          <NavigationArrow className="h-5 w-5" /> Ver no mapa
        </a>
      </div>

      <button
        type="button"
        onClick={onNovo}
        className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Agendar outra visita
      </button>
    </div>
  );
}

function Linha({
  icon: Icon,
  rotulo,
  children,
}: {
  icon: typeof MapPin;
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{rotulo}</dt>
        <dd className="font-medium leading-snug break-words">{children}</dd>
      </div>
    </div>
  );
}

function Campo({
  id,
  rotulo,
  erro,
  children,
}: {
  id: string;
  rotulo: string;
  erro?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro && <Erro>{erro}</Erro>}
    </div>
  );
}

function Erro({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium text-destructive">{children}</p>;
}

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4 py-12 text-center">
        <Warning className="mx-auto h-10 w-10 text-aviso-600" />
        <div>
          <h1 className="text-xl font-semibold">{titulo}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
        </div>
        {acao}
      </CardContent>
    </Card>
  );
}

function PaginaSkeleton() {
  return (
    <div className="space-y-5" aria-label="Carregando agenda">
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
