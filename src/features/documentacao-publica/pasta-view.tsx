// A pasta do cliente (/pasta/<token>): a lista de documentos com o andamento
// de cada um e o envio — foto pelo celular ou PDF, um ou vários de uma vez.
// O primeiro arquivo preenche o item que falta; os seguintes entram como
// arquivos a mais do mesmo documento (outro holerite, o verso do RG).

import { useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  Camera,
  CheckCircle,
  Copy,
  FileArrowUp,
  Plus,
  ShareNetwork,
  UserCircle,
  WhatsappLogo,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  agruparItens,
  gruposPendentes,
  mensagemErroDocumentacao,
  type GrupoPasta,
  type PastaPublica,
} from "@/lib/documentacao-link";
import { cn } from "@/lib/utils";
import { DocumentacaoHttpError, enviarArquivoDaPasta, type AlvoDoEnvio } from "./api";
import { prepararArquivo } from "./preparar-arquivo";
import { Alerta } from "./ui";

/** Quantos arquivos de uma vez (uma pasta MCMV inteira cabe com folga). */
const MAX_POR_ESCOLHA = 10;

const ESTADO: Record<GrupoPasta["estado"], { rotulo: string; tom: string }> = {
  falta: { rotulo: "Falta enviar", tom: "border-aviso-500 text-aviso-700" },
  reenviar: { rotulo: "Envie de novo", tom: "border-vermelho-500 text-vermelho-700" },
  enviado: { rotulo: "Enviado", tom: "border-azul-500 text-azul-700" },
  aprovado: { rotulo: "Aprovado", tom: "border-verde-500 text-verde-700" },
};

function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

