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
  const opcoes: postgres.Options<{}> & { max_pipeline: number } = {
    prepare: false,
    // Uma consulta por vez em cada conexão. Por padrão o postgres.js manda a
    // consulta seguinte antes de a anterior responder, e o pooler em modo
    // transação às vezes perde a resposta da segunda: a página fica esperando
    // até estourar o tempo. Os registros mostraram isso na Biblioteca, com a
    // contagem de aprovações pendentes do topo da página. A opção existe no
    // postgres.js, só não está nos tipos dele.
    max_pipeline: 0,
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    connection: { application_name: "painel-marketing" },
    onnotice: () => {},
  };
  return postgres(url, opcoes);
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
