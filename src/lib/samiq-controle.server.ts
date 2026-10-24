// Ferramentas de CONTROLE da Sami no WhatsApp (v8, "CRM no WhatsApp").
//
// O corretor nem sempre responde "CONFIRMAR 2": ele escreve "pode marcar a
// visita", "tira a tarefa, já liguei" ou "apaga aquele contato que você
// registrou". Essas três ferramentas deixam a Sami agir sobre a fila da
// própria conversa, sem abrir caminho novo de escrita:
//  * confirmar_pendentes: o MESMO confirmarPropostas do card e do CONFIRMAR,
//    com a sessão do corretor. Trava em código: só confirma quando a mensagem
//    do corretor tem um OK explícito e nenhuma correção (consentimentoExplicito).
//    "Sim, mas muda para 15h" não passa: a Sami refaz o item e descarta o antigo.
//  * descartar_pendentes: rejeita (nada foi gravado, nada a reverter).
//  * desfazer_acoes: o MESMO desfazer de 24 h do painel.
// Os números são os da lista que o corretor viu (cabeçalho do turno).

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { consentimentoExplicito, executadasDaDecisao } from "@/lib/samiq-canal";
import { escolherPorNumero } from "@/lib/samiq-contexto";
import {
  descreverProposta,
  motivoSemDesfazer,
  SAMIQ_TIPOS_SO_COM_CONFIRMAR,
  type PropostaSamiQ,
} from "@/lib/samiq-propostas";
import {
  confirmarPropostas,
  desfazerPropostas,
  rejeitarPropostasDetalhado,
} from "./samiq-confirmar.server";
import type { ContextoExecucao } from "./samiq-executar.server";

type Db = SupabaseClient<Database>;

/** O que as ferramentas de controle fizeram no turno (vira recibo no WhatsApp). */
export type ControleDoTurno = {
  confirmadas: PropostaSamiQ[];
  descartadas: PropostaSamiQ[];
  desfeitas: PropostaSamiQ[];
};

const Itens = z
  .array(z.number().int().min(1).max(20))
  .max(20)
  .optional()
  .describe("Números dos itens na lista do cabeçalho; vazio = todos");

export const ConfirmarPendentesInput = z.object({
  itens: z
    .array(z.number().int().min(1).max(20))
    .min(1)
    .max(20)
    .describe("Números dos itens que o corretor aprovou, na lista 'Esperando o OK'"),
});

export const DescartarPendentesInput = z.object({
  itens: z
    .array(z.number().int().min(1).max(20))
    .min(1)
    .max(20)
    .describe("Números dos itens a descartar"),
});
export const DesfazerAcoesInput = z.object({ itens: Itens });

