/**
 * Reject a promise that never settles.
 *
 * Every `await` on the network or on a browser codec is a potential
 * forever-hang: a stalled upload, a chunk fetch that never resolves, a
 * wasm decoder that wedges. A try/catch cannot catch a hang — the
 * `catch` only runs if the promise REJECTS — so any such await sitting
 * between a `setSubmitting(true)` and its reset will pin a button in its
 * loading state permanently, with no error and no way out but a reload.
 *
 * Wrapping the await converts "hangs forever" into "throws after N ms",
 * which the surrounding error handling already knows how to report.
 *
 * `name` is "TimeoutError", matching the DOMException that
 * `AbortSignal.timeout()` throws, so callers can detect either with a
 * single `e.name === "TimeoutError"` check.
 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

// Generic over the awaitable itself rather than over its value: supabase-js
// hands back thenable builders whose `then` is overloaded, and inferring `T`
// from a `Promise<T>`/`PromiseLike<T>` parameter collapses to `unknown` for
// those callers. Inferring `P` and reporting `Awaited<P>` keeps the real type.
export function withTimeout<P extends PromiseLike<unknown>>(
  p: P,
  ms: number,
): Promise<Awaited<P>> {
  return new Promise<Awaited<P>>((resolve, reject) => {
    const id = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        // `P extends PromiseLike<unknown>` types `v` as unknown here; it is
        // Awaited<P> by construction.
        resolve(v as Awaited<P>);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/** True for both our TimeoutError and AbortSignal.timeout()'s DOMException. */
export function isTimeout(e: unknown): boolean {
  return e instanceof Error && e.name === "TimeoutError";
}
