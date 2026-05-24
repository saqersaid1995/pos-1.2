import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppHeader from "@/components/AppHeader";
import OfflineModePanel from "@/components/OfflineModePanel";

export default function OfflineMode() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Lavinderia POS" subtitle="Offline Mode" />
      <div className="max-w-md mx-auto p-4 sm:p-6">
        <Button
          size="lg"
          className="w-full h-14 text-base gap-2 mb-6"
          onClick={() => window.location.assign("/scan-lite")}
        >
          <ScanLine className="h-5 w-5" />
          Open Scan Lite
        </Button>



        <h2 className="text-lg font-semibold mb-1">Install & Offline Setup</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Install Lavinderia POS on this device for faster access and offline use. Once installed, open it from your desktop shortcut or apps list — no browser tab needed.
        </p>
        <OfflineModePanel />
      </div>
    </div>
  );
}