export function criarFerramentasDeControleSamiQ(args: {
  supabase: Db;
  userId: string;
  /** Texto CRU do corretor neste turno (a trava de consentimento lê aqui, no servidor). */
  textoDoCorretor: string;
  /** Na numeração que o corretor viu. */
  pendentes: ReadonlyArray<PropostaSamiQ>;
  executadas: ReadonlyArray<PropostaSamiQ>;
  contexto?: ContextoExecucao;
  registro: ControleDoTurno;
  agora?: Date;
}): ToolSet {
  const { supabase, userId, registro } = args;
  const agora = args.agora ?? new Date();
  const pendentes = [...args.pendentes];
  const executadas = [...args.executadas];
  const decididas = new Set<string>();

  const escolher = (lista: PropostaSamiQ[], itens?: number[]) => {
    const ids = escolherPorNumero(
      lista.map((p) => p.id),
      itens ?? [],
    );
    if (ids === null) return null;
    return ids
      .map((id) => lista.find((p) => p.id === id))
      .filter((p): p is PropostaSamiQ => !!p && !decididas.has(p.id));
  };

  const titulo = (p: PropostaSamiQ) => descreverProposta(p.payload, p.leadNome).titulo;

  const out: ToolSet = {};

  if (pendentes.length > 0) {
    out.confirmar_pendentes = tool({
      description:
        "Grava itens que estão esperando o OK do corretor (lista 'Esperando o OK' do cabeçalho), pelo número, quando ele disse que pode em linguagem natural ('pode marcar', 'isso, grava'). Se ele pediu mudança ('sim, mas às 15h'), NÃO confirme: crie o item corrigido e descarte o antigo. Venda, perda, troca de vaga e crédito só com o CONFIRMAR dele.",
      inputSchema: ConfirmarPendentesInput,
      execute: async ({ itens }) => {
        if (!consentimentoExplicito(args.textoDoCorretor)) {
          return {
            erro: "sem_ok_explicito",
            detalhe:
              "A mensagem do corretor não é um OK claro. Nada foi gravado. Pergunte se pode gravar (ele responde CONFIRMAR) ou ajuste o item que ele corrigiu.",
          };
        }
        const escolhidas = escolher(pendentes, itens);
        if (escolhidas === null)
          return { erro: "item_inexistente", detalhe: `a lista tem ${pendentes.length} itens` };
        if (escolhidas.length === 0)
          return { erro: "nada_a_confirmar", detalhe: "esses itens já foram decididos" };
        const criticas = escolhidas.filter((p) => SAMIQ_TIPOS_SO_COM_CONFIRMAR.has(p.tipo));
        if (criticas.length > 0) {
          const numeros = criticas.map((p) => pendentes.indexOf(p) + 1).join(" e ");
          return {
            erro: "precisa_confirmar",
            detalhe: `Venda, perda, troca de vaga e crédito só gravam com o comando do corretor. Nada foi gravado. Peça para ele responder CONFIRMAR ${numeros}.`,
          };
        }
        const resultados = await confirmarPropostas({
          supabase,
          userId,
          itens: escolhidas.map((p) => ({ id: p.id })),
          contexto: args.contexto,
        });
        for (const p of escolhidas) decididas.add(p.id);
        const recibo = executadasDaDecisao(escolhidas, resultados);
        registro.confirmadas.push(...recibo);
        return {
          resultados: recibo.map((p) => ({
            item: titulo(p),
            gravado: p.status === "aceita" || p.status === "editada",
            efeito: p.efeito ?? undefined,
            erro: p.erro ?? undefined,
          })),
          aviso:
            "O sistema manda o recibo. Fale só do próximo passo; se algo falhou, explique em uma frase.",
        };
      },
    });

    out.descartar_pendentes = tool({
      description:
        "Descarta itens que esperavam o OK (nada é gravado), quando o corretor disse que não precisa ou quando você vai substituir um item por outro corrigido.",
      inputSchema: DescartarPendentesInput,
      execute: async ({ itens }) => {
        const escolhidas = escolher(pendentes, itens);
        if (escolhidas === null)
          return { erro: "item_inexistente", detalhe: `a lista tem ${pendentes.length} itens` };
        if (escolhidas.length === 0) return { erro: "nada_a_descartar" };
        const r = await rejeitarPropostasDetalhado({ userId, ids: escolhidas.map((p) => p.id) });
        const sairam = escolhidas.filter((p) => r.find((x) => x.id === p.id)?.ok);
        for (const p of sairam) decididas.add(p.id);
        registro.descartadas.push(...sairam);
        const ficaram = escolhidas.filter((p) => !sairam.includes(p));
        return {
          descartados: sairam.map(titulo),
          ...(ficaram.length
            ? { nao_descartados: ficaram.map(titulo), erro: "ja_em_gravacao_ou_crm_fora" }
            : {}),
        };
      },
    });
  }

  if (executadas.some((p) => motivoSemDesfazer(p, agora) === null)) {
    out.desfazer_acoes = tool({
      description:
        "Desfaz ações gravadas recentemente (lista 'Gravado recentemente' do cabeçalho, na numeração do recibo, até 24 h), quando o corretor pedir para apagar, anular ou desfazer. Itens marcados como 'não volta' não se desfazem. Mudança de etapa do funil não volta sozinha.",
      inputSchema: DesfazerAcoesInput,
      execute: async ({ itens }) => {
        const escolhidas = escolher(executadas, itens);
        if (escolhidas === null)
          return { erro: "item_inexistente", detalhe: `o recibo tem ${executadas.length} itens` };
        // Sem número = o recibo todo, só o que ainda volta; com número, explica cada um que não volta.
        const voltam = escolhidas.filter((p) => motivoSemDesfazer(p, agora) === null);
        const naoVoltam = (itens?.length ? escolhidas : []).flatMap((p) => {
          const motivo = motivoSemDesfazer(p, agora);
          return motivo ? [{ item: titulo(p), desfeito: false, erro: motivo }] : [];
        });
        if (voltam.length === 0) {
          return naoVoltam.length
            ? { erro: "nada_a_desfazer", resultados: naoVoltam }
            : { erro: "nada_a_desfazer" };
        }
        const r = await desfazerPropostas({ userId, ids: voltam.map((p) => p.id) });
        for (const p of voltam) decididas.add(p.id);
        const feitas = voltam.filter((p) => r.find((x) => x.id === p.id)?.ok);
        registro.desfeitas.push(...feitas);
        return {
          resultados: [
            ...voltam.map((p) => {
              const x = r.find((y) => y.id === p.id);
              return {
                item: titulo(p),
                desfeito: x?.ok === true,
                erro: x?.erro,
                // Partes que o corretor mudou na tela depois da Sami ficaram como ele deixou.
                ...(x?.mantidos?.length ? { mantidos: x.mantidos } : {}),
              };
            }),
            ...naoVoltam,
          ],
        };
      },
    });
  }

  return out;
}
