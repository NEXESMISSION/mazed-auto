"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AdminButton } from "@/components/admin/AdminButton";
import { useAdminAction, EYEBROW } from "@/components/admin/kit";
import { REQUEST_KINDS, type Approvals } from "@/lib/shops/approvals";
import { LISTING_RULES_BOUNDS, toStoredListingRules, type ListingRules } from "@/lib/listingRules";
import { formatPhone, type SiteContact } from "@/lib/siteContact";
import { Save, ArrowRight, Gift, Store, ClipboardCheck, CalendarClock, Contact } from "lucide-react";

/** The welcome allowance: the first `count` paid publications are offered. */
export type FreeListings = { enabled: boolean; count: number };

/** What a private seller may have live at once, and whether it is free (D-P1, 0189). */
export type PersonalLimits = { vehicles: number; parts: number; free: boolean };

/** The four details the contact and help pages print; email and phone are required. */
const CONTACT_FIELDS: { key: keyof SiteContact; type: "email" | "tel" | "text" }[] = [
  { key: "email", type: "email" },
  { key: "phone", type: "tel" },
  { key: "whatsapp", type: "tel" },
  { key: "address", type: "text" },
];

const within = (n: number, { min, max }: { min: number; max: number }) => n >= min && n <= max;

/**
 * The rules that are not prices. The bank and D17 details buyers pay to have
 * their own screen now, « Moyens de paiement » (D-B1), with a switch per
 * method; this form only points there.
 */
