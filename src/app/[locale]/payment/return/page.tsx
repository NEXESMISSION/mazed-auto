import { Suspense } from "react";
import { ReturnClient } from "./ReturnClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnClient />
    </Suspense>
  );
}
