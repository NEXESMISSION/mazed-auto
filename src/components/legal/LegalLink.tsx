"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  TermsContent,
  PrivacyContent,
  LEGAL_LAST_UPDATED,
} from "./LegalContent";

interface Props {
  /** Which legal document to open. */
  kind: "terms" | "privacy";
  /** Visible link text. Defaults to the document name. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Inline legal link that opens its content in a modal instead of
 * navigating. Use this anywhere a form or wizard step would otherwise lose
 * unsaved input — e.g. the register page password field, the auction
 * publish review.
 *
 * Drop-in replacement for `<Link href="/terms">…</Link>` in those contexts.
 */
export function LegalLink({ kind, children, className }: Props) {
  const [open, setOpen] = useState(false);

  const fallback =
    kind === "terms"
      ? "Conditions d'utilisation"
      : "Politique de confidentialité";
  const title = fallback;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Common case: this link sits inside a <label> that wraps the
          // accept-terms checkbox. Without stopPropagation the click would
          // also flip that checkbox.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          className ?? "text-[var(--gold)] hover:underline cursor-pointer"
        }
      >
        {children ?? fallback}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={`Dernière mise à jour : ${LEGAL_LAST_UPDATED}`}
        size="lg"
      >
        {kind === "terms" ? <TermsContent /> : <PrivacyContent />}
      </Modal>
    </>
  );
}
