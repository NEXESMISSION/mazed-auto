import { notFound } from "next/navigation";
import { Link, redirect } from "@/i18n/navigation";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  type ConversationRow,
  type MessageRow,
  type AuctionRow,
} from "@/lib/db";
import { Avatar } from "@/components/ui/Avatar";
import { anonBidder, anonSeller } from "@/lib/anon";
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

  // Identify the "other" participant — but never reveal who they are.
  // Buyers see "Vendeur #ABCD"; sellers see "Enchérisseur #ABCD". The
  // platform mediates every interaction, so the chat header stays opaque.
  const isBuyer = conversation.buyer_id === user.id;
  const otherUserId = isBuyer ? conversation.seller_id : conversation.buyer_id;
  const otherName = isBuyer ? anonSeller(otherUserId) : anonBidder(otherUserId);

  // Initial messages (SSR seed)
  const { data: rawMessages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  const initialMessages = (rawMessages ?? []) as MessageRow[];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header — slim on mobile, taller and contained on desktop */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl border-b border-[var(--border)]">
        <div className="h-[var(--topbar-h)] lg:h-20 lg:max-w-[var(--max-w-app)] lg:mx-auto lg:px-8 flex items-center px-4 gap-3 lg:gap-4">
          <Link
            href="/messages"
            aria-label="Retour"
            className="h-9 w-9 lg:h-10 lg:w-10 rounded-full bg-[var(--surface)] border border-[var(--gold-soft)] text-[var(--gold)] flex items-center justify-center hover:bg-[var(--gold-faint)] hover:border-[var(--gold)] active:scale-95 transition-all"
          >
            <ChevronLeft className="h-4 w-4 lg:h-5 lg:w-5" strokeWidth={2.5} />
          </Link>
          <Avatar size="sm" alt={otherName} className="lg:!h-11 lg:!w-11" />
          <div className="flex-1 min-w-0">
            <div className="font-bold lg:font-extrabold text-sm lg:text-base truncate">
              {otherName}
            </div>
            {conversation.auctions && (
              <div className="text-[11px] lg:text-[12px] text-[var(--foreground-muted)] truncate">
                {conversation.auctions.make} {conversation.auctions.model}{" "}
                {conversation.auctions.year}
              </div>
            )}
          </div>
          {conversation.auction_id && (
            <Link
              href={`/auctions/${conversation.auction_id}`}
              className="inline-flex items-center gap-1.5 h-9 lg:h-10 px-3 lg:px-4 rounded-full ring-1 ring-[var(--gold)]/40 lg:ring-[var(--border)] hover:ring-[var(--gold)] text-[11px] lg:text-[12px] text-[var(--gold)] hover:text-[var(--gold)] font-bold transition-colors"
            >
              Voir l&apos;enchère
            </Link>
          )}
        </div>
      </header>

      {/* Chat thread — full-width on mobile, contained on desktop */}
      <div className="flex-1 lg:max-w-[var(--max-w-app)] lg:mx-auto lg:w-full lg:px-0 flex flex-col min-h-0">
        <ChatThread
          conversationId={id}
          userId={user.id}
          initialMessages={initialMessages}
        />
      </div>

      {initialMessages.length === 0 && (
        <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
          <div className="text-center text-[var(--foreground-muted)] space-y-2">
            <MessageSquare className="h-10 w-10 lg:h-14 lg:w-14 mx-auto opacity-30" />
            <div className="text-xs lg:text-sm">Commencer la conversation</div>
          </div>
        </div>
      )}
    </div>
  );
}
