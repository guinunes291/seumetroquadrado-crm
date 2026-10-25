import { createServerFn } from "@tanstack/react-start";
import type { PropostaPublica } from "@/lib/proposta-publica.server";

export const obterPropostaPublica = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => ({ token: String(input?.token ?? "").slice(0, 64) }))
  .handler(async ({ data }): Promise<PropostaPublica> => {
    const { carregarPropostaPublica } = await import("@/lib/proposta-publica.server");
    try {
      return await carregarPropostaPublica(data.token);
    } catch {
      // Sem log do token bruto.
      return { estado: "limite" };
    }
  });
