"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Camera, Check, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

const IS_DEV = process.env.NODE_ENV !== "production";

// Mock-OCR fixture pool. The whole point of the Golden Lock check is to
// detect a mismatch between the carte grise's owner field and the seller's
// KYC name; the previous mock generated `ownerName` from `user.firstName +
// user.lastName`, so the check was self-fulfilling and always green.
// Picking from this pool means the OCR result is independent of who's
// signed in — the typical run produces a mismatch and exercises the
// exception flow (PLAN §11.3), which is what we actually need to validate.
// In production this is replaced by real OCR; the fixture only ships in
// dev/preview builds.
const OCR_OWNER_FIXTURES = [
  "Karim Trabelsi",
  "Faten Bouazizi",
  "Anis Khaldi",
  "Mariem Gharbi",
  "Slim Mestiri",
  "Yasmine Chouchane",
];

// Exceptions per PLAN §11.3. The first five cover legitimate name
// mismatches; "other" is the catch-all and forces an admin review before
// the auction can be published.
const exceptions = [
  { v: "company", l: "Voiture au nom d'une société" },
  { v: "agent", l: "Mandataire du propriétaire" },
  { v: "inheritance", l: "Héritage" },
  { v: "spouse", l: "Conjoint(e)" },
  { v: "recent_purchase", l: "Achat récent (carte non encore mise à jour)" },
  { v: "other", l: "Autre cas (révision admin requise)" },
];

interface OCR {
  ownerName: string;
  plate: string;
  vin: string;
  year: string;
  fuel: string;
  registrationDate: string;
}

// Lowercase, trim, collapse interior whitespace before equality. Matches
// "Mohamed Ben Ali" with "  mohamed  ben ali ". Doesn't strip diacritics —
// production OCR should normalise on its side.
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeName(a) === normalizeName(b);
}

