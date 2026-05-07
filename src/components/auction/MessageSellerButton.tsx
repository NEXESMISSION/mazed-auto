"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/Toast";
import type { ButtonProps } from "@/components/ui/Button";

interface Props {
  sellerId: string;
  /** Optional auction id to anchor the conversation to. */
  auctionId?: string | null;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  fullWidth?: boolean;
}

/**
 * Click → finds or creates a conversation with the seller and routes to it.
 * Refuses gracefully if the user is the seller themselves.
 */
export function MessageSellerButton({
  sellerId,
  auctionId = null,
  label = "Contacter le vendeur",
  size = "md",
  variant = "primary",
  fullWidth,
}: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  // Hide on the seller's own auction — you can't message yourself.
  if (user && user.id === sellerId) return null;

  async function handleClick() {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    const res = await fetch("/api/messages/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sellerId, auctionId }),
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast(
        "Échec d'ouverture de la conversation : " + (err?.error || "Erreur inconnue"),
        "error",
      );
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/messages/${id}`);
  }

  return (
    <Button
      size={size}
      variant={variant}
      fullWidth={fullWidth}
      onClick={handleClick}
      disabled={busy}
    >
      <MessageSquare className="h-4 w-4" />
      {busy ? "Ouverture..." : label}
    </Button>
  );
}
