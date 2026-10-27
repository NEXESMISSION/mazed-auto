import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_CONTACT, formatPhone, readSiteContact, siteContactProblems, telHref, tunisianDigits, whatsappHref,
} from "./siteContact";

/** D-B3: the contact details the contact and help pages print, set in Réglages. */
describe("site contact", () => {
  it("falls back to the details the pages printed before", () => {
    expect(readSiteContact(null)).toEqual(DEFAULT_SITE_CONTACT);
    expect(readSiteContact({ email: "  ", phone: "", whatsapp: 12, address: " Tunis " }))
      .toEqual({ ...DEFAULT_SITE_CONTACT, address: "Tunis" });
  });

  it("reads a Tunisian number however it is typed", () => {
    expect(tunisianDigits("98 120 622")).toBe("21698120622");
    expect(tunisianDigits("+216 98-120-622")).toBe("21698120622");
    expect(tunisianDigits("0021698120622")).toBe("");
    expect(tunisianDigits("12 345 678")).toBe("");
    expect(formatPhone("98120622")).toBe("+216 98 120 622");
    expect(telHref("98120622")).toBe("tel:+21698120622");
    expect(whatsappHref("+21698120622")).toBe("https://wa.me/21698120622");
    expect(whatsappHref("")).toBeNull();
  });

  it("says what is wrong before saving", () => {
    expect(siteContactProblems(DEFAULT_SITE_CONTACT)).toEqual([]);
    expect(siteContactProblems({ ...DEFAULT_SITE_CONTACT, email: "contact@", phone: "123" })).toEqual(["email", "phone"]);
    expect(siteContactProblems({ ...DEFAULT_SITE_CONTACT, whatsapp: "55" })).toEqual(["whatsapp"]);
    expect(siteContactProblems({ ...DEFAULT_SITE_CONTACT, whatsapp: "" })).toEqual([]);
  });
});
