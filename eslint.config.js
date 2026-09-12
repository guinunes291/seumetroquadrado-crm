import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

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
  eslintPluginPrettier,
);
