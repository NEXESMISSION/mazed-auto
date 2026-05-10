import { createClient } from "@/lib/supabase/server";
import { CitiesEditor } from "./CitiesEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CmsCitiesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_cities")
    .select("slug, name_ar, name_fr, region, is_active, position")
    .order("position", { ascending: true });
  return <CitiesEditor initial={(data ?? []) as never[]} />;
}
