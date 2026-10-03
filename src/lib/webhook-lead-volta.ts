// A pessoa que já passou pelo CRM e volta pelo anúncio (registro mãe, Fatia B
// — docs/ops/registro-mae.md). O banco decide (registrar_volta_campanha); aqui
// fica o contrato da decisão e o que o webhook escreve em cada caso.
// Puro (só zod) para ser testável em unidade — o route importa daqui.
import { z } from "zod";
import { rotulosHerdados } from "@/features/leads/campos-cliente";

const uuid = z.string().uuid();

export const voltaSchema = z.discriminatedUnion("acao", [
  // Ninguém com esse telefone: o INSERT de sempre.
  z.object({ acao: z.literal("cliente_novo") }),
  // A mesma entrada de novo (formulário enviado duas vezes, retry do Zap).
  z.object({
    acao: z.literal("reenvio"),
    lead_id: uuid,
    cliente_id: uuid,
    corretor_id: uuid.nullable(),
  }),
  // Um registro da pessoa em Visita realizada ou além: fica com o dono dele.
  z.object({
    acao: z.literal("negociacao_avancada"),
    lead_id: uuid,
    cliente_id: uuid,
    corretor_id: uuid.nullable(),
  }),
  // Filho novo, já criado e vinculado à mãe; o webhook distribui.
  z.object({
    acao: z.literal("registro_filho"),
    lead_id: uuid,
    cliente_id: uuid,
    campos_herdados: z.array(z.string()),
    corretores_excluidos: z.number().int().nonnegative(),
  }),
]);

export type Volta = z.infer<typeof voltaSchema>;
export type VoltaSemRegistroNovo = Extract<Volta, { acao: "reenvio" | "negociacao_avancada" }>;

/**
 * Fail-closed: resposta fora do contrato vira null e o webhook segue o
 * caminho de lead novo — o índice único de telefone barra a duplicata.
 */
export function lerVolta(data: unknown): Volta | null {
  const r = voltaSchema.safeParse(data);
  return r.success ? r.data : null;
}

/** O `motivo` da resposta do webhook quando não nasce registro novo. */
export const MOTIVO_VOLTA = {
  reenvio: "reenvio_recente",
  negociacao_avancada: "mantido_negociacao_avancada",
} as const satisfies Record<VoltaSemRegistroNovo["acao"], string>;

/** Nota no registro que recebeu a volta, quando não nasce registro novo. */
export function textoVoltaSemRegistroNovo(
  acao: VoltaSemRegistroNovo["acao"],
  ctx: { campanha: string; quando: string },
): string {
  return acao === "reenvio"
    ? `O cliente reenviou o formulário (campanha ${ctx.campanha}) em ${ctx.quando}. ` +
        "É a mesma entrada: nenhum registro novo foi criado."
    : `Cliente em negociação voltou pela campanha ${ctx.campanha} em ${ctx.quando}. ` +
        "Ele segue com você: nenhum outro corretor recebe este cliente.";
}

/** Nota no filho da campanha: de onde ele veio e o que já veio preenchido. */
export function textoRegistroFilho(campos: string[], ctx: { campanha: string }): string {
  const rotulos = rotulosHerdados(campos);
  return (
    `Este cliente já tinha passado pelo CRM e voltou pela campanha ${ctx.campanha}. ` +
    "Este registro é seu; o histórico de outros atendimentos não vem junto." +
    (rotulos.length ? ` Vieram preenchidos: ${rotulos.join(", ")}.` : "")
  );
}
