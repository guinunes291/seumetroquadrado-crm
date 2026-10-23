// Diretrizes aprendidas da Sami (melhoria contínua, 23/10/2026): o revisor
// diário propõe, o gestor aprova pelo link no WhatsApp e o n8n publica aqui.
// Este módulo é puro (sem banco) para ser testado.
import { z } from "zod";

export const SAMIQ_MAX_DIRETRIZES = 12;

export const DiretrizSamiInput = z.object({
  texto: z.string().trim().min(5).max(600),
  tipo: z.enum(["comportamento", "conhecimento"]).optional(),
  origem: z.string().trim().min(1).max(60).optional(),
  /** Id da regra no Supabase operacional (sami_regras): torna o POST idempotente. */
  id_origem: z.string().trim().min(1).max(100),
  ativa: z.boolean().optional(),
});
export type DiretrizSami = z.infer<typeof DiretrizSamiInput>;

export type LinhaDiretriz = { texto: string; tipo: string };

/** Bloco anexado ao system prompt. Vazio quando não há diretriz ativa. */
export function montarBlocoDiretrizes(linhas: LinhaDiretriz[]): string {
  const itens = linhas
    .map((l) => ({
      texto: String(l.texto ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      tipo: l.tipo,
    }))
    .filter((l) => l.texto.length > 0)
    .slice(0, SAMIQ_MAX_DIRETRIZES);
  if (itens.length === 0) return "";
  const linhasTexto = itens.map(
    (l) => `- ${l.tipo === "conhecimento" ? "[conhecimento] " : ""}${l.texto}`,
  );
  return [
    "",
    "",
    "DIRETRIZES APRENDIDAS (aprovadas pelo gestor da SMQ a partir de conversas reais com corretores; valem junto com as regras acima e prevalecem em caso de conflito):",
    ...linhasTexto,
  ].join("\n");
}