// Copa SMQ — painéis administrativos (extraídos verbatim de copa.tsx na F9).
// Mutations/RPCs preservados byte a byte; a única mudança é de tipagem:
// chamadas cobertas pelos tipos gerados do Supabase perderam o escape de tipo.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEMANAS, semanaAtual as calcSemanaAtual, shortName } from "@/lib/copa";
import {
  GREEN,
  btnStyle,
  type ConfigPonto,
  type Participante,
  type Premio,
  type Selecao,
} from "./copa-ui";

export const EDICAO_ID = "a0000000-0000-4000-8000-000000000001";

export const inputStyle: CSSProperties = {
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

export const labelStyle: CSSProperties = {
  color: "rgba(255,255,255,0.5)",
  fontSize: 11,
  display: "block",
  marginBottom: 4,
  letterSpacing: 1,
  textTransform: "uppercase",
};

export function AdminCard({
  title,
  color,
  icon,
  children,
}: {
  title: string;
  color: string;
  icon: string;
  children: ReactNode;
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

export function AdminConfigPontos({ rows }: { rows: ConfigPonto[] }) {
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

export function AdminPremios({ rows }: { rows: Premio[] }) {
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

export function AdminParticipantes({
  profiles,
  participantes,
  selecoes,
}: {
  profiles: { id: string; nome: string }[];
  participantes: Participante[];
  selecoes: Selecao[];
}) {
  const qc = useQueryClient();
  type Linha = {
    corretor_id: string;
    nome: string;
    ativo: boolean;
    selecao_id: string;
    grupo: string;
  };
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
        // O RPC aceita null em _selecao_id/_grupo ("sem seleção/grupo"), mas os
        // tipos gerados declaram string — os casts preservam o payload original.
        const { error } = await supabase.rpc("copa_set_participante", {
          _edicao_id: EDICAO_ID,
          _corretor_id: l.corretor_id,
          _selecao_id: (l.selecao_id || null) as string,
          _grupo: (l.grupo || null) as string,
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
    <AdminCard
      title={`Participantes / Seleções / Grupos (${ativos} ativos)`}
      color="#4299e1"
      icon="👥"
    >
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

export function AdminLancarPontuacao({
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
      const { data, error } = await supabase
        .from("copa_pontuacao_semanal")
        .select(
          "corretor_id, agendamentos, visitas, analise, vendas, bonus, observacao, bonus_observacao",
        )
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
      const { error } = await supabase.rpc("copa_salvar_pontuacao_lote", {
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
                        onChange={(e) =>
                          update(idx, { [k]: Number(e.target.value) || 0 } as Partial<Row>)
                        }
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
        Pontuação 100% manual: o total digitado em <strong>Bônus/Total</strong> é o que vale na
        semana. Os campos Ag/Vi/An/Ve ficam apenas como registro informativo.
      </p>
    </AdminCard>
  );
}
