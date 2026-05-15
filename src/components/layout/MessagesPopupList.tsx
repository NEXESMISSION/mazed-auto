"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { MessageSquare } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { anonBidder, anonSeller } from "@/lib/anon";
import { cn } from "@/lib/utils";

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
  /** Total unread message count (shown next to the title). */
  unread?: number | null;
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
 * Conversations list rendered inside the header messages popover. Owns
 * its own header + footer chrome so the popover doesn't need to wrap it
 * with extra layout — same shape as NotificationsPopupList for visual
 * parity.
 */
export function MessagesPopupList({ userId, unread, onSelect }: Props) {
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
            unread: m.sender_id !== userId && m.read_at === null ? 1 : 0,
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

  return (
    <>
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
        <h2 className="text-base font-extrabold inline-flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--gold)]" />
          Messages
          {unread !== null && unread !== undefined && unread > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--gold)] text-black text-[10px] tabular-nums font-extrabold">
              {unread}
            </span>
          )}
        </h2>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto">
        {items === null ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--foreground-muted)]">
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-muted)]">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div className="font-bold text-sm">Aucune conversation</div>
            <p className="text-xs text-[var(--foreground-muted)] max-w-[260px] mx-auto leading-relaxed">
              Démarrez une discussion avec un vendeur depuis la page d&apos;enchère.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.slice(0, 20).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  onClick={onSelect}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-2)]",
                    c.unread > 0 && "bg-[var(--gold-faint)]/20",
                  )}
                >
                  <Avatar size="md" alt={c.otherLabel} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={cn(
                          "text-[13px] truncate",
                          c.unread > 0 ? "font-extrabold" : "font-bold",
                        )}
                      >
                        {c.otherLabel}
                      </div>
                      <div className="text-[10px] text-[var(--foreground-subtle)] tabular-nums shrink-0">
                        {c.lastAt ? formatRel(c.lastAt) : ""}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="text-[12px] text-[var(--foreground-muted)] truncate leading-snug">
                        {c.lastBody ?? c.subtitle ?? "Démarrer la conversation"}
                      </div>
                      {c.unread > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--gold)] text-black text-[10px] font-extrabold flex items-center justify-center tabular-nums shrink-0">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer link to the full inbox */}
      <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/40 shrink-0">
        <Link
          href="/messages"
          onClick={onSelect}
          className="block text-center text-[12px] font-bold text-[var(--gold)] hover:underline py-3"
        >
          Tout voir →
        </Link>
      </div>
    </>
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
