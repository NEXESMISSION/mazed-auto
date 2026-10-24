import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import ar from "../../../messages/notifications/ar.json";
import fr from "../../../messages/notifications/fr.json";
import { compactTimeAgo, listingTitleOf, localizeNotification, reasonOf } from "./localize";

// The real messages, read as untyped keys the way the app's translators are.
type T = Parameters<typeof localizeNotification>[2];
const tAr = createTranslator({ locale: "ar", messages: { notifications: ar }, namespace: "notifications" }) as unknown as T;
const tFr = createTranslator({ locale: "fr", messages: { notifications: fr }, namespace: "notifications" }) as unknown as T;

describe("localizeNotification", () => {
  it("leaves French readers exactly the stored text", () => {
    const n = { kind: "listing_published", title: "Votre annonce est en ligne", body: "« Golf 7 » est visible jusqu'au 12/11/2026." };
    expect(localizeNotification(n, "fr", tFr)).toEqual({ title: n.title, body: n.body });
  });

  it("re-words a known kind for Arabic readers, keeping the annonce's title", () => {
    const n = { kind: "listing_published", title: "Votre annonce est en ligne", body: "« Golf 7 » est visible jusqu'au 12/11/2026." };
    const out = localizeNotification(n, "ar", tAr);
    expect(out.title).toBe("إعلانك منشور");
    expect(out.body).toContain("Golf 7");
    expect(out.body).toMatch(/\p{Script=Arabic}/u);
  });

  it("carries an admin's reason, and the credit given back", () => {
    const n = {
      kind: "listing_rejected",
      title: "Annonce à corriger",
      body: "« Clio 4 » n'a pas été publiée. Motif : photos floues Votre publication vous a été rendue.",
    };
    const out = localizeNotification(n, "ar", tAr);
    expect(out.body).toContain("Clio 4");
    expect(out.body).toContain("photos floues");
    expect(out.body).toContain(ar.kinds.listing_rejected.returned);
  });

  it("keeps the stored body when the part it needs is not there", () => {
    const n = { kind: "listing_expired", title: "Annonce expirée", body: "Une annonce n'est plus visible." };
    expect(localizeNotification(n, "ar", tAr)).toEqual({ title: "انتهت صلاحية إعلانك", body: n.body });
  });

  it("leaves an admin broadcast and an unknown kind as written", () => {
    const n = { kind: "announcement", title: "Nouveauté", body: "Texte libre" };
    expect(localizeNotification(n, "ar", tAr)).toEqual({ title: n.title, body: n.body });
    const old = { kind: "auction_won", title: "Adjugé", body: null };
    expect(localizeNotification(old, "ar", tAr)).toEqual({ title: old.title, body: null });
  });

  it("reads the pieces out of the stored French", () => {
    expect(listingTitleOf("« Peugeot 208 » est en cours de vérification.")).toBe("Peugeot 208");
    expect(reasonOf("Motif : RIB illisible. Vous pouvez en envoyer un nouveau.")).toBe("RIB illisible");
    expect(reasonOf("Rien à signaler")).toBeNull();
  });
});

describe("compactTimeAgo", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const day = (d: Date) => d.toISOString().slice(0, 10);
  it("speaks French exactly as before, and Arabic", () => {
    expect(compactTimeAgo("2026-10-24T11:59:30Z", tFr, day, now)).toBe("à l'instant");
    expect(compactTimeAgo("2026-10-24T11:55:00Z", tFr, day, now)).toBe("il y a 5 min");
    expect(compactTimeAgo("2026-10-24T09:00:00Z", tFr, day, now)).toBe("il y a 3 h");
    expect(compactTimeAgo("2026-10-22T12:00:00Z", tFr, day, now)).toBe("il y a 2 j");
    expect(compactTimeAgo("2026-10-24T09:00:00Z", tAr, day, now)).toBe("منذ 3 س");
    expect(compactTimeAgo("2026-10-01T12:00:00Z", tAr, day, now)).toBe("2026-10-01");
  });
});
