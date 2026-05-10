"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

interface Channels {
  inApp: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
}

interface Item {
  kind: string;
  title: string;
  defaults: Channels;
  override: Channels | null;
}

export function NotifPrefsForm({ items }: { items: Item[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [state, setState] = useState<Record<string, Channels>>(() =>
    Object.fromEntries(items.map((i) => [i.kind, i.override ?? i.defaults])),
  );

  function patch(kind: string, p: Partial<Channels>) {
    setState((s) => ({ ...s, [kind]: { ...s[kind], ...p } }));
  }

  async function save(kind: string) {
    start(async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        toast("Veuillez vous reconnecter", "error");
        return;
      }
      const c = state[kind];
      const { error } = await supabase.from("user_notification_prefs").upsert({
        user_id: auth.user.id,
        kind,
        in_app: c.inApp,
        email: c.email,
        sms: c.sms,
        push: c.push,
      });
      if (error) {
        toast("Échec : " + error.message, "error");
        return;
      }
      toast("Préférences enregistrées", "success");
    });
  }

  return (
    <div className="space-y-2">
      {items.map((i) => {
        const c = state[i.kind];
        return (
          <div
            key={i.kind}
            className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-bold text-sm">{i.title}</div>
                <code className="text-[10px] font-mono text-[var(--foreground-subtle)]">
                  {i.kind}
                </code>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save(i.kind)}
                disabled={pending}
              >
                <Save className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
              <Toggle
                label="in-app"
                value={c.inApp}
                onChange={(v) => patch(i.kind, { inApp: v })}
              />
              <Toggle
                label="push"
                value={c.push}
                onChange={(v) => patch(i.kind, { push: v })}
              />
              <Toggle
                label="email"
                value={c.email}
                onChange={(v) => patch(i.kind, { email: v })}
              />
              <Toggle
                label="sms"
                value={c.sms}
                onChange={(v) => patch(i.kind, { sms: v })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`h-9 rounded-[var(--radius)] border text-xs font-bold transition-colors ${
        value
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
          : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)]"
      }`}
    >
      {label}
    </button>
  );
}
