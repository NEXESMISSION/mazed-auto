"use client";

import { useTranslations } from "next-intl";
import { Printer } from "lucide-react";

export function PrintButton() {
  const t = useTranslations("pro.receipt");
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="tap-target inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold print:hidden"
    >
      <Printer className="size-3.5" /> {t("print")}
    </button>
  );
}
