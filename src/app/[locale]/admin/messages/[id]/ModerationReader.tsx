"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

interface Msg {
  id: string;
  sender_id: string;
  sender_label: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export function ModerationReader({
  conversationId,
}: {
  conversationId: string;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[] | null>(null);

  async function load() {
    if (!reason.trim()) {
      toast("Une raison est obligatoire", "warning");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_read_conversation", {
      p_conversation_id: conversationId,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      toast("Échec : " + error.message, "error");
      return;
    }
    setMessages((data ?? []) as Msg[]);
  }

  if (!messages) {
    return (
      <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex : enquête signalement #42 — harcèlement présumé"
        />
        <div className="flex justify-end">
          <Button onClick={load} disabled={busy}>
            {busy ? "Chargement..." : "Lire la conversation"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
      {messages.length === 0 && (
        <div className="p-8 text-center text-sm text-[var(--foreground-muted)]">
          Aucun message.
        </div>
      )}
      {messages.map((m) => (
        <div key={m.id} className="p-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-sm">{m.sender_label}</div>
            <div className="text-[10px] text-[var(--foreground-subtle)] tabular-nums">
              {new Date(m.created_at).toLocaleString("fr-FR")}
              {m.read_at && (
                <span className="ml-2 text-emerald-300">lu</span>
              )}
            </div>
          </div>
          <div className="mt-1 text-sm whitespace-pre-line">{m.body}</div>
        </div>
      ))}
    </div>
  );
}
