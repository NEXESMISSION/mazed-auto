import { createClient } from "@/lib/supabase/server";
import { FeaturesEditor } from "./FeaturesEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CmsFeaturesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_features")
    .select("slug, label_ar, label_fr, category, is_active, position")
    .order("position", { ascending: true });
  return <FeaturesEditor initial={(data ?? []) as never[]} />;
}
