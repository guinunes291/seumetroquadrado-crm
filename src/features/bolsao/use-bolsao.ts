// Leitura do Bolsão de oportunidades.
//
// `bolsao_v1` e `bolsao_diagnostico_v1` (migrations 20260914120000 e
// 20260914130000) ainda não existem nos types gerados do Supabase; passam pela
// fronteira `rpc` de features/dashboard/queries para não gastar o budget de
// escapes de tipo (checado em CI). O retorno é validado com zod FAIL-CLOSED:
// linha malformada derruba a query com erro claro em vez de renderizar uma
// base silenciosamente errada.
//
// Banco antigo (sem as migrations): `rpcWithFallback` devolve null e a tela
// diz "indisponível", nunca "Bolsão vazio". Base vazia e base indisponível
// levam a decisões opostas — a primeira manda o corretor procurar em outro
// lugar, a segunda manda ele chamar o suporte.

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { rpcWithFallback } from "@/lib/supabase-errors";
import { rpc } from "@/features/dashboard/queries";
import type { LinhaBolsao } from "@/features/bolsao/derive";

export const BOLSAO_KEY = "bolsao";
export const BOLSAO_DIAGNOSTICO_KEY = "bolsao-diagnostico";

const linhaSchema = z.object({
  lead_id: z.string().uuid(),
  nome: z.string(),
  telefone_mascarado: z.string().nullable(),
  status: z.string(),
  origem: z.string().nullable(),
  projeto_nome: z.string().nullable(),
  bairro: z.string().nullable(),
  zona: z.string().nullable(),
  parado_desde: z.string(),
  dias_parado: z.number().int(),
  tem_interacao: z.boolean(),
  tem_contato: z.boolean(),
  em_triagem_sdr: z.boolean(),
});

export function parseBolsao(input: unknown): LinhaBolsao[] {
  return z.array(linhaSchema).parse(input ?? []);
}

export function useBolsao(opts: { busca?: string; limite?: number; offset?: number } = {}) {
  const { user } = useAuth();
  const { busca, limite = 50, offset = 0 } = opts;
  return useQuery({
    queryKey: [BOLSAO_KEY, busca ?? "", limite, offset],
    enabled: !!user,
    staleTime: 60_000,
    // A busca muda a cada tecla: manter a página anterior evita o pisca de
    // lista vazia enquanto a próxima carrega.
    placeholderData: (anterior) => anterior,
    queryFn: () =>
      rpcWithFallback<LinhaBolsao[] | null>(
        async () => {
          const { data, error } = await rpc("bolsao_v1", {
            _busca: busca?.trim() ? busca.trim() : null,
            _limite: limite,
            _offset: offset,
          });
          if (error) throw error;
          return parseBolsao(data);
        },
        () => null,
      ),
  });
}

const diagnosticoSchema = z.object({
  base_viva: z.coerce.number().int(),
  com_dono: z.coerce.number().int(),
  sem_dono: z.coerce.number().int(),
  congelados_por_venda: z.coerce.number().int(),
  status_de_venda: z.coerce.number().int(),
  status_de_venda_sem_venda_viva: z.coerce.number().int(),
  perdidos_com_dono: z.coerce.number().int(),
  perdidos_sem_retrabalho: z.coerce.number().int(),
  bolsao_elegivel: z.coerce.number().int(),
  sem_dono_sem_telefone: z.coerce.number().int(),
  sem_dono_opt_out: z.coerce.number().int(),
  estoque_com_dono: z.coerce.number().int(),
  estoque_com_dono_no_fundo: z.coerce.number().int(),
  estoque_com_dono_congelado: z.coerce.number().int(),
});

export type DiagnosticoBolsao = z.infer<typeof diagnosticoSchema>;

/** O tamanho real da base, para o placar da tela não mentir sobre o que a
 *  página mostra. Só gestão recebe números; fora dela a RPC devolve zeros —
 *  é painel, não gate, então a tela simplesmente não mostra o bloco. */
export function useBolsaoDiagnostico() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [BOLSAO_DIAGNOSTICO_KEY],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: () =>
      rpcWithFallback<DiagnosticoBolsao | null>(
        async () => {
          const { data, error } = await rpc("bolsao_diagnostico_v1", {});
          if (error) throw error;
          const linhas = z.array(diagnosticoSchema).parse(data ?? []);
          return linhas[0] ?? null;
        },
        () => null,
      ),
  });
}
