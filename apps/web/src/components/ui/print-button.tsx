"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The browser's print dialog doubles as "Save as PDF". */
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-3.5" />
      Save as PDF
    </Button>
  );
}
