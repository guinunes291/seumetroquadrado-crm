// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

const publicBackendEnv = {
  url: process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
  publishableKey:
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "",
  projectId: process.env.VITE_SUPABASE_PROJECT_ID ?? "",
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
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
