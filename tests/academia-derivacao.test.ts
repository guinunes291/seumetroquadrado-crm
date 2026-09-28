import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AcademiaModuloStatusRow } from "@/integrations/supabase/academia-pendente";
import {
  continueDeOndeParou,
  estadoDoModulo,
  hojeBrasilia,
  modulosDaFase,
  primeiraAulaPendente,
  progressoDoModulo,
} from "@/features/academia/estado-modulo";
import {
  dataBr,
  diasAte,
  formatarHhMm,
  listaDeTextos,
  segundosEmHhMm,
} from "@/features/academia/formato";
import { ehVideoDireto, urlDeEmbedGamma } from "@/features/academia/midia";
import { motivoQuizTrancado } from "@/features/academia/modulo-page";

const HOJE = "2026-10-02";

function modulo(p: Partial<AcademiaModuloStatusRow> = {}): AcademiaModuloStatusRow {
  return {
    corretor_id: "c1",
    modulo_id: p.modulo_id ?? "m1",
    codigo: p.codigo ?? "M01",
    fase: 0,
    numero: 1,
    titulo: "Módulo de teste",
    obrigatorio: true,
    exige_pratica: true,
    aulas_total: 3,
    aulas_feitas: 0,
    melhor_nota: null,
    quiz_aprovado: false,
    tentativas: 0,
    pratica_status: "nao_enviada",
    concluido: false,
    concluido_em: null,
    prazo_em: null,
    ultima_atividade: null,
    ...p,
  };
}

describe("estado do módulo", () => {
  it("sem nenhuma atividade é não iniciado", () => {
    expect(estadoDoModulo(modulo(), HOJE)).toBe("nao_iniciado");
  });

  it("com aula marcada e aulas faltando é em andamento", () => {
    expect(estadoDoModulo(modulo({ aulas_feitas: 1 }), HOJE)).toBe("em_andamento");
  });

  it("aulas completas e quiz não aprovado é quiz pendente", () => {
    expect(estadoDoModulo(modulo({ aulas_feitas: 3 }), HOJE)).toBe("quiz_pendente");
  });

  it("quiz aprovado e prática não aprovada é prática pendente", () => {
    expect(
      estadoDoModulo(modulo({ aulas_feitas: 3, quiz_aprovado: true, tentativas: 1 }), HOJE),
    ).toBe("pratica_pendente");
  });

  it("módulo sem prática pula direto para concluído quando o banco diz que concluiu", () => {
    expect(
      estadoDoModulo(
        modulo({ exige_pratica: false, aulas_feitas: 3, quiz_aprovado: true, concluido: true }),
        HOJE,
      ),
    ).toBe("concluido");
  });

  it("prazo vencido e não concluído é atrasado, mesmo com o quiz em dia", () => {
    expect(
      estadoDoModulo(
        modulo({ aulas_feitas: 3, quiz_aprovado: true, prazo_em: "2026-10-01" }),
        HOJE,
      ),
    ).toBe("atrasado");
  });

  it("concluído ganha de prazo vencido: quem terminou não fica devendo", () => {
    expect(estadoDoModulo(modulo({ concluido: true, prazo_em: "2026-01-01" }), HOJE)).toBe(
      "concluido",
    );
  });

  it("prazo de hoje ainda não está atrasado", () => {
    expect(estadoDoModulo(modulo({ aulas_feitas: 1, prazo_em: HOJE }), HOJE)).toBe("em_andamento");
  });

  it("tentativa reprovada sem aula marcada ainda conta como em andamento", () => {
    expect(estadoDoModulo(modulo({ tentativas: 1 }), HOJE)).toBe("em_andamento");
  });
});

describe("progresso do módulo", () => {
  it("zero quando nada foi feito e 100 quando tudo foi", () => {
    expect(progressoDoModulo(modulo())).toBe(0);
    expect(
      progressoDoModulo(
        modulo({ aulas_feitas: 3, quiz_aprovado: true, pratica_status: "aprovada" }),
      ),
    ).toBe(100);
  });

  it("módulo sem prática não é penalizado por ela", () => {
    expect(
      progressoDoModulo(modulo({ exige_pratica: false, aulas_feitas: 3, quiz_aprovado: true })),
    ).toBe(100);
  });
});

describe("continue de onde parou", () => {
  it("escolhe o não concluído com atividade mais recente", () => {
    const a = modulo({ modulo_id: "a", codigo: "M01", ultima_atividade: "2026-09-30T10:00:00Z" });
    const b = modulo({ modulo_id: "b", codigo: "M02", ultima_atividade: "2026-10-01T10:00:00Z" });
    expect(continueDeOndeParou([a, b])?.codigo).toBe("M02");
  });

  it("ignora módulo concluído mesmo sendo o mais recente", () => {
    const a = modulo({ modulo_id: "a", codigo: "M01", ultima_atividade: "2026-09-30T10:00:00Z" });
    const b = modulo({
      modulo_id: "b",
      codigo: "M02",
      concluido: true,
      ultima_atividade: "2026-10-01T10:00:00Z",
    });
    expect(continueDeOndeParou([a, b])?.codigo).toBe("M01");
  });

  it("sem atividade nenhuma, cai no primeiro da trilha (fase, depois número)", () => {
    const tarde = modulo({ modulo_id: "a", codigo: "M09", fase: 1, numero: 9 });
    const cedo = modulo({ modulo_id: "b", codigo: "O01", fase: 0, numero: 1 });
    expect(continueDeOndeParou([tarde, cedo])?.codigo).toBe("O01");
  });

  it("tudo concluído devolve null", () => {
    expect(continueDeOndeParou([modulo({ concluido: true })])).toBeNull();
  });

  it("lista vazia devolve null", () => {
    expect(continueDeOndeParou([])).toBeNull();
  });
});

