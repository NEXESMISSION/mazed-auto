import { describe, expect, it } from "vitest";
import fr from "../../../messages/pro/fr.json";
import ar from "../../../messages/pro/ar.json";
import { SUBSCRIPTION_ERRORS, subscriptionError } from "./subscription";

/** 0198: every refusal the database gives reaches the seller as a sentence, in both languages. */
describe("subscription refusals", () => {
  it("finds our refusal inside a database error message", () => {
    expect(subscriptionError('P0001: order_open')).toBe("order_open");
    expect(subscriptionError("ERROR:  subscription_exists\nHINT: …")).toBe("subscription_exists");
    expect(subscriptionError("duplicate key value violates unique constraint")).toBeNull();
    expect(subscriptionError(undefined)).toBeNull();
  });

  it("has a sentence for each, in French and Arabic", () => {
    const frApi = (fr as { api: { subscription: Record<string, unknown> } }).api.subscription;
    const arApi = (ar as { api: { subscription: Record<string, unknown> } }).api.subscription;
    for (const code of SUBSCRIPTION_ERRORS) {
      expect(typeof frApi[code], code).toBe("string");
      expect(typeof arApi[code], code).toBe("string");
    }
  });
});
