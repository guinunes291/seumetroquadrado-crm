import { describe, expect, it } from "vitest";
import { MensagemSamiInput, DecidirPropostasInput } from "@/lib/samiq-canal";
import { MARQUINHOS_ADMIN_ID, podeUsarMarquinhos, propostaDaConversa, urlComEscopoSami, autoriaDoHistorico, confirmarExplicitoMarquinhos, desfazerExplicitoMarquinhos, selecionarLeadMarquinhos } from "@/lib/samiq-marquinhos";

describe("Marquinhos: autorização e isolamento", () => {
  it("CANCELAR nunca autoriza desfazer gravação", () => {
    for (const texto of ["CANCELAR", "CANCELAR 1", "cancela a nota", "apague a última nota"]) expect(desfazerExplicitoMarquinhos(texto)).toBe(false);
    expect(desfazerExplicitoMarquinhos("DESFAZER 1")).toBe(true);
  });
  it("seleciona por nome e etapa sem conversa anterior, mas não decide duplicados", () => {
    const candidatos = [{ id: "a", nome: "José Silva", status: "novo" }, { id: "b", nome: "José Silva", status: "agendado" }];
    expect(selecionarLeadMarquinhos(candidatos, "Jose Silva", "agendado")?.id).toBe("b");
    expect(selecionarLeadMarquinhos([...candidatos, { ...candidatos[1], id: "c", nome: "José Silva", status: "agendado" }], "José Silva", "agendado")).toBeNull();
  });
  it("aceita lead_id com nova_conversa e seleção por nome/status", () => {
    const base = { canal: "marquinhos", corretor_telefone: "11930785690", texto: "anote teste", nova_conversa: true };
    expect(MensagemSamiInput.parse({ ...base, lead_id: MARQUINHOS_ADMIN_ID }).lead_id).toBe(MARQUINHOS_ADMIN_ID);
    expect(MensagemSamiInput.parse({ ...base, lead_nome: "José Silva", lead_status: "agendado" }).lead_status).toBe("agendado");
  });
  it("exige CONFIRMAR, não sim, ok ou grava", () => {
    expect(confirmarExplicitoMarquinhos("CONFIRMAR 1")).toBe(true);
    expect(confirmarExplicitoMarquinhos("confirma")).toBe(true);
    for (const texto of ["sim", "ok", "grava", "pode marcar"]) expect(confirmarExplicitoMarquinhos(texto)).toBe(false);
  });
  it("mantém autoria Marquinhos na nota e na origem oficial do funil", () => {
    expect(autoriaDoHistorico({ origem: "marquinhos" })).toBe("Marquinhos (Mark)");
    expect(autoriaDoHistorico({ origem: "registrar_contato", via: "marquinhos" })).toBe("Marquinhos (Mark)");
    expect(autoriaDoHistorico({ origem: "samiq" })).toBe("Sami");
    expect(autoriaDoHistorico({ origem: "manual" })).toBeNull();
  });
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