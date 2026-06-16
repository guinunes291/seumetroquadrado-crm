import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { toast } from "sonner";
import { SEMANAS, semanaAtual as calcSemanaAtual, shortName } from "@/lib/copa";

const EDICAO_ID = "a0000000-0000-4000-8000-000000000001";

export const Route = createFileRoute("/_authenticated/copa")({
  head: () => ({ meta: [{ title: "Copa SMQ — Seu Metro Quadrado" }] }),
  component: CopaPage,
});


type Fase = {
  id: string;
  nome: string;
  tipo: string | null;
  ordem: number;
  semana_inicio: string | null;
  semana_fim: string | null;
};
type Participante = {
  id: string;
  corretor_id: string;
  selecao_id: string | null;
  ativo: boolean;
  grupo: string | null;
};
type Selecao = { id: string; nome: string; bandeira: string };
type Confronto = {
  id: string;
  fase_id: string;
  corretor_a_id: string | null;
  corretor_b_id: string | null;
  vencedor_id: string | null;
  is_wo: boolean;
  semana_ref: number | null;
  posicao: number;
};
type RankRow = {
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
type ConfigPonto = { id: string; chave: string; label: string; pontos: number };
type Premio = {
  id: string;
  posicao: string;
  descricao: string | null;
  valor: string | null;
  icone: string | null;
  ordem: number;
};

const GREEN = "#009c3b";
const GOLD = "#ffdf00";
const RED = "#e53e3e";
const ORANGE = "#f59e0b";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  padding: "8px 12px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.5)",
  fontSize: 11,
  display: "block",
  marginBottom: 4,
  letterSpacing: 1,
  textTransform: "uppercase",
};
function btnStyle(bg: string, small = false): React.CSSProperties {
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

function CopaPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();
  const [aba, setAba] = useState<"chaveamento" | "pontuacao" | "premiacao" | "admin">(
    "chaveamento",
  );

  const fasesQ = useQuery({
    queryKey: ["copa:fases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("copa_fases").select("*").order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Fase[];
    },
  });
  const participantesQ = useQuery({
    queryKey: ["copa:participantes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("copa_participantes")
        .select("id, corretor_id, selecao_id, ativo, grupo");
      if (error) throw error;
      return (data ?? []) as unknown as Participante[];
    },
  });
  const selecoesQ = useQuery({
    queryKey: ["copa:selecoes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("copa_selecoes").select("id, nome, bandeira");
      if (error) throw error;
      return (data ?? []) as Selecao[];
    },
  });
  const confrontosQ = useQuery({
    queryKey: ["copa:confrontos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("copa_confrontos")
        .select(
          "id, fase_id, corretor_a_id, corretor_b_id, vencedor_id, is_wo, semana_ref, posicao",
        )
        .order("posicao");
      if (error) throw error;
      return (data ?? []) as unknown as Confronto[];
    },
  });
  const profilesQ = useQuery({
    queryKey: ["copa:profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const rankingQ = useQuery({
    queryKey: ["copa:ranking"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("copa_ranking");
      if (error) throw error;
      return (data ?? []) as unknown as RankRow[];
    },
  });
  const pontosSemQ = useQuery({
    queryKey: ["copa:pontos-semana"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("copa_pontos_por_semana");
      if (error) throw error;
      return (data ?? []) as { corretor_id: string; semana: number; pontos: number }[];
    },
  });
  const configQ = useQuery({
    queryKey: ["copa:config-pontos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("copa_config_pontos")
        .select("*")
        .order("pontos", { ascending: false });
      return (data ?? []) as ConfigPonto[];
    },
  });
  const premiosQ = useQuery({
    queryKey: ["copa:premios"],
    queryFn: async () => {
      const { data } = await supabase.from("copa_config_premios").select("*").order("ordem");
      return (data ?? []) as Premio[];
    },
  });
  const statusQ = useQuery({
    queryKey: ["copa:status"],
    enabled: canManage,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("copa_status_chaveamento");
      if (error) throw error;
      return ((data ?? []) as any[])[0] as
        | { fase_atual: string | null; pode_avancar: boolean }
        | undefined;
    },
  });

  const fases = fasesQ.data ?? [];
  const participantes = participantesQ.data ?? [];
  const confrontos = confrontosQ.data ?? [];
  const ranking = rankingQ.data ?? [];
  const semana = calcSemanaAtual();
  const semanaLabel = SEMANAS[semana - 1];
  const myId = user?.id ?? null;

  // Realtime: invalida queries quando algo muda no servidor.
  useEffect(() => {
    const ch = supabase
      .channel("copa-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "copa_pontuacoes" }, () => {
        qc.invalidateQueries({ queryKey: ["copa:ranking"] });
        qc.invalidateQueries({ queryKey: ["copa:pontos-semana"] });
        qc.invalidateQueries({ queryKey: ["copa:semanal"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "copa_confrontos" }, () => {
        qc.invalidateQueries({ queryKey: ["copa:confrontos"] });
        qc.invalidateQueries({ queryKey: ["copa:ranking"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "copa_participantes" }, () => {
        qc.invalidateQueries({ queryKey: ["copa:participantes"] });
        qc.invalidateQueries({ queryKey: ["copa:ranking"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);


  const nomeByUuid = useMemo(() => {
    const m = new Map<string, string>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p.nome));
    ranking.forEach((r) => m.set(r.corretor_id, r.nome));
    return m;
  }, [profilesQ.data, ranking]);
  const partByCorretor = useMemo(() => {
    const m = new Map<string, Participante>();
    participantes.forEach((p) => m.set(p.corretor_id, p));
    return m;
  }, [participantes]);
  const selecaoById = useMemo(() => {
    const m = new Map<string, Selecao>();
    (selecoesQ.data ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [selecoesQ.data]);
  const ptsSemMap = useMemo(() => {
    const m = new Map<string, number>();
    (pontosSemQ.data ?? []).forEach((r) => m.set(`${r.semana}:${r.corretor_id}`, Number(r.pontos)));
    return m;
  }, [pontosSemQ.data]);

  function nomeCorretor(id: string | null): string {
    if (!id) return "A definir";
    return nomeByUuid.has(id) ? shortName(nomeByUuid.get(id)!) : "—";
  }
  function selecaoCorretor(id: string | null): { nome: string; bandeira: string } | null {
    if (!id) return null;
    const p = partByCorretor.get(id);
    if (!p?.selecao_id) return null;
    const s = selecaoById.get(p.selecao_id);
    return s ? { nome: s.nome, bandeira: s.bandeira } : null;
  }
  function ptsSem(id: string | null, sem: number | null): number {
    if (!id || !sem) return 0;
    return ptsSemMap.get(`${sem}:${id}`) ?? 0;
  }

  const faseGrupos = fases.find((f) => f.tipo === "grupos");
  const faseRep1 = fases.find((f) => f.tipo === "repescagem1");
  const faseOitavas = fases.find((f) => f.tipo === "oitavas");
  const faseRep2 = fases.find((f) => f.tipo === "repescagem2");
  const faseQuartas = fases.find((f) => f.tipo === "quartas");
  const faseSemi = fases.find((f) => f.tipo === "semifinal");
  const faseTerceiro = fases.find((f) => f.tipo === "terceiro");
  const faseFinal = fases.find((f) => f.tipo === "final");

  const grupos = useMemo(() => {
    const map: Record<string, RankRow[]> = {};
    ranking.forEach((r) => {
      (map[r.grupo ?? "?"] ??= []).push(r);
    });
    Object.values(map).forEach((a) => a.sort((x, y) => y.total_pontos - x.total_pontos));
    return map;
  }, [ranking]);
  const gruposOrdenados = useMemo(
    () =>
      Object.keys(grupos)
        .filter((g) => g !== "?")
        .sort(),
    [grupos],
  );

  function confrontosDaFase(faseId: string) {
    return confrontos.filter((c) => c.fase_id === faseId && (c.corretor_a_id || c.corretor_b_id));
  }
  const meusConfrontos = useMemo(() => {
    if (!myId || canManage || !faseGrupos) return [];
    return confrontos
      .filter(
        (c) =>
          c.fase_id === faseGrupos.id && (c.corretor_a_id === myId || c.corretor_b_id === myId),
      )
      .sort((a, b) => (a.semana_ref ?? 99) - (b.semana_ref ?? 99));
  }, [confrontos, myId, canManage, faseGrupos]);
  const confrontosPorSemana = useMemo(() => {
    if (!canManage) return [] as [number, Confronto[]][];
    const mapa = new Map<number, Confronto[]>();
    confrontos
      .filter((c) => c.corretor_a_id || c.corretor_b_id)
      .sort((a, b) => (a.semana_ref ?? 99) - (b.semana_ref ?? 99))
      .forEach((c) => {
        const s = c.semana_ref ?? 99;
        (mapa.get(s) ?? mapa.set(s, []).get(s)!).push(c);
      });
    return Array.from(mapa.entries()).sort((a, b) => a[0] - b[0]);
  }, [confrontos, canManage]);

  const inval = () => {
    qc.invalidateQueries({ queryKey: ["copa:confrontos"] });
    qc.invalidateQueries({ queryKey: ["copa:ranking"] });
    qc.invalidateQueries({ queryKey: ["copa:participantes"] });
    qc.invalidateQueries({ queryKey: ["copa:status"] });
  };
  const setVencedor = useMutation({
    mutationFn: async (v: { confronto: string; vencedor: string }) => {
      const { error } = await (supabase as any).rpc("copa_set_vencedor", {
        _confronto_id: v.confronto,
        _vencedor_id: v.vencedor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vencedor definido!");
      inval();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const realizarSorteio = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("copa_realizar_sorteio");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sorteio realizado!");
      inval();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const avancarFase = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("copa_avancar_fase");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fase avançada!");
      inval();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const inicializar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("copa_inicializar_dados");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Copa inicializada!");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (fasesQ.isLoading) {
    return (
      <div style={{ background: "#0a1628", minHeight: "100vh", color: "#fff", padding: 40 }}>
        Carregando Copa…
      </div>
    );
  }
  const podio = ranking.slice(0, 3);

  return (
    <div
      style={{
        background: "#0a1628",
        minHeight: "100vh",
        color: "#fff",
        fontFamily: "Inter, sans-serif",
        margin: -24,
      }}
    >
      <div
        style={{
          background: "linear-gradient(180deg,#0d1f3c 0%,#0a1628 100%)",
          borderBottom: `2px solid ${GREEN}`,
          padding: "24px 32px",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 52, lineHeight: 1, filter: `drop-shadow(0 0 12px ${GOLD})` }}>
              🏆
            </div>
            <div>
              <div
                style={{
                  color: GREEN,
                  fontSize: 34,
                  fontWeight: 900,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  lineHeight: 1,
                }}
              >
                COPA SMQ 2026
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  marginTop: 3,
                }}
              >
                Campeonato de Vendas · Seu Metro Quadrado
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: GREEN, fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>
              03 JUN → 08 SET 2026
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              14 semanas · {participantes.filter((p) => p.ativo).length} corretores · R$ 7.250 em
              prêmios
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                justifyContent: "flex-end",
                marginTop: 6,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: GREEN,
                  boxShadow: `0 0 6px ${GREEN}`,
                }}
              />
              <span
                style={{
                  color: GREEN,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                Semana {semana} — {semanaLabel?.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: "#0d1f3c", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex" }}>
          {(
            [
              { key: "chaveamento", icon: "⚽", label: "CHAVEAMENTO" },
              { key: "pontuacao", icon: "📊", label: "PONTUAÇÃO" },
              { key: "premiacao", icon: "🏅", label: "PREMIAÇÃO" },
              ...(canManage ? [{ key: "admin", icon: "⚙️", label: "ADMIN" }] : []),
            ] as { key: typeof aba; icon: string; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAba(tab.key)}
              style={{
                padding: "14px 24px",
                background: "transparent",
                border: "none",
                borderBottom: aba === tab.key ? `3px solid ${GREEN}` : "3px solid transparent",
                color: aba === tab.key ? "#fff" : "rgba(255,255,255,0.5)",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: 2,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px" }}>
        {aba === "chaveamento" && (
          <div>
            {podio.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 16,
                  marginBottom: 32,
                }}
              >
                {podio.map((r, i) => (
                  <div
                    key={r.corretor_id}
                    style={{
                      background: i === 0 ? "rgba(255,223,0,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${i === 0 ? "rgba(255,223,0,0.4)" : "rgba(255,255,255,0.1)"}`,
                      borderRadius: 12,
                      padding: 16,
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 26 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
                    <div style={{ fontSize: 28 }}>{r.bandeira}</div>
                    <div style={{ fontWeight: 800, marginTop: 4 }}>{shortName(r.nome)}</div>
                    <div style={{ color: GOLD, fontWeight: 900, fontSize: 20, marginTop: 4 }}>
                      {r.total_pontos} pts
                    </div>
                  </div>
                ))}
              </div>
            )}

            <SectionTitle>Calendário do Campeonato</SectionTitle>
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

            {faseGrupos && gruposOrdenados.length > 0 && (
              <div style={{ marginBottom: 48 }}>
                <FaseHeader
                  nome="Fase de Grupos"
                  periodo={`SEMANAS 1–7 · ${faseGrupos.semana_inicio ?? "03/06"} A ${faseGrupos.semana_fim ?? "21/07"}`}
                />
                <p
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 13,
                    marginBottom: 20,
                    lineHeight: 1.6,
                  }}
                >
                  {participantes.filter((p) => p.ativo).length} corretores em{" "}
                  {gruposOrdenados.length} grupos de 7, round-robin.
                  <strong style={{ color: GOLD }}> 1º–4º</strong> avançam às Oitavas;{" "}
                  <strong style={{ color: RED }}>5º–7º</strong> vão à Repescagem 1. W.O. (folga) =
                  +10 pts.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(gruposOrdenados.length, 4)},1fr)`,
                    gap: 16,
                  }}
                >
                  {gruposOrdenados.map((g) => (
                    <GrupoCard key={g} grupo={g} linhas={grupos[g]} semana={semana} />
                  ))}
                </div>
              </div>
            )}

            {canManage && confrontosPorSemana.length > 0 && (
              <div style={{ marginBottom: 48 }}>
                <SectionTitle>Todos os Confrontos</SectionTitle>
                {confrontosPorSemana.map(([sem, cs]) => {
                  const resolvidos = cs.filter((c) => c.vencedor_id).length;
                  const fase = fases.find((f) => cs[0] && f.id === cs[0].fase_id);
                  const semInfo = SEMANAS.find((s) => s.semana === sem);
                  return (
                    <div key={sem} style={{ marginBottom: 28 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 12,
                          padding: "10px 16px",
                          background: "rgba(0,156,59,0.1)",
                          borderRadius: 8,
                          border: "1px solid rgba(0,156,59,0.2)",
                        }}
                      >
                        <div
                          style={{ color: GREEN, fontSize: 13, fontWeight: 900, letterSpacing: 1 }}
                        >
                          SEMANA {sem}
                        </div>
                        {fase && (
                          <div
                            style={{
                              color: "rgba(255,255,255,0.5)",
                              fontSize: 12,
                              textTransform: "uppercase",
                            }}
                          >
                            {fase.nome}
                          </div>
                        )}
                        {semInfo && (
                          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                            {semInfo.periodo}
                          </div>
                        )}
                        <div
                          style={{
                            marginLeft: "auto",
                            borderRadius: 12,
                            padding: "2px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            background:
                              resolvidos === cs.length
                                ? "rgba(0,156,59,0.2)"
                                : "rgba(255,255,255,0.08)",
                            color: resolvidos === cs.length ? GREEN : "rgba(255,255,255,0.5)",
                          }}
                        >
                          {resolvidos}/{cs.length} resolvidos
                        </div>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(330px,1fr))",
                          gap: 10,
                        }}
                      >
                        {cs.map((c) => (
                          <ConfrontoLinha
                            key={c.id}
                            c={c}
                            nomeCorretor={nomeCorretor}
                            selecaoCorretor={selecaoCorretor}
                            ptsSem={ptsSem}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!canManage && meusConfrontos.length > 0 && (
              <div style={{ marginBottom: 48 }}>
                <SectionTitle>Meus Confrontos</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {meusConfrontos.map((c) => (
                    <ConfrontoLinha
                      key={c.id}
                      c={c}
                      nomeCorretor={nomeCorretor}
                      selecaoCorretor={selecaoCorretor}
                      ptsSem={ptsSem}
                      destaque={myId}
                    />
                  ))}
                </div>
              </div>
            )}

            {[faseRep1, faseOitavas, faseRep2, faseQuartas, faseSemi, faseTerceiro, faseFinal]
              .filter(Boolean)
              .map((fase) => {
                const f = fase as Fase;
                const lista = confrontosDaFase(f.id);
                if (lista.length === 0) return null;
                return (
                  <div key={f.id} style={{ marginBottom: 40 }}>
                    <FaseHeader
                      nome={f.nome}
                      periodo={`${f.semana_inicio ?? ""} A ${f.semana_fim ?? ""}`}
                      cor={
                        (f.tipo ?? "").startsWith("repescagem")
                          ? RED
                          : f.tipo === "final"
                            ? GOLD
                            : GREEN
                      }
                    />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))",
                        gap: 12,
                      }}
                    >
                      {lista.map((c) => (
                        <ConfrontoCard
                          key={c.id}
                          c={c}
                          nomeCorretor={nomeCorretor}
                          selecaoCorretor={selecaoCorretor}
                          ptsTotal={(id) =>
                            ranking.find((r) => r.corretor_id === id)?.total_pontos ?? 0
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

            {confrontos.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 12 }}>⚽</div>
                <div style={{ fontSize: 16 }}>Chaveamento ainda não gerado.</div>
                {canManage && (
                  <div style={{ fontSize: 13, marginTop: 8 }}>
                    Importe o histórico ou use o Admin → Sorteio.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {aba === "pontuacao" && (
          <div>
            <SectionTitle>Tabela de Pontuação Geral</SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              {(configQ.data ?? []).map((p) => (
                <div
                  key={p.chave}
                  style={{
                    background: "rgba(0,156,59,0.1)",
                    border: "1px solid rgba(0,156,59,0.3)",
                    borderRadius: 8,
                    padding: "8px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{p.label}</span>
                  <span style={{ color: GREEN, fontSize: 16, fontWeight: 900 }}>
                    +{p.pontos} pts
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "50px 1fr 80px 80px 80px 80px 80px",
                  padding: "12px 20px",
                  background: "rgba(0,0,0,0.3)",
                }}
              >
                {["#", "SELEÇÃO / CORRETOR", "📅", "🏠", "📄", "✅", "TOTAL"].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      color: "rgba(255,255,255,0.4)",
                      fontSize: 11,
                      fontWeight: 700,
                      textAlign: i > 1 ? "center" : "left",
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>
              {ranking.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
                  Nenhuma pontuação ainda.
                </div>
              ) : (
                ranking.map((r, idx) => {
                  const isMe = r.corretor_id === myId;
                  return (
                    <div
                      key={r.corretor_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "50px 1fr 80px 80px 80px 80px 80px",
                        padding: "14px 20px",
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                        background: isMe
                          ? "rgba(0,156,59,0.08)"
                          : idx % 2
                            ? "rgba(255,255,255,0.01)"
                            : "transparent",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          color: idx < 3 ? GOLD : "rgba(255,255,255,0.4)",
                          fontSize: 16,
                          fontWeight: 900,
                        }}
                      >
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{r.bandeira}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>
                            {r.selecao_nome ?? "Sem seleção"}
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
                            {shortName(r.nome)}
                            {isMe && (
                              <span style={{ color: GREEN, marginLeft: 6, fontWeight: 700 }}>
                                ● Você
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {[
                        r.total_agendamentos,
                        r.total_visitas,
                        r.total_documentacao,
                        r.total_vendas,
                      ].map((v, i) => (
                        <div
                          key={i}
                          style={{
                            textAlign: "center",
                            color: "rgba(255,255,255,0.7)",
                            fontSize: 14,
                          }}
                        >
                          {v}
                        </div>
                      ))}
                      <div
                        style={{ textAlign: "center", color: GREEN, fontSize: 16, fontWeight: 900 }}
                      >
                        {r.total_pontos}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {aba === "premiacao" && (
          <div>
            <SectionTitle>Premiação Oficial</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(premiosQ.data ?? [])
                .slice()
                .sort((a, b) => b.ordem - a.ordem)
                .map((p) => (
                  <div
                    key={p.id}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      padding: 20,
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    <span style={{ fontSize: 36 }}>{p.icone}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 800 }}>{p.posicao}</div>
                      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                        {p.descricao}
                      </div>
                    </div>
                    <div style={{ color: GOLD, fontSize: 22, fontWeight: 900 }}>{p.valor}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {aba === "admin" && canManage && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionTitle>Painel Administrativo</SectionTitle>
            <AdminCard title="Inicializar" color={RED} icon="🔧">
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 12 }}>
                Garante config de pontos padrão. Fases: {fases.length} · Participantes:{" "}
                {participantes.length} · Confrontos: {confrontos.length}.
              </p>
              <button
                style={btnStyle(RED)}
                disabled={inicializar.isPending}
                onClick={() => inicializar.mutate()}
              >
                🔧 Inicializar
              </button>
            </AdminCard>
            {statusQ.data?.pode_avancar && (
              <AdminCard title="Avançar Fase" color={GREEN} icon="⏭️">
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 12 }}>
                  Fase atual ({statusQ.data.fase_atual}) resolvida.
                </p>
                <button
                  style={btnStyle(GREEN)}
                  disabled={avancarFase.isPending}
                  onClick={() => avancarFase.mutate()}
                >
                  ⏭️ Avançar
                </button>
              </AdminCard>
            )}
            <AdminConfigPontos rows={configQ.data ?? []} />
            <AdminPremios rows={premiosQ.data ?? []} />
            <AdminParticipantes
              profiles={profilesQ.data ?? []}
              participantes={participantes}
              selecoes={selecoesQ.data ?? []}
            />
            <AdminLancarPontuacao
              profiles={profilesQ.data ?? []}
              participantes={participantes}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["copa:ranking"] });
                qc.invalidateQueries({ queryKey: ["copa:pontos-semana"] });
                qc.invalidateQueries({ queryKey: ["copa:semanal"] });
              }}
            />
            <AdminCard title="Sorteio (grupos + chaveamento)" color="#9f7aea" icon="🎲">
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 12 }}>
                Gera grupos de 7, atribui seleções e cria os confrontos.{" "}
                <span style={{ color: RED }}>Substitui os confrontos atuais.</span>

              </p>
              <button
                style={btnStyle("#9f7aea")}
                disabled={realizarSorteio.isPending}
                onClick={() => {
                  if (confirm("Refazer o sorteio?")) realizarSorteio.mutate();
                }}
              >
                🎲 Realizar Sorteio
              </button>
            </AdminCard>

            <AdminCard title="Definir Vencedores" color={RED} icon="⚔️">
              {fases
                .filter((f) => confrontosDaFase(f.id).length > 0)
                .map((fase) => (
                  <div key={fase.id} style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        color: "rgba(255,255,255,0.6)",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                        marginBottom: 8,
                      }}
                    >
                      {fase.nome}{" "}
                      <span
                        style={{
                          background: "rgba(255,255,255,0.1)",
                          borderRadius: 4,
                          padding: "2px 8px",
                        }}
                      >
                        {confrontosDaFase(fase.id).filter((c) => c.vencedor_id).length}/
                        {confrontosDaFase(fase.id).length}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {confrontosDaFase(fase.id).map((c) => {
                        const a = selecaoCorretor(c.corretor_a_id),
                          b = selecaoCorretor(c.corretor_b_id);
                        return (
                          <div
                            key={c.id}
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              borderRadius: 8,
                              padding: "10px 14px",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              style={{
                                ...btnStyle(c.vencedor_id === c.corretor_a_id ? GREEN : "#333"),
                                flex: 1,
                                minWidth: 120,
                                justifyContent: "center",
                              }}
                              onClick={() =>
                                c.corretor_a_id &&
                                setVencedor.mutate({ confronto: c.id, vencedor: c.corretor_a_id })
                              }
                            >
                              {a?.bandeira ?? "🏳️"} {a?.nome ?? nomeCorretor(c.corretor_a_id)}
                            </button>
                            <span
                              style={{
                                color: "rgba(255,255,255,0.3)",
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              VS
                            </span>
                            <button
                              style={{
                                ...btnStyle(c.vencedor_id === c.corretor_b_id ? GREEN : "#333"),
                                flex: 1,
                                minWidth: 120,
                                justifyContent: "center",
                              }}
                              disabled={!c.corretor_b_id}
                              onClick={() =>
                                c.corretor_b_id &&
                                setVencedor.mutate({ confronto: c.id, vencedor: c.corretor_b_id })
                              }
                            >
                              {c.corretor_b_id
                                ? `${b?.bandeira ?? "🏳️"} ${b?.nome ?? nomeCorretor(c.corretor_b_id)}`
                                : "W.O."}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              {fases.filter((f) => confrontosDaFase(f.id).length > 0).length === 0 && (
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  Sem confrontos. Importe o histórico ou faça o sorteio.
                </div>
              )}
            </AdminCard>
          </div>
        )}
      </div>

      <div
        style={{
          textAlign: "center",
          padding: "24px 20px",
          color: "rgba(255,255,255,0.2)",
          fontSize: 11,
          letterSpacing: 2,
          textTransform: "uppercase",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        Copa SMQ 2026 · Seu Metro Quadrado · Campeonato Interno de Vendas
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
      <h2
        style={{
          color: GREEN,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: 3,
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        {children}
      </h2>
      <div
        style={{
          flex: 1,
          height: 2,
          background: "linear-gradient(90deg, rgba(0,156,59,0.5) 0%, transparent 100%)",
        }}
      />
    </div>
  );
}
function FaseHeader({
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
function GrupoCard({
  grupo,
  linhas,
  semana,
}: {
  grupo: string;
  linhas: RankRow[];
  semana: number;
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
                  background: idx < 4 ? GREEN : "rgba(255,255,255,0.2)",
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
function ConfrontoLinha({
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
        <div>
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
function ConfrontoCard({
  c,
  nomeCorretor,
  selecaoCorretor,
  ptsTotal,
}: {
  c: Confronto;
  nomeCorretor: (id: string | null) => string;
  selecaoCorretor: (id: string | null) => { nome: string; bandeira: string } | null;
  ptsTotal: (id: string | null) => number;
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
function AdminCard({
  title,
  color,
  icon,
  children,
}: {
  title: string;
  color: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${color}40`,
        borderRadius: 12,
        padding: 24,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span
          style={{
            color,
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
function AdminConfigPontos({ rows }: { rows: ConfigPonto[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, number>>({});
  const save = useMutation({
    mutationFn: async (v: { id: string; pontos: number }) => {
      const { error } = await supabase
        .from("copa_config_pontos")
        .update({ pontos: v.pontos })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pontuação atualizada!");
      qc.invalidateQueries({ queryKey: ["copa:config-pontos"] });
      qc.invalidateQueries({ queryKey: ["copa:ranking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AdminCard title="Editar Pontuação por Atividade" color={GREEN} icon="📊">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
        {rows.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{p.label}</span>
            <input
              type="number"
              style={{ ...inputStyle, width: 80 }}
              value={draft[p.chave] ?? p.pontos}
              onChange={(e) => setDraft({ ...draft, [p.chave]: Number(e.target.value) })}
            />
            <button
              style={btnStyle(GREEN, true)}
              onClick={() => save.mutate({ id: p.id, pontos: draft[p.chave] ?? p.pontos })}
            >
              ✅
            </button>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
function AdminPremios({ rows }: { rows: Premio[] }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (v: { id: string; valor: string }) => {
      const { error } = await supabase
        .from("copa_config_premios")
        .update({ valor: v.valor })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prêmio atualizado!");
      qc.invalidateQueries({ queryKey: ["copa:premios"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AdminCard title="Editar Prêmios" color="#f6ad55" icon="🏆">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows
          .slice()
          .sort((a, b) => a.ordem - b.ordem)
          .map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{p.icone}</span>
              <span style={{ flex: 1, fontSize: 13 }}>{p.posicao}</span>
              <input
                style={{ ...inputStyle, width: 130 }}
                value={draft[p.id] ?? p.valor ?? ""}
                onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })}
              />
              <button
                style={btnStyle("#f6ad55", true)}
                onClick={() => save.mutate({ id: p.id, valor: draft[p.id] ?? p.valor ?? "" })}
              >
                ✅
              </button>
            </div>
          ))}
      </div>
    </AdminCard>
  );
}
function AdminParticipantes({
  profiles,
  participantes,
  selecoes,
}: {
  profiles: { id: string; nome: string }[];
  participantes: Participante[];
  selecoes: Selecao[];
}) {
  const qc = useQueryClient();
  type Linha = { corretor_id: string; nome: string; ativo: boolean; selecao_id: string; grupo: string };
  const [linhas, setLinhas] = useState<Linha[]>([]);
  useEffect(() => {
    const byCorretor = new Map(participantes.map((p) => [p.corretor_id, p]));
    setLinhas(
      profiles.map((p) => {
        const found = byCorretor.get(p.id);
        return {
          corretor_id: p.id,
          nome: p.nome,
          ativo: !!found?.ativo,
          selecao_id: found?.selecao_id ?? "",
          grupo: found?.grupo ?? "",
        };
      }),
    );
  }, [profiles, participantes]);

  const save = useMutation({
    mutationFn: async () => {
      // Salva uma linha por vez (lote sequencial via RPC).
      for (const l of linhas) {
        const { error } = await (supabase as any).rpc("copa_set_participante", {
          _edicao_id: EDICAO_ID,
          _corretor_id: l.corretor_id,
          _selecao_id: l.selecao_id || null,
          _grupo: l.grupo || null,
          _ativo: l.ativo,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Participantes salvos!");
      qc.invalidateQueries({ queryKey: ["copa:participantes"] });
      qc.invalidateQueries({ queryKey: ["copa:ranking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ativos = linhas.filter((l) => l.ativo).length;
  const update = (idx: number, patch: Partial<Linha>) =>
    setLinhas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  return (
    <AdminCard title={`Participantes / Seleções / Grupos (${ativos} ativos)`} color="#4299e1" icon="👥">
      <div style={{ maxHeight: 420, overflowY: "auto", marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.5)" }}>
              <th style={{ textAlign: "center", padding: "8px 6px", width: 50 }}>Na copa</th>
              <th style={{ textAlign: "left", padding: "8px 6px" }}>Corretor</th>
              <th style={{ textAlign: "left", padding: "8px 6px", width: 220 }}>Seleção</th>
              <th style={{ textAlign: "left", padding: "8px 6px", width: 80 }}>Grupo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, idx) => (
              <tr
                key={l.corretor_id}
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                  background: l.ativo ? "rgba(66,153,225,0.06)" : "transparent",
                }}
              >
                <td style={{ textAlign: "center", padding: "6px" }}>
                  <input
                    type="checkbox"
                    checked={l.ativo}
                    onChange={(e) => update(idx, { ativo: e.target.checked })}
                  />
                </td>
                <td style={{ padding: "6px" }}>{shortName(l.nome)}</td>
                <td style={{ padding: "6px" }}>
                  <select
                    style={inputStyle}
                    value={l.selecao_id}
                    onChange={(e) => update(idx, { selecao_id: e.target.value })}
                    disabled={!l.ativo}
                  >
                    <option value="">— sem seleção —</option>
                    {selecoes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.bandeira} {s.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "6px" }}>
                  <select
                    style={inputStyle}
                    value={l.grupo}
                    onChange={(e) => update(idx, { grupo: e.target.value })}
                    disabled={!l.ativo}
                  >
                    <option value="">—</option>
                    {["A", "B", "C", "D"].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button style={btnStyle("#4299e1")} disabled={save.isPending} onClick={() => save.mutate()}>
        💾 Salvar Participantes
      </button>
    </AdminCard>
  );
}

function AdminLancarPontuacao({
  profiles,
  participantes,
  onSaved,
}: {
  profiles: { id: string; nome: string }[];
  participantes: Participante[];
  onSaved: () => void;
}) {
  const nomeById = useMemo(() => new Map(profiles.map((p) => [p.id, p.nome])), [profiles]);
  const ativos = useMemo(() => participantes.filter((p) => p.ativo), [participantes]);
  const [sem, setSem] = useState<number>(calcSemanaAtual());

  type Row = {
    corretor_id: string;
    agendamentos: number;
    visitas: number;
    analise: number;
    vendas: number;
    bonus: number;
    observacao: string;
    bonus_observacao: string;
  };
  const [grid, setGrid] = useState<Row[]>([]);

  const semQ = useQuery({
    queryKey: ["copa:semanal", sem],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("copa_pontuacao_semanal")
        .select("corretor_id, agendamentos, visitas, analise, vendas, bonus, observacao, bonus_observacao")
        .eq("edicao_id", EDICAO_ID)
        .eq("semana", sem);
      if (error) throw error;
      return (data ?? []) as {
        corretor_id: string;
        agendamentos: number;
        visitas: number;
        analise: number;
        vendas: number;
        bonus: number;
        observacao: string | null;
        bonus_observacao: string | null;
      }[];
    },
  });

  useEffect(() => {
    const byId = new Map((semQ.data ?? []).map((r) => [r.corretor_id, r]));
    setGrid(
      ativos.map((p) => {
        const e = byId.get(p.corretor_id);
        return {
          corretor_id: p.corretor_id,
          agendamentos: e?.agendamentos ?? 0,
          visitas: e?.visitas ?? 0,
          analise: e?.analise ?? 0,
          vendas: e?.vendas ?? 0,
          bonus: e?.bonus ?? 0,
          observacao: e?.observacao ?? "",
          bonus_observacao: e?.bonus_observacao ?? "",
        };
      }),
    );
  }, [semQ.data, ativos]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("copa_salvar_pontuacao_lote", {
        _edicao_id: EDICAO_ID,
        _semana: sem,
        _rows: grid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Planilha salva!");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (idx: number, patch: Partial<Row>) =>
    setGrid((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const folga = (idx: number) =>
    update(idx, {
      agendamentos: 0,
      visitas: 0,
      analise: 0,
      vendas: 0,
      bonus: 0,
      observacao: "folga",
      bonus_observacao: "",
    });

  return (
    <AdminCard title="Lançamento Manual — Planilha da Semana" color="#ed8936" icon="✏️">
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
        <label style={{ ...labelStyle, marginBottom: 0 }}>Semana</label>
        <select
          style={{ ...inputStyle, width: 260 }}
          value={sem}
          onChange={(e) => setSem(Number(e.target.value))}
        >
          {SEMANAS.map((s) => (
            <option key={s.semana} value={s.semana}>
              Semana {s.semana} — {s.label} ({s.periodo})
            </option>
          ))}
        </select>
        <button
          style={btnStyle("#ed8936")}
          disabled={save.isPending || grid.length === 0}
          onClick={() => save.mutate()}
        >
          💾 Salvar semana {sem}
        </button>
      </div>
      <div style={{ maxHeight: 480, overflowY: "auto", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.5)" }}>
              <th style={{ textAlign: "left", padding: "8px 6px" }}>Corretor</th>
              <th style={{ textAlign: "center", padding: "8px 4px", width: 70 }}>📅 Ag</th>
              <th style={{ textAlign: "center", padding: "8px 4px", width: 70 }}>🏠 Vi</th>
              <th style={{ textAlign: "center", padding: "8px 4px", width: 70 }}>📄 An</th>
              <th style={{ textAlign: "center", padding: "8px 4px", width: 70 }}>✅ Ve</th>
              <th style={{ textAlign: "center", padding: "8px 4px", width: 70 }}>🎁 Bônus</th>
              <th style={{ textAlign: "left", padding: "8px 6px", width: 150 }}>Motivo bônus</th>
              <th style={{ textAlign: "left", padding: "8px 6px", width: 110 }}>Obs.</th>
              <th style={{ textAlign: "center", padding: "8px 6px", width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {grid.map((r, idx) => {
              const nome = shortName(nomeById.get(r.corretor_id) ?? "—");
              return (
                <tr key={r.corretor_id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "4px 6px", fontWeight: 600 }}>{nome}</td>
                  {(["agendamentos", "visitas", "analise", "vendas", "bonus"] as const).map((k) => (
                    <td key={k} style={{ padding: "4px" }}>
                      <input
                        type="number"
                        min={0}
                        style={{ ...inputStyle, padding: "4px 6px", textAlign: "center" }}
                        value={r[k]}
                        onChange={(e) => update(idx, { [k]: Number(e.target.value) || 0 } as Partial<Row>)}
                      />
                    </td>
                  ))}
                  <td style={{ padding: "4px" }}>
                    <input
                      style={{ ...inputStyle, padding: "4px 6px" }}
                      placeholder="ex: W.O."
                      value={r.bonus_observacao}
                      onChange={(e) => update(idx, { bonus_observacao: e.target.value })}
                    />
                  </td>
                  <td style={{ padding: "4px" }}>
                    <input
                      style={{ ...inputStyle, padding: "4px 6px" }}
                      placeholder="folga…"
                      value={r.observacao}
                      onChange={(e) => update(idx, { observacao: e.target.value })}
                    />
                  </td>
                  <td style={{ textAlign: "center", padding: "4px" }}>
                    <button
                      style={btnStyle("#666", true)}
                      title="Marcar folga"
                      onClick={() => folga(idx)}
                    >
                      💤
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 10 }}>
        Pontuação 100% manual: o total digitado em <strong>Bônus/Total</strong> é o que vale na semana. Os campos Ag/Vi/An/Ve ficam apenas como registro informativo.
      </p>
    </AdminCard>
  );
}


