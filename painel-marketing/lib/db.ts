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

function criar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  return postgres(url, {
    prepare: false,
    max: 3,
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
