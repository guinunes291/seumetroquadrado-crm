import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, FolderSimple, UserCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOCUMENTACAO_LINK_SLUG_RE,
  PASTA_TOKEN_RE,
  iniciarDocumentacaoSchema,
  mensagemErroDocumentacao,
} from "@/lib/documentacao-link";
import { maskCPF, maskPhoneBR } from "@/lib/masks";
import { DocumentacaoHttpError, documentacaoApi } from "@/features/documentacao-publica/api";
import {
  Alerta,
  Aviso,
  Campo,
  Erro,
  Moldura,
  PaginaSkeleton,
  PerguntasPerfil,
  RESPOSTAS_VAZIAS,
  respostasCompletas,
  type Respostas,
} from "@/features/documentacao-publica/ui";

// Link FIXO de documentação do corretor (/documentos/<slug>). O cliente
// informa os dados e o perfil de renda; o servidor acha ou cria o lead na
// carteira do corretor (Em atendimento), monta a lista de documentos e abre a
// pasta pessoal (/pasta/<token>), para onde a página segue.

export const Route = createFileRoute("/documentos/$slug")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Envie seus documentos — Seu Metro Quadrado" },
      { name: "description", content: "Envie os documentos para a sua análise de crédito." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: DocumentosPage,
});

/** A pasta já aberta neste aparelho: quem volta pelo link fixo continua de onde parou. */
const chavePasta = (slug: string) => `smq:documentos:${slug}`;

function lerPasta(slug: string): string | null {
  try {
    const t = localStorage.getItem(chavePasta(slug));
    return t && PASTA_TOKEN_RE.test(t) ? t : null;
  } catch {
    return null;
  }
}

function guardarPasta(slug: string, token: string) {
  try {
    localStorage.setItem(chavePasta(slug), token);
  } catch {
    // Modo privado sem storage: o link da pasta continua valendo.
  }
}

type Campos = {
  nome: string;
  telefone: string;
  email: string;
  cpf: string;
  consentimento: boolean;
  website: string;
};

const CAMPOS_VAZIOS: Campos = {
  nome: "",
  telefone: "",
  email: "",
  cpf: "",
  consentimento: false,
  website: "",
};

