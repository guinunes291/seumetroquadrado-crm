// Copa SMQ — cartões de confronto (extraídos verbatim de copa.tsx na F9).
// Vencedor/W.O./pontos chegam resolvidos por props; nenhuma regra vive aqui.

import { GREEN, GOLD, ORANGE, type Confronto } from "./copa-ui";

export function ConfrontoLinha({
  c,
  nomeCorretor,
  selecaoCorretor,
  ptsSem,
  destaque,
}: {
  c: Confronto;
  nomeCorretor: (id: string | null) => string;
  selecaoCorretor: (id: string | null) => { nome: string; bandeira: string } | null;
  ptsSem: (id: string | null, s: number | null) => number;
  destaque?: string | null;
}) {
  const a = selecaoCorretor(c.corretor_a_id),
    b = selecaoCorretor(c.corretor_b_id);
  const sem = c.semana_ref ?? 1;
  const pa = ptsSem(c.corretor_a_id, sem),
    pb = ptsSem(c.corretor_b_id, sem);
  const aWon = c.vencedor_id && c.vencedor_id === c.corretor_a_id;
  const bWon = c.vencedor_id && c.vencedor_id === c.corretor_b_id;
  const wo = c.is_wo || c.corretor_b_id === null;
  if (wo) {
    return (
      <div
        style={{
          background: "rgba(245,158,11,0.06)",
          border: `1px solid ${ORANGE}80`,
          borderRadius: 10,
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 26 }}>{a?.bandeira ?? "🏳️"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{a?.nome ?? "A definir"}</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
            {nomeCorretor(c.corretor_a_id)}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              background: ORANGE,
              color: "#000",
              fontSize: 10,
              fontWeight: 900,
              padding: "2px 10px",
              borderRadius: 4,
            }}
          >
            W.O.
          </div>
          <div style={{ color: ORANGE, fontSize: 13, fontWeight: 900, marginTop: 2 }}>+10 pts</div>
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        background: c.vencedor_id ? "rgba(0,156,59,0.08)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${c.vencedor_id ? "rgba(0,156,59,0.3)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: aWon ? GREEN : c.corretor_a_id === destaque ? GOLD : "#fff",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {a?.bandeira ?? "🏳️"} {a?.nome ?? "A definir"}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
          {nomeCorretor(c.corretor_a_id)}
        </div>
      </div>
      <div style={{ textAlign: "center", minWidth: 64 }}>
        <div className="tabular-nums">
          <span style={{ color: aWon ? GREEN : "#fff", fontSize: 18, fontWeight: 900 }}>{pa}</span>
          <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 4px" }}>×</span>
          <span style={{ color: bWon ? GREEN : "#fff", fontSize: 18, fontWeight: 900 }}>{pb}</span>
        </div>
        <div
          style={{
            fontSize: 9,
            color: c.vencedor_id ? GREEN : "rgba(255,255,255,0.3)",
            fontWeight: 700,
            marginTop: 2,
          }}
        >
          {c.vencedor_id ? "DEFINIDO" : `SEM ${sem}`}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
        <div
          style={{
            color: bWon ? GREEN : c.corretor_b_id === destaque ? GOLD : "#fff",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {b?.nome ?? "A definir"} {b?.bandeira ?? "🏳️"}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
          {nomeCorretor(c.corretor_b_id)}
        </div>
      </div>
    </div>
  );
}

export function ConfrontoCard({
  c,
  nomeCorretor,
  selecaoCorretor,
  ptsTotal,
  semanaLabel,
}: {
  c: Confronto;
  nomeCorretor: (id: string | null) => string;
  selecaoCorretor: (id: string | null) => { nome: string; bandeira: string } | null;
  ptsTotal: (id: string | null) => number;
  semanaLabel?: string | null;
}) {
  const a = selecaoCorretor(c.corretor_a_id),
    b = selecaoCorretor(c.corretor_b_id);
  const aWon = c.vencedor_id && c.vencedor_id === c.corretor_a_id;
  const bWon = c.vencedor_id && c.vencedor_id === c.corretor_b_id;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {semanaLabel && (
        <div
          style={{
            background: "rgba(0,156,59,0.15)",
            color: GREEN,
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: 1.5,
            padding: "4px 12px",
            textAlign: "center",
            borderBottom: "1px solid rgba(0,156,59,0.25)",
          }}
        >
          PONTOS DA {semanaLabel}
        </div>
      )}
      {[
        { id: c.corretor_a_id, sel: a, won: aWon },
        { id: c.corretor_b_id, sel: b, won: bWon },
      ].map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: p.won ? "rgba(0,156,59,0.1)" : "transparent",
            borderBottom: i === 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, opacity: p.id ? 1 : 0.3 }}>{p.sel?.bandeira ?? "🏳️"}</span>
            <div>
              <div
                style={{
                  color: p.id ? "#fff" : "rgba(255,255,255,0.3)",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {p.sel?.nome ?? "A definir"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                {nomeCorretor(p.id)}
              </div>
            </div>
          </div>
          <div
            className="tabular-nums"
            style={{
              color: p.won ? GREEN : "rgba(255,255,255,0.5)",
              fontSize: 16,
              fontWeight: 900,
            }}
          >
            {p.id ? ptsTotal(p.id) : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}
