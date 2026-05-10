"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";

/** Self-service password change for the signed-in admin. */
export function MeChangePassword() {
  const { toast } = useToast();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (pwd.length < 12) {
      toast(
        "Mot de passe trop court (12 caractères minimum pour un admin)",
        "warning",
      );
      return;
    }
    if (pwd !== confirm) {
      toast("Les deux mots de passe ne correspondent pas", "warning");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) {
      toast("Échec : " + error.message, "error");
      return;
    }
    setPwd("");
    setConfirm("");
    toast("Mot de passe changé", "success");
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--foreground-muted)]">
        Minimum 12 caractères pour un compte admin. Changez-le tous les 90
        jours.
      </p>
      <div className="grid md:grid-cols-2 gap-2">
        <Input
          type="password"
          placeholder="Nouveau mot de passe"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Confirmer"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          <Save className="h-4 w-4" />
          {busy ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
