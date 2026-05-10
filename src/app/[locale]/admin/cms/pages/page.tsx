import { createClient } from "@/lib/supabase/server";
import { PagesEditor } from "./PagesEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SLUGS = [
  { slug: "about", label: "À propos" },
  { slug: "how-it-works", label: "Comment ça marche" },
  { slug: "help", label: "Aide" },
  { slug: "terms", label: "CGU" },
  { slug: "privacy", label: "Confidentialité" },
];

export default async function CmsPagesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_pages")
    .select("slug, title_ar, title_fr, body_ar, body_fr, updated_at")
    .in(
      "slug",
      SLUGS.map((s) => s.slug),
    );
  const byKey = Object.fromEntries(
    (data ?? []).map((r) => [r.slug, r]),
  ) as Record<
    string,
    {
      slug: string;
      title_ar: string | null;
      title_fr: string | null;
      body_ar: string | null;
      body_fr: string | null;
      updated_at: string;
    }
  >;
  const rows = SLUGS.map((s) => ({
    slug: s.slug,
    label: s.label,
    titleAr: byKey[s.slug]?.title_ar ?? "",
    titleFr: byKey[s.slug]?.title_fr ?? "",
    bodyAr: byKey[s.slug]?.body_ar ?? "",
    bodyFr: byKey[s.slug]?.body_fr ?? "",
    updatedAt: byKey[s.slug]?.updated_at ?? null,
  }));
  return <PagesEditor rows={rows} />;
}
