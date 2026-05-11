import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Auth gate for the entire KYC flow. Anonymous visitors are bounced to
 * login — there is no public KYC entry point. Signed-in users at every
 * verification status can reach the flow; /kyc/status surfaces the
 * current state and /kyc/start guides them into a (re-)submission.
 */
export default async function KYCLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect({ href: "/login?redirect=/kyc/start", locale });
  }

  return <>{children}</>;
}
