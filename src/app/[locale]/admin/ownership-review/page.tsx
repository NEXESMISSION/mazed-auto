import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ShieldAlert, ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Badge } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { auctionCode, formatPrice } from "@/lib/format";
import { thumb } from "@/lib/imageUrl";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EXCEPTION_VALUES = [
  "company",
  "agent",
  "inheritance",
  "spouse",
  "recent_purchase",
  "other",
] as const;

export default async function OwnershipReviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin.ownershipReview" });
  const tException = await getTranslations({ locale, namespace: "wizard.exception" });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("auctions")
    .select(
      "id, make, model, year, image_urls, starting_price, current_price, status, ownership_exception, carte_grise_owner_name, created_at, seller:sellers(id, display_name, username, verified_kyc)",
    )
    .not("ownership_exception", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  // Supabase types the embedded relation as an array even with !inner;
  // we know it's a single row per auction, so cast through unknown.
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    image_urls: string[];
    starting_price: number;
    current_price: number;
    status: string;
    ownership_exception: string;
    carte_grise_owner_name: string | null;
    created_at: string;
    seller: {
      id: string;
      display_name: string | null;
      username: string | null;
      verified_kyc: boolean;
    } | null;
  }>;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-extrabold">
            {t("pageTitle")}
          </h1>
          <Badge variant="gold">{rows.length}</Badge>
        </div>
        <p className="text-xs text-[var(--foreground-muted)]">{t("intro")}</p>

        {error && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-200">
            {t("error", { error: error.message })}
          </div>
        )}

        <div className="space-y-3">
          {rows.length === 0 && (
            <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-sm text-[var(--foreground-muted)]">
              {t("empty")}
            </div>
          )}
          {rows.map((a) => {
            const exceptionLabel = EXCEPTION_VALUES.includes(
              a.ownership_exception as (typeof EXCEPTION_VALUES)[number],
            )
              ? tException(a.ownership_exception as (typeof EXCEPTION_VALUES)[number])
              : a.ownership_exception;
            return (
              <div
                key={a.id}
                className={`rounded-[var(--radius-md)] bg-[var(--surface)] border ${
                  a.ownership_exception === "other"
                    ? "border-amber-500/40"
                    : "border-[var(--border)]"
                } overflow-hidden`}
              >
                <div className="p-4 flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb(a.image_urls[0], { width: 220, quality: 60 })}
                    alt={`${a.make} ${a.model} ${a.year}`}
                    className="h-24 w-32 rounded-[var(--radius-sm)] object-cover shrink-0"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold">
                        {a.make} {a.model} {a.year}
                      </h3>
                      <span className="font-mono text-xs text-[var(--foreground-subtle)]">
                        {auctionCode(a.id)}
                      </span>
                      <Badge size="sm" variant="default">
                        {a.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-400" />
                      <Badge size="sm" variant="warning">
                        {exceptionLabel}
                      </Badge>
                    </div>
                    <div className="text-xs text-[var(--foreground-muted)]">
                      {t("sellerLabel")}{" "}
                      <Link
                        href={`/admin/users/${a.seller?.id ?? ""}`}
                        className="text-foreground hover:underline"
                      >
                        {a.seller?.display_name ?? t("sellerUnknown")}
                      </Link>
                      {a.seller?.verified_kyc ? t("kycOk") : t("kycFail")}
                    </div>
                    {a.carte_grise_owner_name && (
                      <div className="text-xs">
                        <span className="text-[var(--foreground-muted)]">
                          {t("carteGriseLabel")}
                        </span>{" "}
                        <span className="font-bold">
                          {a.carte_grise_owner_name}
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-[var(--foreground-muted)]">
                      {t("startingPriceLabel", {
                        price: formatPrice(Number(a.starting_price)),
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link
                      href={`/admin/auctions/${a.id}`}
                      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-[var(--radius)] bg-[var(--gold)] text-black font-bold text-xs"
                    >
                      {t("examine")}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
