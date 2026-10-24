import Link from "next/link";
import { listarCriativos, resumoBiblioteca, type Criativo, type Filtro } from "@/lib/criativos";
import { listar } from "@/lib/empreendimentos";
import { contaAnuncios } from "@/lib/meta";
import { verificarTexto, temPreco } from "@/lib/compliance";
import { CUSTO_TETO, VOLUME_MINIMO, ehVencedor } from "@/lib/biblioteca";
import { dataCurta, dataHora, moeda, numero } from "@/lib/formato";
import { BotaoSincronizarCriativos } from "@/components/botao-sincronizar-criativos";
import { acaoMarcar, acaoNota } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIPOS: Record<string, string> = {
  video: "Vídeo",
  imagem: "Imagem",
  carrossel: "Carrossel",
  outro: "Outro",
};
const RESULTADO: Record<string, string> = {
  lead_form: "leads",
  conversa_whatsapp: "conversas",
  nenhum: "resultados",
};

type Busca = {
  emp?: string;
  tipo?: string;
  ordem?: string;
  fav?: string;
  ocultos?: string;
  ar?: string;
};

function Marcar({
  c,
  campo,
  valor,
  rotulo,
}: {
  c: Criativo;
  campo: string;
  valor: boolean;
  rotulo: string;
}) {
  return (
    <form action={acaoMarcar}>
      <input type="hidden" name="ad_id" value={c.ad_id} />
      <input type="hidden" name="campo" value={campo} />
      <input type="hidden" name="valor" value={valor ? "sim" : "nao"} />
      <button className="rounded border border-navy/15 px-2 py-1 text-xs text-navy hover:bg-creme">
        {rotulo}
      </button>
    </form>
  );
}

function Cartao({ c, empNome }: { c: Criativo; empNome: string | null }) {
  const texto = [c.titulo, c.texto].filter(Boolean).join("\n");
  const problemas = texto ? verificarTexto(texto) : [];
  const preco = texto ? temPreco(texto) : false;
  const vencedor = ehVencedor(c.resultados, c.custo_por_resultado);
  const foto = c.imagem ?? c.miniatura;
  const unidade = RESULTADO[c.tipo_resultado ?? "nenhum"] ?? "resultados";
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-lg bg-white ring-1 ${vencedor ? "ring-2 ring-aurum" : "ring-navy/10"}`}
    >
      <div className="relative aspect-square bg-creme">
        {foto ? (
          // Miniaturas vêm do CDN da Meta com endereço assinado; não passam pelo otimizador.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-cinza">
            sem miniatura
          </div>
        )}
        <span className="absolute left-2 top-2 rounded bg-navy/80 px-2 py-0.5 text-xs text-creme">
          {TIPOS[c.tipo]}
        </span>
        {vencedor && (
          <span className="absolute right-2 top-2 rounded bg-aurum px-2 py-0.5 text-xs font-bold text-navy">
            Vencedor
          </span>
        )}
        {c.favorito && (
          <span className="absolute bottom-2 right-2 rounded bg-white px-2 py-0.5 text-xs text-navy">
            ★ Favorito
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4 text-sm">
        <p className="font-semibold leading-snug text-navy">{c.nome}</p>
        <p className="text-xs text-cinza">
          {empNome ?? "Empreendimento não identificado"} ·{" "}
          {c.status === "ACTIVE" ? "no ar" : "parado"}
          {c.criado_na_meta ? ` · desde ${dataCurta(c.criado_na_meta)}` : ""}
        </p>
        <dl className="grid grid-cols-3 gap-2 rounded-md bg-creme p-2 text-center text-xs">
          <div>
            <dt className="text-cinza">Gasto</dt>
            <dd className="font-semibold text-navy">{moeda(c.gasto)}</dd>
          </div>
          <div>
            <dt className="text-cinza">{unidade[0].toUpperCase() + unidade.slice(1)}</dt>
            <dd className="font-semibold text-navy">{numero(c.resultados)}</dd>
          </div>
          <div>
            <dt className="text-cinza">Custo cada</dt>
            <dd
              className={`font-semibold ${c.custo_por_resultado !== null && c.custo_por_resultado > CUSTO_TETO ? "text-alerta" : "text-navy"}`}
            >
              {c.custo_por_resultado !== null ? moeda(c.custo_por_resultado) : "sem"}
            </dd>
          </div>
        </dl>
        {c.ctr !== null && (
          <p className="text-xs text-cinza">CTR {String(c.ctr).replace(".", ",")}%</p>
        )}
        {texto && (
          <details className="text-xs">
            <summary className="cursor-pointer text-navy">Ver texto do anúncio</summary>
            <p className="mt-2 whitespace-pre-line text-cinza">{texto}</p>
          </details>
        )}
        {problemas.map((p) => (
          <p key={p.regra} className="text-xs text-alerta">
            Fora das regras: {p.regra} (“{p.trecho}”)
          </p>
        ))}
        {preco && (
          <p className="text-xs text-alerta">
            Cita valor: confira com a tabela oficial antes de reusar.
          </p>
        )}
        {c.nota && <p className="rounded bg-aurum/10 p-2 text-xs text-navy">{c.nota}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          <Marcar
            c={c}
            campo="favorito"
            valor={!c.favorito}
            rotulo={c.favorito ? "Tirar favorito" : "Favoritar"}
          />
          <Marcar
            c={c}
            campo="oculto"
            valor={!c.oculto}
            rotulo={c.oculto ? "Mostrar de novo" : "Esconder"}
          />
          {c.campaign_id && (
            <Link
              href={`/campanhas/nova?modelo=${c.campaign_id}`}
              className="rounded border border-navy/15 px-2 py-1 text-xs text-navy hover:bg-creme"
            >
              Usar como modelo
            </Link>
          )}
          <a
            href={`https://adsmanager.facebook.com/adsmanager/manage/ads?act=${contaAnuncios()}&selected_ad_ids=${c.ad_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-navy/15 px-2 py-1 text-xs text-navy hover:bg-creme"
          >
            Ver na Meta
          </a>
          {c.link_publicacao && (
            <a
              href={c.link_publicacao}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-navy/15 px-2 py-1 text-xs text-navy hover:bg-creme"
            >
              Ver no Instagram
            </a>
          )}
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-cinza">Anotar</summary>
          <form action={acaoNota} className="mt-2 space-y-2">
            <input type="hidden" name="ad_id" value={c.ad_id} />
            <textarea
              name="nota"
              rows={2}
              defaultValue={c.nota ?? ""}
              maxLength={500}
              className="w-full rounded border border-navy/20 p-2"
            />
            <button className="rounded bg-navy px-2 py-1 text-creme">Salvar nota</button>
          </form>
        </details>
      </div>
    </article>
  );
}

