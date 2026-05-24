import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatOMR } from "@/lib/currency";
import { Loader2, Plus, Play, FileText, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  fetchFixedAssets, fetchDepreciationEntries, enrichAssets, runDepreciation,
  softDeleteFixedAsset, getInvoiceSignedUrl, type FixedAssetWithDepreciation,
} from "@/lib/fixed-assets-queries";
import { NewFixedAssetDialog } from "./NewFixedAssetDialog";
import { EditFixedAssetDialog } from "./EditFixedAssetDialog";

export function FixedAssetsTab({ onChanged }: { onChanged: () => void }) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [assets, setAssets] = useState<FixedAssetWithDepreciation[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FixedAssetWithDepreciation | null>(null);

  const load = async () => {
    setLoading(true);
    const [a, d] = await Promise.all([fetchFixedAssets(), fetchDepreciationEntries()]);
    setAssets(enrichAssets(a, d));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRun = async () => {
    setRunning(true);
    const res = await runDepreciation();
    setRunning(false);
    if (!res) { toast.error("Failed to run depreciation"); return; }
    const totalPosted = res.reduce((s, r: any) => s + Number(r.posted_count || 0), 0);
    const totalAmt = res.reduce((s, r: any) => s + Number(r.total_amount || 0), 0);
    toast.success(`Posted ${totalPosted} entries (${formatOMR(totalAmt)})`);
    await load();
    onChanged();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete asset "${name}"? This will reverse its journal entries.`)) return;
    const ok = await softDeleteFixedAsset(id);
    if (!ok) { toast.error("Failed to delete"); return; }
    toast.success("Asset removed");
    await load();
    onChanged();
  };

  const openInvoice = async (path: string) => {
    const url = await getInvoiceSignedUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("Could not open invoice");
  };

  const totalCost = assets.reduce((s, a) => s + a.cost, 0);
  const totalDep = assets.reduce((s, a) => s + a.accumulated_depreciation, 0);
  const totalNBV = assets.reduce((s, a) => s + a.net_book_value, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Fixed Assets</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRun} disabled={running || assets.length === 0}>
              {running ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
              Run Depreciation
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Asset
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : assets.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No fixed assets yet. Click <strong>Add Asset</strong> to register equipment, furniture, or other long-term assets.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-muted/40 rounded p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Total Cost</div>
                <div className="text-base font-bold tabular-nums">{formatOMR(totalCost)}</div>
              </div>
              <div className="bg-muted/40 rounded p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Accumulated Depreciation</div>
                <div className="text-base font-bold tabular-nums text-destructive">- {formatOMR(totalDep)}</div>
              </div>
              <div className="bg-primary/10 rounded p-3 border border-primary/20">
                <div className="text-[10px] uppercase text-muted-foreground">Net Book Value</div>
                <div className="text-base font-bold tabular-nums text-primary">{formatOMR(totalNBV)}</div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Purchase Date</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Accum. Dep.</TableHead>
                  <TableHead className="text-right">Net Book Value</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.asset_name}</div>
                      {a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{a.category}</Badge></TableCell>
                    <TableCell className="text-sm">{a.purchase_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatOMR(a.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">- {formatOMR(a.accumulated_depreciation)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{formatOMR(a.net_book_value)}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {a.months_posted} / {a.total_months} months
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {a.invoice_url && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openInvoice(a.invoice_url)} title="View invoice">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(a)} title="Edit asset">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id, a.asset_name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        <NewFixedAssetDialog open={open} onOpenChange={setOpen} onCreated={() => { load(); onChanged(); }} />
        <EditFixedAssetDialog
          open={!!editing}
          onOpenChange={(v) => { if (!v) setEditing(null); }}
          asset={editing}
          onSaved={() => { load(); onChanged(); }}
        />
      </CardContent>
    </Card>
  );
}
