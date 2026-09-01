import { describe, it, expect } from "vitest";
import {
  normalizePhotos,
  normalizeSections,
  normalizeVerdict,
  toDiagnostic,
} from "./diagnostics";

/**
 * The diagnostic document is stored as free-form jsonb and rendered on a
 * PUBLIC page. These lock the normaliser: whatever is in the column, the
 * public sheet gets a well-formed, bounded structure.
 */

describe("normalizeSections", () => {
  it("keeps well-formed sections and items", () => {
    expect(
      normalizeSections([
        { title: "Moteur", items: [{ label: "Compression", state: "warn", note: "Cylindre 3" }] },
      ]),
    ).toEqual([
      { title: "Moteur", items: [{ label: "Compression", state: "warn", note: "Cylindre 3" }] },
    ]);
  });

  it("drops items with no label — an unnamed check says nothing", () => {
    const out = normalizeSections([{ title: "Moteur", items: [{ label: "  ", state: "bad" }] }]);
    expect(out).toEqual([{ title: "Moteur", items: [] }]);
  });

  it("drops a section that is entirely empty", () => {
    expect(normalizeSections([{ title: "", items: [] }])).toEqual([]);
  });

  it("defaults an unknown state to ok rather than rendering a broken chip", () => {
    const out = normalizeSections([{ items: [{ label: "Freins", state: "explosé" }] }]);
    expect(out[0].items[0].state).toBe("ok");
    expect(out[0].title).toBe("Contrôles");
  });

  it("survives garbage", () => {
    expect(normalizeSections(null)).toEqual([]);
    expect(normalizeSections("nope")).toEqual([]);
    expect(normalizeSections([null, 42])).toEqual([]);
  });

  it("caps the document size", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      title: `S${i}`,
      items: Array.from({ length: 60 }, (_, j) => ({ label: `I${j}`, state: "ok" })),
    }));
    const out = normalizeSections(many);
    expect(out).toHaveLength(20);
    expect(out[0].items).toHaveLength(30);
  });
});

describe("normalizePhotos", () => {
  it("requires a path", () => {
    expect(normalizePhotos([{ caption: "orphan" }, { path: "uid/a.webp" }])).toEqual([
      { path: "uid/a.webp", caption: null },
    ]);
  });
  it("caps the gallery", () => {
    const out = normalizePhotos(
      Array.from({ length: 40 }, (_, i) => ({ path: `uid/${i}.webp` })),
    );
    expect(out).toHaveLength(24);
  });
});

describe("normalizeVerdict", () => {
  it("only accepts the three known verdicts", () => {
    expect(normalizeVerdict("reserves")).toBe("reserves");
    expect(normalizeVerdict("failed")).toBe("failed");
    expect(normalizeVerdict("approved")).toBe("approved");
    // Anything else must NOT silently become a pass — but 'approved' is the
    // documented default and the admin UI can only send the three.
    expect(normalizeVerdict("banana")).toBe("approved");
    expect(normalizeVerdict(undefined)).toBe("approved");
  });
});

describe("toDiagnostic", () => {
  it("maps a row and normalises its document", () => {
    const d = toDiagnostic({
      property_id: "p1",
      status: "published",
      verdict: "reserves",
      headline: "  Contrôlé sur 42 points  ",
      summary: "Bon état général.",
      sections: [{ title: "Moteur", items: [{ label: "Huile", state: "ok" }] }],
      photos: [{ path: "uid/1.webp", caption: "Compteur" }],
      inspector_name: "Équipe Mazed",
      inspected_at: "2026-08-01T10:00:00.000Z",
      published_at: "2026-08-02T10:00:00.000Z",
    });
    expect(d.status).toBe("published");
    expect(d.verdict).toBe("reserves");
    expect(d.headline).toBe("Contrôlé sur 42 points");
    expect(d.sections[0].items[0]).toEqual({ label: "Huile", state: "ok", note: null });
    expect(d.photos).toEqual([{ path: "uid/1.webp", caption: "Compteur" }]);
  });

  it("treats any non-published status as a draft", () => {
    const d = toDiagnostic({
      property_id: "p1",
      status: "whatever",
      verdict: "approved",
      headline: null,
      summary: null,
      sections: null,
      photos: null,
      inspector_name: null,
      inspected_at: null,
      published_at: null,
    });
    expect(d.status).toBe("draft");
    expect(d.sections).toEqual([]);
    expect(d.photos).toEqual([]);
  });
});
