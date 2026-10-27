"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AdminButton } from "@/components/admin/AdminButton";
import { Confirm, StatusPill, useAdminAction } from "@/components/admin/kit";
import type { Tone } from "@/components/admin/kit/tones";
import type { SiteModule } from "@/lib/modules";
import {
  ArrowRight, Building2, ClipboardCheck, CreditCard, Gift, Mail, MessageSquareText, Power, Share2, Store,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<SiteModule["key"], LucideIcon> = {
  shops: Store,
  approvals: ClipboardCheck,
  manual: Building2,
  konnect: CreditCard,
  social: Share2,
  sms: MessageSquareText,
  email: Mail,
  freeListings: Gift,
};

/** A server variable (on Vercel) is written in capitals; anything else names a screen to fill in. */
const isEnvName = (s: string) => /^[A-Z][A-Z0-9_]+$/.test(s);

function state(m: SiteModule): { tone: Tone; key: "running" | "waiting" | "ready" | "missing" | "off" } {
  if (m.on && m.ready) return { tone: "ok", key: "running" };
  if (m.on) return { tone: "warn", key: "waiting" };
  if (!m.switchable) return { tone: "neutral", key: "off" };
  return m.ready ? { tone: "info", key: "ready" } : { tone: "neutral", key: "missing" };
}

/**
 * The modules, one line each: what it does, its state, what it still needs,
 * and its switch when this screen owns it. Every switch asks first — most of
 * them change what the public sees at once.
 */
export function ModulesBoard({ modules }: { modules: SiteModule[] }) {
  const t = useTranslations("admin.modules");
  const action = useAdminAction();
  const [asking, setAsking] = useState<{ key: SiteModule["key"]; on: boolean } | "startReady" | null>(null);

  const startable = modules.filter((m) => m.switchable && m.ready && !m.on);
  const running = modules.filter((m) => m.on && m.ready).length;
  const name = (key: SiteModule["key"]) => t(`items.${key}.label`);

  const confirm = async () => {
    if (!asking) return;
    const ok = asking === "startReady"
      ? await action.run({
          url: "/api/admin/modules",
          method: "POST",
          body: { start_ready: true },
          success: t("startedAll", { count: startable.length }),
        })
      : await action.run({
          url: "/api/admin/modules",
          method: "POST",
          body: { key: asking.key, on: asking.on },
          success: t(asking.on ? "switchedOn" : "switchedOff", { name: name(asking.key) }),
        });
    if (ok !== false) setAsking(null);
  };

  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <AdminButton
          variant="primary"
          size="md"
          disabled={startable.length === 0}
          disabledReason={t("nothingToStart")}
          icon={<Power className="size-3.5" strokeWidth={2.4} />}
          onClick={() => setAsking("startReady")}
        >
          {t("startReady")}
        </AdminButton>
        <span className="text-[12px] text-subtle">{t("summary", { running, total: modules.length })}</span>
      </div>

      <ul className="mt-5 border-t border-border">
        {modules.map((m) => {
          const Icon = ICONS[m.key];
          const s = state(m);
          const env = m.missing.filter(isEnvName);
          const screens = m.missing.filter((x) => !isEnvName(x));
          return (
            <li key={m.key} className="flex items-start gap-4 border-b border-border py-4">
              <Icon className="mt-0.5 size-4 shrink-0 text-subtle" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-[13px] font-semibold text-foreground">{name(m.key)}</span>
                  <StatusPill tone={s.tone}>{t(`state.${s.key}`)}</StatusPill>
                </div>
                <p className="mt-0.5 max-w-xl text-[12px] text-subtle">{t(`items.${m.key}.body`)}</p>
                {m.detail && (
                  <p className="mt-1 text-[12px] text-foreground/80">{t(`items.${m.key}.detail`, m.detail)}</p>
                )}
                {env.length > 0 && (
                  <p className="mt-1.5 text-[12px] text-[var(--tone-warn)]">
                    {t("missingEnv")} <span className="ltr-island font-mono text-[11.5px]">{env.join(", ")}</span>
                  </p>
                )}
                {screens.map((x) => (
                  <p key={x} className="mt-1 text-[12px] text-[var(--tone-warn)]">{t(`missing.${x}`)}</p>
                ))}
                {m.optional && m.optional.length > 0 && (
                  <p className="mt-1 text-[11.5px] text-muted">
                    {t(`items.${m.key}.optional`)} <span className="ltr-island font-mono">{m.optional.join(", ")}</span>
                  </p>
                )}
                {m.href && (
                  <Link
                    href={m.href as "/admin"}
                    className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--gold)] transition hover:gap-1.5"
                  >
                    {t("open")}
                    <ArrowRight className="size-3.5 rtl:-scale-x-100" strokeWidth={2.2} />
                  </Link>
                )}
              </div>
              {m.switchable && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={m.on}
                  aria-label={name(m.key)}
                  // Off and not ready: nothing to switch on yet. On stays switchable off whatever is missing.
                  disabled={!m.on && !m.ready}
                  title={!m.on && !m.ready ? t("notReady") : undefined}
                  onClick={() => setAsking({ key: m.key, on: !m.on })}
                  className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    m.on ? "bg-[var(--gold)]" : "bg-surface-3 ring-1 ring-border"
                  }`}
                >
                  <span
                    className={`size-4 rounded-full bg-white shadow-sm transition ${
                      m.on ? "translate-x-4 rtl:-translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <Confirm
        open={asking !== null}
        variant="primary"
        pending={action.pending}
        title={
          asking === "startReady"
            ? t("confirm.startTitle")
            : asking
              ? t(asking.on ? "confirm.onTitle" : "confirm.offTitle", { name: name(asking.key) })
              : ""
        }
        body={
          // Confirm puts the body in a <p>: phrasing content only.
          asking === "startReady" ? (
            <>
              {t("confirm.startBody")}
              {startable.map((m) => (
                <span key={m.key} className="mt-1 block font-semibold text-foreground">· {name(m.key)}</span>
              ))}
            </>
          ) : asking ? (
            t(`items.${asking.key}.${asking.on ? "effectOn" : "effectOff"}`)
          ) : null
        }
        confirmLabel={asking === "startReady" ? t("startReady") : asking?.on ? t("confirm.on") : t("confirm.off")}
        onConfirm={confirm}
        onCancel={() => setAsking(null)}
      />
    </div>
  );
}
