"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { anonBidder, anonSeller } from "@/lib/anon";

interface ConversationItem {
  id: string;
  otherLabel: string;
  subtitle: string | null;
  lastBody: string | null;
  lastAt: string | null;
  unread: number;
}

interface Props {
  userId: string;
  /** Called when a row is clicked — lets the parent close the popup. */
  onSelect?: () => void;
}

interface ConvRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  auction_id: string | null;
  last_message_at: string;
  auctions: {
    make: string;
    model: string;
    year: number;
  } | null;
}

interface MsgRow {
  conversation_id: string;
  body: string;
  sender_id: string;
  created_at: string;
  read_at: string | null;
}

/**
 * Loads the user's conversations on mount and renders them inside the
 * messages popup. Lightweight server-component port — same data shape as
 * `/messages/page.tsx` but fetched client-side so the popup can open
 * without a route change.
 */
export function MessagesPopupList({ userId, onSelect }: Props) {
  const [items, setItems] = useState<ConversationItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const { data: rows } = await supabase
        .from("conversations")
        .select("*, auctions:auction_id(make, model, year)")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("last_message_at", { ascending: false });

      const conversations = (rows ?? []) as unknown as ConvRow[];
      if (conversations.length === 0) {
        if (!cancelled) setItems([]);
        return;
      }

      const { data: messages } = await supabase
        .from("messages")
        .select("conversation_id, body, sender_id, created_at, read_at")
        .in(
          "conversation_id",
          conversations.map((c) => c.id),
        )
        .order("created_at", { ascending: false });

      // Last message + unread count, per conversation.
      const lastByConv = new Map<
        string,
        { body: string; created_at: string; sender_id: string; unread: number }
      >();
      ((messages ?? []) as MsgRow[]).forEach((m) => {
        const slot = lastByConv.get(m.conversation_id);
        if (!slot) {
          lastByConv.set(m.conversation_id, {
            body: m.body,
            created_at: m.created_at,
            sender_id: m.sender_id,
            unread:
              m.sender_id !== userId && m.read_at === null ? 1 : 0,
          });
        } else if (m.sender_id !== userId && m.read_at === null) {
          slot.unread += 1;
        }
      });

      const list: ConversationItem[] = conversations.map((c) => {
        const otherId = c.buyer_id === userId ? c.seller_id : c.buyer_id;
        const otherIsSeller = c.buyer_id === userId;
        const otherLabel = otherIsSeller
          ? anonSeller(otherId)
          : anonBidder(otherId);
        const last = lastByConv.get(c.id);
        const subtitle = c.auctions
          ? `${c.auctions.make} ${c.auctions.model} ${c.auctions.year}`
          : null;
        return {
          id: c.id,
          otherLabel,
          subtitle,
          lastBody: last?.body ?? null,
          lastAt: last?.created_at ?? null,
          unread: last?.unread ?? 0,
        };
      });

      if (!cancelled) setItems(list);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (items === null) {
    return (
      <div className="px-4 py-10 text-center text-[var(--foreground-muted)] text-sm">
        Chargement…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-12 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
          <MessageSquare className="h-6 w-6" />
        </div>
        <div className="font-bold text-sm">Aucune conversation</div>
        <p className="text-xs text-[var(--foreground-muted)]">
          Démarrez une discussion avec un vendeur depuis la page d&apos;enchère
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--border)] max-h-[60vh] overflow-y-auto">
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/messages/${c.id}`}
          onClick={onSelect}
          className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
        >
          <Avatar size="md" alt={c.otherLabel} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-sm truncate">{c.otherLabel}</div>
              <div className="text-[10px] text-[var(--foreground-subtle)] tabular-nums shrink-0">
                {c.lastAt ? formatRel(c.lastAt) : ""}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <div className="text-xs text-[var(--foreground-muted)] truncate">
                {c.lastBody ?? c.subtitle ?? "Démarrer la conversation"}
              </div>
              {c.unread > 0 && (
                <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                  {c.unread}
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
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
