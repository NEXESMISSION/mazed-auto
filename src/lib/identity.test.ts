import { describe, expect, it } from "vitest";
import { accountLabel, formatPhone, isSyntheticEmail, realEmail } from "./identity";

describe("synthetic phone emails", () => {
  it("recognises the address signup mints for a phone account", () => {
    expect(isSyntheticEmail("21658415520@phone.mazedauto.app")).toBe(true);
    expect(isSyntheticEmail("21658415520@PHONE.MAZEDAUTO.APP")).toBe(true);
  });

  it("leaves a real address alone", () => {
    expect(isSyntheticEmail("saif@gmail.com")).toBe(false);
    expect(realEmail("saif@gmail.com")).toBe("saif@gmail.com");
  });

  it("reports no email at all for a phone account", () => {
    expect(realEmail("21658415520@phone.mazedauto.app")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("reads a Tunisian number the way it is spoken", () => {
    expect(formatPhone("+21658415520")).toBe("58 415 520");
    expect(formatPhone("21658415520")).toBe("58 415 520");
    expect(formatPhone("58415520")).toBe("58 415 520");
  });

  it("returns the input untouched when it is not 8 local digits", () => {
    expect(formatPhone("+3312345")).toBe("+3312345");
  });

  it("has nothing to say about a missing number", () => {
    expect(formatPhone(null)).toBeNull();
  });
});

describe("accountLabel", () => {
  it("shows the phone, never the synthetic address", () => {
    expect(accountLabel("21658415520@phone.mazedauto.app", "+21658415520")).toBe("58 415 520");
  });

  it("falls back to a real email when there is no phone", () => {
    expect(accountLabel("saif@gmail.com", null)).toBe("saif@gmail.com");
  });

  it("shows nothing rather than the plumbing when both are missing", () => {
    expect(accountLabel("21658415520@phone.mazedauto.app", null)).toBeNull();
  });
});
