"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  CreditCard,
  Smartphone,
  Building2,
  Lock,
  ArrowRight,
  ChevronLeft,
  AlertTriangle,
  Upload,
  Copy,
  CheckCircle2,
  FileText,
  Info,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/imageCompress";
import { submitManualPayment } from "./actions";

interface Props {
  bank: {
    beneficiary: string;
    bankName: string;
    rib: string;
    swift: string;
  };
  d17: {
    phone: string;
    recipientName: string;
  };
}

type PaymentMethod = "card" | "d17" | "bank";

export function CheckoutClient({ bank, d17 }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();

  const rawAmount = params.get("amount");
  const parsedAmount = rawAmount === null ? NaN : Number(rawAmount);
  const amount =
    Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  const type = params.get("type") ?? "deposit";
  const auctionId = params.get("auction");

  const [method, setMethod] = useState<PaymentMethod>("bank");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [block, setBlock] = useState<{ title: string; body: string } | null>(
    null,
  );
  const [validating, setValidating] = useState(() => {
    if (amount <= 0) return false;
    if (type === "subscription") return false;
    if (!auctionId) return false;
    return true;
  });

  // Receipt-upload state for the manual lanes (bank + D17)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (amount <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlock({
        title: "Montant manquant ou invalide",
        body: "Le lien de paiement est incomplet. Revenez à l'enchère et réessayez.",
      });
      setValidating(false);
    }
  }, [amount]);

  useEffect(() => {
    if (amount <= 0) return;
    if (type === "subscription") return;
    if (!auctionId) return;
    const supabase = createClient();
    supabase
      .from("auctions")
      .select("status")
      .eq("id", auctionId)
      .maybeSingle()
      .then(({ data }) => {
        const status = data?.status as string | undefined;
        if (!status) {
          setBlock({
            title: "Enchère introuvable",
            body: "Vérifiez le lien ou revenez à la liste des enchères.",
          });
        } else if (
          type === "deposit" &&
          status !== "active" &&
          status !== "ending"
        ) {
          setBlock({
            title: "Impossible de payer la caution maintenant",
            body:
              status === "ended" || status === "reserve_not_met"
                ? "Cette enchère est terminée. Aucune caution n'est requise."
                : "Cette enchère n'accepte pas de caution actuellement.",
          });
        } else if (
          type === "final" &&
          status !== "active" &&
          status !== "ending" &&
          status !== "ended" &&
          status !== "pending_seller_decision"
        ) {
          setBlock({
            title: "Impossible de finaliser le paiement",
            body:
              status === "cancelled"
                ? "Cette enchère a été annulée — aucune voiture à payer."
                : "Le statut de l'enchère ne permet pas de paiement final actuellement.",
          });
        }
        setValidating(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId, type]);

  // Card → keeps the existing simulated flow (forwards to /payment/processing).
  function handleSubmitCard(e: React.FormEvent) {
    e.preventDefault();
    if (block) return;
    const url = new URL(window.location.origin + "/payment/processing");
    params.forEach((v, k) => url.searchParams.set(k, v));
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("type", type);
    url.searchParams.set("method", "card");
    router.push(url.pathname + url.search);
  }

  // Manual (bank + D17) → uploads receipt + creates pending_verification tx.
  async function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault();
    if (block) return;
    if (!receiptFile) {
      toast("Veuillez joindre une image du reçu de paiement", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const payload =
        receiptFile.type === "application/pdf"
          ? receiptFile
          : await compressImage(receiptFile, {
              maxEdge: 1600,
              quality: 0.85,
            });
      const fd = new FormData();
      fd.append("receipt", payload);
      fd.append("amount", String(amount));
      fd.append("type", type);
      fd.append("method", method === "bank" ? "bank_transfer" : "d17");
      if (auctionId) fd.append("auctionId", auctionId);

      const r = await submitManualPayment(fd);
      if (!r.ok) {
        toast("Échec de la soumission : " + r.error, "error");
        return;
      }
      const url = new URL(window.location.origin + "/payment/pending");
      url.searchParams.set("tx", r.txId);
      url.searchParams.set("amount", String(amount));
      url.searchParams.set("method", method === "bank" ? "bank_transfer" : "d17");
      if (auctionId) url.searchParams.set("auction", auctionId);
      router.push(url.pathname + url.search);
    } finally {
      setSubmitting(false);
    }
  }

  function pickReceipt(file: File) {
    setReceiptFile(file);
    // Local preview — Blob URL revoked on next pick + on unmount.
    setReceiptPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file.type === "application/pdf"
        ? null
        : URL.createObjectURL(file);
    });
  }
  useEffect(
    () => () => {
      if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    },
    [receiptPreview],
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="max-w-md lg:max-w-[var(--max-w-content)] mx-auto px-4 lg:px-8 h-14 lg:h-16 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="h-9 w-9 lg:h-10 lg:w-10 rounded-full bg-[var(--surface)] border border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
            aria-label="Retour"
          >
            <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5" strokeWidth={2.5} />
          </button>
          <div className="flex items-center gap-2 font-bold text-sm lg:text-base">
            <Lock className="h-4 w-4 lg:h-4.5 lg:w-4.5 text-[var(--gold)]" />
            Paiement
          </div>
          <div className="w-9 lg:w-10" />
        </div>
      </header>

      <main className="flex-1 max-w-md lg:max-w-[var(--max-w-content)] mx-auto w-full p-4 lg:px-8 lg:py-10 pb-32 md:pb-4 space-y-4 lg:space-y-6">
        {block ? (
          <div className="rounded-[var(--radius-md)] bg-amber-500/10 border border-amber-500/40 p-5 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
            <div className="font-bold">{block.title}</div>
            <p className="text-sm text-[var(--foreground-muted)]">{block.body}</p>
            {auctionId && (
              <Link href={`/auctions/${auctionId}`} className="block">
                <Button variant="secondary" size="md" fullWidth>
                  Voir l&apos;enchère
                </Button>
              </Link>
            )}
          </div>
        ) : validating ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Summary card */}
            <div className="relative overflow-hidden rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] border border-[var(--border)] lg:ring-1 lg:ring-[var(--gold)]/20 lg:border-0 p-4 lg:p-7">
              <div
                aria-hidden
                className="hidden lg:block pointer-events-none absolute -top-20 -end-20 h-56 w-56 rounded-full bg-[var(--gold)] blur-3xl opacity-15"
              />
              <div className="relative">
                <div className="text-[10px] lg:text-[11px] uppercase tracking-[0.18em] lg:tracking-[0.22em] font-bold text-[var(--foreground-muted)]">
                  {type === "deposit"
                    ? "Caution de participation (5%)"
                    : type === "final"
                      ? "Prix final de la voiture"
                      : type === "subscription"
                        ? params.get("plan_label") || "Abonnement Mazed Auto"
                        : "Montant"}
                </div>
                <div className="mt-1.5 lg:mt-3 text-3xl lg:text-[48px] xl:text-[56px] font-extrabold lg:font-black gradient-gold-text tabular-nums leading-none">
                  {formatPrice(amount)}
                </div>
              </div>
            </div>

            {/* Method tabs */}
            <div>
              <div className="text-xs font-semibold text-[var(--foreground-muted)] mb-2">
                Choisir le moyen de paiement
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MethodTab
                  active={method === "bank"}
                  onClick={() => setMethod("bank")}
                  icon={<Building2 className="h-5 w-5" />}
                  label="Virement"
                  sub="bancaire"
                />
                <MethodTab
                  active={method === "d17"}
                  onClick={() => setMethod("d17")}
                  icon={<Smartphone className="h-5 w-5" />}
                  label="D17"
                  sub="Poste TN"
                />
                <MethodTab
                  active={method === "card"}
                  onClick={() => setMethod("card")}
                  icon={<CreditCard className="h-5 w-5" />}
                  label="Carte"
                  sub="(test)"
                />
              </div>
            </div>

            {method === "card" ? (
              <CardForm
                amount={amount}
                card={card}
                setCard={setCard}
                onSubmit={handleSubmitCard}
              />
            ) : (
              <ManualForm
                method={method}
                amount={amount}
                bank={bank}
                d17={d17}
                receiptFile={receiptFile}
                receiptPreview={receiptPreview}
                fileInputRef={fileInputRef}
                onPickReceipt={pickReceipt}
                submitting={submitting}
                onSubmit={handleSubmitManual}
              />
            )}

            <Link
              href="/help"
              className="block text-center text-xs text-[var(--gold)] hover:underline"
            >
              Vous rencontrez un problème ?
            </Link>
          </>
        )}
      </main>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Card form — kept as the existing simulated flow. Real provider
   integration (Konnect / ClicTopay) lands here later.
   ────────────────────────────────────────────────────────────────── */
