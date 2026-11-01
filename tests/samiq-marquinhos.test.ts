import { describe, expect, it } from "vitest";
import { MensagemSamiInput, DecidirPropostasInput } from "@/lib/samiq-canal";
import { MARQUINHOS_ADMIN_ID, podeUsarMarquinhos, propostaDaConversa, urlComEscopoSami } from "@/lib/samiq-marquinhos";

describe("Marquinhos: autorização e isolamento", () => {
  it("só autoriza o perfil Admin indicado, com papel admin vigente", () => {
    expect(podeUsarMarquinhos("07699874-e860-47f1-971b-a6bf3f71ae6f", true)).toBe(true);
    expect(podeUsarMarquinhos(MARQUINHOS_ADMIN_ID, false)).toBe(false);
    expect(podeUsarMarquinhos("outro-admin", true)).toBe(false);
  });
  it("valida canal explícito e não infere privilégios do contexto", () => {
    const body = { corretor_telefone: "11930785690", texto: "anota teste", contexto_canal: "Marquinhos" };
    expect(MensagemSamiInput.parse(body).canal).toBeUndefined();
    expect(MensagemSamiInput.parse({ ...body, canal: "marquinhos" }).canal).toBe("marquinhos");
    expect(MensagemSamiInput.safeParse({ ...body, canal: "diretor" }).success).toBe(false);
    expect(DecidirPropostasInput.parse({ ...body, canal: "marquinhos", decisao: "confirmar" }).canal).toBe("marquinhos");
  });
  it("Sami continua restrita à carteira inclusive na busca por id", () => {
    const url = new URL(urlComEscopoSami("https://example.test/rest/v1/leads?id=eq.alvo", MARQUINHOS_ADMIN_ID, "whatsapp"));
    expect(url.searchParams.get("corretor_id")).toBe(`eq.${MARQUINHOS_ADMIN_ID}`);
  });
  it("Marquinhos usa todos os leads ativos sem acessar lixeira ou excluídos", () => {
    const url = new URL(urlComEscopoSami("https://example.test/rest/v1/leads", MARQUINHOS_ADMIN_ID, "marquinhos"));
    expect(url.searchParams.has("corretor_id")).toBe(false);
    expect(url.searchParams.get("deleted_at")).toBe("is.null");
    expect(url.searchParams.get("na_lixeira")).toBe("eq.false");
  });
  it("CONFIRMAR não pode usar IDs de outra conversa", () => {
    expect(propostaDaConversa([{ id: "mark" }, { id: "sami" }], new Set(["mark"]))).toEqual([{ id: "mark" }]);
    expect(propostaDaConversa([{ id: "sami" }], new Set(["mark"]))).toEqual([]);
  });
});