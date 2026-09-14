// A aba "Atendidos" do discador: leads do BOLSÃO que atenderam o discador do
// próprio corretor. Atender NÃO dá posse — o lead segue no Bolsão, discável
// por outros corretores, até alguém avançar a fase (a partir de agendado, por
// configuração). Por isso tudo aqui passa por RPCs DEFINER que exigem o
// registro de atendimento do próprio corretor:
//   * discador_atendidos_meus_v1  — a lista, anonimizada (telefone mascarado,
//                                    sem dizer quem mais atendeu nem quem virou dono);
//   * discador_atendido_nota_v1   — nota/ligação/whatsapp na timeline sem ser dono;
//   * discador_atendido_assumir_v1 — assume o lead para avançar de fase
//                                    (agendar visita): só aí ele entra na carteira.
// As RPCs não estão nos types gerados — passam pela fronteira `rpc` de
// features/dashboard/queries; retorno validado com zod FAIL-CLOSED.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";

export const ATENDIDOS_KEY = "discador-atendidos-meus";

const linhaSchema = z.object({
  lead_id: z.string().uuid(),
  nome: z.string(),
  telefone_mascarado: z.string().nullable(),
  status: z.string(),
  projeto_nome: z.string().nullable(),
  dias_parado: z.number().int(),
  primeiro_atendimento_em: z.string(),
  ultimo_atendimento_em: z.string(),
  atendimentos: z.number().int(),
  outros_corretores: z.number().int(),
  tem_dono: z.boolean(),
  dono_sou_eu: z.boolean(),
  ainda_no_bolsao: z.boolean(),
  encerrado_em: z.string().nullable(),
  encerrado_motivo: z.string().nullable(),
});

export type LinhaAtendido = z.infer<typeof linhaSchema>;

export function parseAtendidos(input: unknown): LinhaAtendido[] {
  return z.array(linhaSchema).parse(input ?? []);
}

export async function listarMeusAtendidos(): Promise<LinhaAtendido[] | null> {
  return rpcWithFallback<LinhaAtendido[] | null>(
    async () => {
      const { data, error } = await rpc("discador_atendidos_meus_v1", {});
      if (error) throw error;
      return parseAtendidos(data);
    },
    () => null,
  );
}

export type TipoNota = "ligacao" | "whatsapp" | "nota";

export async function registrarNotaAtendido(
  leadId: string,
  conteudo: string,
  tipo: TipoNota = "nota",
): Promise<void> {
  const { error } = await rpc("discador_atendido_nota_v1", {
    _lead: leadId,
    _conteudo: conteudo,
    _tipo: tipo,
  });
  if (error) throw new Error(error.message || "Não foi possível registrar a nota.");
}

export type ResultadoAssumir = { ok: boolean; motivo: string };

export async function assumirAtendido(leadId: string): Promise<ResultadoAssumir> {
  const { data, error } = await rpc("discador_atendido_assumir_v1", { _lead: leadId });
  if (error) throw new Error(error.message || "Não foi possível assumir o lead.");
  const r = (data ?? {}) as { ok?: boolean; motivo?: string };
  return { ok: r.ok === true, motivo: r.motivo ?? (r.ok ? "assumido" : "recusado") };
}

export const MOTIVO_ASSUMIR: Record<string, string> = {
  assumido: "O lead entrou na sua carteira. Agende a visita no dossiê.",
  ja_e_seu: "Este lead já é seu.",
  tem_dono: "Outro corretor avançou este cliente antes de você — ele saiu do Bolsão.",
  em_triagem_sdr: "Este lead está com o SDR agora; ele decide a entrega.",
  venda_viva: "Este cliente tem uma venda registrada — não se mexe.",
  lead_fora_da_base: "Este lead saiu da base (lixeira).",
  lead_inexistente: "Lead não encontrado.",
};

export const MOTIVO_ENCERRAMENTO: Record<string, string> = {
  posse_propria: "você assumiu",
  posse_outro: "outro corretor avançou",
};

/** Abertos primeiro (a RPC já ordena); aqui só separa para a tela. */
export function separarAtendidos(linhas: readonly LinhaAtendido[]): {
  abertos: LinhaAtendido[];
  encerrados: LinhaAtendido[];
} {
  const abertos: LinhaAtendido[] = [];
  const encerrados: LinhaAtendido[] = [];
  for (const l of linhas) (l.encerrado_em ? encerrados : abertos).push(l);
  return { abertos, encerrados };
}

export function useMeusAtendidos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [ATENDIDOS_KEY, user?.id],
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: listarMeusAtendidos,
  });
}
