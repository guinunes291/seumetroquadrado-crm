// Papel SDR (pré-venda) — vocabulário e regras PURAS, espelho testável do que
// vive no banco (migrations 20260904*). A decisão real é sempre do Postgres:
// o trigger sdr_guarda_qualificado barra o "qualificado" sem os campos, e as
// RPCs agendar_visita_sdr / entregar_lead_sdr aplicam a régua de etapa. Aqui
// é a mesma régua para a UI explicar ANTES de bater na RPC — nunca uma
// segunda fonte de verdade.

import type { LeadStatus } from "@/lib/leads";
import { ZONAS_REGIAO, type ZonaProjeto } from "@/lib/zonas";

// ---------------------------------------------------------------------------
// Zona de interesse (decisão do dono, 05/10/2026): o lead que o SDR agenda ou
// entrega precisa da zona em que o cliente tem interesse, escolhida no
// registro — a roleta entrega só a quem atende a zona. O banco recusa sem
// ela (SQLSTATE SMQZ2, migration 20261010120900); aqui a tela trava antes.
// ---------------------------------------------------------------------------

/** Código do Postgres para "zona de interesse obrigatória". */
export const ZONA_SDR_ERRCODE = "SMQZ2";

/** As zonas que o SDR pode escolher (as mesmas seis do banco). */
export const ZONAS_SDR: readonly ZonaProjeto[] = ZONAS_REGIAO;

export function zonaInteresseValida(z: string | null | undefined): z is ZonaProjeto {
  return !!z && (ZONAS_REGIAO as readonly string[]).includes(z);
}

/** O erro do banco quando a zona faltou (para a tela apontar o campo). */
export function erroZonaObrigatoria(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: string }).code === ZONA_SDR_ERRCODE;
}

/** Etapas em que o lead ainda está "na mão" do SDR (funil reutilizado). */
export const SDR_ETAPAS_BASE = [
  "aguardando_atendimento",
  "em_atendimento",
  "aguardando_retorno",
  "qualificado",
] as const satisfies readonly LeadStatus[];

export type SdrEtapa = (typeof SDR_ETAPAS_BASE)[number];

export const SDR_ETAPA_LABEL: Record<SdrEtapa, string> = {
  aguardando_atendimento: "Sem contato",
  em_atendimento: "Em conversa",
  aguardando_retorno: "Aguardando retorno",
  qualificado: "Qualificado",
};

export type LeadParaQualificar = {
  renda_informada?: string | null;
  renda_estimada?: number | null;
  tipo_renda?: string | null;
  decisor?: string | null;
  sdr_interesse_confirmado?: boolean | null;
};

/**
 * O que ainda falta para o SDR marcar o lead como qualificado (decisão:
 * campos + interesse confirmado). Lista vazia = pode qualificar. Mesma ordem
 * das mensagens do trigger sdr_guarda_qualificado.
 */
export function requisitosQualificado(lead: LeadParaQualificar): string[] {
  const faltam: string[] = [];
  if (!lead.sdr_interesse_confirmado) faltam.push("Interesse confirmado");
  const temRenda = (lead.renda_informada ?? "").trim() !== "" || (lead.renda_estimada ?? 0) > 0;
  if (!temRenda) faltam.push("Renda");
  if ((lead.tipo_renda ?? "").trim() === "") faltam.push("Tipo de renda");
  if ((lead.decisor ?? "").trim() === "") faltam.push("Quem decide");
  return faltam;
}

/** Lead encerrado não é agendado nem entregue pelo SDR. */
const ENCERRADOS: readonly string[] = ["perdido", "contrato_fechado", "pos_venda"];

/** Agendar visita: qualquer etapa viva antes da entrega (a RPC passa a caixa
 *  de entrada por em_atendimento sozinha). */
export function podeAgendarSdr(status: string, entregueEm: string | null | undefined): boolean {
  if (entregueEm) return false;
  return !ENCERRADOS.includes(status);
}

/** Entrega manual com motivo: só depois do primeiro contato. */
export function podeEntregarSdr(status: string, entregueEm: string | null | undefined): boolean {
  if (entregueEm) return false;
  if (ENCERRADOS.includes(status)) return false;
  return !["novo", "aguardando_corretor", "aguardando_atendimento"].includes(status);
}

/** Motivo da entrega manual: mesmo mínimo da RPC (5 caracteres). */
export function motivoEntregaValido(motivo: string): boolean {
  return motivo.trim().length >= 5;
}

/** Regras do motor, para a timeline e o histórico dizerem o que aconteceu. */
export const SDR_REGRA_LABEL: Record<string, string> = {
  roleta_sdr: "Roleta de agendados do SDR",
  roleta_sdr_zona: "Time da zona do cliente",
  sdr_prioridade_corretor_original: "Prioridade do corretor original",
  sdr_retorno_corretor_origem: "Voltou ao corretor que falou com o cliente nos últimos dias",
  espelho_adicionado: "Espelho adicionado pelo admin",
  espelho_substituido: "Dono substituído pelo admin",
  "base_sdr:estoque": "Estoque sem dono → base do SDR",
  "base_sdr:perdido": "Perdido reciclado → base do SDR",
  "sdr_devolucao:no_show": "Devolvido ao SDR (não compareceu)",
  "sdr_devolucao:posse_sdr": "Devolvido ao SDR (corretor parado)",
  "sdr_devolucao:manual_admin": "Devolvido ao SDR (admin)",
};

