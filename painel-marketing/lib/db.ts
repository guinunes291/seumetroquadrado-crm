import "server-only";
import postgres from "postgres";

// Conexão com o smq-operacional pelo papel painel_marketing, que só enxerga o
// esquema marketing. A URL vem de DATABASE_URL (variável de ambiente da Vercel)
// e nunca vai para o navegador nem para os logs.
//
// prepare:false porque o pooler do Supabase em modo transação (porta 6543) não
// mantém prepared statements entre conexões.

declare global {
  var __painelSql: postgres.Sql | undefined;
  var __painelSqlUso: number | undefined;
}

// Na Vercel a função fica congelada entre um acesso e outro. As conexões que
// sobram abertas nesse tempo morrem no caminho até o pooler, e a próxima
// consulta fica esperando para sempre (a Biblioteca chegou a levar 2 minutos e
// depois travar). Por isso, depois de alguns segundos sem uso, as conexões
// velhas são fechadas e o pedido seguinte abre novas.
const OCIOSO_MS = 10_000;

function criar(max = 3) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  return postgres(url, {
    prepare: false,
    max,
    idle_timeout: 5,
    connect_timeout: 10,
    ssl: "require",
    connection: { application_name: "painel-marketing" },
    onnotice: () => {},
    // Diagnóstico temporário da Biblioteca travando: registra qual conexão
    // mandou qual consulta (só o começo do texto, nunca os valores).
    debug: (conn, q) =>
      console.log(
        `[db] ${new Date().toISOString()} conn ${conn} envia: ${q.replace(/\s+/g, " ").trim().slice(0, 70)}`,
      ),
    onclose: (conn) => console.log(`[db] ${new Date().toISOString()} conn ${conn} fechou`),
  });
}

export function sql() {
  const agora = Date.now();
  const velho = globalThis.__painelSql;
  if (velho && agora - (globalThis.__painelSqlUso ?? 0) > OCIOSO_MS) {
    // Deixa terminar o que ainda estiver rodando nele (até 30 s) antes de fechar.
    velho.end({ timeout: 30 }).catch(() => {});
    globalThis.__painelSql = undefined;
  }
  globalThis.__painelSqlUso = agora;
  globalThis.__painelSql ??= criar();
  return globalThis.__painelSql;
}

// Conexão só para uma gravação grande (como a sincronização da Biblioteca).
// Quem abre fecha com end() no fim, para que um problema nela não prenda as
// conexões que as páginas usam.
export function conexaoAvulsa() {
  return criar(1);
}