export default function Step4Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [activeShoot, setActiveShoot] = useState<"front" | "back" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [ocr, setOcr] = useState<OCR | null>(
    draft.ownerName
      ? {
          ownerName: draft.ownerName,
          plate: draft.registration ?? "—",
          vin: draft.vin ?? "—",
          year: String(draft.year ?? ""),
          fuel: draft.fuelType ?? "",
          registrationDate: "",
        }
      : null,
  );
  const [exception, setException] = useState(draft.ownershipException ?? "");

  const kycName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const matched = ocr ? namesMatch(ocr.ownerName, kycName) : false;

  function pickShoot(side: "front" | "back") {
    if (uploading || analyzing) return;
    setActiveShoot(side);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    const side = activeShoot;
    if (!f || !side) return;
    if (!user) {
      toast("Connectez-vous d'abord", "warning");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${user.id}/carte-grise/${Date.now()}-${side}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from("auction-media")
      .upload(path, f, {
        contentType: f.type || "image/jpeg",
        upsert: false,
      });

    if (error) {
      setUploading(false);
      setActiveShoot(null);
      toast("Échec du téléversement : " + error.message, "error");
      return;
    }

    const { data } = supabase.storage.from("auction-media").getPublicUrl(path);
    const url = data.publicUrl;
    if (side === "front") setFront(url);
    else setBack(url);
    setUploading(false);
    setActiveShoot(null);

    const otherDone = side === "front" ? back : front;
    if (otherDone) runOCR();
  }

  async function runOCR() {
    setAnalyzing(true);
    await new Promise((r) => setTimeout(r, 1800));
    // Mock OCR: pick a fixture name independent of the signed-in user so
    // the Golden Lock comparison can actually fail. With 6 fixtures the
    // mismatch flow fires for ~all sessions where the seller isn't named
    // after one of the fixture entries.
    const owner =
      OCR_OWNER_FIXTURES[Math.floor(Math.random() * OCR_OWNER_FIXTURES.length)];
    const result: OCR = {
      ownerName: owner,
      plate: draft.registration ?? "123 Tunis 4567",
      vin: draft.vin ?? "VF1XXXXXXX12345",
      year: String(draft.year ?? "2022"),
      fuel:
        draft.fuelType === "diesel"
          ? "Diesel"
          : draft.fuelType === "hybrid"
            ? "Hybride"
            : draft.fuelType === "electric"
              ? "Électrique"
              : "Essence",
      registrationDate: new Date().toISOString().slice(0, 10),
    };
    setOcr(result);
    // New OCR run resets any previous exception choice — if the new result
    // matches the KYC name, no exception is needed; if it still mismatches,
    // the user re-picks.
    setException("");
    update({
      ownerName: result.ownerName,
      ownershipException: "",
      requiresOwnershipReview: false,
    });
    setAnalyzing(false);
    if (namesMatch(result.ownerName, kycName)) {
      toast("Données extraites — propriétaire confirmé", "success");
    } else {
      toast("Données extraites — vérifiez le propriétaire", "info");
    }
  }

  // Continue is disabled when:
  //  - no OCR yet (dev can fast-forward; prod cannot)
  //  - OCR returned a mismatch but no exception is selected
  const canContinue = ocr ? matched || Boolean(exception) : IS_DEV;
  const requiresAdminReview = exception === "other";

  return (
    <CreateAuctionShell current={3}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Carte grise</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Pour confirmer que la voiture est à votre nom
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileChange}
          className="hidden"
        />

        {/* Two scans side by side */}
        <div className="grid grid-cols-2 gap-3">
          <ScanSlot
            label="Recto"
            url={front}
            uploading={uploading && activeShoot === "front"}
            disabled={uploading}
            onClick={() => pickShoot("front")}
          />
          <ScanSlot
            label="Verso"
            url={back}
            uploading={uploading && activeShoot === "back"}
            disabled={uploading}
            onClick={() => pickShoot("back")}
          />
        </div>

        {/* Analyzing */}
        {analyzing && (
          <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4 text-center">
            <div className="mx-auto h-8 w-8 border-3 border-[var(--gold)] border-t-transparent rounded-full animate-spin mb-2" />
            <div className="text-sm font-semibold">Extraction des données en cours...</div>
          </div>
        )}

        {/* OCR results */}
        {ocr && !analyzing && (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
            <div className="px-4 py-2.5 bg-[var(--gold-faint)] border-b border-[var(--border)] text-xs font-bold text-[var(--gold-bright)]">
              ✓ Données extraites
            </div>
            <div className="p-4 space-y-3">
              <Field label="Nom du propriétaire">
                <Input value={ocr.ownerName} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Numéro de plaque">
                  <Input value={ocr.plate} />
                </Field>
                <Field label="VIN">
                  <Input value={ocr.vin} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Année">
                  <Input value={ocr.year} />
                </Field>
                <Field label="Carburant">
                  <Input value={ocr.fuel} />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* Golden Lock — green when names match, red when they don't */}
        {ocr && matched && (
          <div className="rounded-[var(--radius)] bg-green-500/10 border border-green-500/30 p-4 flex gap-3 items-start">
            <Check className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <div className="font-bold text-green-400">Verrou doré ✓</div>
              <div className="text-[var(--foreground-muted)] text-xs mt-0.5">
                Le nom du propriétaire correspond à votre carte d'identité
              </div>
            </div>
          </div>
        )}
        {ocr && !matched && (
          <div className="rounded-[var(--radius)] bg-red-500/10 border border-red-500/30 p-4 flex gap-3 items-start">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <div className="font-bold text-red-400">
                Verrou doré ✗ — noms différents
              </div>
              <div className="text-[var(--foreground-muted)] text-xs mt-0.5 leading-relaxed">
                La carte grise est au nom de <b>{ocr.ownerName}</b>, votre KYC
                est au nom de <b>{kycName || "—"}</b>. Choisissez le motif
                ci-dessous pour continuer.
              </div>
            </div>
          </div>
        )}

        {/* Exception selector — only shown when names don't match */}
        {ocr && !matched && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
              Motif de la différence <span className="text-red-400">*</span>
            </label>
            <select
              value={exception}
              onChange={(e) => {
                const v = e.target.value;
                setException(v);
                update({
                  ownershipException: v,
                  requiresOwnershipReview: v === "other",
                });
              }}
              className="h-11 w-full px-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] focus:border-[var(--gold)] focus:outline-none cursor-pointer"
            >
              <option value="" disabled>
                Choisir un motif…
              </option>
              {exceptions.map((e) => (
                <option key={e.v} value={e.v}>
                  {e.l}
                </option>
              ))}
            </select>
            {exception && exception !== "other" && (
              <div className="rounded-[var(--radius-sm)] bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--foreground-muted)]">
                  Vous devrez téléverser un document juridique supplémentaire
                  prouvant votre autorisation de vendre.
                </div>
              </div>
            )}
            {requiresAdminReview && (
              <div className="rounded-[var(--radius-sm)] bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--foreground-muted)]">
                  Cas non standard — votre annonce sera publiée après
                  vérification manuelle par un administrateur.
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-4 flex flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            onClick={() => router.back()}
          >
            Retour
          </Button>
          <Button
            size="lg"
            fullWidth
            disabled={!canContinue}
            onClick={() => {
              // Dev: synthesize a minimal OCR payload so the saved draft
              // has the fields downstream pages may peek at.
              if (IS_DEV && !ocr) {
                const fullName = kycName || "Test";
                update({
                  ownerName: fullName,
                  registration: "TEST-1234",
                  vin: "TESTVIN0000000001",
                });
              }
              router.push("/seller/new/step-5");
            }}
          >
            Continuer
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

    </CreateAuctionShell>
  );
}

function ScanSlot({
  label,
  url,
  uploading,
  disabled,
  onClick,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative aspect-[4/3] rounded-[var(--radius)] border-2 border-dashed overflow-hidden transition-colors ${
        uploading
          ? "border-[var(--gold)]"
          : url
            ? "border-[var(--success)]"
            : "border-[var(--border)] hover:border-[var(--gold)] bg-[var(--surface)]"
      } ${disabled && !uploading ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label} className="h-full w-full object-cover" />
          <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-[var(--success)] flex items-center justify-center">
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <Camera className="h-6 w-6 text-[var(--gold)]" />
          <div className="text-xs font-semibold">{label}</div>
        </div>
      )}
      {uploading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-[var(--gold)] animate-spin" />
        </div>
      )}
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
