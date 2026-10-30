import { getTranslations } from "next-intl/server";
import { PopupForm } from "../PopupForm";
import { requireAdminPage } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

/**
 * /admin/popups/new — blank form. Auth is enforced by the admin layout.
 */
export default async function NewPopupPage() {
  await requireAdminPage();
  const t = await getTranslations("admin.popups");
  return (
    <div>
      <span className="batta-eyebrow">{t("eyebrow")}</span>
      <h2 className="mt-1.5 text-[24px] font-extrabold leading-tight tracking-tight">
        {t("new")}
      </h2>
      <p className="mt-1.5 text-[12px] text-muted">
        {t("newBody")}
      </p>
      <div className="mt-5">
        <PopupForm initial={null} />
      </div>
    </div>
  );
}