export function SettingsForm({
  initialFree,
  initialPersonal,
  initialProShops,
  initialApprovals,
  initialGraceDays,
  initialListingRules,
  initialContact,
}: {
  initialFree: FreeListings;
  initialPersonal: PersonalLimits;
  initialProShops: boolean;
  /** What a shop must have approved before it pays (0196). */
  initialApprovals: Approvals;
  /** Days a lapsed shop's annonces stay up (0191). */
  initialGraceDays: number;
  /** How long an annonce stays online, how many photos it carries (D-B5). */
  initialListingRules: ListingRules;
  /** How people reach the team, as the contact and help pages print it (D-B3). */
  initialContact: SiteContact;
}) {
  const t = useTranslations("admin.settings.form");
  const [free, setFree] = useState<FreeListings>(initialFree);
  const freeAction = useAdminAction();
  const [personal, setPersonal] = useState<PersonalLimits>(initialPersonal);
  const personalAction = useAdminAction();
  const [proShops, setProShops] = useState(initialProShops);
  const shopsAction = useAdminAction();
  const [approvals, setApprovals] = useState<Approvals>(initialApprovals);
  const [graceDays, setGraceDays] = useState(initialGraceDays);
  const rulesAction = useAdminAction();
  const rulesDirty =
    REQUEST_KINDS.some((k) => approvals[k] !== initialApprovals[k]) || graceDays !== initialGraceDays;
  const personalDirty =
    personal.vehicles !== initialPersonal.vehicles
    || personal.parts !== initialPersonal.parts
    || personal.free !== initialPersonal.free;
  const [listingRules, setListingRules] = useState<ListingRules>(initialListingRules);
  const listingAction = useAdminAction();
  const listingDirty =
    listingRules.validityDays !== initialListingRules.validityDays
    || listingRules.maxPhotos !== initialListingRules.maxPhotos;
  // The server clamps too; refusing here says why instead of saving another number.
  const listingRulesValid =
    within(listingRules.validityDays, LISTING_RULES_BOUNDS.validityDays)
    && within(listingRules.maxPhotos, LISTING_RULES_BOUNDS.maxPhotos);
  const [contact, setContact] = useState<SiteContact>(initialContact);
  const contactAction = useAdminAction();
  const contactDirty = CONTACT_FIELDS.some(({ key }) => contact[key].trim() !== initialContact[key]);
  const whole = (v: string) => Math.max(0, Math.trunc(Number(v) || 0));

  return (
    <div className="mt-7">
      <section className="border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("payee.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("payee.moved")}
        </p>
        <Link
          href={"/admin/moyens-paiement" as never}
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--gold)] transition hover:gap-2"
        >
          {t("payee.open")}
          <ArrowRight className="size-3.5 rtl:-scale-x-100" strokeWidth={2.2} />
        </Link>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("contact.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("contact.body")}
        </p>

        <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
          {CONTACT_FIELDS.map(({ key, type }) => (
            <label key={key} className={key === "address" ? "sm:col-span-2" : undefined}>
              <span className="mb-1 block text-[12.5px] text-subtle">{t(`contact.${key}`)}</span>
              <input
                type={type}
                dir={type === "text" ? undefined : "ltr"}
                value={contact[key]}
                maxLength={key === "address" ? 200 : key === "email" ? 120 : 30}
                placeholder={t(`contact.placeholders.${key}`)}
                onChange={(e) => setContact((c) => ({ ...c, [key]: e.target.value }))}
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] text-foreground focus:border-[var(--gold)] focus:outline-none"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 max-w-xl text-[12px] text-subtle">{t("contact.hint")}</p>

        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <Contact className="size-3.5 shrink-0" />
          {t("contact.shownOn")}
          <Link href={"/contact" as never} className="font-medium text-[var(--gold)] hover:underline">
            {t("contact.see")}
          </Link>
        </p>

        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={contactAction.pending}
            done={contactAction.done}
            doneLabel={t("saved")}
            disabled={!contactDirty}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              contactAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { site_contact: contact },
                success: t("contact.success"),
                // As the server stores them, so the form reads as saved.
                onSuccess: () =>
                  setContact((c) => ({
                    email: c.email.trim(),
                    phone: formatPhone(c.phone),
                    whatsapp: c.whatsapp.trim() ? formatPhone(c.whatsapp) : "",
                    address: c.address.trim(),
                  })),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("welcome.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("welcome.body")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={free.enabled}
              onChange={(e) => setFree((f) => ({ ...f, enabled: e.target.checked }))}
              className="size-4 accent-[var(--gold)]"
            />
            <span className="text-[13px] font-medium text-foreground">{t("welcome.enable")}</span>
          </label>

          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">{t("welcome.count")}</span>
            <input
              type="number"
              min={0}
              max={50}
              value={free.count}
              onChange={(e) =>
                setFree((f) => ({ ...f, count: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))
              }
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
            />
          </label>
        </div>

        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <Gift className="size-3.5 shrink-0" />
          {free.enabled && free.count > 0
            ? t("welcome.on", { count: free.count })
            : t("welcome.off")}
        </p>

        {/* Lowering the number never bills anyone retroactively: each waiver is
            recorded on the listing it applied to, so what is already given
            stays given. */}
        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={freeAction.pending}
            done={freeAction.done}
            doneLabel={t("saved")}
            disabled={free.enabled === initialFree.enabled && free.count === initialFree.count}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              freeAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { free_listings: free },
                success: t("welcome.success"),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("personal.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("personal.body")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">{t("personal.vehicles")}</span>
            <input
              type="number"
              min={0}
              max={20}
              value={personal.vehicles}
              onChange={(e) => setPersonal((p) => ({ ...p, vehicles: whole(e.target.value) }))}
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
            />
          </label>
          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">{t("personal.parts")}</span>
            <input
              type="number"
              min={0}
              max={100}
              value={personal.parts}
              onChange={(e) => setPersonal((p) => ({ ...p, parts: whole(e.target.value) }))}
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={personal.free}
              onChange={(e) => setPersonal((p) => ({ ...p, free: e.target.checked }))}
              className="size-4 accent-[var(--gold)]"
            />
            <span className="text-[13px] font-medium text-foreground">{t("personal.free")}</span>
          </label>
        </div>

        <p className="mt-3 text-[12px] text-subtle">
          {personal.free
            ? t("personal.on", { vehicles: personal.vehicles, parts: personal.parts })
            : t("personal.off")}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={personalAction.pending}
            done={personalAction.done}
            doneLabel={t("saved")}
            disabled={!personalDirty}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              personalAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { personal_limits: personal },
                success: t("personal.success"),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("listingRules.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("listingRules.body")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">{t("listingRules.days")}</span>
            <input
              type="number"
              min={LISTING_RULES_BOUNDS.validityDays.min}
              max={LISTING_RULES_BOUNDS.validityDays.max}
              value={listingRules.validityDays}
              onChange={(e) => setListingRules((r) => ({ ...r, validityDays: whole(e.target.value) }))}
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
            />
          </label>
          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">{t("listingRules.photos")}</span>
            <input
              type="number"
              min={LISTING_RULES_BOUNDS.maxPhotos.min}
              max={LISTING_RULES_BOUNDS.maxPhotos.max}
              value={listingRules.maxPhotos}
              onChange={(e) => setListingRules((r) => ({ ...r, maxPhotos: whole(e.target.value) }))}
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
            />
          </label>
        </div>

        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <CalendarClock className="size-3.5 shrink-0" />
          {listingRulesValid
            ? t("listingRules.summary", { days: listingRules.validityDays, photos: listingRules.maxPhotos })
            : t("listingRules.bounds", {
                minDays: LISTING_RULES_BOUNDS.validityDays.min,
                maxDays: LISTING_RULES_BOUNDS.validityDays.max,
                minPhotos: LISTING_RULES_BOUNDS.maxPhotos.min,
                maxPhotos: LISTING_RULES_BOUNDS.maxPhotos.max,
              })}
        </p>
        <p className="mt-1.5 max-w-xl text-[12px] text-subtle">{t("listingRules.hint")}</p>

        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={listingAction.pending}
            done={listingAction.done}
            doneLabel={t("saved")}
            disabled={!listingDirty || !listingRulesValid}
            disabledReason={listingDirty ? t("listingRules.outOfBounds") : t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              listingAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { listing_rules: toStoredListingRules(listingRules) },
                success: t("listingRules.success"),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("shops.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("shops.body")}
        </p>

        <label className="mt-4 inline-flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={proShops}
            onChange={(e) => setProShops(e.target.checked)}
            className="size-4 accent-[var(--gold)]"
          />
          <span className="text-[13px] font-medium text-foreground">{t("shops.open")}</span>
        </label>

        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <Store className="size-3.5 shrink-0" />
          {proShops ? t("shops.public") : t("shops.preview")}
          <Link href={"/boutiques" as never} className="font-medium text-[var(--gold)] hover:underline">
            {t("shops.see")}
          </Link>
        </p>

        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={shopsAction.pending}
            done={shopsAction.done}
            doneLabel={t("saved")}
            disabled={proShops === initialProShops}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              shopsAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { pro_shops: { enabled: proShops } },
                success: proShops ? t("shops.successPublic") : t("shops.successPreview"),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("rules.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("rules.body")}
        </p>

        <div className="mt-4 space-y-3">
          {REQUEST_KINDS.map((k) => (
            <label key={k} className="flex max-w-xl cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={approvals[k]}
                onChange={(e) => setApprovals((a) => ({ ...a, [k]: e.target.checked }))}
                className="mt-0.5 size-4 shrink-0 accent-[var(--gold)]"
              />
              <span>
                <span className="block text-[13px] font-medium text-foreground">{t(`rules.kinds.${k}.label`)}</span>
                <span className="block text-[12px] text-subtle">{t(`rules.kinds.${k}.hint`)}</span>
              </span>
            </label>
          ))}
        </div>

        <label className="mt-5 flex flex-wrap items-center gap-2.5">
          <span className="text-[13px] font-medium text-foreground">{t("rules.grace")}</span>
          <input
            type="number"
            min={0}
            max={30}
            value={graceDays}
            onChange={(e) => setGraceDays(Math.min(30, whole(e.target.value)))}
            className="w-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[13px] tabular-nums text-foreground focus:border-[var(--gold)] focus:outline-none"
          />
          <span className="text-[12px] text-subtle">{t("rules.graceSuffix")}</span>
        </label>
        <p className="mt-1.5 max-w-xl text-[12px] text-subtle">{t("rules.graceHint")}</p>

        <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <ClipboardCheck className="size-3.5 shrink-0" />
          {t("rules.queue")}
          <Link href={"/admin/demandes" as never} className="font-medium text-[var(--gold)] hover:underline">
            {t("rules.openQueue")}
          </Link>
        </p>

        <div className="mt-4 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={rulesAction.pending}
            done={rulesAction.done}
            doneLabel={t("saved")}
            disabled={!rulesDirty}
            disabledReason={t("unchanged")}
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              rulesAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { pro_approvals: approvals, pro_grace_days: graceDays },
                success: t("rules.success"),
              })
            }
          >
            {t("save")}
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>{t("prices.title")}</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          {t("prices.body")}
        </p>
        <Link
          href="/admin/offres"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--gold)] transition hover:gap-2"
        >
          {t("prices.open")}
          <ArrowRight className="size-3.5 rtl:-scale-x-100" strokeWidth={2.2} />
        </Link>
      </section>
    </div>
  );
}
