/**
 * Mazed Auto — manual payment methods and their instructions.
 *
 * Two offline methods, each paid outside the site and proved by a receipt:
 *
 *   1. Buyer picks bank transfer or D17 at checkout.
 *   2. Shown the payee details + a unique reference.
 *   3. Pays externally (wire transfer or D17 push).
 *   4. Uploads a screenshot / photo of the receipt.
 *   5. Admin reviews on /admin/paiements; accept → status='captured'
 *      (downstream triggers fire), reject → status='failed' with a
 *      reason the buyer sees in their notifications.
 *
 * WHAT IS OFFERED IS WHAT THE BACK OFFICE OPENED (D-B1). Each method is set in
 * « Moyens de paiement » (`app_settings.payment_methods`) and switched on
 * there; a method is shown to a buyer only when it is on AND its details are
 * complete and valid. There are no default details any more: this file used
 * to fall back to sample ones — a made-up RIB and IBAN, a D17 number that may
 * well be a stranger's phone, under the name of the project this code was
 * forked from — whenever a setting was empty, and that is what buyers were
 * told to send money to. With nothing opened, nothing is offered and the
 * order is not created (`manualPaymentOpen`).
 */

import type { PaymentProvider } from "./types";

export type InstructionField = {
  label: string;
  value: string;
  /** Render a copy-to-clipboard button. */
  copyable?: boolean;
  /** Render in monospaced tabular type — IBANs, references, amounts. */
  mono?: boolean;
};

export type ProviderInstructions = {
  value: PaymentProvider;
  label: string;
  shortLabel: string;
  description: string;
  fields: InstructionField[];
  /** What the buyer must do after paying. */
  nextStep: string;
};

// ── The methods, as the back office set them ───────────────────────────────

export type BankMethod = { enabled: boolean; holder: string; bank: string; rib: string; iban: string };
export type D17Method = { enabled: boolean; holder: string; number: string };
export type PaymentMethods = { bank_transfer: BankMethod; d17: D17Method };

/** The one setting that holds them. The old `payee_*` keys are no longer read. */
export const PAYMENT_METHODS_KEY = "payment_methods";

/**
 * Who the buyer pays: the company, by its name. It is a société, but the name
 * on its accounts is « Mazed Auto ». Filled in for every method until the back
 * office writes another, so the form starts with it and the checkout and the
 * receipts never show an empty beneficiary — or the forked project's.
 */
export const DEFAULT_HOLDER = "Mazed Auto";

export const EMPTY_METHODS: PaymentMethods = {
  bank_transfer: { enabled: false, holder: DEFAULT_HOLDER, bank: "", rib: "", iban: "" },
  d17: { enabled: false, holder: DEFAULT_HOLDER, number: "" },
};

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The holder as stored, or the company when it is empty or a sample. */
function holderOf(v: unknown): string {
  const h = str(v);
  return h && !SAMPLES.names.includes(h.toLowerCase()) ? h : DEFAULT_HOLDER;
}

/** The stored value, whatever its state, as a full shape — off when unsure. */
export function readPaymentMethods(value: unknown): PaymentMethods {
  const v = (value ?? {}) as { bank_transfer?: Record<string, unknown>; d17?: Record<string, unknown> };
  const b = v.bank_transfer ?? {};
  const d = v.d17 ?? {};
  return {
    bank_transfer: {
      enabled: b.enabled === true,
      holder: holderOf(b.holder),
      bank: str(b.bank),
      rib: str(b.rib, 40),
      iban: str(b.iban, 40),
    },
    d17: { enabled: d.enabled === true, holder: holderOf(d.holder), number: str(d.number, 20) },
  };
}

// ── Checking the details ───────────────────────────────────────────────────

const digits = (s: string) => s.replace(/\D/g, "");
const alnum = (s: string) => s.replace(/[^0-9a-z]/gi, "").toUpperCase();

/**
 * The sample details this codebase shipped with. Refused anywhere they would
 * reach a buyer, so a copy left in a database can never be switched on.
 */
const SAMPLES = {
  names: ["batta tunisia sarl"],
  rib: ["07003000123456789078"],
  iban: ["TN59070030000123456789078"],
  d17: ["55123456"],
};

