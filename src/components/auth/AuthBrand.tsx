import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LOGO } from "@/lib/brand";

/**
 * The logo on the auth pages: small, at the top start (left, right in
 * Arabic), linking home — the same
 * horizontal lockup and the same size as the site's top bars, so signing in
 * does not look like a different site. The cards themselves carry no logo.
 */
export function AuthBrand({ className, size = "sm" }: { className?: string; size?: "sm" | "md" }) {
  const t = useTranslations("brand");
  return (
    <Link href="/" aria-label={t("name")} className={cn("inline-flex w-fit shrink-0", className)}>
      <Image
        src={LOGO.lockupWide.src}
        alt=""
        width={LOGO.lockupWide.width}
        height={LOGO.lockupWide.height}
        priority
        sizes={size === "md" ? "170px" : "150px"}
        className={size === "md" ? "h-9 w-auto" : "h-8 w-auto"}
      />
    </Link>
  );
}
