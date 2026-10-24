import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";

/**
 * Shown to an admin on shop pages that visitors cannot reach yet
 * (`app_settings.pro_shops.enabled` is off): what they are looking at is a
 * preview, and how it goes live.
 */
export function ShopsPreviewBanner({ who = "admin" }: { who?: "admin" | "owner" }) {
  const t = useTranslations("shops.preview");
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-2xl bg-gold-faint px-4 py-3 text-[12.5px] leading-relaxed text-gold ring-1 ring-gold-soft">
      <Eye className="mt-0.5 size-4 shrink-0" />
      {who === "owner" ? (
        <p>
          <strong>{t("ownerTitle")}</strong> {t("ownerBody")}
        </p>
      ) : (
        <p>
          <strong>{t("adminTitle")}</strong> {t("adminBody")}
        </p>
      )}
    </div>
  );
}