export function PastaView({
  token,
  pasta,
  onAtualizar,
}: {
  token: string;
  pasta: PastaPublica;
  onAtualizar: () => void;
}) {
  const grupos = useMemo(() => agruparItens(pasta.itens), [pasta.itens]);
  const faltam = gruposPendentes(grupos);
  const prontos = grupos.length - faltam;
  const primeiroNome = pasta.corretor_nome.split(" ")[0];
  const whatsapp = pasta.corretor_whatsapp
    ? `https://wa.me/${pasta.corretor_whatsapp}?text=${encodeURIComponent(
        faltam === 0
          ? "Olá! Enviei os meus documentos pelo link da pasta."
          : "Olá! Estou enviando os meus documentos pelo link e tenho uma dúvida.",
      )}`
    : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-xs font-medium text-aviso-700">Sua pasta de documentos</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              {faltam === 0 ? "Tudo enviado. Obrigado!" : "Envie os seus documentos"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {faltam === 0
                ? `${primeiroNome} vai conferir e te avisar se faltar algo.`
                : "Tire uma foto bem iluminada ou anexe o PDF de cada item. Pode mandar aos poucos."}
            </p>
          </div>
          <div className="flex items-start gap-2.5 text-sm">
            <UserCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Corretor responsável</p>
              <p className="font-medium">{pasta.corretor_nome}</p>
            </div>
          </div>
          {grupos.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-medium">
                  {prontos} de {grupos.length} documentos
                </span>
                <span className="text-muted-foreground">
                  {faltam === 0 ? "completo" : `falta${faltam > 1 ? "m" : ""} ${faltam}`}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  role="progressbar"
                  aria-label="Documentos enviados"
                  aria-valuemin={0}
                  aria-valuemax={grupos.length}
                  aria-valuenow={prontos}
                  className={cn(
                    "h-full rounded-full",
                    faltam === 0 ? "bg-verde-500" : "bg-primary",
                  )}
                  style={{ width: `${(prontos / Math.max(1, grupos.length)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <GuardeOLink expiraEm={pasta.expira_em} />

      <ul className="space-y-3" aria-label="Documentos">
        {grupos.map((g) => (
          <GrupoCard key={g.tipo} grupo={g} token={token} onEnviado={onAtualizar} />
        ))}
        {!grupos.some((g) => g.tipo === "outro") && (
          <GrupoCard
            grupo={{
              tipo: "outro",
              label: "Outro documento",
              estado: "aprovado",
              arquivos: 0,
              alvo: null,
              trocavel: null,
            }}
            extraSomente
            token={token}
            onEnviado={onAtualizar}
          />
        )}
      </ul>

      {whatsapp && (
        <Button asChild variant="outline" className="min-h-12 w-full">
          <a href={whatsapp} target="_blank" rel="noreferrer noopener">
            <WhatsappLogo className="mr-2 h-5 w-5" />
            {faltam === 0 ? `Avisar ${primeiroNome}` : `Dúvida? Fale com ${primeiroNome}`}
          </a>
        </Button>
      )}
    </div>
  );
}

function GuardeOLink({ expiraEm }: { expiraEm: string }) {
  const url = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
  const podeCompartilhar =
    typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Copie o endereço na barra do navegador.");
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-card/60 p-3 text-sm">
      <p>
        <span className="font-medium">Guarde este link.</span> Você pode fechar e voltar depois para
        mandar o que faltar — ele vale até {dataCurta(expiraEm)}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => void copiar()}>
          <Copy className="mr-1.5 h-4 w-4" /> Copiar link
        </Button>
        {podeCompartilhar && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              void navigator.share({ title: "Minha pasta de documentos", url }).catch(() => {})
            }
          >
            <ShareNetwork className="mr-1.5 h-4 w-4" /> Enviar para mim
          </Button>
        )}
      </div>
    </div>
  );
}

type Envio = { atual: number; total: number; progresso: number };

function GrupoCard({
  grupo,
  token,
  onEnviado,
  extraSomente = false,
}: {
  grupo: GrupoPasta;
  token: string;
  onEnviado: () => void;
  /** O cartão "Outro documento" sem itens: só aceita arquivo a mais. */
  extraSomente?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const modo = useRef<"alvo" | "extra" | "trocar">("alvo");
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const escolher = (m: "alvo" | "extra" | "trocar") => {
    modo.current = m;
    if (input.current) {
      input.current.multiple = m !== "trocar";
      input.current.value = "";
      input.current.click();
    }
  };

  const enviarArquivos = async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    const lista = arquivos.slice(0, MAX_POR_ESCOLHA);
    setErro(null);
    setOk(null);
    let enviados = 0;
    for (const [i, arquivo] of lista.entries()) {
      setEnvio({ atual: i + 1, total: lista.length, progresso: 0 });
      // O primeiro preenche o item (ou troca o arquivo); os outros entram a mais.
      const item =
        i === 0 && modo.current === "alvo"
          ? grupo.alvo
          : i === 0 && modo.current === "trocar"
            ? grupo.trocavel
            : null;
      const alvo: AlvoDoEnvio = item ? { documentacaoId: item } : { tipo: grupo.tipo };
      try {
        const { blob, nome } = await prepararArquivo(arquivo);
        await enviarArquivoDaPasta(token, alvo, blob, nome, (p) =>
          setEnvio({ atual: i + 1, total: lista.length, progresso: p }),
        );
        enviados += 1;
      } catch (e) {
        const code =
          e instanceof DocumentacaoHttpError
            ? e.code
            : e instanceof Error && e.message === "arquivo_invalido"
              ? "arquivo_invalido"
              : null;
        setErro(
          code === "network_error"
            ? "A conexão caiu durante o envio. Tente de novo."
            : mensagemErroDocumentacao(code),
        );
        break;
      }
    }
    setEnvio(null);
    if (enviados > 0) {
      setOk(enviados === 1 ? "Arquivo enviado." : `${enviados} arquivos enviados.`);
      onEnviado();
    }
    if (arquivos.length > MAX_POR_ESCOLHA) {
      setErro(`Enviamos os ${MAX_POR_ESCOLHA} primeiros. Escolha os outros em seguida.`);
    }
  };

  const estado = ESTADO[grupo.estado];
  const pede = grupo.estado === "falta" || grupo.estado === "reenviar";

  return (
    <li aria-label={grupo.label}>
      <Card className={cn(pede && "border-aviso-300")}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{grupo.label}</p>
              {grupo.arquivos > 0 && (
                <p className="text-xs text-muted-foreground">
                  {grupo.arquivos} arquivo{grupo.arquivos > 1 ? "s" : ""} enviado
                  {grupo.arquivos > 1 ? "s" : ""}
                </p>
              )}
              {grupo.estado === "reenviar" && (
                <p className="text-xs text-vermelho-700">
                  O corretor pediu para enviar de novo (foto legível e completa).
                </p>
              )}
            </div>
            {!extraSomente && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                  estado.tom,
                )}
              >
                {(grupo.estado === "enviado" || grupo.estado === "aprovado") && (
                  <CheckCircle className="h-3.5 w-3.5" weight="fill" />
                )}
                {estado.rotulo}
              </span>
            )}
          </div>

          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            aria-label={`Arquivo de ${grupo.label}`}
            onChange={(e) => void enviarArquivos(Array.from(e.currentTarget.files ?? []))}
          />

          {envio ? (
            <div className="space-y-1.5" aria-live="polite">
              <p className="text-sm">
                Enviando {envio.total > 1 ? `${envio.atual} de ${envio.total}` : ""}…{" "}
                {Math.round(envio.progresso * 100)}%
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(envio.progresso * 100)}%` }}
                />
              </div>
            </div>
          ) : pede ? (
            <Button type="button" className="min-h-11 w-full" onClick={() => escolher("alvo")}>
              <Camera className="mr-2 h-5 w-5" /> Tirar foto ou anexar PDF
            </Button>
          ) : extraSomente ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => escolher("extra")}
            >
              <FileArrowUp className="mr-2 h-5 w-5" /> Enviar outro documento
            </Button>
          ) : grupo.estado === "enviado" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                onClick={() => escolher("extra")}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Adicionar arquivo
              </Button>
              {grupo.trocavel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-10"
                  onClick={() => escolher("trocar")}
                >
                  <ArrowsClockwise className="mr-1.5 h-4 w-4" /> Trocar o último
                </Button>
              )}
            </div>
          ) : null}

          {ok && !envio && <p className="text-xs font-medium text-verde-700">{ok}</p>}
          {erro && <Alerta>{erro}</Alerta>}
        </CardContent>
      </Card>
    </li>
  );
}
