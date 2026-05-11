import { Link } from "@/i18n/navigation";
import { MessageSquare } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import {
  type ConversationRow,
  type AuctionRow,
} from "@/lib/db";
import { anonBidder, anonSeller } from "@/lib/anon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MessagesIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
          <MessageSquare className="h-12 w-12 text-[var(--gold)] mx-auto" />
          <div className="font-bold text-lg">Connectez-vous pour voir vos messages</div>
          <Link href="/login">
            <Button size="md">Connexion</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  // Conversations the user participates in (RLS enforces this anyway, the
  // explicit `or` is just to keep the query readable).
  const { data: rows } = await supabase
    .from("conversations")
    .select("*, auctions:auction_id(make, model, year, image_urls)")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false });

  const conversations =
    (rows ?? []) as (ConversationRow & {
      auctions:
        | Pick<AuctionRow, "make" | "model" | "year" | "image_urls">
        | null;
    })[];

  // Resolve "other party" display names + last-message previews in one pass.
  // Keep IO bounded: one query for sellers, one for last messages.
  const otherIds = Array.from(
    new Set(
      conversations.map((c) =>
        c.buyer_id === user.id ? c.seller_id : c.buyer_id,
      ),
    ),
  );

  // We deliberately don't look up the other participant's seller row.
  // Participants must stay anonymous in the inbox — buyers can't see who
  // the seller is, sellers can't see who the buyer is. Only the platform
  // (admin) ever resolves identities.
  const { data: lastMessages } = conversations.length > 0
    ? await supabase
        .from("messages")
        .select("conversation_id, body, sender_id, created_at, read_at")
        .in(
          "conversation_id",
          conversations.map((c) => c.id),
        )
        .order("created_at", { ascending: false })
    : { data: [] as Array<{
        conversation_id: string;
        body: string;
        sender_id: string;
        created_at: string;
        read_at: string | null;
      }> };

  // Last message + unread count per conversation
  const lastByConv = new Map<
    string,
    {
      body: string;
      created_at: string;
      sender_id: string;
      unread: number;
    }
  >();
  (lastMessages ?? []).forEach((m) => {
    const slot = lastByConv.get(m.conversation_id);
    if (!slot) {
      lastByConv.set(m.conversation_id, {
        body: m.body,
        created_at: m.created_at,
        sender_id: m.sender_id,
        unread:
          m.sender_id !== user.id && m.read_at === null ? 1 : 0,
      });
    } else if (m.sender_id !== user.id && m.read_at === null) {
      slot.unread += 1;
    }
  });

  return (
    <AppShell>
      <div className="max-w-[var(--max-w)] lg:max-w-[var(--max-w-app)] mx-auto px-4 py-5 lg:px-8 lg:py-10 space-y-4 lg:space-y-6">
        <div>
          <div className="hidden lg:inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] font-bold text-[var(--gold)]">
            <MessageSquare className="h-3.5 w-3.5" />
            Conversations
          </div>
          <h1 className="text-2xl lg:text-4xl xl:text-5xl font-extrabold lg:font-black lg:tracking-tight lg:mt-2 lg:leading-[1.05]">
            Messages
          </h1>
          {conversations.length > 0 && (
            <p className="hidden lg:block mt-3 text-base text-[var(--foreground-muted)] max-w-2xl">
              {conversations.length}{" "}
              {conversations.length === 1 ? "conversation" : "conversations"}.
              Identités anonymisées des deux côtés — vous reconnaîtrez la voiture,
              pas l&apos;acheteur.
            </p>
          )}
        </div>

        {conversations.length === 0 ? (
          <div className="text-center py-16 lg:py-24 space-y-3">
            <div className="mx-auto h-14 w-14 lg:h-20 lg:w-20 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
              <MessageSquare className="h-7 w-7 lg:h-10 lg:w-10" />
            </div>
            <div className="font-bold lg:text-lg">Aucune conversation</div>
            <p className="text-sm text-[var(--foreground-muted)] max-w-md mx-auto">
              Démarrez une conversation avec un vendeur depuis la page d&apos;enchère
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] lg:rounded-2xl bg-[var(--surface)] border border-[var(--border)] lg:ring-1 lg:ring-[var(--border)] lg:border-0 divide-y divide-[var(--border)] overflow-hidden">
            {conversations.map((c) => {
              const otherId =
                c.buyer_id === user.id ? c.seller_id : c.buyer_id;
              const otherIsSeller = c.buyer_id === user.id;
              // Anonymous handle, derived from the other participant's
              // user_id — the same opaque tag every time without ever
              // touching the seller row.
              const otherLabel = otherIsSeller
                ? anonSeller(otherId)
                : anonBidder(otherId);
              const last = lastByConv.get(c.id);
              const subtitle = c.auctions
                ? `${c.auctions.make} ${c.auctions.model} ${c.auctions.year}`
                : null;
              return (
                <Link
                  key={c.id}
                  href={`/messages/${c.id}`}
                  className="flex items-center gap-3 lg:gap-4 p-3 lg:p-5 hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Avatar
                    size="md"
                    alt={otherLabel}
                    className="lg:!h-12 lg:!w-12"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold lg:font-extrabold text-sm lg:text-base truncate">
                        {otherLabel}
                      </div>
                      <div className="text-[10px] lg:text-[11px] text-[var(--foreground-subtle)] tabular-nums shrink-0">
                        {last ? formatRel(last.created_at) : ""}
                      </div>
                    </div>
                    {subtitle && (
                      <div className="hidden lg:block text-[11px] uppercase tracking-[0.15em] font-bold text-[var(--gold)]/70 mt-0.5 truncate">
                        {subtitle}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-0.5 lg:mt-1">
                      <div className="text-xs lg:text-[13px] text-[var(--foreground-muted)] truncate">
                        {last?.body ?? subtitle ?? "Démarrer la conversation"}
                      </div>
                      {(last?.unread ?? 0) > 0 && (
                        <span className="min-w-[18px] lg:min-w-[22px] h-[18px] lg:h-[22px] px-1.5 lg:px-2 rounded-full bg-[var(--gold)] text-black text-[10px] lg:text-[11px] font-extrabold flex items-center justify-center tabular-nums shadow-[var(--shadow-gold)]">
                          {last!.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function formatRel(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} j`;
  return new Date(iso).toLocaleDateString("fr-TN");
}
