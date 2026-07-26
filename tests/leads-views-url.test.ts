import { describe, expect, it } from "vitest";
import {
  filtrosParaSearch,
  mesclarFiltrosDaUrl,
  searchParaFiltros,
  temFiltrosNaUrl,
  FILTRO_PADRAO,
} from "@/lib/leads-views";

describe("searchParaFiltros / filtrosParaSearch", () => {
  it("lê da URL só chaves conhecidas, ignorando vazios e 'all'", () => {
    const f = searchParaFiltros({
      status: "em_atendimento",
      corretor: "abc-123",
      temperatura: "all",
      origem: "",
      view: "kanban",
      qualquer: "x",
    });
    expect(f).toEqual({ status: "em_atendimento", corretor: "abc-123" });
  });

  it("round-trip: filtros → search → filtros preserva o que não é default", () => {
    const filtros = {
      ...FILTRO_PADRAO,
      status: "agendado",
      temperatura: "quente",
      periodo: "30d",
    };
    const search = filtrosParaSearch(filtros);
    expect(search).toEqual({ status: "agendado", temperatura: "quente", periodo: "30d" });
    expect(searchParaFiltros(search)).toEqual(search);
  });

  it("temFiltrosNaUrl distingue drill de navegação comum", () => {
    expect(temFiltrosNaUrl({ view: "kanban" })).toBe(false);
    expect(temFiltrosNaUrl({ status: "perdido" })).toBe(true);
  });
});

describe("mesclarFiltrosDaUrl", () => {
  it("aplica sobre o padrão e mantém valores válidos", () => {
    const f = mesclarFiltrosDaUrl({ status: "agendado", temperatura: "quente" }, true);
    expect(f.status).toBe("agendado");
    expect(f.temperatura).toBe("quente");
    expect(f.origem).toBe("all");
  });

  it("saneia periodo/temperatura/contato desconhecidos (Select não pode receber lixo)", () => {
    const f = mesclarFiltrosDaUrl(
      { periodo: "14d", temperatura: "fervendo", contato: "xpto" },
      true,
    );
    expect(f.periodo).toBe("all");
    expect(f.temperatura).toBe("all");
    expect(f.contato).toBe("all");
  });

  it("datas soltas ativam o modo custom", () => {
    const f = mesclarFiltrosDaUrl({ dataInicio: "2026-07-01", dataFim: "2026-07-15" }, true);
    expect(f.periodo).toBe("custom");
    expect(f.dataInicio).toBe("2026-07-01");
  });

  it("quem não gerencia nunca filtra por corretor via URL", () => {
    const f = mesclarFiltrosDaUrl({ corretor: "abc" }, false);
    expect(f.corretor).toBe("all");
  });
});
