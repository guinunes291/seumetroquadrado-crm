// Copa SMQ — calendário de semanas e tabela de grupo (extraídos verbatim de
// copa.tsx na F9). Apenas apresentação: as linhas chegam prontas do RPC.

import { SEMANAS, shortName } from "@/lib/copa";
import { GREEN, GOLD, type CopaRankRow } from "./copa-ui";

/** Grade das 14 semanas com a semana atual destacada "AO VIVO". */
export function CopaCalendario({ semana }: { semana: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))",
        gap: 12,
        marginBottom: 40,
      }}
    >
      {SEMANAS.map((s) => {
        const atual = s.semana === semana;
        return (
          <div
            key={s.semana}
            style={{
              background: atual ? "rgba(0,156,59,0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${atual ? GREEN : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8,
              padding: "14px 12px",
              textAlign: "center",
              position: "relative",
            }}
          >
            {atual && (
              <div
                style={{
                  position: "absolute",
                  top: 6,
                  right: 8,
                  background: GREEN,
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  letterSpacing: 1,
                }}
              >
                AO VIVO
              </div>
            )}
            <div
              className="font-display tabular-nums"
              style={{
                color: atual ? GREEN : "rgba(255,255,255,0.4)",
                fontSize: 32,
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              {s.semana}
            </div>
            <div
              style={{
                color: atual ? "#fff" : "rgba(255,255,255,0.6)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              {s.label}
            </div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2 }}>
              {s.periodo}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GrupoCard({
  grupo,
  linhas,
  semana,
  topN = 4,
}: {
  grupo: string;
  linhas: CopaRankRow[];
  semana: number;
  topN?: number;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(0,156,59,0.08)",
        }}
      >
        <span style={{ color: GREEN, fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>
          GRUPO {grupo}
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>SEM {semana}</span>
      </div>
      <div style={{ padding: "8px 16px 4px" }}>
        {linhas.map((c, idx) => (
          <div
            key={c.corretor_id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 50px 40px",
              gap: 4,
              padding: "8px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{c.bandeira}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.selecao_nome ?? "—"}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
                  {shortName(c.nome)}
                </div>
              </div>
            </div>
            <div
              className="tabular-nums"
              style={{
                textAlign: "center",
                color: c.total_pontos > 0 ? GOLD : "rgba(255,255,255,0.5)",
                fontSize: 14,
                fontWeight: 900,
              }}
            >
              {c.total_pontos}
            </div>
            <div style={{ textAlign: "center" }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: idx < topN ? GREEN : "rgba(255,255,255,0.2)",
                  display: "inline-block",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
