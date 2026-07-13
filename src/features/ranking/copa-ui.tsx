// Copa SMQ — cores, tipos e blocos visuais compartilhados pelos módulos
// copa-*.tsx e pela página copa.tsx. Código movido verbatim do monólito
// copa.tsx (F9): nada aqui altera regra de pontuação ou query.

import type { CSSProperties } from "react";

export const GREEN = "#009c3b";
export const GOLD = "#ffdf00";
export const RED = "#e53e3e";
export const ORANGE = "#f59e0b";

export type Fase = {
  id: string;
  nome: string;
  tipo: string | null;
  ordem: number;
  semana_inicio: number | null;
  semana_fim: number | null;
};
export type Participante = {
  id: string;
  corretor_id: string;
  selecao_id: string | null;
  ativo: boolean;
  grupo: string | null;
};
export type Selecao = { id: string; nome: string; bandeira: string };
export type Confronto = {
  id: string;
  fase_id: string;
  corretor_a_id: string | null;
  corretor_b_id: string | null;
  vencedor_id: string | null;
  is_wo: boolean;
  semana_ref: number | null;
  posicao: number;
};
export type CopaRankRow = {
  corretor_id: string;
  nome: string;
  selecao_id: string | null;
  selecao_nome: string | null;
  bandeira: string;
  grupo: string | null;
  total_agendamentos: number;
  total_visitas: number;
  total_documentacao: number;
  total_vendas: number;
  total_pontos: number;
};
export type ConfigPonto = { id: string; chave: string; label: string; pontos: number };
export type Premio = {
  id: string;
  posicao: string;
  descricao: string | null;
  valor: string | null;
  icone: string | null;
  ordem: number;
};

export function btnStyle(bg: string, small = false): CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: small ? 6 : 8,
    padding: small ? "6px 12px" : "10px 20px",
    fontSize: small ? 12 : 13,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: 1,
    textTransform: "uppercase",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

export function FaseHeader({
  nome,
  periodo,
  cor = GREEN,
}: {
  nome: string;
  periodo: string;
  cor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
      <h3
        style={{
          color: cor,
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: 3,
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        {nome}
      </h3>
      <div
        style={{
          background: `${cor}20`,
          border: `1px solid ${cor}40`,
          borderRadius: 6,
          padding: "4px 12px",
          color: cor,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {periodo}
      </div>
      <div
        style={{
          flex: 1,
          height: 1,
          background: `linear-gradient(90deg, ${cor}40 0%, transparent 100%)`,
        }}
      />
    </div>
  );
}
