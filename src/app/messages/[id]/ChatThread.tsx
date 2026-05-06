"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useRealtimeMessages } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { MessageRow } from "@/lib/db";

interface Props {
  conversationId: string;
  userId: string;
  initialMessages: MessageRow[];
}

export function ChatThread({
  conversationId,
  userId,
  initialMessages,
}: Props) {
  const messages = useRealtimeMessages(conversationId, initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message whenever the list changes.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  // Mark inbound messages as read when the user is viewing the thread.
  useEffect(() => {
    const unread = messages.filter(
      (m) => m.sender_id !== userId && m.read_at === null,
    );
    if (unread.length === 0) return;
    const supabase = createClient();
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((m) => m.id),
      )
      .then(() => undefined);
  }, [messages, userId]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: userId,
      body: text,
    });
    setSending(false);
    if (error) return; // (toast wired elsewhere)
    setBody("");
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2"
      >
        {messages.map((m, i) => {
          const mine = m.sender_id === userId;
          const prev = messages[i - 1];
          const grouped =
            prev &&
            prev.sender_id === m.sender_id &&
            new Date(m.created_at).getTime() -
              new Date(prev.created_at).getTime() <
              60_000;
          return (
            <div
              key={m.id}
              className={cn(
                "max-w-[80%] flex flex-col",
                mine ? "items-end self-end ms-auto" : "items-start self-start",
              )}
            >
              <div
                className={cn(
                  "px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                  mine
                    ? "bg-[var(--gold)] text-black rounded-bl-md"
                    : "bg-[var(--surface)] border border-[var(--border)] rounded-br-md",
                  grouped && (mine ? "rounded-tr-md" : "rounded-tl-md"),
                )}
              >
                {m.body}
              </div>
              {!grouped && (
                <span className="text-[10px] text-[var(--foreground-subtle)] mt-1 px-1">
                  {formatTime(m.created_at)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 bg-[#0a0a0a] border-t border-[var(--border)] px-3 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Écrire un message..."
            rows={1}
            className="flex-1 min-h-[40px] max-h-32 px-3 py-2.5 rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] text-sm focus:border-[var(--gold)] focus:outline-none resize-none"
          />
          <button
            type="submit"
            aria-label="Envoyer"
            disabled={!body.trim() || sending}
            className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-b from-[var(--gold-bright)] to-[var(--gold)] shadow-[var(--shadow-gold)] flex items-center justify-center text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("fr-TN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("fr-TN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
