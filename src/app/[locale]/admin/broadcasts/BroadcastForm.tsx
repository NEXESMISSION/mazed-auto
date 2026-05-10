"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createBroadcastAction } from "@/app/[locale]/admin/actions";

const AUDIENCES = [
  { v: "all", l: "Tous" },
  { v: "buyers", l: "Acheteurs" },
  { v: "sellers", l: "Vendeurs" },
  { v: "admins", l: "Admins" },
  { v: "auction_bidders", l: "Enchérisseurs d'une enchère" },
] as const;

export function BroadcastForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] =
    useState<(typeof AUDIENCES)[number]["v"]>("all");
  const [auctionId, setAuctionId] = useState("");

  function send() {
    if (!title.trim() || !body.trim()) {
      toast("Titre + corps requis", "warning");
      return;
    }
    if (audience === "auction_bidders" && !auctionId.trim()) {
      toast("ID enchère requis pour cette audience", "warning");
      return;
    }
    if (
      !window.confirm(
        `Envoyer cette annonce à : ${audience}${audience === "auction_bidders" ? " (" + auctionId + ")" : ""} ?`,
      )
    )
      return;
    start(async () => {
      const r = await createBroadcastAction({
        title: title.trim(),
        body: body.trim(),
        audience,
        audienceFilter:
          audience === "auction_bidders"
            ? { auction_id: auctionId.trim() }
            : null,
      });
      if (!r.ok) {
        toast("Échec : " + r.error, "error");
        return;
      }
      toast("Annonce envoyée", "success");
      setTitle("");
      setBody("");
      setAuctionId("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          Audience
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.v}
              type="button"
              onClick={() => setAudience(a.v)}
              className={`px-3 h-9 rounded-full text-sm border ${
                audience === a.v
                  ? "bg-[var(--gold)] border-[var(--gold)] text-black font-bold"
                  : "bg-[var(--surface-2)] border-[var(--border)]"
              }`}
            >
              {a.l}
            </button>
          ))}
        </div>
      </div>

      {audience === "auction_bidders" && (
        <div>
          <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
            ID enchère
          </label>
          <Input
            value={auctionId}
            onChange={(e) => setAuctionId(e.target.value)}
            placeholder="UUID"
            className="mt-1"
          />
        </div>
      )}

      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          Titre
        </label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-[0.18em] font-bold text-[var(--foreground-muted)]">
          Message
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--radius)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={send} disabled={pending}>
          <Send className="h-4 w-4" />
          {pending ? "Envoi..." : "Envoyer"}
        </Button>
      </div>
    </div>
  );
}
