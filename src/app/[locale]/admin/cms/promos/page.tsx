import { createClient } from "@/lib/supabase/server";
import { PromosEditor } from "./PromosEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CmsPromosPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_promo_banners")
    .select("*")
    .order("position", { ascending: true });
  return <PromosEditor initial={(data ?? []) as never[]} />;
}
