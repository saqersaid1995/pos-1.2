import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  updateFixedAsset, uploadInvoice, recalculateAssetDepreciation,
  type FixedAssetCategory, type FixedAssetWithDepreciation,
} from "@/lib/fixed-assets-queries";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: FixedAssetWithDepreciation | null;
  onSaved: () => void;
}

export function EditFixedAssetDialog({ open, onOpenChange, asset, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<FixedAssetCategory>("Equipment");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [cost, setCost] = useState("");
  const [lifeMonths, setLifeMonths] = useState("60");
  const [residual, setResidual] = useState("0");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const hasDepreciation = (asset?.months_posted || 0) > 0;
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!asset) return;
    setName(asset.asset_name);
    setCategory(asset.category as FixedAssetCategory);
    setPurchaseDate(asset.purchase_date);
    setCost(String(asset.cost));
    setLifeMonths(String(Math.round(asset.useful_life_years * 12)));
    setResidual(String(asset.residual_value));
    setNotes(asset.notes || "");
    setFile(null);
    setConfirming(false);
  }, [asset, open]);

  if (!asset) return null;

  const validate = () => {
    if (!name.trim()) { toast.error("Asset name is required"); return false; }
    const c = parseFloat(cost);
    const lm = parseFloat(lifeMonths);
    const r = parseFloat(residual || "0");
    if (!(c > 0)) { toast.error("Cost must be greater than 0"); return false; }
    if (!(lm > 0)) { toast.error("Useful life must be greater than 0"); return false; }
    if (r < 0 || r >= c) { toast.error("Residual must be ≥ 0 and < cost"); return false; }
    if (purchaseDate > today) { toast.error("Purchase date cannot be in the future"); return false; }
    return true;
  };

  const performSave = async () => {
    setSaving(true);
    try {
      let invoicePath = asset.invoice_url;
      if (file) {
        const path = await uploadInvoice(file, asset.id);
        if (!path) { toast.error("Invoice upload failed"); setSaving(false); return; }
        invoicePath = path;
      }
      const ok = await updateFixedAsset(asset.id, {
        asset_name: name.trim(),
        category,
        purchase_date: purchaseDate,
        cost: parseFloat(cost),
        useful_life_years: parseFloat(lifeMonths) / 12,
        residual_value: parseFloat(residual || "0"),
        notes: notes.trim(),
        invoice_url: invoicePath,
      } as any);
      if (!ok) { toast.error("Failed to update asset"); setSaving(false); return; }

      if (hasDepreciation) {
        const res = await recalculateAssetDepreciation(asset.id);
        if (res) toast.success(`Asset updated. Recalculated ${res.posted_count} depreciation entries.`);
        else toast.success("Asset updated (recalculation skipped)");
      } else {
        toast.success("Asset updated");
      }
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (hasDepreciation && !confirming) { setConfirming(true); return; }
    await performSave();
  };

  const handleRecalcOnly = async () => {
    setSaving(true);
    const res = await recalculateAssetDepreciation(asset.id);
    setSaving(false);
    if (!res) { toast.error("Recalculation failed"); return; }
    toast.success(`Recalculated ${res.posted_count} entries`);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Fixed Asset</DialogTitle>
        </DialogHeader>

        {confirming && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-amber-900 dark:text-amber-200">Recalculation required</div>
              <div className="text-amber-800 dark:text-amber-300">
                Editing this asset will reverse and recalculate all {asset.months_posted} depreciation entries
                already posted to the journal. Proceed?
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label>Asset Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
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
              <Input type="date" max={today} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Cost (OMR) *</Label>
              <Input type="number" step="0.001" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div>
              <Label>Useful Life (months) *</Label>
              <Input type="number" step="1" min="1" value={lifeMonths} onChange={(e) => setLifeMonths(e.target.value)} />
            </div>
            <div>
              <Label>Residual (OMR)</Label>
              <Input type="number" step="0.001" min="0" value={residual} onChange={(e) => setResidual(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Invoice (replace)</Label>
            <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            {asset.invoice_url && !file && (
              <div className="text-xs text-muted-foreground mt-1">Current invoice attached. Upload to replace.</div>
            )}
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {hasDepreciation && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleRecalcOnly}
              disabled={saving}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Recalculate Depreciation Only
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirming ? "Proceed & Recalculate" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
