import { createClient } from "@/lib/supabase/server";
import { FaqsEditor } from "./FaqsEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CmsFaqsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cms_faqs")
    .select(
      "id, position, question_ar, question_fr, answer_ar, answer_fr, is_published, updated_at",
    )
    .order("position", { ascending: true });
  return <FaqsEditor initial={(data ?? []) as never[]} />;
}
