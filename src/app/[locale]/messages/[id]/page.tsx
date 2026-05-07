import { notFound } from "next/navigation";
import { Link, redirect } from "@/i18n/navigation";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  type ConversationRow,
  type MessageRow,
  type AuctionRow,
  type SellerRow,
  mapSeller,
} from "@/lib/db";
import { Avatar } from "@/components/ui/Avatar";
import { ChatThread } from "./ChatThread";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export default async function ConversationPage({ params }: Props) {
  const { id, locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirect({ href: `/login?redirect=/messages/${id}`, locale });
  }

  // RLS will already block non-participants — but check explicitly so we can
  // 404 gracefully instead of returning an empty page.
  const { data: conv } = await supabase
    .from("conversations")
    .select("*, auctions:auction_id(make, model, year, image_urls)")
    .eq("id", id)
    .maybeSingle();
  if (!conv) notFound();

  const conversation = conv as ConversationRow & {
    auctions: Pick<AuctionRow, "make" | "model" | "year" | "image_urls"> | null;
  };

  // Identify the "other" participant
  const isBuyer = conversation.buyer_id === user.id;
  const otherUserId = isBuyer ? conversation.seller_id : conversation.buyer_id;

  const { data: otherSeller } = await supabase
    .from("sellers")
    .select("*")
    .eq("id", otherUserId)
    .maybeSingle();
  const otherSellerObj = otherSeller ? mapSeller(otherSeller as SellerRow) : null;
  const otherName = otherSellerObj?.displayName || (isBuyer ? "le vendeur" : "l'acheteur");

  // Initial messages (SSR seed)
  const { data: rawMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const initialMessages = (rawMessages ?? []) as MessageRow[];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 h-[var(--topbar-h)] bg-[#0a0a0a] border-b border-[var(--border)] flex items-center px-4 gap-3">
        <Link
          href="/messages"
          aria-label="Retour"
          className="h-9 w-9 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center hover:border-[var(--gold-soft)] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Avatar size="sm" src={otherSellerObj?.avatarUrl} alt={otherName} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{otherName}</div>
          {conversation.auctions && (
            <div className="text-[11px] text-[var(--foreground-muted)] truncate">
              {conversation.auctions.make} {conversation.auctions.model}{" "}
              {conversation.auctions.year}
            </div>
          )}
        </div>
        {conversation.auction_id && (
          <Link
            href={`/auctions/${conversation.auction_id}`}
            className="text-[11px] text-[var(--gold)] font-bold hover:underline"
          >
            Offre l'enchère
          </Link>
        )}
      </header>

      <ChatThread
        conversationId={id}
        userId={user.id}
        initialMessages={initialMessages}
      />

      {initialMessages.length === 0 && (
        <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
          <div className="text-center text-[var(--foreground-muted)] space-y-2">
            <MessageSquare className="h-10 w-10 mx-auto opacity-30" />
            <div className="text-xs">Commencer Conversation</div>
          </div>
        </div>
      )}
    </div>
  );
}