/** A Tunisian RIB: 20 digits, written 2 · 3 · 13 · 2. */
export function formatRib(rib: string): string {
  const d = digits(rib);
  return d.length === 20 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 18)} ${d.slice(18)}` : rib.trim();
}

/** An IBAN in groups of four, as banks print it. */
export function formatIban(iban: string): string {
  return alnum(iban).replace(/(.{4})/g, "$1 ").trim();
}

/** A D17 number is a Tunisian mobile: 8 digits, written 2 · 3 · 3. */
export function formatD17(n: string): string {
  const d = digits(n).replace(/^216(?=\d{8}$)/, "");
  return d.length === 8 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : n.trim();
}

/**
 * A RIB's key is its last two digits, chosen so the whole 20-digit number is a
 * multiple of 97: a mistyped digit almost always breaks it.
 */
export function ribKeyOk(rib: string): boolean {
  const d = digits(rib);
  return d.length === 20 && BigInt(d) % BigInt(97) === BigInt(0);
}

/**
 * The IBAN of a Tunisian account: TN59 and the RIB. The check digits are 59
 * for every account, because a RIB whose key is right is a multiple of 97.
 * Empty until the RIB has its 20 digits.
 */
export function ibanFromRib(rib: string): string {
  const d = digits(rib);
  return d.length === 20 ? `TN59${d}` : "";
}

/** The bank a RIB's first two digits name (codes of the Banque centrale de Tunisie). */
const TN_BANKS: Record<string, string> = {
  "01": "ATB",
  "03": "BNA",
  "04": "Attijari bank",
  "05": "Banque de Tunisie",
  "07": "Amen Bank",
  "08": "BIAT",
  "10": "STB",
  "11": "UBCI",
  "12": "UIB",
  "14": "BH Bank",
  "17": "La Poste Tunisienne",
  "20": "BTK",
  "25": "Banque Zitouna",
};

/** The bank for this RIB, as a suggestion to check — empty when the code is not one we know. */
export function bankFromRib(rib: string): string {
  return TN_BANKS[digits(rib).slice(0, 2)] ?? "";
}

/**
 * The bank method once a RIB is typed: the IBAN and the bank follow the RIB,
 * for as long as nobody has written their own over the suggestion.
 */
export function withRib(m: BankMethod, rib: string): BankMethod {
  const ownIban = m.iban !== "" && alnum(m.iban) !== ibanFromRib(m.rib);
  const ownBank = m.bank !== "" && m.bank !== bankFromRib(m.rib);
  return {
    ...m,
    rib,
    iban: ownIban ? m.iban : ibanFromRib(rib),
    bank: ownBank ? m.bank : bankFromRib(rib),
  };
}

/** ISO 13616: move the first four characters to the end, letters to numbers, mod 97 = 1. */
function ibanChecksumOk(iban: string): boolean {
  const s = alnum(iban);
  const moved = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = /[A-Z]/.test(ch) ? ch.charCodeAt(0) - 55 : Number(ch);
    rest = Number(`${rest}${n}`) % 97;
  }
  return rest === 1;
}

/** What is wrong with a method's details — empty when it may be offered. */
export type MethodProblem =
  | "holder" | "bank" | "rib" | "ribKey" | "iban" | "ibanRib" | "number" | "sample";

export function bankProblems(m: BankMethod): MethodProblem[] {
  const out: MethodProblem[] = [];
  if (m.holder.length < 2) out.push("holder");
  if (m.bank.length < 2) out.push("bank");
  const rib = digits(m.rib);
  if (rib.length !== 20) out.push("rib");
  else if (!ribKeyOk(rib)) out.push("ribKey");
  // An IBAN made from a RIB whose key is wrong fails for that same reason: the
  // RIB's message says it once.
  if (m.iban && !(out.includes("ribKey") && alnum(m.iban) === ibanFromRib(rib))) {
    const iban = alnum(m.iban);
    if (!/^TN\d{22}$/.test(iban) || !ibanChecksumOk(iban)) out.push("iban");
    else if (rib.length === 20 && iban.slice(4) !== rib) out.push("ibanRib");
  }
  if (
    SAMPLES.names.includes(m.holder.toLowerCase())
    || SAMPLES.rib.includes(rib)
    || SAMPLES.iban.includes(alnum(m.iban))
  ) out.push("sample");
  return out;
}

export function d17Problems(m: D17Method): MethodProblem[] {
  const out: MethodProblem[] = [];
  if (m.holder.length < 2) out.push("holder");
  const n = digits(m.number).replace(/^216(?=\d{8}$)/, "");
  if (!/^[2-9]\d{7}$/.test(n)) out.push("number");
  if (SAMPLES.d17.includes(n) || SAMPLES.names.includes(m.holder.toLowerCase())) out.push("sample");
  return out;
}

/** The methods a buyer may be offered: switched on, and nothing wrong with them. */
export function availableMethods(m: PaymentMethods): PaymentProvider[] {
  const out: PaymentProvider[] = [];
  if (m.bank_transfer.enabled && bankProblems(m.bank_transfer).length === 0) out.push("bank_transfer");
  if (m.d17.enabled && d17Problems(m.d17).length === 0) out.push("d17");
  return out;
}

// ── Reading them ───────────────────────────────────────────────────────────

/**
 * Server-only: the methods as set. Pass the SERVICE-ROLE client — the setting
 * is not in the public-read policy of `app_settings`, and under a buyer's RLS
 * the row would read as missing (which, now, means « nothing offered »).
 *
 * Typed as `any` for the client param: the generated Supabase types push the
 * TS resolver into "excessively deep" territory on this builder chain.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchPaymentMethods(supabase: any): Promise<PaymentMethods> {
  const { data } = (await supabase
    .from("app_settings")
    .select("value")
    .eq("key", PAYMENT_METHODS_KEY)
    .maybeSingle()) as { data: { value: unknown } | null };
  return readPaymentMethods(data?.value);
}

/**
 * Whether a manual order may be created at all: at least one method a buyer
 * could actually pay with. The routes that create a transfer / D17 order ask
 * this first, so nobody is left holding an order with nowhere to pay it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function manualPaymentOpen(supabase: any): Promise<boolean> {
  return availableMethods(await fetchPaymentMethods(supabase)).length > 0;
}

/**
 * The name printed on a receipt as the one who was paid: the bank account's
 * holder once it is set, otherwise the site's name — never a sample.
 */
export function receiptIssuer(m: PaymentMethods): string {
  const holder = m.bank_transfer.holder;
  return holder && !SAMPLES.names.includes(holder.toLowerCase()) ? holder : DEFAULT_HOLDER;
}

// ── What the checkout shows ────────────────────────────────────────────────

/**
 * Build a short, human-readable reference the buyer types in the
 * "communication" / "motif" field of their transfer. We use the first
 * 8 chars of the payment UUID, uppercased, prefixed with MAZED. That
 * gives admin a one-line search key to match a bank statement against a
 * payments row.
 */
export function paymentReference(paymentId: string): string {
  return `MAZED-${paymentId.slice(0, 8).toUpperCase()}`;
}

/**
 * Format a TND amount the same way it appears on bank statements —
 * 2 decimals, dot separator, no currency suffix (added by the UI).
 */
function fmt(amountTND: number): string {
  return amountTND.toFixed(2);
}

/** The field labels in French — the default when no translator is passed. */
const FIELD_LABELS: Record<string, string> = {
  beneficiary: "Bénéficiaire",
  bank: "Banque",
  rib: "RIB",
  iban: "IBAN",
  amount: "Montant",
  referenceBank: "Référence (à indiquer dans le motif)",
  d17Number: "Numéro D17",
  referenceD17: "Référence (libellé du transfert)",
};

/**
 * The instructions for each method a buyer may use — only those
 * (`availableMethods`). Empty when none is open: the checkout then says so
 * instead of showing numbers.
 *
 * `label` names a field in the reader's language: the checkout passes the
 * `payment.instructions` translator (keys as in FIELD_LABELS).
 */
export function paymentInstructions(opts: {
  paymentId: string;
  amountTND: number;
  methods: PaymentMethods;
  label?: (key: string) => string;
}): ProviderInstructions[] {
  const ref = paymentReference(opts.paymentId);
  const amt = fmt(opts.amountTND);
  const l = opts.label ?? ((key: string) => FIELD_LABELS[key]);
  const open = availableMethods(opts.methods);
  const b = opts.methods.bank_transfer;
  const d = opts.methods.d17;
  const out: ProviderInstructions[] = [];

  if (open.includes("bank_transfer")) {
    out.push({
      value: "bank_transfer",
      label: "Virement bancaire (RIB)",
      shortLabel: "Virement",
      description:
        "Effectuez un virement depuis votre application bancaire ou en agence vers le compte ci-dessous, puis revenez ici pour téléverser le reçu.",
      fields: [
        { label: l("beneficiary"), value: b.holder },
        { label: l("bank"), value: b.bank },
        { label: l("rib"), value: formatRib(b.rib), copyable: true, mono: true },
        ...(b.iban ? [{ label: l("iban"), value: formatIban(b.iban), copyable: true, mono: true }] : []),
        { label: l("amount"), value: `${amt} TND`, copyable: true, mono: true },
        { label: l("referenceBank"), value: ref, copyable: true, mono: true },
      ],
      nextStep:
        "Téléversez une photo lisible de votre ordre de virement (reçu, capture e-banking, ou avis d'agence).",
    });
  }
  if (open.includes("d17")) {
    out.push({
      value: "d17",
      label: "D17 · La Poste Tunisienne",
      shortLabel: "D17",
      description:
        "Envoyez le montant depuis votre application D17 vers le numéro ci-dessous, puis téléversez la confirmation reçue par SMS ou dans l'app.",
      fields: [
        { label: l("d17Number"), value: formatD17(d.number), copyable: true, mono: true },
        { label: l("beneficiary"), value: d.holder },
        { label: l("amount"), value: `${amt} TND`, copyable: true, mono: true },
        { label: l("referenceD17"), value: ref, copyable: true, mono: true },
      ],
      nextStep:
        "Téléversez la capture d'écran de la confirmation D17 (référence + montant lisibles).",
    });
  }
  return out;
}
