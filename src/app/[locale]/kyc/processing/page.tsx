"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Check, AlertTriangle } from "lucide-react";
import { KYCShell } from "@/components/layout/KYCShell";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { clearKycDraft, readKycDraft } from "@/lib/kycDraft";

const CHECK_KEYS = ["checkUpload", "checkSave", "checkQueue"] as const;

const TAG = "[KYC/processing]";

// Verbose, structured logger so the dev console shows every step the
// submission goes through — auth state, draft URLs, Supabase responses
// and timings — making it easy to copy a console dump back when
// something stalls.
function log(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  // eslint-disable-next-line no-console
  console.log(`%c${TAG} %c${ts}`, "color:#d4af37;font-weight:bold", "color:#888", ...args);
}

function err(...args: unknown[]) {
  const ts = new Date().toISOString().slice(11, 23);
  // eslint-disable-next-line no-console
  console.error(`%c${TAG} %c${ts}`, "color:#ef4444;font-weight:bold", "color:#888", ...args);
}

interface DetailedError {
  message: string;
  code?: string;
  hint?: string;
  details?: string;
  raw?: unknown;
}

export default function KYCProcessingPage() {
  const router = useRouter();
  const { user, loaded, update } = useAuth();
  const t = useTranslations("kyc.processing");
  const [step, setStep] = useState(0);
  const [error, setError] = useState<DetailedError | null>(null);
  const submittedRef = useRef(false);

  // Snapshot the volatile context values in refs. The submit effect
  // below depends ONLY on `loaded` so its promise is never torn down
  // mid-flight by a re-render — the previous version was killed when
  // update() flipped user.kycStatus, which fired the auth listener,
  // mutated the `user` object, ran the submit effect's cleanup, and
  // skipped the trailing router.push("/kyc/status") via a stale
  // `cancelled` flag.
  //
  // The ref-writes used to happen in the render body (`userRef.current
  // = user;` etc.), which the React 19 purity lint rule flags — and
  // it's technically wrong: render shouldn't have side effects. Sync
  // the refs from an effect instead. The effect runs in the commit
  // phase, so by the time submit() reads userRef.current the values
  // are up-to-date (submit() is launched from a DIFFERENT effect
  // below that depends on `loaded`, not on these refs).
  const userRef = useRef(user);
  const updateRef = useRef(update);
  const routerRef = useRef(router);
  useEffect(() => {
    userRef.current = user;
    updateRef.current = update;
    routerRef.current = router;
  });

  useEffect(() => {
    log("mount", {
      loaded,
      hasUser: Boolean(userRef.current),
      userId: userRef.current?.id,
    });
    if (!loaded) {
      log("waiting for auth.loaded …");
      return;
    }
    if (submittedRef.current) {
      log("submit already attempted, skipping");
      return;
    }
    submittedRef.current = true;

    // `unmounted` only guards setState calls so React doesn't warn after
    // the page leaves. The router.push is intentionally NOT gated by it —
    // we always want to navigate once the submission succeeds.
    let unmounted = false;
    async function submit() {
      log("submit() start");
      const u = userRef.current;
      if (!u) {
        err("no user in context — aborting");
        if (!unmounted)
          setError({
            message: t("errorUserMissing"),
          });
        return;
      }
      log("user", {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        kycStatus: u.kycStatus,
      });

      const draft = readKycDraft();
      log("draft", draft);
      if (!draft.idFrontUrl || !draft.idBackUrl || !draft.selfieVideoUrl) {
        err("draft incomplete", {
          hasFront: Boolean(draft.idFrontUrl),
          hasBack: Boolean(draft.idBackUrl),
          hasSelfie: Boolean(draft.selfieVideoUrl),
        });
        if (!unmounted)
          setError({
            message: t("errorDraftMissing"),
          });
        return;
      }

      const advance = (i: number) =>
        new Promise<void>((res) =>
          setTimeout(() => {
            if (!unmounted) setStep(i);
            res();
          }, 700),
        );

      log("advance → step 1 (upload phase visual)");
      await advance(1);

      const supabase = createClient();
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");

      const payload = {
        user_id: u.id,
        full_name: fullName || null,
        id_front_url: draft.idFrontUrl,
        id_back_url: draft.idBackUrl,
        selfie_video_url: draft.selfieVideoUrl,
        selfie_image_url: draft.selfieImageUrl ?? null,
        status: "pending" as const,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date().toISOString(),
      };
      log("upserting kyc_submissions", payload);

      const t0 = performance.now();
      const upsertResp = await supabase
        .from("kyc_submissions")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();
      const upsertMs = Math.round(performance.now() - t0);
      log("kyc_submissions response", {
        ms: upsertMs,
        status: upsertResp.status,
        statusText: upsertResp.statusText,
        data: upsertResp.data,
        error: upsertResp.error,
      });

      if (upsertResp.error) {
        const e = upsertResp.error;
        err("kyc_submissions upsert failed", e);
        if (!unmounted) {
          setError({
            message: e.message,
            code: e.code,
            hint: e.hint,
            details: e.details,
            raw: e,
          });
        }
        return;
      }

      log("advance → step 2 (record saved)");
      await advance(2);

      log("calling update({ kycStatus: 'pending' })");
      const updateResp = await updateRef.current({ kycStatus: "pending" });
      log("update response", updateResp);
      if (updateResp.error) {
        err("auth update failed", updateResp.error);
        if (!unmounted) {
          setError({
            message: updateResp.error.message,
            raw: updateResp.error,
          });
        }
        return;
      }

      log("advance → step 3 (queued for review)");
      await advance(3);

      log("clearing draft + redirecting → /kyc/status");
      clearKycDraft();
      // Always navigate. Don't condition on `unmounted` — by the time we
      // got here the submit succeeded; a re-render shouldn't trap the
      // user on this screen.
      routerRef.current.push("/kyc/status");
    }

    submit().catch((e) => {
      err("submit() threw", e);
      if (!unmounted) {
        setError({
          message: e instanceof Error ? e.message : t("errorUnexpected"),
          raw: e,
        });
      }
    });
    return () => {
      log("effect cleanup");
      unmounted = true;
    };
    // `t` is closed over inside submit() for the error toasts; include it
    // so a mid-flow locale switch picks up the new locale's strings (the
    // submittedRef guard already blocks duplicate submissions, so adding
    // it to deps is safe and idempotent).
  }, [loaded, t]);

  if (error) {
    return (
      <KYCShell current={3}>
        <div className="space-y-6 py-8 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-red-500/15 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t("errorTitle")}</h2>
            <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
              {error.message}
            </p>
            {(error.code || error.hint || error.details) && (
              <div className="mt-3 text-start text-[11px] font-mono text-[var(--foreground-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] p-3 space-y-1">
                {error.code && <div>code: {error.code}</div>}
                {error.hint && <div>hint: {error.hint}</div>}
                {error.details && <div>details: {error.details}</div>}
              </div>
            )}
            <p className="text-[10px] text-[var(--foreground-subtle)] mt-2">
              {t("errorConsoleHint")}
            </p>
          </div>
          <Button size="lg" fullWidth onClick={() => router.push("/kyc/start")}>
            {t("retryCta")}
          </Button>
        </div>
      </KYCShell>
    );
  }

  return (
    <KYCShell current={3}>
      <div className="space-y-6 py-6">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 mb-4 relative">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--gold)] border-t-transparent animate-spin" />
            <div className="absolute inset-3 rounded-full bg-[var(--gold-faint)]" />
          </div>
          <h2 className="text-xl font-bold">{t("title")}</h2>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            {t("subtitle")}
          </p>
        </div>

        <div className="space-y-2">
          {CHECK_KEYS.map((key, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div
                key={key}
                className="flex items-center gap-3 p-3 rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)]"
              >
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                    done
                      ? "bg-green-500 text-white"
                      : active
                        ? "bg-[var(--gold-faint)] border-2 border-[var(--gold)]"
                        : "bg-[var(--surface-2)]"
                  }`}
                >
                  {done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  {active && (
                    <div className="h-2 w-2 rounded-full bg-[var(--gold)] animate-pulse" />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    done
                      ? "text-foreground"
                      : active
                        ? "text-[var(--gold)] font-semibold"
                        : "text-[var(--foreground-subtle)]"
                  }`}
                >
                  {t(key)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </KYCShell>
  );
}
