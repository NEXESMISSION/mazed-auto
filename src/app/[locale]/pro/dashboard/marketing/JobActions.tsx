"use client";

import { useTranslations } from "next-intl";
import { PostButton } from "../PostButton";

/** The moves a journal line allows — the same rules as /api/pro/social/jobs/[id]/[action]. */
export function JobActions({ id, status, needsCheck }: { id: string; status: string; needsCheck: boolean }) {
  const t = useTranslations("social.journal");
  const cls = "inline-flex items-center text-[12px] font-bold text-gold hover:underline";
  const canRetry = ["failed", "manual_action_required"].includes(status);
  const canCancel = ["draft", "pending_approval", "scheduled", "failed", "manual_action_required"].includes(status);
  if (!needsCheck && !canRetry && !canCancel) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-3">
      {needsCheck && <PostButton url={`/api/pro/social/jobs/${id}/check`} className={cls}>{t("check")}</PostButton>}
      {canRetry && <PostButton url={`/api/pro/social/jobs/${id}/retry`} className={cls}>{t("retry")}</PostButton>}
      {canCancel && (
        <PostButton url={`/api/pro/social/jobs/${id}/cancel`} confirm={t("confirmCancel")} className="inline-flex items-center text-[12px] font-bold text-muted hover:text-foreground">
          {t("cancel")}
        </PostButton>
      )}
    </div>
  );
}
