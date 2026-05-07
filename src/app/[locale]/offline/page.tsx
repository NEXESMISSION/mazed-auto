import { Link } from "@/i18n/navigation";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

export const metadata = {
  title: "Vous êtes hors ligne — Mazed Auto",
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="mx-auto h-16 w-16 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[var(--gold)]">
          <WifiOff className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">Aucune connexion Internet</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 leading-relaxed">
            Vérifiez votre connexion réseau et réessayez. Certaines pages mises en
            cache localement peuvent fonctionner hors ligne.
          </p>
        </div>
        <Link href="/">
          <Button size="md" fullWidth>
            Réessayer
          </Button>
        </Link>
      </div>
    </main>
  );
}
