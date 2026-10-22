import { describe, it, expect, afterEach } from "vitest";
import { konnectConfig, toMillimes, verifyKonnectPayment } from "./konnect";

/**
 * The check between « Konnect says something » and « a subscription opens ».
 * A webhook or a browser return can be replayed or forged; this decides on
 * Konnect's own record, compared field by field with our order.
 */

const ORDER = { orderId: "pay-1", amountTnd: 79 };
const paid = (over: Record<string, unknown> = {}) => ({
  status: "completed", token: "TND", amount: 79000, reachedAmount: 79000, orderId: "pay-1", id: "k-1", ...over,
});

describe("verifyKonnectPayment", () => {
  it("accepts a completed payment of the full amount, in TND, for our order", () => {
    expect(verifyKonnectPayment(paid(), ORDER).outcome).toBe("completed");
  });

  it("waits while the payment is not completed (recette 6)", () => {
    expect(verifyKonnectPayment(paid({ status: "pending" }), ORDER).outcome).toBe("pending");
  });

  it("refuses a short payment", () => {
    expect(verifyKonnectPayment(paid({ reachedAmount: 29000, amount: 79000 }), ORDER))
      .toMatchObject({ outcome: "mismatch", reason: "amount" });
  });

  it("refuses a payment for another order, even completed", () => {
    expect(verifyKonnectPayment(paid({ orderId: "pay-2" }), ORDER))
      .toMatchObject({ outcome: "mismatch", reason: "order_id" });
  });

  it("refuses another currency", () => {
    expect(verifyKonnectPayment(paid({ token: "EUR" }), ORDER))
      .toMatchObject({ outcome: "mismatch", reason: "currency" });
  });

  it("refuses a completed payment that does not name our order", () => {
    const { orderId: _unused, ...noOrder } = paid();
    void _unused;
    expect(verifyKonnectPayment(noOrder, ORDER)).toMatchObject({ outcome: "mismatch", reason: "order_id_missing" });
  });

  it("treats garbage as not paid", () => {
    expect(verifyKonnectPayment(null, ORDER).outcome).toBe("pending");
    expect(verifyKonnectPayment("ok", ORDER).outcome).toBe("pending");
  });

  it("keeps a snapshot of what Konnect said", () => {
    expect(verifyKonnectPayment(paid(), ORDER).snapshot).toMatchObject({ status: "completed", orderId: "pay-1", reachedAmount: 79000 });
  });
});

describe("amounts and configuration", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("converts dinars to millimes without float drift", () => {
    expect(toMillimes(29)).toBe(29000);
    expect(toMillimes(9.99)).toBe(9990);
    expect(toMillimes(0.1 + 0.2)).toBe(300);
  });

  it("is off until both the key and the wallet are set", () => {
    delete process.env.KONNECT_API_KEY;
    process.env.KONNECT_WALLET_ID = "w";
    expect(konnectConfig()).toBeNull();
    process.env.KONNECT_API_KEY = "k";
    expect(konnectConfig()).toMatchObject({ apiKey: "k", walletId: "w", baseUrl: "https://api.konnect.network/api/v2" });
  });
});
