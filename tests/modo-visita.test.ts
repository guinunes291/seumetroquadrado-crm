import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260711133000_modo_visita.sql");
const page = read("src/features/visitas/modo-visita-page.tsx");

describe("Modo Visita", () => {
  it("centraliza escrita e aplica o mesmo escopo de carteira", () => {
    expect(migration).toContain("ALTER TABLE public.visita_execucoes FORCE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.visita_execucoes FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("public.is_active_member(_uid)");
    expect(migration).toContain("public.pode_acessar_lead(_uid, _agenda.lead_id)");
    expect(migration).toContain("USING (public.pode_acessar_lead(auth.uid(), lead_id))");
  });

  it("conclui agenda, execução e próxima etapa na mesma transação", () => {
    const rpc = migration.match(
      /CREATE OR REPLACE FUNCTION public\.salvar_modo_visita[\s\S]*?REVOKE ALL ON FUNCTION public\.salvar_modo_visita/,
    )?.[0];
    expect(rpc).toBeTruthy();
    expect(rpc).toContain("FOR UPDATE");
    expect(rpc).toContain("UPDATE public.agendamentos");
    expect(rpc).toContain("PERFORM public.transicionar_lead");
    expect(rpc).toContain("IF _ja_concluida");
    expect(rpc).toContain("somente visita agendada ou confirmada pode ser executada");
    expect(rpc).toContain("aguardando retorno exige follow-up futuro");
  });

  it("persiste somente texto revisado, nunca áudio bruto", () => {
    expect(migration).not.toMatch(/bytea|audio_(?:url|path|blob)/i);
    expect(page).toContain("webkitSpeechRecognition");
    expect(page).toContain("O CRM não grava nem armazena o áudio");
    expect(page).toContain("o navegador pode enviá-lo ao");
    expect(page).toContain("cliente autorizou o ditado");
    expect(page).toContain("onCheckedChange={handleSpeechConsent}");
    expect(page).toContain("if (!consentGranted && listening)");
    expect(page).toContain("recognitionRef.current.onresult = null");
    expect(page).toContain("(!speechConsent && !listening)");
    expect(page).not.toContain("MediaRecorder");
    expect(page).not.toContain("getUserMedia");
  });

  it("mantém agenda compacta e ações de campo acessíveis", () => {
    expect(page).toContain(".limit(20)");
    expect(page).toContain("aria-pressed={listening}");
    expect(page).toContain('role="status" aria-live="polite"');
    expect(page).toContain("<StickyActionRail");
    expect(page).toContain("disabled={saveMutation.isPending || completed}");
  });
});
