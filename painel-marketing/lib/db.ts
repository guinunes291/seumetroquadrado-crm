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
}

function criar(max = 3) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  return postgres(url, {
    prepare: false,
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    connection: { application_name: "painel-marketing" },
    onnotice: () => {},
  });
}

export function sql() {
  globalThis.__painelSql ??= criar();
  return globalThis.__painelSql;
}

// Conexão só para uma gravação grande (como a sincronização da Biblioteca).
// Quem abre fecha com end() no fim, para que um problema nela não prenda as
// conexões que as páginas usam.
export function conexaoAvulsa() {
  return criar(1);
}
