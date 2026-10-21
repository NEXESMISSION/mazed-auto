import { NextResponse } from "next/server";
import type { Refusal } from "@/lib/publication";

/**
 * A refusal the seller is meant to read — a limit reached, a shop without a
 * subscription — as opposed to a failure, which goes through `fail()` and
 * shows only a code. `detail` is written for the seller and is safe to show.
 */
export function refusalResponse(r: Refusal): NextResponse {
  return NextResponse.json({ error: r.error, detail: r.detail }, { status: r.status });
}
