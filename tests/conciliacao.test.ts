import { describe, it, expect } from "vitest";
import { parseOfx } from "@/lib/ofx";

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260701120000[-3:BRT]<TRNAMT>-1500.50<FITID>ABC123<MEMO>PIX ENVIADO CAMILLE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260705<TRNAMT>25000.00<FITID>XYZ999<NAME>CONSTRUTORA ALFA<MEMO>TED</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("parseOfx", () => {
  it("lê débitos e créditos com data, valor e fitid", () => {
    const r = parseOfx(OFX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transacoes).toHaveLength(2);
    expect(r.transacoes[0]).toMatchObject({ data: "2026-07-01", valor: -1500.5, fitid: "ABC123" });
    expect(r.transacoes[1]).toMatchObject({ data: "2026-07-05", valor: 25000, fitid: "XYZ999" });
    expect(r.transacoes[1].contraparte).toBe("CONSTRUTORA ALFA");
  });

  it("recusa arquivo que não é OFX", () => {
    const r = parseOfx("data;valor\n01/07/2026;-100");
    expect(r).toEqual({ ok: false, erro: "arquivo_nao_e_ofx" });
  });

  it("recusa OFX sem lançamentos", () => {
    const r = parseOfx("OFXHEADER:100\n<OFX></OFX>");
    expect(r.ok).toBe(false);
  });
});
