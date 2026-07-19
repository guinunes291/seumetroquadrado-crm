import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Suíte de banco (tests/db): roda contra um Postgres real com as migrations
// aplicadas pelo harness (scripts/db-harness). Não entra no `npm run test`
// normal — exige DATABASE_URL acessível (local: npm run db:up && db:apply).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    // Sequencial: os testes compartilham um banco e limpam dados entre si;
    // concorrência real é exercitada DENTRO dos testes (múltiplas conexões).
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
