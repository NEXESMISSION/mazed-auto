"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Mail, Check, Reply } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { setContactStatus } from "@/app/[locale]/admin/cms/actions";

interface Msg {
  id: string;
  name: string;
  email: string;
  topic: string;
  body: string;
  status: "open" | "reading" | "replied" | "closed";
  reply_body: string | null;
  created_at: string;
  replied_at: string | null;
}

export function ContactInboxList({ initial }: { initial: Msg[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Msg[]>(initial);
  const [filter, setFilter] = useState<"all" | "open" | "reading" | "replied">("open");
  const [pending, start] = useTransition();
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const filtered =
    filter === "all" ? items : items.filter((m) => m.status === filter);

  function setStatus(id: string, status: Msg["status"], replyText?: string) {
    start(async () => {
      const r = await setContactStatus({ id, status, reply: replyText });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      setItems((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                status,
                reply_body: replyText ?? m.reply_body,
                replied_at: status === "replied" ? new Date().toISOString() : m.replied_at,
              }
            : m,
        ),
      );
      toast("Mis à jour", "success");
      setReplyOpen(null);
      setReply("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {(["open", "reading", "replied", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 h-9 rounded-full text-sm border ${
              filter === f
                ? "bg-[var(--gold)] border-[var(--gold)] text-black font-bold"
                : "bg-[var(--surface-2)] border-[var(--border)]"
            }`}
          >
            {f === "all"
              ? "Tous"
              : f === "open"
                ? "Nouveaux"
                : f === "reading"
                  ? "En lecture"
                  : "Répondus"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-12 text-center text-sm text-[var(--foreground-muted)]">
            Aucun message.
          </div>
        )}
        {filtered.map((m) => (
          <div
            key={m.id}
            className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-[var(--foreground-muted)]" />
                <span className="font-bold text-sm">{m.name}</span>
                <span className="text-xs text-[var(--foreground-muted)]">
                  &lt;{m.email}&gt;
                </span>
              </div>
              <Badge size="sm">{m.topic}</Badge>
            </div>
            <div className="text-sm whitespace-pre-line">{m.body}</div>
            <div className="text-[11px] text-[var(--foreground-subtle)] mt-2 tabular-nums">
              {new Date(m.created_at).toLocaleString("fr-FR")}
            </div>

            {m.reply_body && (
              <div className="mt-2 p-3 rounded-[var(--radius)] bg-emerald-500/10 border border-emerald-500/30 text-sm">
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-300 mb-1">
                  Réponse
                </div>
                <div className="whitespace-pre-line">{m.reply_body}</div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {m.status === "open" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setStatus(m.id, "reading")}
                  disabled={pending}
                >
                  Marquer en lecture
                </Button>
              )}
              {m.status !== "replied" && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setReplyOpen(m.id);
                    setReply(m.reply_body ?? "");
                  }}
                  disabled={pending}
                >
                  <Reply className="h-4 w-4" />
                  Répondre
                </Button>
              )}
              {m.status !== "closed" && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setStatus(m.id, "closed")}
                  disabled={pending}
                >
                  Fermer
                </Button>
              )}
            </div>

            {replyOpen === m.id && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  placeholder="Votre réponse (sera envoyée par email — bientôt)"
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReplyOpen(null);
                      setReply("");
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setStatus(m.id, "replied", reply.trim())}
                    disabled={pending || !reply.trim()}
                  >
                    <Check className="h-4 w-4" />
                    Envoyer la réponse
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