function DocumentosPage() {
  const { slug } = Route.useParams();
  const slugValido = DOCUMENTACAO_LINK_SLUG_RE.test(slug);
  const [pastaAnterior] = useState(() => (slugValido ? lerPasta(slug) : null));

  const linkQ = useQuery({
    queryKey: ["documentos-publico", slug],
    enabled: slugValido,
    retry: false,
    queryFn: () => documentacaoApi<{ ok: true; corretor_nome: string }>({ action: "link", slug }),
  });

  const indisponivel =
    !slugValido || (linkQ.error instanceof DocumentacaoHttpError && linkQ.error.status === 404);

  return (
    <Moldura subtitulo="Envio de documentos">
      {indisponivel ? (
        <Aviso
          titulo="Este link não está mais disponível"
          texto="O link pode ter sido trocado pelo corretor. Peça um link novo a ele."
        />
      ) : linkQ.isPending ? (
        <PaginaSkeleton rotulo="Carregando" />
      ) : linkQ.isError || !linkQ.data ? (
        <Aviso
          titulo={
            linkQ.error instanceof DocumentacaoHttpError && linkQ.error.status === 429
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
          corretorNome={linkQ.data.corretor_nome}
          pastaAnterior={pastaAnterior}
        />
      )}
    </Moldura>
  );
}

function Formulario({
  slug,
  corretorNome,
  pastaAnterior,
}: {
  slug: string;
  corretorNome: string;
  pastaAnterior: string | null;
}) {
  const navigate = useNavigate();
  const [campos, setCampos] = useState<Campos>(CAMPOS_VAZIOS);
  const [respostas, setRespostas] = useState<Respostas>(RESPOSTAS_VAZIAS);
  const [erros, setErros] = useState<Partial<Record<keyof Campos | "perfil", string>>>({});
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const abrirPasta = (token: string) =>
    void navigate({ to: "/pasta/$token", params: { token }, replace: true });

  const enviar = useMutation({
    mutationFn: (dados: Record<string, unknown>) =>
      documentacaoApi<{ ok: true; token: string }>({ action: "iniciar", ...dados }),
    onSuccess: ({ token }) => {
      guardarPasta(slug, token);
      abrirPasta(token);
    },
    onError: (error) => {
      setErroEnvio(
        mensagemErroDocumentacao(error instanceof DocumentacaoHttpError ? error.code : null),
      );
    },
  });

  const set = <K extends keyof Campos>(k: K, v: Campos[K]) => {
    setCampos((atual) => ({ ...atual, [k]: v }));
    setErros((atual) => ({ ...atual, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErroEnvio(null);
    const novosErros: typeof erros = {};
    if (!respostasCompletas(respostas)) {
      novosErros.perfil = "Responda as perguntas para montarmos a sua lista.";
    }
    const payload = {
      slug,
      nome: campos.nome,
      telefone: campos.telefone,
      email: campos.email,
      cpf: campos.cpf,
      ...respostas,
      consentimento: campos.consentimento,
      website: campos.website || undefined,
    };
    const parsed = iniciarDocumentacaoSchema.safeParse(payload);
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

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-xs font-medium text-aviso-700">Análise de crédito</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Envie os seus documentos</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Responda rapidinho e a gente monta a lista certa para o seu perfil. Depois é só tirar
              foto pelo celular — dá para mandar aos poucos.
            </p>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <UserCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Corretor responsável</p>
              <p className="font-medium">{corretorNome}</p>
            </div>
          </div>
          {pastaAnterior && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full justify-between"
              onClick={() =>
                void navigate({ to: "/pasta/$token", params: { token: pastaAnterior } })
              }
            >
              <span className="flex items-center gap-2">
                <FolderSimple className="h-4 w-4" /> Já comecei: continuar a minha pasta
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">1. Seus dados</h2>
          <Campo id="doc-nome" rotulo="Nome completo" erro={erros.nome}>
            <Input
              id="doc-nome"
              autoComplete="name"
              value={campos.nome}
              maxLength={120}
              onChange={(e) => set("nome", e.target.value)}
            />
          </Campo>
          <Campo id="doc-telefone" rotulo="Telefone (WhatsApp)" erro={erros.telefone}>
            <Input
              id="doc-telefone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 98765-4321"
              value={campos.telefone}
              onChange={(e) => set("telefone", maskPhoneBR(e.target.value))}
            />
          </Campo>
          <Campo id="doc-email" rotulo="E-mail" erro={erros.email}>
            <Input
              id="doc-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={campos.email}
              maxLength={160}
              onChange={(e) => set("email", e.target.value)}
            />
          </Campo>
          <Campo id="doc-cpf" rotulo="CPF" erro={erros.cpf}>
            <Input
              id="doc-cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={campos.cpf}
              onChange={(e) => set("cpf", maskCPF(e.target.value))}
            />
          </Campo>

          {/* Honeypot: invisível para pessoas, preenchido por robôs. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="doc-website">Site</label>
            <input
              id="doc-website"
              tabIndex={-1}
              autoComplete="off"
              value={campos.website}
              onChange={(e) => set("website", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="font-semibold">2. Sua renda</h2>
          <PerguntasPerfil
            valor={respostas}
            onChange={(r) => {
              setRespostas(r);
              setErros((atual) => ({ ...atual, perfil: undefined }));
            }}
            erro={erros.perfil}
          />
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
        <Checkbox
          id="doc-consentimento"
          checked={campos.consentimento}
          onCheckedChange={(v) => set("consentimento", v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="doc-consentimento" className="text-sm font-normal leading-snug">
          Autorizo a Seu Metro Quadrado a usar estes dados e os documentos que eu enviar para o meu
          atendimento e a minha análise de crédito, e a entrar em contato comigo sobre eles.
        </Label>
      </div>
      {erros.consentimento && <Erro>{erros.consentimento}</Erro>}

      {erroEnvio && <Alerta>{erroEnvio}</Alerta>}

      <Button
        type="submit"
        size="lg"
        className="min-h-12 w-full text-base"
        disabled={enviar.isPending}
      >
        <FolderSimple className="mr-2 h-5 w-5" />
        {enviar.isPending ? "Abrindo a sua pasta..." : "Continuar para os documentos"}
      </Button>
    </form>
  );
}