export default async function Biblioteca({ searchParams }: { searchParams: Promise<Busca> }) {
  const b = await searchParams;
  const filtro: Filtro = {
    empreendimento: Number(b.emp) || undefined,
    tipo: b.tipo && b.tipo in TIPOS ? b.tipo : undefined,
    ordem:
      (["custo", "resultados", "gasto", "recentes"] as const).find((o) => o === b.ordem) ?? "custo",
    favoritos: b.fav === "1",
    ocultos: b.ocultos === "1",
    noAr: b.ar === "1",
  };
  const [lista, resumo, emps] = await Promise.all([
    listarCriativos(filtro),
    resumoBiblioteca(),
    listar(),
  ]);
  const nomes = new Map(emps.map((e) => [e.id, e.nome]));
  const vencedores = lista.filter((c) => ehVencedor(c.resultados, c.custo_por_resultado)).length;
  const sel = "rounded-md border border-navy/20 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl">Biblioteca de criativos</h1>
          <p className="mt-1 text-sm text-cinza">
            Todos os anúncios que já gastaram, com o resultado de todo o período. Vencedor é quem
            tem pelo menos {VOLUME_MINIMO} resultados a até {moeda(CUSTO_TETO)} cada. Favoritar,
            esconder e anotar ficam só aqui: nada muda na Meta.
          </p>
          <p className="mt-1 text-xs text-cinza">
            {resumo.ultima
              ? `${numero(resumo.com_gasto)} anúncios com gasto · atualizado em ${dataHora(resumo.ultima)}`
              : "Ainda não lido. Clique em Atualizar da Meta."}
          </p>
        </div>
        <BotaoSincronizarCriativos habilitado={Boolean(process.env.META_ACCESS_TOKEN)} />
      </section>

      <form className="flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 ring-1 ring-navy/10">
        <label className="text-xs text-cinza">
          Empreendimento
          <select name="emp" defaultValue={b.emp ?? ""} className={`mt-1 block ${sel}`}>
            <option value="">Todos</option>
            {emps.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-cinza">
          Formato
          <select name="tipo" defaultValue={filtro.tipo ?? ""} className={`mt-1 block ${sel}`}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-cinza">
          Ordenar por
          <select name="ordem" defaultValue={filtro.ordem} className={`mt-1 block ${sel}`}>
            <option value="custo">Menor custo (com volume)</option>
            <option value="resultados">Mais resultados</option>
            <option value="gasto">Mais gasto</option>
            <option value="recentes">Mais recentes</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="ar" value="1" defaultChecked={filtro.noAr} /> Só no ar
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="fav" value="1" defaultChecked={filtro.favoritos} /> Só
          favoritos
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="ocultos" value="1" defaultChecked={filtro.ocultos} /> Ver
          escondidos
        </label>
        <button className="rounded-md bg-aurum px-3 py-1.5 text-sm font-semibold text-navy">
          Filtrar
        </button>
      </form>

      {lista.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-sm text-cinza ring-1 ring-navy/10">
          Nenhum anúncio com esse filtro.
        </p>
      ) : (
        <>
          <p className="text-sm text-cinza">
            {numero(lista.length)} anúncios
            {lista.length === 120 ? " (mostrando os 120 primeiros)" : ""} · {numero(vencedores)}{" "}
            vencedores
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {lista.map((c) => (
              <Cartao
                key={c.ad_id}
                c={c}
                empNome={c.empreendimento_id ? (nomes.get(c.empreendimento_id) ?? null) : null}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
