// Modelo do comparativo em PDF — puro (testado em tests/comparativo-pdf.test.ts).
//
// O documento vai para o CLIENTE (WhatsApp), então o que entra aqui é filtrado
// de propósito:
//   • cliente só pelo PRIMEIRO nome, sem telefone nem qualquer outro dado;
//   • nada interno: comissão, disponibilidade, argumentos de venda, observações;
//   • imagem só com URL https (capa, galeria e plantas).
// O HTML (comparativo-pdf.ts) só formata o que este modelo decidiu mostrar.

import type { ProjetoRow } from "@/components/projeto-card";
import { imagemExibivel } from "@/lib/imagem-url";
import type { PlantaProjeto } from "@/lib/plantas";
import {
  formatBRL,
  formatDormsRange,
  formatEntrega,
  formatM2Range,
  formatVagasRange,
} from "@/lib/projetos";
import { GRANDE_SP, zonaDoProjeto } from "@/lib/zonas";
import {
  avaliarEncaixe,
  perfilTemDados,
  resumoDoPerfil,
  type Encaixe,
  type PerfilComparativo,
} from "./encaixe";

export const COMPARATIVO_MAX_FOTOS = 4;
export const COMPARATIVO_MAX_DIFERENCIAIS = 14;
export const COMPARATIVO_MAX_PLANTAS = 6;

export type ProjetoParaComparativo = ProjetoRow & { plantas?: PlantaProjeto[] };

export type EntradaComparativo = {
  /** Nome completo do lead (só o primeiro nome vai para o PDF). */
  clienteNome: string | null;
  corretor: { nome: string | null; telefone: string | null; creci?: string | null };
  perfil: PerfilComparativo | null;
  projetos: ProjetoParaComparativo[];
  /** Mensagem do corretor para o cliente (capa). */
  mensagem: string;
  /** "Por que indico este", por id de projeto. */
  notasPorProjeto: Record<string, string>;
  geradoEm: Date;
};

export type ProjetoComparativo = {
  id: string;
  nome: string;
  construtora: string | null;
  local: string;
  endereco: string | null;
  preco: string;
  dorms: string;
  metragem: string;
  vagas: string;
  entrega: string;
  renda: string;
  suites: string | null;
  capa: string | null;
  fotos: string[];
  diferenciais: string[];
  plantas: Array<{ url: string; legenda: string | null }>;
  encaixe: Encaixe | null;
  nota: string | null;
};

export type Comparativo = {
  titulo: string;
  clientePrimeiroNome: string | null;
  corretor: { nome: string | null; telefone: string | null; creci: string | null };
  dataLabel: string;
  mensagem: string | null;
  resumoPerfil: string[];
  temPerfil: boolean;
  projetos: ProjetoComparativo[];
};

const A_CONFIRMAR = "A confirmar";

/** Só http(s) seguro entra como <img> no documento. */
export function urlImagemSegura(url: string | null | undefined): string | null {
  const u = imagemExibivel(url);
  if (!u) return null;
  return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
}

export function primeiroNome(nome: string | null | undefined): string | null {
  const p = (nome ?? "").trim().split(/\s+/)[0];
  if (!p) return null;
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

const texto = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t ? t : null;
};

function localDe(p: ProjetoRow): string {
  const zona = zonaDoProjeto(p);
  const zonaTxt = zona ? (zona === GRANDE_SP ? "Grande SP" : `Zona ${zona}`) : null;
  const cidade = p.cidade && !/^s[aã]o paulo$/i.test(p.cidade.trim()) ? p.cidade.trim() : null;
  return [texto(p.bairro), cidade, zonaTxt].filter(Boolean).join(" · ") || A_CONFIRMAR;
}

function enderecoDe(p: ProjetoRow): string | null {
  const rua = texto(p.logradouro);
  if (rua) return [rua, texto(p.numero)].filter(Boolean).join(", ");
  return texto(p.endereco);
}

function projetoComparativo(
  p: ProjetoParaComparativo,
  perfil: PerfilComparativo | null,
  nota: string | null,
): ProjetoComparativo {
  const capa = urlImagemSegura(p.capa_url);
  const fotos: string[] = [];
  for (const g of p.galeria_urls ?? []) {
    const u = urlImagemSegura(g);
    if (u && u !== capa && !fotos.includes(u)) fotos.push(u);
    if (fotos.length >= COMPARATIVO_MAX_FOTOS) break;
  }
  const diferenciais = Array.from(
    new Set(
      (p.diferenciais ?? []).map((d) => (typeof d === "string" ? d.trim() : "")).filter(Boolean),
    ),
  ).slice(0, COMPARATIVO_MAX_DIFERENCIAIS);
  const plantas = (p.plantas ?? [])
    .map((pl) => ({ url: urlImagemSegura(pl.url), legenda: texto(pl.legenda) }))
    .filter((pl): pl is { url: string; legenda: string | null } => pl.url != null)
    .slice(0, COMPARATIVO_MAX_PLANTAS);

  return {
    id: p.id,
    nome: p.nome,
    construtora: texto(p.construtora),
    local: localDe(p),
    endereco: enderecoDe(p),
    preco:
      p.sob_consulta || p.preco_a_partir == null
        ? "Sob consulta"
        : `A partir de ${formatBRL(p.preco_a_partir)}`,
    dorms: formatDormsRange(p.dorms_min, p.dorms_max) ?? A_CONFIRMAR,
    metragem: formatM2Range(p.metragem_min, p.metragem_max) ?? A_CONFIRMAR,
    vagas: formatVagasRange(p.vagas_min, p.vagas_max, p.vagas_observacao) ?? A_CONFIRMAR,
    entrega: formatEntrega(p.status_entrega, p.mes_entrega, p.ano_entrega) ?? A_CONFIRMAR,
    renda: p.renda_minima == null ? A_CONFIRMAR : formatBRL(p.renda_minima),
    suites: p.suites ? `${p.suites} ${p.suites === 1 ? "suíte" : "suítes"}` : null,
    capa,
    fotos,
    diferenciais,
    plantas,
    encaixe: avaliarEncaixe(perfil, p),
    nota,
  };
}

export function montarComparativo(e: EntradaComparativo): Comparativo {
  const nome = primeiroNome(e.clienteNome);
  const data = e.geradoEm;
  const dataLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(data);
  const dataArquivo = data.toISOString().slice(0, 10);
  const temPerfil = perfilTemDados(e.perfil);
  return {
    titulo: nome
      ? `Comparativo de empreendimentos – ${nome} – ${dataArquivo}`
      : `Comparativo de empreendimentos – ${dataArquivo}`,
    clientePrimeiroNome: nome,
    corretor: {
      nome: texto(e.corretor.nome),
      telefone: texto(e.corretor.telefone),
      creci: texto(e.corretor.creci ?? null),
    },
    dataLabel,
    mensagem: texto(e.mensagem),
    resumoPerfil: temPerfil ? resumoDoPerfil(e.perfil) : [],
    temPerfil,
    projetos: e.projetos.map((p) =>
      projetoComparativo(p, temPerfil ? e.perfil : null, texto(e.notasPorProjeto[p.id])),
    ),
  };
}
