import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PASTA_TOKEN_RE,
  mensagemErroDocumentacao,
  type PastaPublica,
} from "@/lib/documentacao-link";
import { DocumentacaoHttpError, documentacaoApi } from "@/features/documentacao-publica/api";
import { PastaView } from "@/features/documentacao-publica/pasta-view";
import {
  Alerta,
  Aviso,
  Moldura,
  PaginaSkeleton,
  PerguntasPerfil,
  RESPOSTAS_VAZIAS,
  respostasCompletas,
  type Respostas,
} from "@/features/documentacao-publica/ui";

// A pasta pessoal do cliente (/pasta/<token>): a lista de documentos e o
// envio dos arquivos, aos poucos, por 30 dias. Sem lista ainda (o corretor
// mandou o link pela aba Documentação de um lead sem checklist), a página
// pergunta o perfil de renda primeiro.

export const Route = createFileRoute("/pasta/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sua pasta de documentos — Seu Metro Quadrado" },
      { name: "description", content: "Envie os documentos para a sua análise de crédito." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PastaPage,
});

type PastaResposta = { ok: true } & PastaPublica;

function PastaPage() {
  const { token } = Route.useParams();
  const tokenValido = PASTA_TOKEN_RE.test(token);
  const queryKey = ["pasta-publica", token];

  const pastaQ = useQuery({
    queryKey,
    enabled: tokenValido,
    retry: false,
    queryFn: () => documentacaoApi<PastaResposta>({ action: "pasta", token }),
  });

  const indisponivel =
    !tokenValido || (pastaQ.error instanceof DocumentacaoHttpError && pastaQ.error.status === 404);

  return (
    <Moldura subtitulo="Pasta de documentos">
      {indisponivel ? (
        <Aviso
          titulo="Este link não está mais disponível"
          texto="O prazo do link pode ter acabado ou o corretor gerou um novo. Peça o link atualizado a ele."
        />
      ) : pastaQ.isPending ? (
        <PaginaSkeleton rotulo="Carregando a sua pasta" />
      ) : pastaQ.isError || !pastaQ.data ? (
        <Aviso
          titulo={
            pastaQ.error instanceof DocumentacaoHttpError && pastaQ.error.status === 429
              ? "Muitos acessos agora"
              : "Não foi possível carregar agora"
          }
          texto="Verifique a conexão e tente novamente em instantes."
          acao={
            <Button
              type="button"
              className="min-h-11"
              disabled={pastaQ.isFetching}
              onClick={() => void pastaQ.refetch()}
            >
              {pastaQ.isFetching ? "Tentando novamente..." : "Tentar novamente"}
            </Button>
          }
        />
      ) : pastaQ.data.itens.length === 0 ? (
        <MontarLista token={token} corretorNome={pastaQ.data.corretor_nome} queryKey={queryKey} />
      ) : (
        <PastaView token={token} pasta={pastaQ.data} onAtualizar={() => void pastaQ.refetch()} />
      )}
    </Moldura>
  );
}

function MontarLista({
  token,
  corretorNome,
  queryKey,
}: {
  token: string;
  corretorNome: string;
  queryKey: string[];
}) {
  const qc = useQueryClient();
  const [respostas, setRespostas] = useState<Respostas>(RESPOSTAS_VAZIAS);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: (r: Record<string, unknown>) =>
      documentacaoApi<PastaResposta>({ action: "perfil", token, ...r }),
    onSuccess: (data) => qc.setQueryData(queryKey, data),
    onError: (e) =>
      setErro(mensagemErroDocumentacao(e instanceof DocumentacaoHttpError ? e.code : null)),
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-2 p-5">
          <p className="text-xs font-medium text-aviso-700">Sua pasta de documentos</p>
          <h1 className="text-2xl font-bold tracking-tight">Vamos montar a sua lista</h1>
          <p className="text-sm text-muted-foreground">
            {corretorNome.split(" ")[0]} pediu os seus documentos. Responda e mostramos exatamente o
            que enviar.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-5 p-5">
          <PerguntasPerfil valor={respostas} onChange={setRespostas} />
          {erro && <Alerta>{erro}</Alerta>}
          <Button
            type="button"
            size="lg"
            className="min-h-12 w-full text-base"
            disabled={!respostasCompletas(respostas) || salvar.isPending}
            onClick={() => {
              setErro(null);
              if (respostasCompletas(respostas)) salvar.mutate(respostas);
            }}
          >
            <ListChecks className="mr-2 h-5 w-5" />
            {salvar.isPending ? "Montando..." : "Ver a minha lista"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
