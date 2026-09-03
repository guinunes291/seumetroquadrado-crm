// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import type { Plugin } from "vite";

// Pesos do Phosphor que o CRM usa (identidade v3): duotone é o padrão
// (IconContext no __root), fill marca o item ativo da navegação e regular é o
// fallback da biblioteca quando não há provider (testes). Cada módulo de ícone
// do @phosphor-icons/react carrega os SEIS pesos num Map — mesmo com
// tree-shaking, um ícone custa 6× o path. Este transform apaga as entradas dos
// pesos não usados no build; se o formato do módulo mudar, devolve o original.
const PHOSPHOR_WEIGHTS = new Set(["duotone", "fill", "regular"]);

function phosphorWeightsPlugin(): Plugin {
  return {
    name: "smq:phosphor-weights",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@phosphor-icons/react/dist/defs/")) return null;
      const open = code.indexOf("new Map([");
      const close = code.lastIndexOf("]);");
      if (open < 0 || close < 0) return null;
      const inner = code.slice(open + "new Map([".length, close);
      // Entradas: `[\n    "peso",\n    ...\n  ]` separadas por vírgula + quebra.
      const entries = inner.split(/\n {2}\],?\n {2}\[\n/);
      if (entries.length !== 6) return null;
      const kept = entries.filter((entry) => {
        const m = entry.match(/^\s*\[?\s*"([a-z]+)"/);
        return m ? PHOSPHOR_WEIGHTS.has(m[1]) : true;
      });
      if (kept.length === entries.length) return null;
      const first = kept[0].replace(/^\s*\[\n/, "");
      const last = kept[kept.length - 1].replace(/\n {2}\]\s*$/, "");
      const body = kept.map((e, i) => {
        let t = e;
        if (i === 0) t = first;
        if (i === kept.length - 1) t = last;
        return `  [\n${t}\n  ]`;
      });
      return {
        code: `${code.slice(0, open)}new Map([\n${body.join(",\n")}\n${code.slice(close)}`,
        map: null,
      };
    },
  };
}

const publicBackendEnv = {
  url:
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    "https://rldnprwjlomjmjvinxuh.supabase.co",
  publishableKey:
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "sb_publishable_iME1K9WwVJYw8xCfwv2XVg_Pt3iR4fb",
  projectId: process.env.VITE_SUPABASE_PROJECT_ID ?? "rldnprwjlomjmjvinxuh",
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin(), phosphorWeightsPlugin()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicBackendEnv.url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        publicBackendEnv.publishableKey,
      ),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(publicBackendEnv.publishableKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(publicBackendEnv.projectId),
      "process.env.SUPABASE_URL": JSON.stringify(publicBackendEnv.url),
      "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicBackendEnv.publishableKey),
    },
    build: {
      // Vendors pesados separados por rota. NÃO particionamos react/react-dom/
      // scheduler/tanstack em chunks próprios: o shim do `use-sync-external-store`
      // muta o namespace do React e, quando react vira um chunk carregado
      // tardiamente, quebra com "Cannot set properties of undefined
      // (setting 'useSyncExternalStore')" e derruba o app publicado (tela preta).
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("node_modules/@supabase/")) return "vendor-supabase";
            if (id.includes("node_modules/@radix-ui/")) return "vendor-radix";
            if (/node_modules\/(recharts|d3-|victory-vendor)\//.test(id)) return "vendor-charts";
            if (/node_modules\/(lucide-react|sonner|cmdk|vaul|embla-carousel)\//.test(id)) {
              return "vendor-ui";
            }
            if (/node_modules\/(date-fns|react-day-picker)\//.test(id)) return "vendor-date";
            return undefined;
          },
        },
      },
    },
  },
});
