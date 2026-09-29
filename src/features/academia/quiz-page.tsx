import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle, Clock, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { QueryErrorState } from "@/components/ui/query-error-state";
import type {
  AcademiaQuizEnviarRetorno,
  AcademiaQuizIniciarRetorno,
} from "@/features/academia/tipos";
import { useEnviarQuiz, useIniciarQuiz, useModulo } from "./academia-client";
import { erroAmigavel } from "./erros";
import { listaDeTextos, segundosEmHhMm } from "./formato";
import { EsqueletoAcademia } from "./guard";

/**
 * O gabarito NUNCA existe no navegador antes do envio: academia_quiz_iniciar
 * devolve id, enunciado e alternativas, sem o campo `correta`. A correção só
 * chega na resposta de academia_quiz_enviar, e é dela que a tela de resultado
 * lê. Não há cópia local do que é certo em momento nenhum.
 */
export function QuizPage({ codigo }: { codigo: string }) {
  const modulo = useModulo(codigo);
  const iniciar = useIniciarQuiz();
  const enviar = useEnviarQuiz();
  const navigate = useNavigate();

  const [sessao, setSessao] = useState<AcademiaQuizIniciarRetorno | null>(null);
  const [atual, setAtual] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, number>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<AcademiaQuizEnviarRetorno | null>(null);
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    if (restante === null || resultado) return;
    if (restante <= 0) return;
    const t = setTimeout(() => setRestante((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [restante, resultado]);

  const questoes = useMemo(() => sessao?.questoes ?? [], [sessao]);
  const erroIniciar = iniciar.isError ? erroAmigavel(iniciar.error) : null;
  const erroEnviar = enviar.isError ? erroAmigavel(enviar.error) : null;

  if (modulo.isPending) return <EsqueletoAcademia />;
  if (modulo.isError) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState
          title="Não foi possível carregar o quiz."
          error={modulo.error}
          onRetry={() => void modulo.refetch()}
        />
      </div>
    );
  }

  const dados = modulo.data.modulo;
  const voltar = (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/academia/modulo/$codigo" params={{ codigo }}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        {dados?.titulo ?? "Voltar"}
      </Link>
    </Button>
  );

  // ---- resultado -----------------------------------------------------
  if (resultado) {
    const gabarito = resultado.gabarito ?? [];
    return (
      <div className="p-4 md:p-6">
        <div className="mb-3">{voltar}</div>
        <Card className={resultado.aprovado ? "border-emerald-600/50" : "border-destructive/50"}>
          <CardContent className="py-6 text-center">
            {resultado.aprovado ? (
              <CheckCircle className="mx-auto h-10 w-10 text-emerald-600" weight="fill" />
            ) : (
              <XCircle className="mx-auto h-10 w-10 text-destructive" weight="fill" />
            )}
            <p className="mt-2 font-display text-2xl font-semibold">
              {Number(resultado.nota).toFixed(0)}
            </p>
            <p className="text-sm text-muted-foreground">
              {resultado.acertos} de {resultado.total} certas. Nota mínima: {resultado.nota_minima}.
            </p>
            <p className="mt-2 text-sm font-medium">
              {resultado.aprovado
                ? "Aprovado. O módulo avança."
                : "Ainda não passou. Revise as aulas e tente de novo."}
            </p>
          </CardContent>
        </Card>

        <h2 className="mb-2 mt-6 text-sm font-semibold">Correção</h2>
        <div className="space-y-3">
          {gabarito.map((g, i) => {
            const alternativas = listaDeTextos(g.alternativas);
            const acertou = g.marcada === g.correta;
            return (
              <Card key={g.id}>
                <CardContent className="py-4">
                  <div className="mb-2 flex items-start gap-2">
                    {acertou ? (
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <p className="text-sm font-medium">
                      {i + 1}. {g.enunciado}
                    </p>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {alternativas.map((alt, idx) => (
                      <li
                        key={alt}
                        className={
                          idx === g.correta
                            ? "font-medium text-emerald-700 dark:text-emerald-400"
                            : idx === g.marcada
                              ? "text-destructive line-through"
                              : "text-muted-foreground"
                        }
                      >
                        {alt}
                      </li>
                    ))}
                  </ul>
                  {g.explicacao && (
                    <p className="mt-2 rounded-md bg-muted p-2 text-xs">{g.explicacao}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Button
          className="mt-6 w-full sm:w-auto"
          onClick={() => void navigate({ to: "/academia/modulo/$codigo", params: { codigo } })}
        >
          Voltar ao módulo
        </Button>
      </div>
    );
  }

  // ---- antes de começar ----------------------------------------------
  if (!sessao) {
    return (
      <div className="p-4 md:p-6">
        <div className="mb-3">{voltar}</div>
        <h1 className="font-display text-xl font-semibold tracking-tight">Quiz do módulo</h1>
        <Card className="mt-4">
          <CardContent className="space-y-3 py-5">
            <p className="text-sm text-muted-foreground">
              Uma questão por tela. Dá para voltar e mudar a resposta antes de enviar.
            </p>
            {erroIniciar && (
              <div className="rounded-md border border-destructive/40 p-3">
                <p className="text-sm font-medium">{erroIniciar.titulo}</p>
                <p className="text-xs text-muted-foreground">{erroIniciar.detalhe}</p>
              </div>
            )}
            <Button
              className="w-full sm:w-auto"
              disabled={iniciar.isPending || !dados}
              onClick={() =>
                dados &&
                iniciar.mutate(dados.id, {
                  onSuccess: (s) => {
                    setSessao(s);
                    setRestante(s.tempo_limite_min * 60);
                  },
                })
              }
            >
              {iniciar.isPending ? "Abrindo..." : "Começar o quiz"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- confirmação ----------------------------------------------------
  const semResposta = questoes.filter((q) => respostas[q.id] === undefined).length;
  if (confirmando) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Enviar o quiz?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {semResposta === 0
            ? "Todas as questões respondidas. Depois de enviar não dá para mudar."
            : `${semResposta} questão(ões) sem resposta contam como erradas. Depois de enviar não dá para mudar.`}
        </p>
        {erroEnviar && (
          <div className="mt-4 rounded-md border border-destructive/40 p-3">
            <p className="text-sm font-medium">{erroEnviar.titulo}</p>
            <p className="text-xs text-muted-foreground">{erroEnviar.detalhe}</p>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            disabled={enviar.isPending}
            onClick={() =>
              enviar.mutate(
                { tentativaId: sessao.tentativa_id, respostas },
                { onSuccess: (r) => setResultado(r) },
              )
            }
          >
            {enviar.isPending ? "Enviando..." : "Enviar agora"}
          </Button>
          <Button variant="outline" onClick={() => setConfirmando(false)}>
            Revisar antes
          </Button>
        </div>
      </div>
    );
  }

  // ---- respondendo -----------------------------------------------------
  const q = questoes[atual];
  if (!q) {
    return (
      <div className="p-4 md:p-6">
        <QueryErrorState title="Este quiz voltou sem questões." />
      </div>
    );
  }
  const alternativas = listaDeTextos(q.alternativas);
  const marcada = respostas[q.id];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Questão {atual + 1} de {questoes.length}
        </span>
        {restante !== null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {segundosEmHhMm(restante)}
          </span>
        )}
      </div>
      <Progress className="mb-4" value={((atual + 1) / questoes.length) * 100} />

      <p className="text-base font-medium">{q.enunciado}</p>

      <div className="mt-4 space-y-2">
        {alternativas.map((alt, idx) => (
          <button
            key={alt}
            type="button"
            onClick={() => setRespostas((r) => ({ ...r, [q.id]: idx }))}
            className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
              marcada === idx ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"
            }`}
          >
            {alt}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {atual > 0 && (
          <Button variant="outline" onClick={() => setAtual((i) => i - 1)}>
            Anterior
          </Button>
        )}
        {atual < questoes.length - 1 ? (
          <Button onClick={() => setAtual((i) => i + 1)}>Próxima</Button>
        ) : (
          <Button onClick={() => setConfirmando(true)}>Revisar e enviar</Button>
        )}
      </div>
    </div>
  );
}
