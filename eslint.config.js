import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

import quality from "./eslint-rules/index.cjs";

const testFiles = [
  "**/*{.,-}{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  "**/{__tests__,__mocks__,fixtures,mocks}/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
];

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Arquivos GERADOS pela plataforma Lovable (cabeçalho "This file is
  // automatically generated. Do not edit it directly."). Regras de estilo não
  // se aplicam: todo save do editor reescreve o arquivo e desfaz o conserto.
  //
  // Histórico que motivou isto: `previewAuthStorage.ts` quebrou o `lint:ci` com
  // `prefer-const` em 4040159, foi consertado à mão no #183 (0fbc7eb), e voltou
  // a quebrar no save seguinte — deixando o main vermelho e bloqueando todo PR,
  // inclusive os que não tocam em código. Consertar à mão é enxugar gelo.
  //
  // Mesma lógica que scripts/check-type-escape-budget.mjs já aplica a
  // src/routeTree.gen.ts: ratchet não mede código que ninguém escreve.
  // Só estilo é desligado — erros reais (no-undef, no-unused-expressions,
  // regras de tipo) continuam valendo nestes arquivos.
  {
    files: [
      "src/integrations/supabase/auth-attacher.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/client.server.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
    ],
    rules: {
      "prefer-const": "off",
    },
  },
  // Quality gates copiados do vibe-coding-toolkit (commit 790a895, prompt 08).
  // Os .cjs em eslint-rules/ são cópia byte a byte — não reformatar (por isso
  // estão no .prettierignore). Severidade definida pela medição inicial: regra
  // com violações entra em "warn" com a contagem anotada (baseline); volta a
  // "error" quando a contagem chegar a zero.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { quality },
    rules: {
      // Baseline 2026-10-23: 160 arquivos acima de 350 linhas.
      "quality/max-lines": ["warn", { max: 350 }],
      // Baseline 2026-10-23: 88 chamadas em 48 arquivos. Não existe logger
      // central no projeto ainda, então não há bloco "off" para um adaptador.
      "quality/no-direct-console": ["warn", { logger: "um logger central do projeto" }],
      // Tela (.tsx em qualquer pasta, e src/components/) não importa o cliente
      // do banco. O Drizzle aqui só descreve o schema das migrations; o acesso
      // real é pelo Supabase. Camada de dados liberada: features/*/queries.ts,
      // lib/*.server.ts, lib/*.functions.ts e routes/api/** (servidor).
      // Baseline 2026-10-23: 105 telas importam `supabase` (cliente com RLS);
      // 0 telas importam `supabaseAdmin`.
      "quality/no-direct-data-access": [
        "warn",
        {
          modules: ["@/integrations/supabase/client", "@/integrations/supabase/client.server"],
          bindings: ["supabase", "supabaseAdmin"],
          layers: ["/src/components/"],
          extensions: [".tsx"],
        },
      ],
    },
  },
  {
    // Tipos gerados pelo Supabase a partir do banco (já no .prettierignore):
    // ninguém escreve este arquivo à mão, o próximo save do Lovable o reescreve.
    // Vem DEPOIS do bloco que liga a regra, senão o "off" é sobrescrito.
    files: ["src/integrations/supabase/types.ts"],
    rules: {
      "quality/max-lines": "off",
    },
  },
  {
    // Mesmo teto para arquivos de teste, sempre em "warn". Vem DEPOIS do bloco
    // acima: em flat config o bloco posterior vence para o mesmo arquivo.
    // Baseline 2026-10-23: 79 arquivos de teste acima de 350 linhas.
    files: testFiles,
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
    },
  },
  eslintPluginPrettier,
);
