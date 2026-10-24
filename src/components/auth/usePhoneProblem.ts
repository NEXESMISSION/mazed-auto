"use client";

import { useTranslations } from "next-intl";
import type { PhoneProblem } from "@/lib/tunisia";

/** Words validatePhone's verdict in the reader's language. */
export function usePhoneProblem() {
  const t = useTranslations("phone.errors");
  return (check: { reason: PhoneProblem; digits: number }, dialCode: string) =>
    t(check.reason, { count: check.digits, dialCode });
}
