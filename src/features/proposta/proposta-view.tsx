import { CalendarCheck, MapPin, WhatsappLogo } from "@phosphor-icons/react";
import type { PropostaSnapshot } from "@/lib/proposta-link";
import { cn } from "@/lib/utils";

// Página do cliente (Link de Proposta). Mesmo componente na página pública e
// na prévia do editor. Cada bloco leva data-secao para o tracking por seção.

export type EventoProposta = "clique_whatsapp" | "clique_mapa" | "visita_pedida" | "fluxo_visto";

type Props = {
  snapshot: PropostaSnapshot;
  blocos: string[];
  expiraEm?: string | null;
  agendarSlug?: string | null;
  onEvento?: (tipo: EventoProposta, secao: string) => void;
  /** Na prévia os links não abrem e o botão fixo fica dentro do quadro. */
  previa?: boolean;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function dataLonga(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
}

export function linkWhatsappCorretor(s: PropostaSnapshot, texto?: string) {
  if (!s.corretor.whatsapp) return null;
  const msg =
    texto ?? `Oi, ${s.corretor.nome.split(" ")[0]}! Vi a apresentação do ${s.projeto.nome} e queria conversar.`;
  return `https://wa.me/${s.corretor.whatsapp}?text=${encodeURIComponent(msg)}`;
}

function Eyebrow({ n, children }: { n: number; children: string }) {
  return (
    <p className="font-smq-display text-[11px] font-semibold uppercase tracking-[0.28em] text-smq-dourado">
      {String(n).padStart(2, "0")} <span className="mx-2 inline-block h-px w-6 align-middle bg-smq-dourado/60" />
      {children}
    </p>
  );
}

function Secao({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  return (
    <section data-secao={id} className={cn("px-6 py-16 sm:px-10 sm:py-24", className)}>
      <div className="mx-auto max-w-2xl">{children}</div>
    </section>
  );
}

export function PropostaView({ snapshot: s, blocos, expiraEm, agendarSlug, onEvento, previa }: Props) {
  const wa = linkWhatsappCorretor(s);
  const alvo = previa ? undefined : "_blank";
  let n = 0;
  const mapa = s.projeto.endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.projeto.endereco)}`
    : null;

  const render = (b: string) => {
    switch (b) {
      case "capa":
        return (
          <header
            key={b}
            data-secao="capa"
            className="relative flex min-h-[88svh] flex-col justify-end overflow-hidden bg-smq-marinho text-smq-creme"
          >
            {s.projeto.capa_url && (
              <img
                src={s.projeto.capa_url}
                alt={s.projeto.nome}
                className="absolute inset-0 h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-smq-marinho via-smq-marinho/70 to-smq-marinho/10" />
            <div className="relative px-6 pb-14 pt-32 sm:px-10 sm:pb-20">
              <div className="mx-auto max-w-2xl">
                <p className="font-smq-display text-[11px] font-semibold uppercase tracking-[0.32em] text-smq-dourado">
                  {s.modelo === "proposta" ? "Proposta preparada para" : "Apresentação preparada para"}
                </p>
                <p className="mt-3 font-smq-display text-2xl font-semibold">{s.cliente_primeiro_nome}</p>
                <h1 className="mt-8 font-smq-display text-5xl font-bold leading-[1.02] tracking-tight sm:text-7xl">
                  {s.projeto.nome}
                </h1>
                {s.projeto.construtora && (
                  <p className="mt-4 font-smq-body text-base text-smq-creme/80">{s.projeto.construtora}</p>
                )}
                <div className="mt-10 h-px w-16 bg-smq-dourado" />
                <p className="mt-4 font-smq-body text-sm text-smq-creme/80">
                  Com carinho, {s.corretor.nome.split(" ")[0]}
                </p>
              </div>
            </div>
          </header>
        );
      case "corretor":
        return null; // rodapé fixo da página
      case "empreendimento":
        n++;
        return (
          <Secao key={b} id="empreendimento" className="bg-smq-creme">
            <Eyebrow n={n}>O empreendimento</Eyebrow>
            <h2 className="mt-6 font-smq-display text-3xl font-bold leading-tight text-smq-marinho sm:text-4xl">
              Um lugar pensado para a sua próxima fase.
            </h2>
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 font-smq-body">
              {s.projeto.entrega && (
                <div>
                  <dt className="text-xs uppercase tracking-widest text-smq-tinta-suave">Entrega</dt>
                  <dd className="mt-2 font-smq-display text-xl font-semibold text-smq-marinho">{s.projeto.entrega}</dd>
                </div>
              )}
              {s.modelo === "proposta" && s.projeto.preco_a_partir != null && (
                <div>
                  <dt className="text-xs uppercase tracking-widest text-smq-tinta-suave">A partir de</dt>
                  <dd className="mt-2 font-smq-display text-xl font-semibold text-smq-marinho">
                    {brl(s.projeto.preco_a_partir)}
                  </dd>
                </div>
              )}
              {s.projeto.construtora && (
                <div>
                  <dt className="text-xs uppercase tracking-widest text-smq-tinta-suave">Construtora</dt>
                  <dd className="mt-2 font-smq-display text-xl font-semibold text-smq-marinho">{s.projeto.construtora}</dd>
                </div>
              )}
            </dl>
            {s.projeto.fotos.length > 0 && (
              <div className="-mx-6 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 sm:-mx-10 sm:px-10">
                {s.projeto.fotos.map((f) => (
                  <img
                    key={f}
                    src={f}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-72 w-[80%] shrink-0 snap-center rounded-sm object-cover sm:w-[70%]"
                  />
                ))}
              </div>
            )}
          </Secao>
        );
      case "diferenciais":
        n++;
        return (
          <Secao key={b} id="diferenciais" className="bg-smq-papel">
            <Eyebrow n={n}>Diferenciais</Eyebrow>
            <ul className="mt-8 font-smq-body">
              {s.projeto.diferenciais.map((d) => (
                <li key={d} className="flex gap-5 border-b border-smq-dourado/25 py-5 text-lg leading-snug text-smq-tinta">
                  <span className="mt-3 h-px w-5 shrink-0 bg-smq-dourado" />
                  {d}
                </li>
              ))}
            </ul>
          </Secao>
        );
      case "localizacao":
        n++;
        return (
          <Secao key={b} id="localizacao" className="bg-smq-creme">
            <Eyebrow n={n}>Localização</Eyebrow>
            <p className="mt-6 font-smq-display text-2xl font-semibold leading-snug text-smq-marinho sm:text-3xl">
              {s.projeto.endereco}
            </p>
            {mapa && (
              <a
                href={previa ? undefined : mapa}
                target={alvo}
                rel="noreferrer"
                onClick={() => onEvento?.("clique_mapa", "localizacao")}
                className="mt-8 inline-flex items-center gap-2 border-b border-smq-dourado pb-1 font-smq-body text-sm font-medium text-smq-marinho"
              >
                <MapPin className="h-4 w-4" weight="fill" aria-hidden /> Ver no mapa
              </a>
            )}
          </Secao>
        );
      case "plantas":
        n++;
        return (
          <Secao key={b} id="plantas" className="bg-smq-papel">
            <Eyebrow n={n}>Plantas</Eyebrow>
            <div className="mt-8 space-y-10">
              {s.plantas.map((p) => (
                <figure key={p.imagem_url}>
                  <img
                    src={p.imagem_url}
                    alt={p.titulo}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full rounded-sm bg-smq-creme object-contain"
                  />
                  <figcaption className="mt-4 flex items-baseline justify-between font-smq-body">
                    <span className="font-smq-display text-lg font-semibold text-smq-marinho">{p.titulo}</span>
                    {p.metragem && <span className="text-sm text-smq-tinta-suave">{p.metragem} m²</span>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Secao>
        );
      case "unidade":
        if (!s.unidade) return null;
        n++;
        return (
          <Secao key={b} id="unidade" className="bg-smq-creme">
            <Eyebrow n={n}>Sua unidade</Eyebrow>
            <p className="mt-6 font-smq-display text-5xl font-bold text-smq-marinho">{s.unidade.identificacao}</p>
            <p className="mt-3 font-smq-body text-lg text-smq-tinta-suave">
              {[s.unidade.tipologia, s.unidade.metragem ? `${s.unidade.metragem} m²` : null].filter(Boolean).join(" · ")}
            </p>
            {s.unidade.planta_url && (
              <img src={s.unidade.planta_url} alt="" className="mt-8 w-full rounded-sm object-contain" />
            )}
          </Secao>
        );
      case "fluxo":
        n++;
        return (
          <Secao key={b} id="fluxo" className="bg-smq-papel">
            <Eyebrow n={n}>Fluxo de pagamento</Eyebrow>
            <div className="mt-8 space-y-6">
              {s.fluxos.map((f, i) => (
                <article key={i} className="border border-smq-dourado/40 bg-smq-papel p-6">
                  <p className="font-smq-display text-xs font-semibold uppercase tracking-[0.24em] text-smq-dourado">
                    Opção {i + 1}
                  </p>
                  <h3 className="mt-2 font-smq-display text-xl font-bold text-smq-marinho">{f.titulo}</h3>
                  <p className="mt-4 font-smq-display text-3xl font-bold text-smq-marinho">{brl(f.valor_total)}</p>
                  <dl className="mt-6 space-y-3 font-smq-body text-sm text-smq-tinta">
                    {f.ato > 0 && <Linha k="Ato" v={brl(f.ato)} />}
                    {f.mensais && f.mensais.quantidade > 0 && (
                      <Linha k="Mensais" v={`${f.mensais.quantidade}x de ${brl(f.mensais.valor)}`} />
                    )}
                    {f.anuais && f.anuais.quantidade > 0 && (
                      <Linha k="Anuais" v={`${f.anuais.quantidade}x de ${brl(f.anuais.valor)}`} />
                    )}
                    {f.fgts ? <Linha k="FGTS" v={brl(f.fgts)} /> : null}
                    {f.subsidio ? <Linha k="Subsídio" v={brl(f.subsidio)} /> : null}
                    {f.financiamento > 0 && <Linha k="Financiamento" v={brl(f.financiamento)} />}
                  </dl>
                </article>
              ))}
            </div>
          </Secao>
        );
      case "validade":
        if (!expiraEm) return null;
        n++;
        return (
          <Secao key={b} id="validade" className="bg-smq-creme">
            <Eyebrow n={n}>Validade</Eyebrow>
            <p className="mt-6 font-smq-display text-2xl font-semibold text-smq-marinho">
              Condições válidas até {dataLonga(expiraEm)}.
            </p>
            <p className="mt-4 font-smq-body text-sm leading-relaxed text-smq-tinta-suave">
              Valores sujeitos à análise de crédito e à disponibilidade da unidade. Esta proposta não substitui o contrato.
            </p>
          </Secao>
        );
      case "visita": {
        n++;
        const agendar = agendarSlug ? `/agendar/${agendarSlug}` : null;
        const destino = agendar ?? linkWhatsappCorretor(s, `Oi, ${s.corretor.nome.split(" ")[0]}! Quero agendar uma visita ao ${s.projeto.nome}.`);
        return (
          <Secao key={b} id="visita" className="bg-smq-marinho text-smq-creme">
            <Eyebrow n={n}>Sua visita</Eyebrow>
            <h2 className="mt-6 font-smq-display text-4xl font-bold leading-tight sm:text-5xl">
              Ver de perto muda tudo.
            </h2>
            <p className="mt-5 font-smq-body text-base leading-relaxed text-smq-creme/80">
              Escolha o melhor dia e eu preparo tudo para te receber.
            </p>
            {destino && (
              <a
                href={previa ? undefined : destino}
                target={agendar ? undefined : alvo}
                rel="noreferrer"
                onClick={() => onEvento?.("visita_pedida", "visita")}
                className="mt-10 inline-flex w-full items-center justify-center gap-3 bg-smq-dourado px-6 py-5 font-smq-display text-base font-bold text-smq-marinho transition-opacity hover:opacity-90 sm:w-auto"
              >
                {agendar ? <CalendarCheck className="h-5 w-5" aria-hidden /> : <WhatsappLogo className="h-5 w-5" aria-hidden />}
                Confirme o dia e horário da sua visita
              </a>
            )}
          </Secao>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="font-smq-body bg-smq-creme text-smq-tinta">
      {blocos.map(render)}
      <footer data-secao="corretor" className="bg-smq-marinho px-6 pb-28 pt-16 text-smq-creme sm:px-10">
        <div className="mx-auto flex max-w-2xl items-center gap-5">
          {s.corretor.foto_url ? (
            <img
              src={s.corretor.foto_url}
              alt={s.corretor.nome}
              className="h-16 w-16 rounded-full border border-smq-dourado object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-smq-dourado font-smq-display text-xl font-bold text-smq-dourado">
              {s.corretor.nome.charAt(0)}
            </div>
          )}
          <div>
            <p className="font-smq-display text-[11px] uppercase tracking-[0.28em] text-smq-dourado">Seu corretor</p>
            <p className="mt-1 font-smq-display text-lg font-semibold">{s.corretor.nome}</p>
            {s.corretor.creci && <p className="text-xs text-smq-creme/70">CRECI {s.corretor.creci}</p>}
          </div>
        </div>
        <p className="mx-auto mt-12 max-w-2xl font-smq-display text-xs tracking-[0.3em] text-smq-creme/50">
          SEU METRO QUADRADO
        </p>
      </footer>
      {wa && (
        <a
          href={previa ? undefined : wa}
          target={alvo}
          rel="noreferrer"
          onClick={() => onEvento?.("clique_whatsapp", "corretor")}
          aria-label={`Falar com ${s.corretor.nome} no WhatsApp`}
          className={cn(
            "z-40 flex items-center gap-2 rounded-full bg-smq-marinho px-4 py-3 font-smq-body text-sm font-medium text-smq-creme shadow-lg ring-1 ring-smq-dourado/60",
            previa ? "sticky bottom-4 ml-auto mr-4 w-fit" : "fixed bottom-5 right-5",
          )}
        >
          <WhatsappLogo className="h-5 w-5 text-smq-dourado" weight="fill" aria-hidden />
          Falar com {s.corretor.nome.split(" ")[0]}
        </a>
      )}
    </div>
  );
}

function Linha({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-smq-dourado/20 pb-2">
      <dt className="text-smq-tinta-suave">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
