import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ScreenHeader } from "@/components/layout/ScreenHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import {
  type ConversationRow,
  type AuctionRow,
  type SellerRow,
  mapSeller,
} from "@/lib/db";

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

  const [{ data: sellersData }, { data: lastMessages }] = await Promise.all([
    otherIds.length > 0
      ? supabase.from("sellers").select("*").in("id", otherIds)
      : Promise.resolve({ data: [] as SellerRow[] }),
    conversations.length > 0
      ? supabase
          .from("messages")
          .select("conversation_id, body, sender_id, created_at, read_at")
          .in(
            "conversation_id",
            conversations.map((c) => c.id),
          )
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Array<{
          conversation_id: string;
          body: string;
          sender_id: string;
          created_at: string;
          read_at: string | null;
        }> }),
  ]);

  const sellersById = new Map(
    (sellersData ?? []).map((s) => [s.id, mapSeller(s as SellerRow)]),
  );

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
      <div className="max-w-[var(--max-w)] mx-auto px-4 py-5 space-y-4">
        <h1 className="text-2xl font-extrabold">Messages</h1>

        {conversations.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="mx-auto h-14 w-14 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
              <MessageSquare className="h-7 w-7" />
            </div>
            <div className="font-bold">Aucune conversation</div>
            <p className="text-sm text-[var(--foreground-muted)]">
              Démarrez une conversation avec un vendeur depuis la page d'enchère
            </p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
            {conversations.map((c) => {
              const otherId =
                c.buyer_id === user.id ? c.seller_id : c.buyer_id;
              const other = sellersById.get(otherId);
              const last = lastByConv.get(c.id);
              const subtitle = c.auctions
                ? `${c.auctions.make} ${c.auctions.model} ${c.auctions.year}`
                : null;
              return (
                <Link
                  key={c.id}
                  href={`/messages/${c.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Avatar
                    size="md"
                    src={other?.avatarUrl}
                    alt={other?.displayName || "Conversation"}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm truncate">
                        {other?.displayName ||
                          (c.buyer_id === user.id ? "Le vendeur" : "L'acheteur")}
                      </div>
                      <div className="text-[10px] text-[var(--foreground-subtle)] tabular-nums shrink-0">
                        {last ? formatRel(last.created_at) : ""}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="text-xs text-[var(--foreground-muted)] truncate">
                        {last?.body ?? subtitle ?? "Démarrer la conversation"}
                      </div>
                      {(last?.unread ?? 0) > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold flex items-center justify-center tabular-nums">
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