describe("próxima aula do card", () => {
  const aulas = [
    { id: "a1", ordem: 1 },
    { id: "a2", ordem: 2 },
    { id: "a3", ordem: 3 },
  ];

  it("é a primeira não concluída, na ordem da aula", () => {
    expect(primeiraAulaPendente(aulas, new Set(["a1"]))?.id).toBe("a2");
  });

  it("respeita a ordem mesmo com a lista fora de ordem", () => {
    const embaralhadas = [aulas[2], aulas[0], aulas[1]];
    expect(primeiraAulaPendente(embaralhadas, new Set())?.id).toBe("a1");
  });

  it("com todas feitas devolve null: o que falta ali é quiz ou prática", () => {
    expect(primeiraAulaPendente(aulas, new Set(["a1", "a2", "a3"]))).toBeNull();
  });
});

describe("módulos da fase", () => {
  it("filtra e ordena por número", () => {
    const m = [
      modulo({ modulo_id: "b", codigo: "M02", fase: 1, numero: 2 }),
      modulo({ modulo_id: "a", codigo: "M01", fase: 1, numero: 1 }),
      modulo({ modulo_id: "c", codigo: "O01", fase: 0, numero: 1 }),
    ];
    expect(modulosDaFase(m, 1).map((x) => x.codigo)).toEqual(["M01", "M02"]);
  });
});

describe("formatação de tempo em hh:mm", () => {
  it("minutos viram hh:mm com dois dígitos", () => {
    expect(formatarHhMm(0)).toBe("00:00");
    expect(formatarHhMm(30)).toBe("00:30");
    expect(formatarHhMm(60)).toBe("01:00");
    expect(formatarHhMm(95)).toBe("01:35");
    expect(formatarHhMm(600)).toBe("10:00");
  });

  it("negativo não vira hora negativa", () => {
    expect(formatarHhMm(-5)).toBe("00:00");
  });

  it("segundos arredondam para cima: 1 segundo restante ainda mostra 00:01", () => {
    expect(segundosEmHhMm(1)).toBe("00:01");
    expect(segundosEmHhMm(60)).toBe("00:01");
    expect(segundosEmHhMm(61)).toBe("00:02");
    expect(segundosEmHhMm(0)).toBe("00:00");
  });

  it("data ISO vira dd/mm/aaaa sem depender do fuso do navegador", () => {
    expect(dataBr("2026-10-02")).toBe("02/10/2026");
    expect(dataBr("2026-10-02T23:30:00Z")).toBe("02/10/2026");
    expect(dataBr(null)).toBe("");
  });

  it("dias até o prazo: negativo quando venceu", () => {
    expect(diasAte("2026-10-05", HOJE)).toBe(3);
    expect(diasAte(HOJE, HOJE)).toBe(0);
    expect(diasAte("2026-09-30", HOJE)).toBe(-2);
  });

  it("hoje em Brasília usa o fuso de São Paulo, não o do processo", () => {
    // 03:00Z de 3/10 ainda é dia 2 em Brasília.
    expect(hojeBrasilia(new Date("2026-10-03T02:00:00Z"))).toBe("2026-10-02");
    expect(hojeBrasilia(new Date("2026-10-03T04:00:00Z"))).toBe("2026-10-03");
  });
});

describe("jsonb das aulas", () => {
  it("lista de textos ignora o que não é string", () => {
    expect(listaDeTextos(["a", 1, null, "b"])).toEqual(["a", "b"]);
    expect(listaDeTextos(null)).toEqual([]);
    expect(listaDeTextos("nao e array")).toEqual([]);
  });
});

describe("quiz trancado", () => {
  it("diz quantas aulas faltam, no singular e no plural", () => {
    expect(motivoQuizTrancado(3, 2)).toBe("Falta 1 aula para liberar o quiz.");
    expect(motivoQuizTrancado(3, 0)).toBe("Faltam 3 aulas para liberar o quiz.");
  });

  it("libera quando todas as aulas estão feitas", () => {
    expect(motivoQuizTrancado(3, 3)).toBeNull();
  });

  it("módulo sem aula publicada não libera o quiz", () => {
    expect(motivoQuizTrancado(0, 0)).toBe("Este módulo ainda não tem aula publicada.");
  });
});

describe("mídia das aulas", () => {
  it("converte link de doc do Gamma em embed", () => {
    expect(urlDeEmbedGamma("https://gamma.app/docs/abc123")).toBe("https://gamma.app/embed/abc123");
    expect(urlDeEmbedGamma("https://gamma.app/embed/abc123")).toBe(
      "https://gamma.app/embed/abc123",
    );
  });

  it("recusa domínio de fora e http puro: iframe de origem desconhecida não entra", () => {
    expect(urlDeEmbedGamma("https://exemplo.com/docs/abc")).toBeNull();
    expect(urlDeEmbedGamma("http://gamma.app/docs/abc")).toBeNull();
    expect(urlDeEmbedGamma("nao e url")).toBeNull();
    expect(urlDeEmbedGamma(null)).toBeNull();
  });

  it("vídeo direto só com extensão conhecida em https", () => {
    expect(ehVideoDireto("https://cdn.exemplo.com/a.mp4")).toBe(true);
    expect(ehVideoDireto("https://youtube.com/watch?v=x")).toBe(false);
    expect(ehVideoDireto(null)).toBe(false);
  });
});

describe("texto da Academia", () => {
  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const caminho = join(dir, nome);
      return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
    });
  }

  it("não usa travessão em lugar nenhum de src/features/academia", () => {
    const comTravessao = arquivos("src/features/academia")
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .filter((f) => readFileSync(f, "utf8").includes("—"));
    expect(comTravessao).toEqual([]);
  });
});
