import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createFixedAsset, uploadInvoice, type FixedAssetCategory, type FundingSource } from "@/lib/fixed-assets-queries";
import { Loader2, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

export function NewFixedAssetDialog({ open, onOpenChange, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FixedAssetCategory>("Equipment");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [cost, setCost] = useState("");
  const [life, setLife] = useState("5");
  const [residual, setResidual] = useState("0");
  const [funding, setFunding] = useState<FundingSource>("equity");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setName(""); setCategory("Equipment"); setCost(""); setLife("5"); setResidual("0");
    setFunding("equity"); setNotes(""); setFile(null);
    setPurchaseDate(new Date().toISOString().split("T")[0]);
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Asset name is required");
    const c = parseFloat(cost);
    const l = parseFloat(life);
    const r = parseFloat(residual || "0");
    if (!(c > 0)) return toast.error("Cost must be greater than 0");
    if (!(l > 0)) return toast.error("Useful life must be greater than 0");
    if (r < 0 || r >= c) return toast.error("Residual value must be ≥ 0 and < cost");

    setSaving(true);
    try {
      let invoicePath = "";
      if (file) {
        const tempId = crypto.randomUUID();
        const path = await uploadInvoice(file, tempId);
        if (!path) { toast.error("Invoice upload failed"); setSaving(false); return; }
        invoicePath = path;
      }
      const id = await createFixedAsset({
        asset_name: name.trim(),
        category,
        purchase_date: purchaseDate,
        cost: c,
        useful_life_years: l,
        residual_value: r,
        funding_source: funding,
        notes: notes.trim(),
        invoice_url: invoicePath,
      });
      if (!id) { toast.error("Failed to create asset"); setSaving(false); return; }
      toast.success("Fixed asset added & journal entry posted");
      reset();
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Fixed Asset</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Asset Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Industrial Washer #2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as FixedAssetCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Equipment">Equipment</SelectItem>
                  <SelectItem value="Furniture">Furniture</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Purchase Date *</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Cost (OMR) *</Label>
              <Input type="number" step="0.001" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div>
              <Label>Useful Life (yrs) *</Label>
              <Input type="number" step="0.5" min="0.5" value={life} onChange={(e) => setLife(e.target.value)} />
            </div>
            <div>
              <Label>Residual (OMR)</Label>
              <Input type="number" step="0.001" min="0" value={residual} onChange={(e) => setResidual(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Funded By *</Label>
            <Select value={funding} onValueChange={(v) => setFunding(v as FundingSource)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equity">Owner's Equity</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="loan">Bank Loan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Invoice (PDF/Image)</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              {file && <Upload className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
            Depreciation method: <strong>Straight-line</strong>. Monthly entries are posted via the
            <strong> "Run Depreciation"</strong> button.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Asset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
