"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface SaleSerialized {
  date: string;
  label: string;
  sale: number;
  commission: number;
  tva: number;
  net: number;
  paid: boolean;
}

export function ExportCsvButton({ sales }: { sales: SaleSerialized[] }) {
  function exportCsv() {
    const rows = [
      ["Date", "Auction", "Sale", "Commission", "TVA (19%)", "Net", "Status"],
      ...sales.map((s) => [
        s.date,
        s.label,
        String(s.sale),
        String(s.commission),
        String(s.tva),
        String(s.net),
        s.paid ? "paid" : "pending",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `earnings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={exportCsv}
      disabled={sales.length === 0}
    >
      <Download className="h-4 w-4" />
      Exporter CSV
    </Button>
  );
}