function CardForm({
  amount,
  card,
  setCard,
  onSubmit,
}: {
  amount: number;
  card: { number: string; expiry: string; cvv: string; name: string };
  setCard: (c: { number: string; expiry: string; cvv: string; name: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Badge variant="warning" size="md" className="w-fit">
        ⚠ Paiement par carte simulé (passerelle bancaire à venir)
      </Badge>
      <Field label="Numéro de carte">
        <Input
          placeholder="4242 4242 4242 4242"
          value={card.number}
          onChange={(e) => setCard({ ...card, number: e.target.value })}
          inputMode="numeric"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date d'expiration">
          <Input
            placeholder="MM/YY"
            value={card.expiry}
            onChange={(e) => setCard({ ...card, expiry: e.target.value })}
          />
        </Field>
        <Field label="CVV">
          <Input
            placeholder="123"
            value={card.cvv}
            onChange={(e) => setCard({ ...card, cvv: e.target.value })}
            inputMode="numeric"
          />
        </Field>
      </div>
      <Field label="Nom du titulaire">
        <Input
          placeholder="MOHAMED BEN ALI"
          value={card.name}
          onChange={(e) => setCard({ ...card, name: e.target.value })}
        />
      </Field>
      <Button type="submit" size="xl" fullWidth>
        <Lock className="h-5 w-5" />
        Payer {formatPrice(amount)}
        <ArrowRight className="h-5 w-5" />
      </Button>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Manual form — bank transfer OR D17. Shows the recipient details,
   "copy" buttons for each field, then a single receipt-upload step
   followed by Submit. Admin verifies inside /admin/transactions.
   ────────────────────────────────────────────────────────────────── */
function ManualForm({
  method,
  amount,
  bank,
  d17,
  receiptFile,
  receiptPreview,
  fileInputRef,
  onPickReceipt,
  submitting,
  onSubmit,
}: {
  method: "bank" | "d17";
  amount: number;
  bank: Props["bank"];
  d17: Props["d17"];
  receiptFile: File | null;
  receiptPreview: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onPickReceipt: (f: File) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Step 1 — instructions + recipient info */}
      <section className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
        <header className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2.5 bg-[var(--surface-2)]/50">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--gold)] text-black font-extrabold text-[12px]">
            1
          </span>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--gold)]">
              {method === "bank" ? "Virement bancaire" : "D17 — Poste Tunisienne"}
            </div>
            <div className="text-[13px] font-bold mt-0.5">
              Effectuez le paiement de {formatPrice(amount)}
            </div>
          </div>
        </header>

        <div className="p-4 space-y-3">
          {method === "bank" ? (
            <>
              <CopyRow label="Bénéficiaire" value={bank.beneficiary} />
              <CopyRow label="Banque" value={bank.bankName} />
              <CopyRow label="RIB" value={bank.rib} mono />
              <CopyRow label="Code SWIFT / BIC" value={bank.swift} mono />
            </>
          ) : (
            <>
              <CopyRow label="Destinataire" value={d17.recipientName} />
              <CopyRow label="Numéro D17" value={d17.phone} mono />
            </>
          )}

          <CopyRow
            label="Montant à payer"
            value={`${amount} DT`}
            mono
            highlight
          />
        </div>

        <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]/30 flex items-start gap-2.5 text-[12px] text-[var(--foreground-muted)] leading-snug">
          <Info className="h-4 w-4 text-[var(--gold)] mt-0.5 shrink-0" />
          {method === "bank" ? (
            <span>
              Effectuez un virement depuis votre application bancaire avec
              l&apos;exact montant ci-dessus. Indiquez votre numéro de
              téléphone en référence.
            </span>
          ) : (
            <span>
              Ouvrez l&apos;application D17 ou rendez-vous au bureau de
              poste le plus proche pour effectuer le transfert.
            </span>
          )}
        </div>
      </section>

      {/* Step 2 — receipt upload */}
      <section className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
        <header className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2.5 bg-[var(--surface-2)]/50">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--gold)] text-black font-extrabold text-[12px]">
            2
          </span>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] font-bold text-[var(--gold)]">
              Reçu de paiement
            </div>
            <div className="text-[13px] font-bold mt-0.5">
              Joignez une photo ou un PDF du reçu
            </div>
          </div>
        </header>

        <div className="p-4 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickReceipt(f);
              e.target.value = "";
            }}
          />

          {receiptFile ? (
            <div className="space-y-2">
              <div className="relative rounded-[var(--radius)] overflow-hidden bg-[var(--surface-2)] border border-[var(--success)]/40 aspect-[4/3]">
                {receiptPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={receiptPreview}
                    alt="Aperçu du reçu"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--foreground-muted)]">
                    <FileText className="h-10 w-10 text-[var(--gold)]" />
                    <div className="text-sm font-semibold">{receiptFile.name}</div>
                    <div className="text-[11px]">
                      {(receiptFile.size / 1024).toFixed(0)} KB · PDF
                    </div>
                  </div>
                )}
                <div className="absolute top-2 end-2 inline-flex items-center gap-1 px-2 h-6 rounded-full bg-emerald-500/90 text-white text-[10px] font-extrabold uppercase tracking-[0.15em]">
                  <CheckCircle2 className="h-3 w-3" />
                  Joint
                </div>
              </div>
              <Button
                type="button"
                size="md"
                variant="ghost"
                fullWidth
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Remplacer le fichier
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="
                w-full rounded-[var(--radius)] border-2 border-dashed border-[var(--gold-soft)]
                bg-[var(--surface-2)] hover:border-[var(--gold)] hover:bg-[var(--gold-faint)]/50
                transition-colors py-8 px-4 flex flex-col items-center gap-2
              "
            >
              <span className="h-12 w-12 rounded-full bg-[var(--gold)] text-black flex items-center justify-center">
                <Receipt className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <div className="text-sm font-bold">Joindre une photo ou un PDF</div>
              <div className="text-[11px] text-[var(--foreground-muted)]">
                JPG, PNG, HEIC ou PDF · max 8 MB
              </div>
            </button>
          )}
        </div>
      </section>

      <Button type="submit" size="xl" fullWidth disabled={submitting || !receiptFile}>
        {submitting ? (
          <>
            <span className="h-4 w-4 border-2 border-black/40 border-t-black rounded-full animate-spin" />
            Envoi…
          </>
        ) : (
          <>
            <Receipt className="h-5 w-5" />
            Soumettre pour vérification
            <ArrowRight className="h-5 w-5" />
          </>
        )}
      </Button>

      <p className="text-[11px] text-[var(--foreground-muted)] text-center leading-snug">
        Notre équipe vérifie votre reçu dans les 24 heures. Vous serez
        notifié dès que le paiement est validé.
      </p>
    </form>
  );
}

function CopyRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast("✓ Copié", "success");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Impossible de copier", "error");
    }
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[var(--radius)] px-3 py-2.5 ${
        highlight
          ? "bg-[var(--gold-faint)] ring-1 ring-[var(--gold)]/30"
          : "bg-[var(--surface-2)]"
      }`}
    >
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          {label}
        </div>
        <div
          className={`${
            mono ? "font-mono" : "font-semibold"
          } ${highlight ? "text-[var(--gold-bright)] text-lg" : "text-sm"} truncate mt-0.5`}
        >
          {value}
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label="Copier"
        className="shrink-0 h-9 w-9 rounded-full bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--gold)] hover:text-[var(--gold)] flex items-center justify-center transition-colors"
      >
        {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function MethodTab({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-[var(--radius)] border-2 flex flex-col items-center gap-1 transition-colors ${
        active
          ? "bg-[var(--gold-faint)] border-[var(--gold)] text-[var(--gold)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)] hover:border-[var(--gold-soft)]"
      }`}
    >
      {icon}
      <span className="text-xs font-bold">{label}</span>
      {sub && <span className="text-[9px] text-[var(--foreground-subtle)]">{sub}</span>}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-[var(--foreground-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
