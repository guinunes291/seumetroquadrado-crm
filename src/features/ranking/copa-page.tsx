import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useUserRoles } from "@/hooks/use-auth";
import { toast } from "sonner";
import { SEMANAS, semanaAtual as calcSemanaAtual, shortName } from "@/lib/copa";
import { GlassCard } from "@/components/ui/glass-card";
import { SectionHeader } from "@/components/ui/section-header";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Podium } from "@/features/ranking/podium";
import {
  GREEN,
  GOLD,
  RED,
  btnStyle,
  FaseHeader,
  type Fase,
  type Participante,
  type Selecao,
  type Confronto,
  type CopaRankRow as RankRow,
  type ConfigPonto,
  type Premio,
} from "@/features/ranking/copa-ui";
import { CopaCalendario, GrupoCard } from "@/features/ranking/copa-grupos";
import { ConfrontoLinha, ConfrontoCard } from "@/features/ranking/copa-confrontos";
import { CopaClassificacao } from "@/features/ranking/copa-classificacao";
import {
  AdminCard,
  AdminConfigPontos,
  AdminPremios,
  AdminParticipantes,
  AdminLancarPontuacao,
} from "@/features/ranking/copa-admin";

export function CopaPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = useUserRoles();
  const canManage = isAdmin || isGestor;
  const qc = useQueryClient();
  const [aba, setAba] = useState<"chaveamento" | "pontuacao" | "premiacao" | "admin">(
    "chaveamento",
  );

  const fasesQ = useQuery({
    queryKey: ["copa:fases"],
    queryFn: async (): Promise<Fase[]> => {
      const { data, error } = await supabase.from("copa_fases").select("*").order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  const participantesQ = useQuery({
    queryKey: ["copa:participantes"],
    queryFn: async (): Promise<Participante[]> => {
      const { data, error } = await supabase
        .from("copa_participantes")
        .select("id, corretor_id, selecao_id, ativo, grupo");
      if (error) throw error;
      return data ?? [];
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
    queryFn: async (): Promise<Confronto[]> => {
      const { data, error } = await supabase
        .from("copa_confrontos")
        .select(
          "id, fase_id, corretor_a_id, corretor_b_id, vencedor_id, is_wo, semana_ref, posicao",
        )
        .order("posicao");
      if (error) throw error;
      return data ?? [];
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
    queryFn: async (): Promise<RankRow[]> => {
      const { data, error } = await supabase.rpc("copa_ranking");
      if (error) throw error;
      return data ?? [];
    },
  });
  const pontosSemQ = useQuery({
    queryKey: ["copa:pontos-semana"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("copa_pontos_por_semana");
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
      const { data, error } = await supabase.rpc("copa_status_chaveamento");
      if (error) throw error;
      const rows = (data ?? []) as { fase_atual: string | null; pode_avancar: boolean }[];
      return rows.at(0);
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

  // Fase "de grupos" a exibir no topo: prioriza Semifinal quando ela já tem
  // participantes atribuídos a grupos (formato de grupinhos, não chaveamento).
  const faseGruposAtiva = useMemo(() => {
    const temGrupo = participantes.some((p) => p.ativo && p.grupo);
    if (faseSemi && temGrupo) {
      const semiPart = participantes.filter((p) => p.ativo && p.grupo);
      if (semiPart.length <= 8) return faseSemi;
    }
    return faseGrupos;
  }, [faseSemi, faseGrupos, participantes]);

  // Pontos por corretor escopados ao intervalo de semanas da fase exibida.
  const pontosNaFase = useMemo(() => {
    const m = new Map<string, number>();
    const si = faseGruposAtiva?.semana_inicio ?? 1;
    const sf = faseGruposAtiva?.semana_fim ?? 14;
    (pontosSemQ.data ?? []).forEach((r) => {
      if (r.semana >= si && r.semana <= sf) {
        m.set(r.corretor_id, (m.get(r.corretor_id) ?? 0) + Number(r.pontos));
      }
    });
    return m;
  }, [pontosSemQ.data, faseGruposAtiva]);

  const grupos = useMemo(() => {
    const map: Record<string, RankRow[]> = {};
    ranking.forEach((r) => {
      const escopado: RankRow = { ...r, total_pontos: pontosNaFase.get(r.corretor_id) ?? 0 };
      (map[r.grupo ?? "?"] ??= []).push(escopado);
    });
    Object.values(map).forEach((a) => a.sort((x, y) => y.total_pontos - x.total_pontos));
    return map;
  }, [ranking, pontosNaFase]);
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
      const { error } = await supabase.rpc("copa_set_vencedor", {
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
      const { error } = await supabase.rpc("copa_avancar_fase");
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
      const { error } = await supabase.rpc("copa_inicializar_dados");
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
  const corretoresAtivos = participantes.filter((p) => p.ativo).length;

  return (
    // `dark` força os tokens escuros do design system neste subtree — a Copa é
    // escura por design (fundo navy fixo), independente do tema do usuário.
    <div
      className="dark"
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
        {/* Placar hero — GlassCard com números em font-display/AnimatedNumber. */}
        <GlassCard
          glow
          className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 p-6"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 52, lineHeight: 1, filter: `drop-shadow(0 0 12px ${GOLD})` }}>
              🏆
            </div>
            <div>
              <div
                className="font-display"
                style={{
                  color: GREEN,
                  fontSize: 34,
                  fontWeight: 800,
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
            <div
              className="font-display tabular-nums"
              style={{ color: GREEN, fontSize: 18, fontWeight: 700, letterSpacing: 1 }}
            >
              03 JUN → 08 SET 2026
            </div>
            <div
              className="tabular-nums"
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              14 semanas · <AnimatedNumber value={corretoresAtivos} /> corretores · R$ 7.250 em
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
                className="animate-pulse"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: GREEN,
                  boxShadow: `0 0 6px ${GREEN}`,
                }}
              />
              <span
                className="tabular-nums"
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
        </GlassCard>
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
              <Podium
                className="mb-8"
                entries={podio.map((r) => ({
                  id: r.corretor_id,
                  nome: shortName(r.nome),
                  legenda: r.selecao_nome,
                  emblema: r.bandeira,
                  valor: r.total_pontos,
                  unidade: "pts",
                }))}
              />
            )}

            <SectionHeader eyebrow="14 semanas" title="Calendário do Campeonato" />
            <CopaCalendario semana={semana} />

            {faseGruposAtiva && gruposOrdenados.length > 0 && (() => {
              const ativos = participantes.filter((p) => p.ativo && p.grupo).length;
              const isSemi = faseGruposAtiva.tipo === "semifinal";
              const perGrupo = gruposOrdenados.length > 0
                ? Math.round(ativos / gruposOrdenados.length)
                : 0;
              const topN = isSemi ? 1 : 4;
              const si = faseGruposAtiva.semana_inicio ?? 1;
              const sf = faseGruposAtiva.semana_fim ?? si;
              const periodoLabel = si === sf ? `SEMANA ${si}` : `SEMANAS ${si}–${sf}`;
              return (
                <div style={{ marginBottom: 48 }}>
                  <FaseHeader
                    nome={faseGruposAtiva.nome}
                    periodo={periodoLabel}
                  />
                  <p
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: 13,
                      marginBottom: 20,
                      lineHeight: 1.6,
                    }}
                  >
                    {isSemi ? (
                      <>
                        {ativos} corretores em {gruposOrdenados.length} grupos de {perGrupo}.
                        <strong style={{ color: GOLD }}> 1º de cada grupo</strong> vai para a Final;{" "}
                        <strong style={{ color: RED }}>2º</strong> disputa o 3º lugar. Pontuação
                        zerada — conta apenas o que for feito nesta fase.
                      </>
                    ) : (
                      <>
                        {ativos} corretores em {gruposOrdenados.length} grupos de {perGrupo},
                        round-robin.
                        <strong style={{ color: GOLD }}> 1º–4º</strong> avançam às Oitavas;{" "}
                        <strong style={{ color: RED }}>5º–7º</strong> vão à Repescagem 1. W.O.
                        (folga) = +10 pts.
                      </>
                    )}
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${Math.min(gruposOrdenados.length, 4)},1fr)`,
                      gap: 16,
                    }}
                  >
                    {gruposOrdenados.map((g) => (
                      <GrupoCard
                        key={g}
                        grupo={g}
                        linhas={grupos[g]}
                        semana={semana}
                        topN={topN}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {canManage && confrontosPorSemana.length > 0 && (
              <div style={{ marginBottom: 48 }}>
                <SectionHeader eyebrow="Visão da gestão" title="Todos os Confrontos" />
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
                <SectionHeader eyebrow="Sua campanha" title="Meus Confrontos" />
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
                          ptsTotal={(id) => ptsSem(id, c.semana_ref)}
                          semanaLabel={c.semana_ref ? `SEM ${c.semana_ref}` : null}
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
          <CopaClassificacao
            ranking={ranking}
            myId={myId}
            config={configQ.data ?? []}
            loading={rankingQ.isLoading}
          />
        )}

        {aba === "premiacao" && (
          <div>
            <SectionHeader eyebrow="R$ 7.250 em prêmios" title="Premiação Oficial" />
            <div
              className="stagger-children"
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
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
                    <div
                      className="font-display tabular-nums"
                      style={{ color: GOLD, fontSize: 22, fontWeight: 800 }}
                    >
                      {p.valor}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {aba === "admin" && canManage && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionHeader eyebrow="Gestão da Copa" title="Painel Administrativo" />
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
