import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "../../src/styles.css";
import { RankingExperience } from "../../src/features/ranking/ranking-page";
import { fixtureRanking } from "../../tests/fixtures/ranking";
// Cenário explícito do harness: navegador sem Fullscreen API (TV ainda funciona).
if (new URLSearchParams(location.search).has("sem-fullscreen")) {
  document.documentElement.requestFullscreen = () =>
    Promise.reject(new Error("Fullscreen indisponível no cenário de teste"));
}
const HOJE = new Date(2026, 8, 8, 12);
function Preview() {
  const [snapshot, setSnapshot] = useState(fixtureRanking);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState({ ano: 2026, mes: 9 });
  const [hoje, setHoje] = useState(HOJE);
  return (
    <>
      <div
        style={{
          background: "#f3dfae",
          color: "#11283b",
          padding: "8px 18px",
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          font: "14px system-ui",
        }}
      >
        <strong>PRÉVIA LOCAL · 30 PERSONAGENS FICTÍCIOS · SEM ACESSO AO CRM</strong>
        <button
          onClick={() => {
            setSnapshot(fixtureRanking());
            setError(false);
            setLoading(false);
            setHoje(HOJE);
            setMes({ ano: 2026, mes: 9 });
          }}
        >
          Restaurar
        </button>
        <button onClick={() => setError((v) => !v)}>Simular falha</button>
        <button onClick={() => setLoading((v) => !v)}>Carregamento</button>
        <button
          onClick={() =>
            setSnapshot((s) => ({
              ...s,
              rows: s.rows.map((r) => ({
                ...r,
                vgv: 0,
                vendas: 0,
                pontuacao: 0,
                ligacoes: 0,
                whatsapps: 0,
                agendamentos: 0,
                visitas: 0,
                documentacoes: 0,
              })),
              vendas: [],
              metas: [],
            }))
          }
        >
          Sem vendas/metas
        </button>
        <button
          onClick={() =>
            setSnapshot((s) => ({
              ...s,
              rows: s.rows.map((r) => ({ ...r, vgv: 1000000, vendas: 2 })),
            }))
          }
        >
          Empate de 30
        </button>
        <button
          onClick={() =>
            setSnapshot((s) => {
              const id = `nova-${Date.now()}`;
              const aprovado = new Date(Date.parse(s.gerado_em) + 1000).toISOString();
              return {
                ...s,
                gerado_em: new Date(Date.parse(aprovado) + 1000).toISOString(),
                vendas: [
                  ...s.vendas,
                  {
                    id,
                    corretor_id: "c1",
                    aprovado_em: aprovado,
                    dia: "2026-09-08",
                    valor: 400000,
                  },
                ],
                rows: s.rows.map((r) =>
                  r.corretor_id === "c1"
                    ? {
                        ...r,
                        vendas: r.vendas + 1,
                        vgv: r.vgv + 400000,
                        pontuacao: r.pontuacao + 1000,
                      }
                    : r,
                ),
              };
            })
          }
        >
          Nova aprovação
        </button>
        <select
          aria-label="Cenários adicionais da prévia"
          defaultValue=""
          onChange={(event) => {
            const caso = event.target.value;
            const base = fixtureRanking();
            const quantidade = caso === "um" ? 1 : caso === "dois" ? 2 : 0;
            const ids = new Set(base.rows.slice(0, quantidade).map((r) => r.corretor_id));
            base.rows = base.rows.map((r) =>
              ids.has(r.corretor_id)
                ? r
                : { ...r, vgv: 0, vendas: 0, pontuacao: r.pontuacao - r.vendas * 1000 },
            );
            base.vendas = base.vendas.filter((v) => ids.has(v.corretor_id));
            base.coortes = [];
            if (caso === "vazio") {
              base.rows = [];
              base.equipes = [];
              base.metas = [];
              base.total_participantes = 0;
            }
            if (caso === "primeiro") base.gerado_em = "2026-09-01T15:00:00Z";
            setHoje(caso === "primeiro" ? new Date(2026, 8, 1, 12) : HOJE);
            setMes({ ano: 2026, mes: 9 });
            setSnapshot(base);
            setError(false);
            setLoading(false);
            event.target.value = "";
          }}
        >
          <option value="" disabled>
            Cenários adicionais
          </option>
          <option value="um">Um corretor vendendo</option>
          <option value="dois">Dois corretores vendendo</option>
          <option value="primeiro">Primeiro dia do mês</option>
          <option value="vazio">Nenhum participante</option>
        </select>
      </div>
      <div
        style={{ padding: "clamp(0px, 1.5vw, 24px)", background: "#070E1C", minHeight: "100vh" }}
      >
        <RankingExperience
          snapshot={loading ? undefined : snapshot}
          hoje={hoje}
          {...mes}
          userKey="c4"
          preview
          loading={loading}
          fetching={false}
          error={error}
          onRefresh={() => setError(false)}
          onMonthChange={(ano, m) => {
            setMes({ ano, mes: m });
            const key = `${ano}-${String(m).padStart(2, "0")}`;
            setSnapshot((s) => ({
              ...s,
              inicio: `${key}-01`,
              fim: `${key}-${new Date(ano, m, 0).getDate()}`,
              vendas: [],
            }));
          }}
        />
      </div>
    </>
  );
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <Preview />
  </QueryClientProvider>,
);
