import { createClient } from "@/lib/supabase/server";
import { CategoriesEditor } from "./CategoriesEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CmsCategoriesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_categories")
    .select("slug, name_ar, name_fr, image_url, is_visible, position")
    .order("position", { ascending: true });
  return <CategoriesEditor initial={(data ?? []) as never[]} />;
}
