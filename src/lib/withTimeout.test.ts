import { describe, it, expect } from "vitest";
import { withTimeout, isTimeout, TimeoutError } from "./withTimeout";

describe("withTimeout", () => {
  it("passes through a value that settles in time", async () => {
    const p = Promise.resolve({ data: { user: { id: "u1" } } });
    await expect(withTimeout(p, 1000)).resolves.toEqual({
      data: { user: { id: "u1" } },
    });
  });

  it("rejects with TimeoutError when the promise NEVER settles", async () => {
    // The regression this whole helper exists for: a receipt upload that
    // hangs forever used to pin the checkout button on "Envoi…" because a
    // try/catch cannot catch a promise that simply never resolves.
    const forever = new Promise<string>(() => {});
    await expect(withTimeout(forever, 20)).rejects.toBeInstanceOf(TimeoutError);
  });

  it("propagates a real rejection rather than masking it as a timeout", async () => {
    const boom = Promise.reject(new Error("upload_failed"));
    await expect(withTimeout(boom, 1000)).rejects.toThrow("upload_failed");
  });

  it("does not reject a promise that settles just before the deadline", async () => {
    const slow = new Promise<string>((r) => setTimeout(() => r("ok"), 10));
    await expect(withTimeout(slow, 200)).resolves.toBe("ok");
  });

  it("accepts a supabase-style thenable and keeps its value type", async () => {
    // supabase-js returns thenable builders, not native promises.
    const thenable = {
      then<R>(onOk: (v: { error: null }) => R) {
        return Promise.resolve(onOk({ error: null }));
      },
    };
    const res = await withTimeout(thenable, 1000);
    expect(res.error).toBeNull();
  });
});

describe("isTimeout", () => {
  it("recognises our TimeoutError", () => {
    expect(isTimeout(new TimeoutError(100))).toBe(true);
  });

  it("recognises the DOMException AbortSignal.timeout() throws", () => {
    // Same shape the fetch() abort path produces, so one check covers both.
    const domErr = new Error("signal timed out");
    domErr.name = "TimeoutError";
    expect(isTimeout(domErr)).toBe(true);
  });

  it("does not misreport ordinary errors as timeouts", () => {
    expect(isTimeout(new Error("network"))).toBe(false);
    expect(isTimeout("nope")).toBe(false);
    expect(isTimeout(null)).toBe(false);
  });
});
