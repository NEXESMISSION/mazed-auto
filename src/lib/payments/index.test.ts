import { describe, expect, it } from "vitest";
import {
  EMPTY_METHODS, availableMethods, bankProblems, d17Problems, formatD17, formatIban, formatRib,
  paymentInstructions, readPaymentMethods, receiptIssuer, type PaymentMethods,
} from "./index";

/**
 * D-B1: a buyer is only ever told to pay with what the back office opened,
 * complete and valid — and never with the sample details this code shipped
 * with (a made-up RIB / IBAN, a D17 number that may be anyone's phone).
 */
const RIB = "08006000671000123456";
const IBAN = "TN9108006000671000123456"; // checksum-valid, embeds RIB

const set = (over: Partial<{ bank: Partial<PaymentMethods["bank_transfer"]>; d17: Partial<PaymentMethods["d17"]> }>): PaymentMethods => ({
  bank_transfer: { ...EMPTY_METHODS.bank_transfer, ...over.bank },
  d17: { ...EMPTY_METHODS.d17, ...over.d17 },
});
const bank = { enabled: true, holder: "Mazed Auto SARL", bank: "BIAT", rib: RIB, iban: IBAN };

describe("payment methods — nothing offered unless opened", () => {
  it("reads a missing or broken setting as everything off", () => {
    expect(readPaymentMethods(null)).toEqual(EMPTY_METHODS);
    expect(readPaymentMethods({ bank_transfer: { enabled: "yes" } }).bank_transfer.enabled).toBe(false);
    expect(availableMethods(readPaymentMethods(undefined))).toEqual([]);
  });

  it("offers a method only when it is on and complete", () => {
    expect(availableMethods(set({ bank }))).toEqual(["bank_transfer"]);
    expect(availableMethods(set({ bank: { ...bank, enabled: false } }))).toEqual([]);
    expect(availableMethods(set({ bank: { ...bank, rib: "123" } }))).toEqual([]);
    expect(availableMethods(set({ d17: { enabled: true, holder: "Mazed Auto", number: "+216 98 120 622" } }))).toEqual(["d17"]);
  });

  it("checks the RIB, the IBAN's checksum and that both name the same account", () => {
    expect(bankProblems({ ...bank })).toEqual([]);
    expect(bankProblems({ ...bank, iban: "" })).toEqual([]);   // the RIB alone is enough
    expect(bankProblems({ ...bank, rib: "0800600067" })).toContain("rib");
    expect(bankProblems({ ...bank, iban: "TN9208006000671000123456" })).toContain("iban");
    expect(bankProblems({ ...bank, rib: "08006000671000123457" })).toContain("ibanRib");
    expect(d17Problems({ enabled: true, holder: "X Y", number: "12 345 67" })).toContain("number");
  });

  it("refuses the sample details this code shipped with", () => {
    const sample = { enabled: true, holder: "Batta Tunisia SARL", bank: "Société Tunisienne de Banque (STB)",
      rib: "07 003 0001234567890 78", iban: "TN59 0700 3000 0123 4567 8907 8" };
    expect(bankProblems(sample)).toContain("sample");
    expect(d17Problems({ enabled: true, holder: "Mazed Auto", number: "55 123 456" })).toContain("sample");
    expect(availableMethods(set({ bank: sample, d17: { enabled: true, holder: "Mazed Auto", number: "55 123 456" } }))).toEqual([]);
    expect(receiptIssuer(set({ bank: sample }))).toBe("Mazed Auto");
  });

  it("shows only the open methods, in the bank's own formatting", () => {
    expect(paymentInstructions({ paymentId: "abcdef12-0000", amountTND: 29, methods: EMPTY_METHODS })).toEqual([]);
    const shown = paymentInstructions({ paymentId: "abcdef12-0000", amountTND: 29, methods: set({ bank }) });
    expect(shown.map((p) => p.value)).toEqual(["bank_transfer"]);
    const values = shown[0].fields.map((f) => f.value);
    expect(values).toContain("08 006 0006710001234 56");
    expect(values).toContain("TN91 0800 6000 6710 0012 3456");
    expect(values).toContain("MAZED-ABCDEF12");
    expect(formatRib(RIB)).toBe("08 006 0006710001234 56");
    expect(formatIban(IBAN)).toBe("TN91 0800 6000 6710 0012 3456");
    expect(formatD17("+21698120622")).toBe("98 120 622");
  });
});
