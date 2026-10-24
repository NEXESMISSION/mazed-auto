import { getLocale, getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/dates";
import { getProContext } from "@/lib/shops/proContext";
import { CAN_EDIT_SHOP } from "@/lib/shops/server";
import { socialGate, shopMayUseAi } from "@/lib/social/gate";
import { metaConfig } from "@/lib/social/meta";
import { isSocialCryptoConfigured } from "@/lib/social/crypto";
import { PostButton } from "../PostButton";
import { SocialComposer } from "./SocialComposer";
import { JobActions } from "./JobActions";
import { AlertTriangle, CheckCircle2, ExternalLink, Facebook, Instagram, Link2, Unplug } from "lucide-react";

const STATUS_TONE: Record<string, string> = {
  published: "batta-tone-ok",
  failed: "batta-tone-bad",
  manual_action_required: "batta-tone-bad",
  publishing: "batta-tone-warn",
  scheduled: "batta-tone-warn",
  pending_approval: "batta-tone-warn",
  cancelled: "bg-surface-2 text-muted ring-1 ring-border",
  draft: "bg-surface-2 text-muted ring-1 ring-border",
};

/**
 * Marketing → Social Publisher (lot S1). The shop's connected accounts, a
 * composer (annonce → texts per network → validate → consent → publish), and
 * the journal of every publication with what Meta answered.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; social_error?: string }>;
}) {
  const ctx = await getProContext();
  if (ctx.kind !== "shop") return null;
  const { admin, shop, role } = ctx;
  const t = await getTranslations("social");
  const locale = await getLocale();
  const gate = await socialGate(admin);
  if (!gate.visible) return <p className="rounded-2xl border border-border bg-surface p-6 text-center text-[13px] text-muted">{t("soon")}</p>;
  const sp = await searchParams;
  const canManage = CAN_EDIT_SHOP.includes(role);
  const configured = !!metaConfig() && isSocialCryptoConfigured();

  const [accountsRes, listingsRes, jobsRes, allowAi] = await Promise.all([
    admin.from("social_accounts").select("id, network, name, username, picture_url, status, last_error").eq("shop_id", shop.id).order("network").order("created_at"),
    admin.from("listings").select("id, title, reference").eq("shop_id", shop.id).eq("status", "published").order("published_at", { ascending: false }).limit(100),
    admin
      .from("social_publication_jobs")
      .select("id, network, status, external_url, last_error, needs_remote_check, attempts, created_at, published_at, request:social_publication_requests!inner (shop_id, listing:listings (title, reference)), account:social_accounts (name)")
      .eq("request.shop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(30),
    shopMayUseAi(admin, shop.id),
  ]);

  type Account = { id: string; network: "facebook" | "instagram"; name: string; username: string | null; picture_url: string | null; status: string; last_error: string | null };
  const accounts = (accountsRes.data ?? []) as Account[];
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  type Job = {
    id: string; network: string; status: string; external_url: string | null; last_error: string | null; needs_remote_check: boolean;
    attempts: number; created_at: string; published_at: string | null;
    request: { listing: { title: string; reference: string | null } | { title: string; reference: string | null }[] | null } | { listing: unknown }[] | null;
    account: { name: string } | { name: string }[] | null;
  };
  const jobs = (jobsRes.data ?? []) as unknown as Job[];
  const when = (iso: string) => formatDate(iso, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const errorKey = sp.social_error && ["denied", "state", "forbidden", "meta", "no_pages", "not_configured"].includes(sp.social_error) ? sp.social_error : null;
  const Icon = ({ network }: { network: string }) => (network === "instagram" ? <Instagram className="size-4" /> : <Facebook className="size-4" />);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-extrabold">{t("title")}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{t("intro")}</p>
      </div>
      {gate.preview && <p className="batta-tone-warn rounded-2xl px-4 py-2.5 text-[12.5px]">{t("preview")}</p>}
      {!configured && <p className="batta-tone-warn rounded-2xl px-4 py-2.5 text-[12.5px]">{t("notConfigured")}</p>}
      {sp.connected && <p className="batta-tone-ok flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[12.5px]"><CheckCircle2 className="size-4" /> {t("connectedBanner", { count: Number(sp.connected) || 0 })}</p>}
      {errorKey && <p className="batta-tone-bad flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[12.5px]"><AlertTriangle className="size-4" /> {t(`errors.${errorKey}`)}</p>}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-extrabold">{t("accounts.title")}</h3>
          {canManage && configured && (
            <a href={`/api/pro/social/meta/connect?shop=${shop.id}`} className="batta-btn-luxe tap-target inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px]">
              <Link2 className="size-4" /> {t("accounts.connect")}
            </a>
          )}
        </div>
        {accounts.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">{t("accounts.none")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                <Icon network={a.network} />
                <span className="font-bold">{a.network === "instagram" && a.username ? `@${a.username}` : a.name}</span>
                <span className="text-[11.5px] text-muted">{t(`accounts.network.${a.network}`)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${a.status === "active" ? "batta-tone-ok" : "batta-tone-bad"}`}>
                  {t(`accounts.status.${a.status as "active" | "expired" | "revoked"}`)}
                </span>
                {canManage && a.status !== "revoked" && a.network === "facebook" && (
                  <PostButton
                    url={`/api/pro/social/accounts/${a.id}/disconnect`}
                    confirm={t("accounts.confirmDisconnect")}
                    success={t("accounts.disconnected")}
                    className="ms-auto inline-flex items-center gap-1 text-[12px] font-bold text-muted hover:text-foreground"
                  >
                    <Unplug className="size-3.5" /> {t("accounts.disconnect")}
                  </PostButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <SocialComposer
          listings={(listingsRes.data ?? []).map((l) => ({ id: l.id as string, label: `${l.title as string}${l.reference ? ` · ${l.reference as string}` : ""}` }))}
          accounts={accounts.filter((a) => a.status === "active").map((a) => ({ id: a.id, network: a.network, name: a.network === "instagram" && a.username ? `@${a.username}` : a.name }))}
          aiEnabled={allowAi}
        />
      )}

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-[14px] font-extrabold">{t("journal.title")}</h3>
        {jobs.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">{t("journal.empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {jobs.map((j) => {
              const req = one(j.request as never) as { listing: unknown } | null;
              const listing = one((req?.listing ?? null) as { title: string; reference: string | null } | null);
              return (
                <li key={j.id} className="py-2.5 text-[12.5px]">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Icon network={j.network} />
                    <span className="font-bold">{listing?.title ?? "—"}</span>
                    <span className="text-muted">→ {one(j.account)?.name ?? "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${STATUS_TONE[j.status] ?? ""}`}>
                      {t(`journal.status.${j.status as "draft"}`)}
                    </span>
                    <span className="text-[11.5px] text-muted">{when(j.published_at ?? j.created_at)} · {t("journal.attempts", { count: j.attempts })}</span>
                    {j.external_url && (
                      <a href={j.external_url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-bold text-gold hover:underline">
                        {t("results.view")} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  {j.last_error && j.status !== "published" && (
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {/* The cancel route stores its own French line; Meta's errors are shown as Meta wrote them. */}
                      {j.last_error === "Annulée par la boutique." ? t("api.cancelledByShop") : j.last_error}
                    </p>
                  )}
                  {canManage && <JobActions id={j.id} status={j.status} needsCheck={j.needs_remote_check} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
