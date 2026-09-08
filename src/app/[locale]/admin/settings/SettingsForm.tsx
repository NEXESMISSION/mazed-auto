"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { AdminButton } from "@/components/admin/AdminButton";
import { TextField, FieldGrid, useAdminAction, EYEBROW } from "@/components/admin/kit";
import { Save, ArrowRight, Gift } from "lucide-react";

/** The welcome allowance: the first `count` paid publications are offered. */
export type FreeListings = { enabled: boolean; count: number };

export type PayeeSettings = {
  payee_name: string;
  payee_bank: string;
  payee_rib: string;
  payee_iban: string;
  payee_d17: string;
};

/**
 * The bank details a buyer is told to transfer to.
 *
 * Worth its own screen for one reason: these five strings are printed on the
 * checkout page and copied by hand into a banking app. A typo does not fail
 * loudly — it sends someone's money somewhere else and shows up days later as
 * "j'ai payé, où est mon annonce ?".
 *
 * Live example: `payee_name` currently reads "Batta Tunisia SARL", the name of
 * the twin real-estate project this codebase was forked from.
 */
export function SettingsForm({
  initial,
  initialFree,
}: {
  initial: PayeeSettings;
  initialFree: FreeListings;
}) {
  const { run, pending, done } = useAdminAction();
  const [form, setForm] = useState<PayeeSettings>(initial);
  const [free, setFree] = useState<FreeListings>(initialFree);
  const freeAction = useAdminAction();

  const set = (k: keyof PayeeSettings) => (v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const dirty = (Object.keys(form) as (keyof PayeeSettings)[]).some(
    (k) => form[k] !== initial[k],
  );

  // The most likely wrong value in the whole console, and the most expensive.
  const looksForeign = /batta/i.test(form.payee_name);

  return (
    <div className="mt-7">
      <section className="border-t border-border pt-5">
        <h2 className={EYEBROW}>Bénéficiaire du virement</h2>
        <p className="mt-1.5 text-[11.5px] text-subtle">
          Affiché au vendeur sur la page de paiement.
        </p>

        {looksForeign && (
          <p className="mt-3 border-s-2 border-[var(--tone-warn)] ps-3 text-[12px] text-[var(--tone-warn)]">
            Ce nom appartient au projet immobilier jumeau, pas à Mazed Auto. C'est celui que le
            vendeur recopie dans son application bancaire.
          </p>
        )}

        <div className="mt-4 space-y-4">
          <TextField
            label="Raison sociale"
            value={form.payee_name}
            onChange={set("payee_name")}
            placeholder="Mazed Auto SARL"
          />
          <FieldGrid>
            <TextField label="Banque" value={form.payee_bank} onChange={set("payee_bank")} />
            <TextField
              label="D17 / téléphone"
              value={form.payee_d17}
              onChange={set("payee_d17")}
              type="tel"
            />
          </FieldGrid>
          <FieldGrid>
            <TextField label="RIB" value={form.payee_rib} onChange={set("payee_rib")} />
            <TextField label="IBAN" value={form.payee_iban} onChange={set("payee_iban")} />
          </FieldGrid>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <AdminButton
            variant="primary"
            size="md"
            pending={pending}
            done={done}
            doneLabel="Enregistré"
            disabled={!dirty}
            disabledReason="Rien n'a changé."
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              run({
                url: "/api/admin/settings",
                method: "POST",
                body: form,
                success: "Coordonnées enregistrées.",
              })
            }
          >
            Enregistrer
          </AdminButton>
          {dirty && (
            <span className="text-[11.5px] text-subtle">Modifications non enregistrées.</span>
          )}
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>Allocation de bienvenue</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          Les premières publications payantes d&apos;un vendeur lui sont offertes. Les catégories
          déjà gratuites — les pièces — ne consomment rien : l&apos;allocation ne sert que là où il
          y aurait eu un prix.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={free.enabled}
              onChange={(e) => setFree((f) => ({ ...f, enabled: e.target.checked }))}
              className="size-4 accent-[var(--gold)]"
            />
            <span className="text-[13px] font-medium text-foreground">Activer</span>
          </label>

          <label className="inline-flex items-center gap-2.5">
            <span className="text-[12.5px] text-subtle">Publications offertes</span>
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
            ? `Un nouveau vendeur publie ${free.count} annonce${free.count > 1 ? "s" : ""} sans payer, puis au tarif normal.`
            : "Désactivée : chaque publication est facturée dès la première."}
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
            doneLabel="Enregistré"
            disabled={free.enabled === initialFree.enabled && free.count === initialFree.count}
            disabledReason="Rien n'a changé."
            icon={<Save className="size-3.5" strokeWidth={2.4} />}
            onClick={() =>
              freeAction.run({
                url: "/api/admin/settings",
                method: "POST",
                body: { free_listings: free },
                success: "Allocation enregistrée.",
              })
            }
          >
            Enregistrer
          </AdminButton>
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-5">
        <h2 className={EYEBROW}>Prix et forfaits</h2>
        <p className="mt-1.5 max-w-xl text-[12.5px] text-subtle">
          Le prix d'une publication, les packs, les mises en avant et le badge ne se règlent plus
          ici. Une seule table décide, et c'est celle que le vendeur paie.
        </p>
        <Link
          href="/admin/offres"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--gold)] transition hover:gap-2"
        >
          Ouvrir Offres &amp; prix
          <ArrowRight className="size-3.5" strokeWidth={2.2} />
        </Link>
      </section>
    </div>
  );
}
