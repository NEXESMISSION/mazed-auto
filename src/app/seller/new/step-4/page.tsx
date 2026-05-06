"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, AlertTriangle, ArrowRight } from "lucide-react";
import { CreateAuctionShell } from "@/components/layout/CreateAuctionShell";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CameraCapture } from "@/components/auction/CameraCapture";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useDraft } from "@/lib/draft";
import { useAuth } from "@/lib/auth";

const IS_DEV = process.env.NODE_ENV !== "production";

const exceptions = [
  { v: "", l: "Voiture à mon nom" },
  { v: "company", l: "Voiture au nom d'une société" },
  { v: "agent", l: "Mandataire du propriétaire" },
  { v: "inheritance", l: "Héritage" },
  { v: "spouse", l: "Conjoint(e)" },
  { v: "recent_purchase", l: "Achat récent (carte non encore mise à jour)" },
];

interface OCR {
  ownerName: string;
  plate: string;
  vin: string;
  year: string;
  fuel: string;
  registrationDate: string;
}

export default function Step4Page() {
  const router = useRouter();
  const { toast } = useToast();
  const { draft, update } = useDraft();
  const { user } = useAuth();
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [activeShoot, setActiveShoot] = useState<"front" | "back" | null>(null);
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

  function onCaptured(url: string) {
    if (activeShoot === "front") setFront(url);
    if (activeShoot === "back") setBack(url);
    setActiveShoot(null);

    // After both are captured, simulate OCR
    if (
      (activeShoot === "front" && back) ||
      (activeShoot === "back" && front)
    ) {
      runOCR();
    }
  }

  async function runOCR() {
    setAnalyzing(true);
    await new Promise((r) => setTimeout(r, 1800));
    const owner =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      "Mohamed Ben Ali";
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
    update({ ownerName: result.ownerName });
    setAnalyzing(false);
    toast("Données extraites ✓", "success");
  }

  return (
    <CreateAuctionShell current={3}>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold">Carte grise</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Pour confirmer que la voiture est à votre nom
          </p>
        </div>

        {/* Two scans side by side */}
        <div className="grid grid-cols-2 gap-3">
          <ScanSlot
            label="Recto"
            url={front}
            onClick={() => setActiveShoot("front")}
          />
          <ScanSlot
            label="Verso"
            url={back}
            onClick={() => setActiveShoot("back")}
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

        {/* Golden Lock check */}
        {ocr && (
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

        {/* Exception selector */}
        {ocr && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--foreground-muted)]">
Cas particulier ? (optionnel)
            </label>
            <select
              value={exception}
              onChange={(e) => {
                setException(e.target.value);
                update({ ownershipException: e.target.value });
              }}
              className="h-11 w-full px-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] focus:border-[var(--gold)] focus:outline-none cursor-pointer"
            >
              {exceptions.map((e) => (
                <option key={e.v} value={e.v}>{e.l}</option>
              ))}
            </select>
            {exception && (
              <div className="rounded-[var(--radius-sm)] bg-amber-500/10 border border-amber-500/30 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--foreground-muted)]">
                  Vous devrez téléverser un document juridique supplémentaire prouvant votre autorisation de vendre.
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
            disabled={!IS_DEV && !ocr}
            onClick={() => {
              // Dev: synthesize a minimal OCR payload so the saved draft
              // has the fields downstream pages may peek at.
              if (IS_DEV && !ocr) {
                const fullName =
                  [user?.firstName, user?.lastName]
                    .filter(Boolean)
                    .join(" ") || "Test";
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

      <Modal
        open={activeShoot !== null}
        onClose={() => setActiveShoot(null)}
        title={activeShoot === "front" ? "Recto" : "Verso"}
      >
        <CameraCapture
          frame="id-card"
          hint="Placez la carte grise dans le cadre"
          onCapture={onCaptured}
          upload
          folder="carte-grise"
        />
      </Modal>
    </CreateAuctionShell>
  );
}

function ScanSlot({
  label,
  url,
  onClick,
}: {
  label: string;
  url: string | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative aspect-[4/3] rounded-[var(--radius)] border-2 border-dashed overflow-hidden transition-colors ${
        url ? "border-[var(--success)]" : "border-[var(--border)] hover:border-[var(--gold)] bg-[var(--surface)]"
      }`}
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
