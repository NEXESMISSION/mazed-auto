import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOLDER, EMPTY_METHODS, availableMethods, bankFromRib, bankProblems, d17Problems, formatD17, formatIban,
  formatRib, ibanFromRib, konnectProblems, paymentInstructions, readPaymentMethods, receiptIssuer, ribKeyOk, withRib,
  type PaymentMethods,
} from "./index";

/**
 * D-B1: a buyer is only ever told to pay with what the back office opened,
 * complete and valid — and never with the sample details this code shipped
 * with (a made-up RIB / IBAN, a D17 number that may be anyone's phone).
 */
const RIB = "08006000671000123450"; // its key (the last two digits) is right
const IBAN = "TN5908006000671000123450"; // checksum-valid, embeds RIB

const set = (over: Partial<{ bank: Partial<PaymentMethods["bank_transfer"]>; d17: Partial<PaymentMethods["d17"]> }>): PaymentMethods => ({
  bank_transfer: { ...EMPTY_METHODS.bank_transfer, ...over.bank },
  d17: { ...EMPTY_METHODS.d17, ...over.d17 },
  konnect: EMPTY_METHODS.konnect,
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
    expect(bankProblems({ ...bank, iban: "TN5808006000671000123450" })).toContain("iban");
    expect(bankProblems({ ...bank, rib: "08006000671000123457" })).toContain("ibanRib");
    expect(bankProblems({ ...bank, rib: "08006000671000123457", iban: "" })).toEqual(["ribKey"]); // one digit off
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
    expect(values).toContain("08 006 0006710001234 50");
    expect(values).toContain("TN59 0800 6000 6710 0012 3450");
    expect(values).toContain("MAZED-ABCDEF12");
    expect(formatRib(RIB)).toBe("08 006 0006710001234 50");
    expect(formatIban(IBAN)).toBe("TN59 0800 6000 6710 0012 3450");
    expect(formatD17("+21698120622")).toBe("98 120 622");
  });
});

describe("payment methods — filled in for the back office to check", () => {
  it("names the company as the beneficiary until another name is written", () => {
    expect(DEFAULT_HOLDER).toBe("Mazed Auto");
    expect(readPaymentMethods(null).bank_transfer.holder).toBe("Mazed Auto");
    expect(readPaymentMethods({ d17: { holder: "  " } }).d17.holder).toBe("Mazed Auto");
    expect(readPaymentMethods({ bank_transfer: { holder: "Mazed Auto SA" } }).bank_transfer.holder).toBe("Mazed Auto SA");
  });

  it("never reads back the forked project's name", () => {
    expect(readPaymentMethods({ bank_transfer: { holder: "Batta Tunisia SARL" } }).bank_transfer.holder).toBe("Mazed Auto");
  });

  it("derives the IBAN from the RIB: TN59 and the RIB", () => {
    expect(ibanFromRib("08 006 0006710001234 50")).toBe(IBAN);
    expect(ibanFromRib("0800600067")).toBe("");
    // The IBAN registry's own Tunisian example.
    expect(ibanFromRib("10006035183598478831")).toBe("TN5910006035183598478831");
    expect(bankProblems({ ...bank, iban: ibanFromRib(RIB) })).toEqual([]);
  });

  it("checks the RIB's key", () => {
    expect(ribKeyOk(RIB)).toBe(true);
    expect(ribKeyOk("08006000671000123451")).toBe(false);
    expect(ribKeyOk("123")).toBe(false);
    // Typed once, wrong once: the IBAN made from it is not blamed as well.
    const typo = withRib(EMPTY_METHODS.bank_transfer, "08006000671000123451");
    expect(bankProblems({ ...typo, enabled: true })).toEqual(["ribKey"]);
  });

  it("fills the IBAN and the bank as the RIB is typed, never over what was written", () => {
    const empty = EMPTY_METHODS.bank_transfer;
    const typed = withRib(withRib(empty, "08"), RIB);
    expect(typed).toMatchObject({ rib: RIB, iban: IBAN, bank: "BIAT", holder: "Mazed Auto" });
    // The RIB changes: the suggestions follow it.
    expect(withRib(typed, "10006035183598478831")).toMatchObject({ iban: "TN5910006035183598478831", bank: "STB" });
    // Written by hand: kept.
    const own = { ...typed, bank: "BIAT Agence Lac 2", iban: "TN59 0800 6000 6710 0012 3450" };
    expect(withRib(own, "10006035183598478831")).toMatchObject({ bank: "BIAT Agence Lac 2" });
    expect(withRib({ ...typed, iban: "TN0000" }, "10006035183598478831").iban).toBe("TN0000");
  });

  it("suggests the bank from the RIB's first two digits", () => {
    expect(bankFromRib(RIB)).toBe("BIAT");
    expect(bankFromRib("10006035183598478831")).toBe("STB");
    expect(bankFromRib("99")).toBe("");
    expect(bankFromRib("")).toBe("");
  });
});

describe("Konnect in « Moyens de paiement » (D-B2)", () => {
  it("reads off, on the test gateway, until the back office says otherwise", () => {
    expect(readPaymentMethods(null).konnect).toEqual({ enabled: false, mode: "test", wallet: "" });
    expect(readPaymentMethods({ konnect: { enabled: "yes", mode: "prod" } }).konnect).toMatchObject({ enabled: false, mode: "test" });
    expect(readPaymentMethods({ konnect: { enabled: true, mode: "live", wallet: " 5f7a209aeb3f76490ac4a3d1 " } }).konnect)
      .toEqual({ enabled: true, mode: "live", wallet: "5f7a209aeb3f76490ac4a3d1" });
  });

  it("needs a wallet id and a key before it can be switched on", () => {
    const k = { enabled: true, mode: "live" as const, wallet: "5f7a209aeb3f76490ac4a3d1" };
    expect(konnectProblems(k, true)).toEqual([]);
    expect(konnectProblems(k, false)).toEqual(["key"]);
    expect(konnectProblems({ ...k, wallet: "my-wallet" }, true)).toEqual(["wallet"]);
    expect(konnectProblems({ ...k, wallet: "" }, false)).toEqual(["wallet", "key"]);
  });

  it("is never a manual method: no instructions, no transfer order", () => {
    const on = { ...set({}), konnect: { enabled: true, mode: "live" as const, wallet: "5f7a209aeb3f76490ac4a3d1" } };
    expect(availableMethods(on)).toEqual([]);
  });
});
