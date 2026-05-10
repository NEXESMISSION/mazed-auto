"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { upsertNotifTemplate } from "../actions";

interface Tpl {
  kind: string;
  locale: string;
  title: string;
  body: string;
  in_app: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
  updated_at: string;
}

export function NotifTemplatesEditor({ initial }: { initial: Tpl[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Tpl[]>(initial);
  const [pending, start] = useTransition();

  // Group by kind, then locale
  const grouped = useMemo(() => {
    const out: Record<string, Tpl[]> = {};
    for (const t of items) {
      if (!out[t.kind]) out[t.kind] = [];
      out[t.kind].push(t);
    }
    return out;
  }, [items]);
  const kinds = Object.keys(grouped).sort();

  function patch(kind: string, locale: string, patch: Partial<Tpl>) {
    setItems((prev) =>
      prev.map((t) =>
        t.kind === kind && t.locale === locale ? { ...t, ...patch } : t,
      ),
    );
  }

  function save(t: Tpl) {
    start(async () => {
      const r = await upsertNotifTemplate({
        kind: t.kind,
        locale: t.locale,
        title: t.title,
        body: t.body,
        inApp: t.in_app,
        email: t.email,
        sms: t.sms,
        push: t.push,
      });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast(`✓ ${t.kind} (${t.locale}) enregistré`, "success");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {kinds.map((kind) => (
        <div
          key={kind}
          className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden"
        >
          <div className="px-4 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] text-sm font-bold">
            <code className="font-mono">{kind}</code>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {grouped[kind].map((t) => (
              <div key={`${kind}-${t.locale}`} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
                    Locale : {t.locale}
                  </div>
                  <div className="flex gap-2 text-xs">
                    <Channel
                      label="in-app"
                      value={t.in_app}
                      onChange={(v) => patch(kind, t.locale, { in_app: v })}
                    />
                    <Channel
                      label="push"
                      value={t.push}
                      onChange={(v) => patch(kind, t.locale, { push: v })}
                    />
                    <Channel
                      label="email"
                      value={t.email}
                      onChange={(v) => patch(kind, t.locale, { email: v })}
                    />
                    <Channel
                      label="sms"
                      value={t.sms}
                      onChange={(v) => patch(kind, t.locale, { sms: v })}
                    />
                  </div>
                </div>
                <Input
                  value={t.title}
                  onChange={(e) =>
                    patch(kind, t.locale, { title: e.target.value })
                  }
                  placeholder="Titre"
                  dir={t.locale === "ar" ? "rtl" : "ltr"}
                />
                <textarea
                  value={t.body}
                  onChange={(e) =>
                    patch(kind, t.locale, { body: e.target.value })
                  }
                  rows={2}
                  dir={t.locale === "ar" ? "rtl" : "ltr"}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => save(t)} disabled={pending}>
                    <Save className="h-3.5 w-3.5" />
                    Enregistrer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Channel({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
