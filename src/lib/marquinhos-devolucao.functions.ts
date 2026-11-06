// Devolver ao Marquinhos — server functions chamadas pela tela.
//
// O pedido entra pela RPC com a SESSÃO do próprio corretor (auth.uid() e RLS
// decidem quem pode devolver); só o despacho ao n8n usa service role, logo em
// seguida, para o Marquinhos assumir na hora em vez de esperar o cron. Se o
// despacho falhar aqui, o pedido continua na fila e o cron tenta de novo.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isObjetivoDevolucao,
  OBSERVACAO_MAX,
  type ObjetivoDevolucao,
} from "@/features/mensagens/devolucao-marquinhos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function despacharAgora(): Promise<boolean> {
  try {
    const { despacharDevolucoesMarquinhos, configDevolucaoMarquinhos } =
      await import("@/lib/marquinhos-devolucao.server");
    if (!configDevolucaoMarquinhos()) return false;
    await despacharDevolucoesMarquinhos(5);
    return true;
  } catch (e) {
    console.error("[marquinhos-devolucao] despacho imediato falhou", e);
    return false;
  }
}

export const devolverAoMarquinhos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { leadId: string; objetivo: ObjetivoDevolucao; observacao?: string | null }) => {
      if (!UUID.test(input?.leadId ?? "")) throw new Error("Cliente inválido.");
      if (!isObjetivoDevolucao(input?.objetivo))
        throw new Error("Escolha o objetivo da devolução.");
      const observacao = (input.observacao ?? "").trim();
      if (observacao.length > OBSERVACAO_MAX)
        throw new Error(`O recado passa de ${OBSERVACAO_MAX} caracteres.`);
      return { leadId: input.leadId, objetivo: input.objetivo, observacao: observacao || null };
    },
  )
  .handler(async ({ data, context }): Promise<{ id: string; enviadoAgora: boolean }> => {
    const { data: id, error } = await context.supabase.rpc("marquinhos_devolver", {
      _lead_id: data.leadId,
      _objetivo: data.objetivo,
      _observacao: data.observacao ?? undefined,
    });
    if (error) throw new Error(error.message);
    if (!id) throw new Error("O banco não devolveu a devolução criada.");
    return { id, enviadoAgora: await despacharAgora() };
  });

export const retomarAtendimentoMarquinhos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { devolucaoId: string }) => {
    if (!UUID.test(input?.devolucaoId ?? "")) throw new Error("Devolução inválida.");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { data: status, error } = await context.supabase.rpc("marquinhos_retomar", {
      _devolucao_id: data.devolucaoId,
    });
    if (error) throw new Error(error.message);
    if (status === "retomando") await despacharAgora();
    return { status: String(status ?? "") };
  });
