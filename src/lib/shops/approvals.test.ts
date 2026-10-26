import { describe, expect, it } from "vitest";
import { DEFAULT_APPROVALS, planKind, readApprovals } from "./approvals";

/**
 * The pages label their buttons « Demander » or « Payer » from these; the
 * database decides with the same rules (0196, tests/rpc/pro_approvals.test.ts).
 * A drift between the two would show a « Payer » the checkout then turns into
 * a request, or the other way round.
 */
describe("pro approvals — what the pages show", () => {
  it("falls back to the database's defaults, key by key", () => {
    expect(readApprovals(null)).toEqual(DEFAULT_APPROVALS);
    expect(readApprovals({ renewal: true })).toEqual({ ...DEFAULT_APPROVALS, renewal: true });
    // Only real booleans count: anything else is the default, never « off ».
    expect(readApprovals({ opening: "false", boost: 1 })).toEqual(DEFAULT_APPROVALS);
    expect(DEFAULT_APPROVALS).toEqual({ opening: true, plan_change: true, renewal: false, boost: false });
  });

  it("names a purchase as pro_request_kind does", () => {
    expect(planKind(null, false, "starter")).toBe("opening");
    expect(planKind("starter", true, "starter")).toBe("renewal");
    expect(planKind("starter", true, "pro")).toBe("plan_change");
    // A period whose plan is unknown is still a period: not an opening.
    expect(planKind(null, true, "pro")).toBe("plan_change");
  });
});
