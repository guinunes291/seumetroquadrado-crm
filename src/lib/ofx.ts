// Parser de OFX (SGML e XML) — puro, sem dependências.
// Usado só pela importação de extrato da aba Conciliação.

export type OfxTransacao = {
  fitid: string;
  data: string; // YYYY-MM-DD
  valor: number; // negativo = débito
  descricao: string;
  contraparte: string | null;
};

export type OfxResultado =
  | { ok: true; transacoes: OfxTransacao[] }
  | { ok: false; erro: string };

function tag(bloco: string, nome: string): string | null {
  // Cobre <TAG>valor (SGML) e <TAG>valor</TAG> (XML).
  const re = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i");
  const m = bloco.match(re);
  if (!m) return null;
  const valor = m[1].trim();
  return valor.length ? valor : null;
}

function dataOfx(bruto: string): string | null {
  const m = bruto.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function hashSimples(texto: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  return `h${h1.toString(16)}${h2.toString(16)}`;
}

/** Lê o conteúdo de um arquivo OFX. Recusa qualquer coisa que não seja OFX. */
export function parseOfx(conteudo: string): OfxResultado {
  const texto = (conteudo ?? "").replace(/\uFEFF/g, "");
  if (!texto.trim()) return { ok: false, erro: "arquivo_vazio" };

  const pareceOfx = /OFXHEADER|<OFX>/i.test(texto);
  if (!pareceOfx) {
    return { ok: false, erro: "arquivo_nao_e_ofx" };
  }

  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  if (!blocos.length) return { ok: false, erro: "ofx_sem_transacoes" };

  const transacoes: OfxTransacao[] = [];
  const vistos = new Set<string>();

  for (const bruto of blocos) {
    const bloco = bruto.split(/<\/STMTTRN>/i)[0];
    const dataBruta = tag(bloco, "DTPOSTED") ?? tag(bloco, "DTUSER");
    const data = dataBruta ? dataOfx(dataBruta) : null;
    const valorBruto = tag(bloco, "TRNAMT");
    if (!data || valorBruto == null) continue;

    const valor = Number(valorBruto.replace(/\./g, (m, i, s) =>
      // Formato brasileiro eventual: 1.234,56 → normaliza vírgula decimal.
      s.includes(",") ? "" : m,
    ).replace(",", "."));
    if (!Number.isFinite(valor)) continue;

    const memo = tag(bloco, "MEMO") ?? "";
    const nome = tag(bloco, "NAME");
    const descricao = [nome, memo].filter(Boolean).join(" · ") || "Lançamento";
    const fitidBruto = tag(bloco, "FITID");
    const fitid =
      fitidBruto ?? hashSimples(`${data}|${valor.toFixed(2)}|${descricao}`.toLowerCase());

    // Um mesmo FITID repetido dentro do arquivo entra uma vez só.
    const chave = fitid;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    transacoes.push({
      fitid,
      data,
      valor: Math.round(valor * 100) / 100,
      descricao: descricao.slice(0, 500),
      contraparte: nome ? nome.slice(0, 200) : null,
    });
  }

  if (!transacoes.length) return { ok: false, erro: "ofx_sem_transacoes" };
  return { ok: true, transacoes };
}
