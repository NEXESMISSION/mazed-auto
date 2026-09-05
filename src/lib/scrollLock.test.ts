import { beforeEach, describe, expect, it } from "vitest";
import { scrollLock } from "./scrollLock";

/**
 * The bug this pins: eight components each saved and restored
 * `document.body.style.overflow` on their own, which is only correct while no
 * two of them overlap. Two overlapping overlays could leave the page
 * permanently unscrollable — "scrolling gets stuck sometimes", intermittent
 * because it needs a particular open/close order.
 *
 * No jsdom in the unit project, and none needed: a body with a style object is
 * the entire surface this module touches.
 */
function stubDocument(initialOverflow = "") {
  const doc = { body: { style: { overflow: initialOverflow } } };
  (globalThis as unknown as { document: unknown }).document = doc;
  return doc;
}

describe("scrollLock", () => {
  beforeEach(() => {
    // Drain any count left by a previous test.
    for (let i = 0; i < 10; i += 1) scrollLock.release();
    stubDocument();
  });

  it("locks on the first acquire and unlocks on the last release", () => {
    const doc = stubDocument();
    scrollLock.acquire();
    expect(doc.body.style.overflow).toBe("hidden");
    scrollLock.release();
    expect(doc.body.style.overflow).toBe("");
  });

  it("survives two overlays closing in the order that used to strand the page", () => {
    const doc = stubDocument();
    // Sheet opens, then an alert opens over it.
    scrollLock.acquire();
    scrollLock.acquire();
    expect(doc.body.style.overflow).toBe("hidden");

    // The sheet closes FIRST — the page must stay locked for the alert.
    scrollLock.release();
    expect(doc.body.style.overflow).toBe("hidden");

    // The alert closes. Nothing is open, so the page must scroll again.
    // The old per-component code restored "hidden" here and froze the page.
    scrollLock.release();
    expect(doc.body.style.overflow).toBe("");
  });

  it("restores whatever the page had before the first lock", () => {
    const doc = stubDocument("clip");
    scrollLock.acquire();
    scrollLock.acquire();
    scrollLock.release();
    scrollLock.release();
    expect(doc.body.style.overflow).toBe("clip");
  });

  it("ignores a release that was never acquired", () => {
    const doc = stubDocument();
    scrollLock.release();
    scrollLock.release();
    expect(doc.body.style.overflow).toBe("");

    // …and still locks correctly afterwards, i.e. the count never went negative.
    scrollLock.acquire();
    expect(doc.body.style.overflow).toBe("hidden");
    scrollLock.release();
    expect(doc.body.style.overflow).toBe("");
  });
});
