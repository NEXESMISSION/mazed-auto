import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChevronLeft } from "lucide-react";

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Where the back arrow goes — defaults to home */
  backHref?: string;
}

/**
 * Mobile-app auth shell — back arrow + brand row at the top, big headline
 * left-aligned (matches the reference home composition), card-less body so
 * the form fields breathe in the narrow phone column.
 */
export async function AuthShell({ title, subtitle, children, footer, backHref = "/" }: Props) {
  const tCommon = await getTranslations("common");
  const tBrand = await getTranslations("brand");
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top — back + brand */}
      <div className="flex items-center justify-between px-4 pt-4">
        <Link
          href={backHref}
          aria-label={tCommon("back")}
          className="h-10 w-10 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold-soft)] transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <Link href="/" className="flex items-center gap-2" aria-label={tBrand("name")}>
          <div className="h-8 w-8 rounded-[var(--radius)] overflow-hidden ring-1 ring-[var(--gold)]/30 shadow-[var(--shadow-gold)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-full w-full object-cover" />
          </div>
        </Link>
      </div>

      {/* Centered content column */}
      <div className="flex-1 px-5 pt-8 pb-10 max-w-[var(--max-w)] w-full mx-auto">
        <div className="space-y-2 mb-7">
          <h1 className="text-[26px] font-extrabold tracking-tight leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {children}

        {footer && (
          <div className="mt-6 text-center text-sm text-[var(--foreground-muted)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
