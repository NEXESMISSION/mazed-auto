import { describe, expect, it } from "vitest";
import { suggestions } from "./suggest";

const MAKES = ["Renault", "Peugeot", "Citroën", "Opel", "Mercedes-Benz"];

describe("suggestions", () => {
  it("offers every option before anything is typed", () => {
    expect(suggestions("", MAKES)).toEqual(MAKES);
    expect(suggestions("   ", MAKES)).toEqual(MAKES);
  });

  it("still offers every option once a field holds one of them", () => {
    expect(suggestions("Peugeot", MAKES)).toEqual(MAKES);
    expect(suggestions("citroen", MAKES)).toEqual(MAKES);
  });

  it("puts matches at the start before matches inside", () => {
    expect(suggestions("pe", MAKES)).toEqual(["Peugeot", "Opel"]);
  });

  it("ignores case and accents", () => {
    expect(suggestions("CITRO", MAKES)).toEqual(["Citroën"]);
    expect(suggestions("benz", MAKES)).toEqual(["Mercedes-Benz"]);
  });

  it("offers nothing for text that matches no option", () => {
    expect(suggestions("zzz", MAKES)).toEqual([]);
  });
});
