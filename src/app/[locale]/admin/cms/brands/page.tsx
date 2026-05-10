import { createClient } from "@/lib/supabase/server";
import { BrandsEditor } from "./BrandsEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CmsBrandsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_brands")
    .select("slug, display_name, logo_url, is_active, position")
    .order("position", { ascending: true });
  return <BrandsEditor initial={(data ?? []) as never[]} />;
}
