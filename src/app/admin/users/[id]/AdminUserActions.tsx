"use client";

import { Ban, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function AdminUserActions() {
  const { toast } = useToast();
  return (
    <div className="flex flex-col gap-2 w-full md:w-auto">
      <Button
        variant="secondary"
        size="md"
        onClick={() => toast("Avertissement envoyé", "info")}
      >
        <AlertTriangle className="h-4 w-4" />
        Envoyer un avertissement
      </Button>
      <Button
        variant="danger"
        size="md"
        onClick={() => toast("Compte suspendu", "warning")}
      >
        <Ban className="h-4 w-4" />
        Suspendre le compte
      </Button>
    </div>
  );
}