export function sdrRegraLabel(regra: string | null | undefined): string {
  if (!regra) return "—";
  return SDR_REGRA_LABEL[regra] ?? regra;
}

/** Situação do lead na visão do SDR (badge da base e da ficha). */
export type SituacaoSdr = "na_base" | "reaquecendo" | "entregue" | "devolvido";

export function situacaoSdr(lead: {
  corretor_id: string | null;
  sdr_entregue_em: string | null;
  sdr_devolvido_em?: string | null;
}): SituacaoSdr {
  if (lead.sdr_entregue_em) return "entregue";
  if (lead.corretor_id) return "reaquecendo";
  if (lead.sdr_devolvido_em) return "devolvido";
  return "na_base";
}

export const SITUACAO_SDR_LABEL: Record<SituacaoSdr, string> = {
  na_base: "Na base",
  reaquecendo: "Reaquecendo (lead de corretor)",
  entregue: "Entregue ao corretor",
  devolvido: "Devolvido para você",
};

/** Percentual de comparecimento a partir do Raio-X (null sem amostra). */
export function comparecimentoPct(realizadas: number, noShow: number): number | null {
  const total = realizadas + noShow;
  if (total <= 0) return null;
  return Math.round((1000 * realizadas) / total) / 10;
}

// ---------------------------------------------------------------------------
// Passagem do discador (decisões do dono, 10/10/2026). O SDR passa o dia no
// discador e só entra no CRM para agendar ou recolher documentação: a
// passagem leva o mínimo que o corretor precisa. A régua de obrigatórios é a
// mesma da RPC sdr_passar_cliente (SMQP1), na mesma ordem e com os mesmos
// nomes, para a tela travar antes de bater no banco.
// ---------------------------------------------------------------------------

/** Códigos do Postgres da passagem. */
export const PASSAGEM_ERRCODE = {
  /** Faltou campo obrigatório (a mensagem lista quais). */
  falta: "SMQP1",
  /** O cliente está com corretor de "agendado" em diante: quem move é a gestão. */
  comCorretor: "SMQP2",
  /** O cliente já foi passado: a remarcação é pela visita no painel. */
  jaPassado: "SMQP3",
} as const;

export type ModoPassagem = "visita" | "documentacao";
export type RestricaoCpf = "sim" | "nao" | "nao_sabe";

/** Atalhos de tipo de renda (o banco guarda texto livre). */
export const TIPOS_RENDA = [
  "CLT",
  "Autônomo",
  "Servidor público",
  "Aposentado ou pensionista",
  "Informal",
  "Formal + informal",
] as const;

/** Atalhos de quem decide a compra. */
export const QUEM_DECIDE = ["Sozinho(a)", "Com o cônjuge", "Com a família"] as const;

export const RESTRICAO_CPF_OPCOES: ReadonlyArray<{ valor: RestricaoCpf; rotulo: string }> = [
  { valor: "nao", rotulo: "Não" },
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao_sabe", rotulo: "Não sabe" },
];

export function restricaoCpfValida(v: unknown): v is RestricaoCpf {
  return v === "sim" || v === "nao" || v === "nao_sabe";
}

export type FormPassagem = {
  modo: ModoPassagem;
  nome: string;
  telefone: string;
  renda: string;
  tipoRenda: string;
  fgts: "sim" | "nao" | null;
  decisor: string;
  restricaoCpf: RestricaoCpf | null;
  resumo: string;
  zona: string | null;
  local: string;
  /** "AAAA-MM-DDTHH:MM" no fuso do aparelho (input datetime-local). */
  inicio: string;
};

/** O que falta para passar o cliente — vazio = pode passar. */
export function camposFaltandoPassagem(f: FormPassagem): string[] {
  const vazio = (s: string | null | undefined) => !s || s.trim() === "";
  const faltam: string[] = [];
  if (vazio(f.nome)) faltam.push("nome");
  if (vazio(f.telefone)) faltam.push("telefone");
  if (vazio(f.renda)) faltam.push("renda");
  if (vazio(f.tipoRenda)) faltam.push("tipo de renda");
  if (!f.fgts) faltam.push("FGTS");
  if (vazio(f.decisor)) faltam.push("quem decide");
  if (!f.restricaoCpf) faltam.push("restrição no CPF");
  if (f.modo === "visita") {
    if (!zonaInteresseValida(f.zona)) faltam.push("zona");
    if (vazio(f.local)) faltam.push("endereço da visita");
    if (vazio(f.inicio) || Number.isNaN(new Date(f.inicio).getTime())) faltam.push("data e hora");
  }
  return faltam;
}

/** O corpo da RPC sdr_passar_cliente. */
export function payloadPassagem(f: FormPassagem): Record<string, string | null> {
  const t = (s: string) => (s.trim() === "" ? null : s.trim());
  const visita = f.modo === "visita";
  return {
    modo: f.modo,
    nome: t(f.nome),
    telefone: t(f.telefone),
    renda: t(f.renda),
    tipo_renda: t(f.tipoRenda),
    fgts: f.fgts,
    decisor: t(f.decisor),
    restricao_cpf: f.restricaoCpf,
    resumo: t(f.resumo),
    zona: f.zona,
    local: visita ? t(f.local) : null,
    inicio: visita && t(f.inicio) ? new Date(f.inicio).toISOString() : null,
  };
}
