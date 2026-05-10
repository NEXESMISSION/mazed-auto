"use client";

import { useState, useTransition } from "react";
import { Check, Edit3, Lock, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { updateSettingAction } from "./actions";

export interface SettingRow {
  key: string;
  value: unknown;
  type: "number" | "string" | "boolean" | "json";
  category: string;
  description: string | null;
  sensitive: boolean;
  requires_approval: boolean;
  updated_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  commission: "Commissions",
  deposit: "Caution de participation",
  auction: "Enchères",
  kyc: "Vérification KYC",
  listing: "Publication d'annonce",
  moderation: "Modération",
  trust: "Score de confiance",
  payment: "Paiement",
  i18n: "Internationalisation",
};

interface Props {
  rows: SettingRow[];
}

/**
 * Editable platform settings list. Each row shows the current value
 * inline; tapping the pencil flips it into a small edit form. The
 * server action handles type coercion (number, boolean, json string,
 * plain string) and updates the row + audit log.
 *
 * Settings flagged `requires_approval` show a warning chip — full
 * 2-admin approval flow is a follow-up; for now an admin can save
 * directly with the audit trail recording who and when.
 */
export function SettingsList({ rows }: Props) {
  const grouped = groupByCategory(rows);
  const cats = Object.keys(grouped).sort((a, b) => orderIdx(a) - orderIdx(b));

  return (
    <div className="space-y-6">
      {cats.map((cat) => (
        <section key={cat} className="space-y-2">
          <h2 className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--foreground-muted)] px-1">
            {CATEGORY_LABEL[cat] ?? cat}
          </h2>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
            {grouped[cat].map((row) => (
              <SettingItem key={row.key} row={row} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SettingItem({ row }: { row: SettingRow }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => stringify(row.value));
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const r = await updateSettingAction(row.key, draft);
      if (!r.ok) {
        toast(r.error, "error");
        return;
      }
      toast(`✓ ${row.key} mis à jour`, "success");
      setEditing(false);
    });
  }

  function cancel() {
    setDraft(stringify(row.value));
    setEditing(false);
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <code className="text-[12px] font-mono font-bold text-foreground">
              {row.key}
            </code>
            {row.sensitive && (
              <span className="inline-flex items-center gap-1 px-1.5 h-4 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[9px] font-bold uppercase tracking-wider">
                <Lock className="h-2.5 w-2.5" />
                Sensible
              </span>
            )}
            {row.requires_approval && (
              <span className="inline-flex items-center gap-1 px-1.5 h-4 rounded-full bg-red-500/15 border border-red-500/40 text-red-300 text-[9px] font-bold uppercase tracking-wider">
                <AlertTriangle className="h-2.5 w-2.5" />
                Approbation
              </span>
            )}
            <span className="text-[9px] text-[var(--foreground-subtle)] font-mono">
              {row.type}
            </span>
          </div>
          {row.description && (
            <div className="text-[11px] text-[var(--foreground-muted)] mt-1 leading-relaxed">
              {row.description}
            </div>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 h-8 w-8 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold)] hover:text-[var(--gold)] transition-colors"
            aria-label="Modifier"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2.5 space-y-2">
          {row.type === "json" ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-xs font-mono focus:outline-none focus:border-[var(--gold)]"
              spellCheck={false}
            />
          ) : (
            <Input
              type={row.type === "number" ? "number" : "text"}
              step={row.type === "number" ? "any" : undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={save}
              disabled={pending || draft === stringify(row.value)}
            >
              <Check className="h-3.5 w-3.5" />
              {pending ? "Enregistrement..." : "Enregistrer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={pending}>
              <X className="h-3.5 w-3.5" />
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5">
          <code className="inline-block text-[12px] font-mono tabular-nums px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--gold)]">
            {stringify(row.value)}
          </code>
          <span className="ms-2 text-[10px] text-[var(--foreground-subtle)]">
            mis à jour {new Date(row.updated_at).toLocaleString("fr-FR")}
          </span>
        </div>
      )}
    </div>
  );
}

function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function groupByCategory(rows: SettingRow[]): Record<string, SettingRow[]> {
  const out: Record<string, SettingRow[]> = {};
  for (const r of rows) {
    if (!out[r.category]) out[r.category] = [];
    out[r.category].push(r);
  }
  for (const cat of Object.keys(out)) {
    out[cat].sort((a, b) => a.key.localeCompare(b.key));
  }
  return out;
}

const ORDER = [
  "commission",
  "deposit",
  "auction",
  "kyc",
  "listing",
  "moderation",
  "trust",
  "payment",
  "i18n",
];
function orderIdx(cat: string): number {
  const i = ORDER.indexOf(cat);
  return i === -1 ? 999 : i;
}
