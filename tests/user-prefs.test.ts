import { beforeEach, describe, expect, it, vi } from "vitest";

// Cliente Supabase fake — cada teste configura o comportamento de from().
const upsertMock = vi.fn();
const eqMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      upsert: upsertMock,
      select: () => ({ eq: eqMock }),
    }),
  },
}));

import {
  _resetServerSyncForTests,
  pullPrefs,
  pushPref,
  readLocalPref,
  writeLocalPref,
} from "@/lib/user-prefs";

const UID = "user-1";

beforeEach(() => {
  window.localStorage.clear();
  upsertMock.mockReset();
  eqMock.mockReset();
  _resetServerSyncForTests();
});

describe("preferências locais", () => {
  it("faz round-trip por usuário e chave", () => {
    writeLocalPref(UID, "ui:sidebar-collapsed", true);
    expect(readLocalPref(UID, "ui:sidebar-collapsed", false)).toBe(true);
    // outro usuário não enxerga
    expect(readLocalPref("user-2", "ui:sidebar-collapsed", false)).toBe(false);
  });

  it("volta ao fallback com JSON corrompido", () => {
    window.localStorage.setItem(`smq:pref:${UID}:table:leads`, "{corrompido");
    expect(readLocalPref(UID, "table:leads", { hidden: [] })).toEqual({ hidden: [] });
  });

  it("sem uid não grava nada (sessão ainda carregando)", () => {
    writeLocalPref("", "ui:density", "compact");
    expect(window.localStorage.length).toBe(0);
  });
});

describe("sync com o servidor", () => {
  it("pushPref faz upsert com user_id/key/value", async () => {
    upsertMock.mockResolvedValue({ error: null });
    await pushPref(UID, "ui:density", "compact");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toMatchObject({
      user_id: UID,
      key: "ui:density",
      value: "compact",
    });
  });

  it("pullPrefs devolve mapa chave→valor", async () => {
    eqMock.mockResolvedValue({
      data: [
        { key: "ui:density", value: "compact" },
        { key: "table:leads", value: { hidden: ["origem"] } },
      ],
      error: null,
    });
    const prefs = await pullPrefs(UID);
    expect(prefs).toEqual({
      "ui:density": "compact",
      "table:leads": { hidden: ["origem"] },
    });
  });

  it("tabela ausente (42P01) desliga o sync da sessão sem lançar erro", async () => {
    upsertMock.mockResolvedValue({
      error: { code: "42P01", message: 'relation "user_preferences" does not exist' },
    });
    await pushPref(UID, "ui:density", "compact");
    // segunda gravação nem tenta o servidor
    await pushPref(UID, "ui:density", "comfortable");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    // e o pull devolve null (local continua como fonte)
    const prefs = await pullPrefs(UID);
    expect(prefs).toBeNull();
    expect(eqMock).not.toHaveBeenCalled();
  });

  it("erro real não desliga o sync (só loga)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    upsertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });
    await pushPref(UID, "ui:density", "compact");
    upsertMock.mockResolvedValue({ error: null });
    await pushPref(UID, "ui:density", "comfortable");
    expect(upsertMock).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
