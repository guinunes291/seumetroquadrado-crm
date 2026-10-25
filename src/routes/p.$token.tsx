import { createFileRoute } from "@tanstack/react-router";
import { WhatsappLogo } from "@phosphor-icons/react";
import { obterPropostaPublica } from "@/lib/proposta-publica.functions";
import { blocosVisiveis } from "@/lib/proposta-link";
import { PropostaView, linkWhatsappCorretor } from "@/features/proposta/proposta-view";
import { usePropostaTracking } from "@/features/proposta/use-proposta-tracking";

export const Route = createFileRoute("/p/$token")({
  loader: ({ params }) => obterPropostaPublica({ data: { token: params.token } }),
  head: ({ loaderData }) => {
    const ok = loaderData && "snapshot" in loaderData ? loaderData : null;
    const titulo = ok
      ? `${ok.snapshot.projeto.nome} para ${ok.snapshot.cliente_primeiro_nome}`
      : "Seu Metro Quadrado";
    const desc = ok
      ? ok.modelo === "proposta"
        ? `Sua proposta preparada por ${ok.snapshot.corretor.nome.split(" ")[0]}.`
        : `Uma apresentação preparada por ${ok.snapshot.corretor.nome.split(" ")[0]} para você conhecer antes da visita.`
      : "Link preparado pelo seu corretor.";
    const capa = ok?.snapshot.projeto.capa_url;
    const img = capa && /^https:\/\//.test(capa) ? capa : null;
    return {
      meta: [
        { title: titulo },
        { name: "description", content: desc },
        { property: "og:title", content: titulo },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: img ? "summary_large_image" : "summary" },
        ...(img ? [{ property: "og:image", content: img }, { name: "twitter:image", content: img }] : []),
        { name: "robots", content: "noindex, nofollow, noarchive" },
        { name: "referrer", content: "no-referrer" },
        { name: "theme-color", content: "#0F1E3A" },
      ],
      links: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Montserrat:wght@600;700&display=swap",
        },
      ],
    };
  },
  component: PaginaProposta,
});

function PaginaProposta() {
  const dados = Route.useLoaderData();
  const { token } = Route.useParams();
  const ativa = dados.estado === "ativa" || dados.estado === "aceita";
  const { evento } = usePropostaTracking(token, ativa);

  if (!("snapshot" in dados) || dados.estado === "expirada") {
    const snap = "snapshot" in dados ? dados.snapshot : null;
    const wa = snap ? linkWhatsappCorretor(snap, `Oi, ${snap.corretor.nome.split(" ")[0]}! Tentei abrir o link do ${snap.projeto.nome} e ele expirou.`) : null;
    const texto =
      dados.estado === "expirada"
        ? "Este link chegou ao fim da validade. Fale com seu corretor e ele prepara uma versão atualizada para você."
        : dados.estado === "limite"
          ? "Muita gente abriu este link agora. Tente de novo em um minuto."
          : "Este link não está mais disponível. Seu corretor pode te enviar um novo quando quiser.";
    return (
      <main className="flex min-h-svh items-center bg-smq-marinho px-6 font-smq-body text-smq-creme">
        <div className="mx-auto max-w-md">
          <p className="font-smq-display text-[11px] uppercase tracking-[0.32em] text-smq-dourado">Seu Metro Quadrado</p>
          <h1 className="mt-6 font-smq-display text-4xl font-bold leading-tight">
            {dados.estado === "limite" ? "Um instante." : "Que bom te ver por aqui."}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-smq-creme/80">{texto}</p>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="mt-10 inline-flex items-center gap-3 bg-smq-dourado px-6 py-4 font-smq-display font-bold text-smq-marinho"
            >
              <WhatsappLogo className="h-5 w-5" aria-hidden /> Falar com {snap!.corretor.nome.split(" ")[0]}
            </a>
          )}
        </div>
      </main>
    );
  }

  return (
    <main>
      <PropostaView
        snapshot={dados.snapshot}
        blocos={blocosVisiveis(dados.snapshot)}
        expiraEm={dados.expira_em}
        agendarSlug={dados.agendar_slug}
        onEvento={(tipo, secao) => evento(tipo, secao)}
      />
    </main>
  );
}
