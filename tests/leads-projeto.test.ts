import { describe, expect, it, vi } from "vitest";
import { listarLeadsDoProjeto, contagensDoProjeto } from "@/features/leads/leads-projeto";
import type { Lead } from "@/features/leads/types";

describe("filtro de projeto da carteira", () => {
  it("encontra clientes Playball Cury além da primeira página sem incluir outros projetos", async () => {
    const first = Array.from({ length: 200 }, (_, i) => ({ id: `outro-${i}`, projeto_id: "outro", status: "novo", total_count: 202 } as Lead));
    const playball = { id: "cliente-playball", projeto_id: "playball-cury", status: "em_atendimento", total_count: 202 } as Lead;
    const carregar = vi.fn(async (page: number) => page === 1 ? first : [playball, { id: "sem-projeto", projeto_id: null, status: "novo" } as Lead]);
    const rows = await listarLeadsDoProjeto("playball-cury", carregar);
    expect(rows.map(row => row.id)).toEqual(["cliente-playball"]);
    expect(carregar).toHaveBeenCalledTimes(2);
    expect(contagensDoProjeto(rows)).toEqual({ total: 1, counts: { em_atendimento: 1 } });
  });
  it("não repete clientes entre páginas", async () => {
    const lead = { id: "playball", projeto_id: "playball-cury", status: "novo" } as Lead;
    const rows = await listarLeadsDoProjeto("playball-cury", async page => page === 1 ? Array.from({ length: 200 }, () => lead) : [lead]);
    expect(rows).toHaveLength(1);
  });
  it("inclui cadastro Playball Cury por nome sem confundir outro vínculo", async () => {
    const rows = await listarLeadsDoProjeto("playball-cury", async () => [
      { id: "por-nome", projeto_id: null, projeto_nome: "Playball Cury", status: "novo" } as Lead,
      { id: "outro", projeto_id: "outro", projeto_nome: "Cury Playball", status: "novo" } as Lead,
    ], "Cury Playball");
    expect(rows.map(row => row.id)).toEqual(["por-nome"]);
  });
});