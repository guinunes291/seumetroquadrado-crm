/**
 * Aba reservada — abrir o wa.me SÓ depois de gravar a tentativa.
 *
 * O que está travado aqui é o contrato "abriu ⇔ gravou": bloqueio de pop-up
 * não grava nada, gravação que falha fecha a aba, e a aba só sai do
 * about:blank depois que a gravação confirmou. E nunca com "noopener" — com
 * ele o window.open devolve null mesmo abrindo, que foi o defeito da Fila do
 * Dia da cadência.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { abrirDepoisDeRegistrar } from "@/lib/aba-reservada";

const WA = "https://wa.me/5511999990000?text=Oi";

function abaFalsa() {
  return {
    opener: window as Window | null,
    location: { href: "about:blank" },
    close: vi.fn(),
  };
}

/** window.open como o spec manda: com noopener/noreferrer devolve null. */
function espiarOpen(aba: ReturnType<typeof abaFalsa> | null) {
  return vi
    .spyOn(window, "open")
    .mockImplementation((_url, _target, features) =>
      aba && !/noopener|noreferrer/i.test(features ?? "") ? (aba as unknown as Window) : null,
    );
}

function adiado() {
  let resolver!: () => void;
  let rejeitar!: (e: Error) => void;
  const promessa = new Promise<void>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("abrirDepoisDeRegistrar", () => {
  it("bloqueio de pop-up: devolve null e NÃO chama o registro", () => {
    espiarOpen(null);
    const registrar = vi.fn(async () => undefined);
    expect(abrirDepoisDeRegistrar(WA, registrar)).toBeNull();
    expect(registrar).not.toHaveBeenCalled();
  });

  it("reserva about:blank sem noopener/noreferrer e zera o opener na hora", () => {
    const aba = abaFalsa();
    const open = espiarOpen(aba);
    const desfecho = abrirDepoisDeRegistrar(WA, () => new Promise(() => {}));
    expect(desfecho).not.toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
    const [url, alvo, features] = open.mock.calls[0];
    expect(url).toBe("about:blank");
    expect(alvo).toBe("_blank");
    expect(String(features ?? "")).not.toMatch(/noopener|noreferrer/i);
    // Antes de qualquer gravação: o destino não alcança o CRM por window.opener.
    expect(aba.opener).toBeNull();
  });

  it("chama o registro no mesmo tique do clique e só navega depois que ele confirma", async () => {
    const aba = abaFalsa();
    espiarOpen(aba);
    const registro = adiado();
    const registrar = vi.fn(() => registro.promessa);

    const desfecho = abrirDepoisDeRegistrar(WA, registrar);
    expect(registrar).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(aba.location.href).toBe("about:blank");

    registro.resolver();
    await expect(desfecho).resolves.toBe(true);
    expect(aba.location.href).toBe(WA);
    expect(aba.close).not.toHaveBeenCalled();
  });

  it("registro que falha fecha a aba reservada e não navega (e a promessa não rejeita)", async () => {
    const aba = abaFalsa();
    espiarOpen(aba);
    const registro = adiado();

    const desfecho = abrirDepoisDeRegistrar(WA, () => registro.promessa);
    registro.rejeitar(new Error("RPC caiu"));

    await expect(desfecho).resolves.toBe(false);
    expect(aba.close).toHaveBeenCalledTimes(1);
    expect(aba.location.href).toBe("about:blank");
  });

  it("registro que lança síncrono também fecha a aba", async () => {
    const aba = abaFalsa();
    espiarOpen(aba);
    const desfecho = abrirDepoisDeRegistrar(WA, () => {
      throw new Error("sem lead");
    });
    await expect(desfecho).resolves.toBe(false);
    expect(aba.close).toHaveBeenCalledTimes(1);
    expect(aba.location.href).toBe("about:blank");
  });

  it("aba fechada antes de a gravação voltar: navegar falha, mas a promessa não rejeita", async () => {
    const aba = {
      opener: window as Window | null,
      location: {
        get href() {
          return "about:blank";
        },
        set href(_v: string) {
          throw new Error("janela fechada");
        },
      },
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(aba as unknown as Window);
    const registrar = vi.fn(async () => undefined);
    await expect(abrirDepoisDeRegistrar(WA, registrar)).resolves.toBe(false);
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it("navegador que recusa reescrever o opener não impede a abertura", async () => {
    const aba = {
      get opener(): Window | null {
        return window;
      },
      set opener(_v: Window | null) {
        throw new Error("read-only");
      },
      location: { href: "about:blank" },
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(aba as unknown as Window);
    await expect(abrirDepoisDeRegistrar(WA, async () => undefined)).resolves.toBe(true);
    expect(aba.location.href).toBe(WA);
  });
});
