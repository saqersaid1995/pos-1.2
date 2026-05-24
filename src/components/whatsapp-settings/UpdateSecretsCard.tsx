import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Copy, Shield, AlertTriangle, CheckCircle, XCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { callAdmin } from "@/lib/whatsapp-settings";

const SECRET_NAMES = [
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
] as const;

export default function UpdateSecretsCard({ onAfterTest }: { onAfterTest: () => void }) {
  const [token, setToken] = useState("");
  const [tokenConfirm, setTokenConfirm] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<null | { ok: boolean; msg: string; phone?: string }>(null);
  const [testing, setTesting] = useState(false);

  const tokenMismatch = token && tokenConfirm && token !== tokenConfirm;

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${text}`);
  }

  async function validate() {
    setValidating(true);
    setResult(null);
    try {
      const data: any = await callAdmin("validate_secrets", {
        access_token: token,
        phone_number_id: phoneId,
      });
      if (data.success) {
        setResult({ ok: true, msg: `Valid · ${data.verified_name || ""}`, phone: data.display_phone_number });
        toast.success("Credentials valid – now save them in Edge Function Secrets");
      } else {
        setResult({ ok: false, msg: data.error || "Validation failed" });
        toast.error(data.error || "Validation failed");
      }
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || String(e) });
      toast.error("Validation error");
    } finally {
      setValidating(false);
      setConfirmOpen(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    try {
      const data: any = await callAdmin("test_connection");
      if (data.success) toast.success(`Connected: ${data.data?.display_phone_number || "OK"}`);
      else toast.error(`Failed: ${data.data?.error?.message || data.error}`);
      onAfterTest();
    } catch (e: any) {
      toast.error(String(e));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="border-blue-300 bg-blue-50/40 dark:bg-blue-950/10">
      <CardHeader>
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-700 mt-1" />
          <div>
            <CardTitle>Update Secrets (Admin)</CardTitle>
            <CardDescription>
              Validate proposed credentials against Meta, then save them manually in Edge Function Secrets.
              Secrets are never stored or logged in the database.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>WHATSAPP_ACCESS_TOKEN</Label>
            <Input type="password" autoComplete="new-password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAG..." />
          </div>
          <div className="space-y-2">
            <Label>Confirm Access Token</Label>
            <Input type="password" autoComplete="new-password" value={tokenConfirm} onChange={(e) => setTokenConfirm(e.target.value)} />
            {tokenMismatch && <p className="text-xs text-destructive">Tokens do not match</p>}
          </div>
          <div className="space-y-2">
            <Label>WHATSAPP_PHONE_NUMBER_ID</Label>
            <Input type="password" autoComplete="new-password" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="123456789012345" />
          </div>
          <div className="space-y-2">
            <Label>VERIFY_TOKEN</Label>
            <Input type="password" autoComplete="new-password" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="webhook verify token" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>WHATSAPP_APP_SECRET (optional)</Label>
            <Input type="password" autoComplete="new-password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="for X-Hub-Signature-256 verification" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!token || !phoneId || !!tokenMismatch || validating}
          >
            <Shield className="h-4 w-4" />
            Validate against Meta
          </Button>
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            <Send className="h-4 w-4" />
            {testing ? "Testing…" : "Test Connection (current secrets)"}
          </Button>
        </div>

        {result && (
          <div className={`rounded-md border p-3 text-sm flex items-start gap-2 ${
            result.ok ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-destructive bg-destructive/10"
          }`}>
            {result.ok ? <CheckCircle className="h-4 w-4 text-green-700 mt-0.5" /> : <XCircle className="h-4 w-4 text-destructive mt-0.5" />}
            <div>
              <p className="font-medium">{result.ok ? "Credentials valid" : "Validation failed"}</p>
              <p className="text-xs text-muted-foreground">{result.msg}</p>
              {result.phone && <p className="text-xs">Display phone: <span className="font-mono">{result.phone}</span></p>}
            </div>
          </div>
        )}

        <div className="rounded-md border border-yellow-300 bg-yellow-50/50 dark:bg-yellow-950/20 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Manual save required</p>
              <p className="text-xs text-muted-foreground mt-1">
                For security, secrets cannot be written from the app. After validating above, paste the values into:
                <br />
                <strong>Lovable Cloud → Backend → Edge Function Secrets</strong>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {SECRET_NAMES.map((n) => (
              <Button key={n} size="sm" variant="outline" onClick={() => copy(n)} className="font-mono text-xs h-7">
                <Copy className="h-3 w-3" />
                {n}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Validate WhatsApp credentials?</DialogTitle>
            <DialogDescription>
              The proposed token + phone number ID will be sent once to Meta Graph API to verify they work.
              Nothing is stored. After validation, you must save the values in Edge Function Secrets.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={validate} disabled={validating}>
              {validating ? "Validating…" : "Validate now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
