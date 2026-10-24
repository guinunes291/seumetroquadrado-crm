import "server-only";
import { sql } from "./db";

// Toda ação do Painel deixa rastro em marketing.auditoria.
// detalhe nunca leva token, senha ou chave: só o que ajuda a entender e reverter.
export async function registrar(
  quem: string,
  acao: string,
  alvo: string | null,
  detalhe: Record<string, unknown>,
) {
  await sql()`
    insert into auditoria (quem, acao, alvo, detalhe)
    values (${quem}, ${acao}, ${alvo}, ${sql().json(detalhe as never)})`;
}
