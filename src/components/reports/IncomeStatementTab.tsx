import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Download, ChevronDown, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import { PL_LINES, type Expense, type PLLine } from "@/lib/expense-queries";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

type Structured = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossProfitPct: number;
  sgaAdmin: number;
  otherOperatingIncome: number;
  ebitda: number;
  ebitdaPct: number;
  depreciation: number;
  interestExpense: number;
  ebit: number;
  interestIncome: number;
  otherIncome: number;
  nonOperatingIncome: number;
  profitBeforeTax: number;
  taxProvision: number;
  netProfit: number;
  netProfitPct: number;
  cashProfit: number;
  prev: {
    revenue: number; cogs: number; grossProfit: number;
    sgaAdmin: number; otherOperatingIncome: number;
    ebitda: number; depreciation: number; interestExpense: number; ebit: number;
    interestIncome: number; otherIncome: number; nonOperatingIncome: number;
    profitBeforeTax: number; taxProvision: number;
    netProfit: number; cashProfit: number;
  };
};

interface IncomeStatementTabProps {
  data: { structured?: Structured };
  dateRangeLabel: string;
  expenses?: Expense[];
}

const fmt = (n: number) => (n < 0 ? `(${formatOMR(Math.abs(n))})` : formatOMR(n));
const pct = (n: number) => `${n.toFixed(1)}%`;
const profitClass = (n: number) => (n >= 0 ? "text-[hsl(142,72%,40%)]" : "text-destructive");

// ---------- Drill-down modal ----------
function DrillDownModal({
  open, onClose, title, expenses,
}: { open: boolean; onClose: () => void; title: string; expenses: Expense[] }) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-2">
          {expenses.length} transaction{expenses.length === 1 ? "" : "s"} • Total: <strong className="text-foreground">{formatOMR(total)}</strong>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No transactions in this period.</TableCell></TableRow>
              ) : expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{e.expense_date}</TableCell>
                  <TableCell>{e.category}</TableCell>
                  <TableCell className="max-w-xs truncate">{e.description || "—"}</TableCell>
                  <TableCell className="capitalize">{e.payment_source}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatOMR(e.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "profit" | "loss" | "neutral" }) {
  const color = accent === "profit" ? "text-[hsl(142,72%,40%)]" : accent === "loss" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Line({
  label, current, previous, indent, bold, negative, onClick,
}: {
  label: string; current: number; previous: number;
  indent?: boolean; bold?: boolean; negative?: boolean; onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto] items-center gap-6 py-2 px-2 rounded ${indent ? "pl-8" : ""} ${bold ? "font-semibold border-t" : ""} ${interactive ? "cursor-pointer hover:bg-accent/50" : ""}`}
      onClick={onClick}
    >
      <span className={`text-sm ${bold ? "text-foreground" : "text-muted-foreground"} ${interactive ? "underline-offset-2 hover:underline" : ""}`}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground w-28 text-right tabular-nums">{fmt(previous)}</span>
      <span className={`text-sm w-32 text-right tabular-nums ${negative ? "text-destructive" : bold ? "text-foreground" : ""}`}>
        {fmt(current)}
      </span>
    </div>
  );
}

function Subtotal({ label, current, previous, pctValue, accent }: { label: string; current: number; previous: number; pctValue?: number; accent?: "profit" | "loss" }) {
  const color = accent === "profit" ? "text-[hsl(142,72%,40%)]" : accent === "loss" ? "text-destructive" : "";
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-6 py-3 px-2 my-1 rounded-md bg-muted/50 border-y">
      <span className="text-sm font-bold flex items-center gap-2">
        {label}
        {pctValue !== undefined && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${pctValue >= 0 ? "bg-[hsl(142,72%,40%)]/10 text-[hsl(142,72%,40%)]" : "bg-destructive/10 text-destructive"}`}>
            {pct(pctValue)}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground w-28 text-right tabular-nums">{fmt(previous)}</span>
      <span className={`text-base font-bold w-32 text-right tabular-nums ${color}`}>{fmt(current)}</span>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg overflow-hidden">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 text-left">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

async function exportPDF(elementId: string, filename: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  toast.info("Generating PDF…");
  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false });
    const pdf = new jsPDF("p", "mm", "a4");
    const imgData = canvas.toDataURL("image/png");
    const A4W = 210, margin = 12;
    const contentW = A4W - margin * 2;
    const imgH = (canvas.height * contentW) / canvas.width;
    pdf.addImage(imgData, "PNG", margin, margin, contentW, imgH);
    pdf.save(filename);
    toast.success("PDF downloaded");
  } catch {
    toast.error("PDF export failed");
  }
}

function handlePrint(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<html><head><title>Income Statement</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
      * { box-sizing: border-box; }
    </style></head><body>${el.innerHTML}</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

export function IncomeStatementTab({ data, dateRangeLabel, expenses = [] }: IncomeStatementTabProps) {
  const s: Structured = data.structured ?? {
    revenue: 0, cogs: 0, grossProfit: 0, grossProfitPct: 0,
    sgaAdmin: 0, otherOperatingIncome: 0,
    ebitda: 0, ebitdaPct: 0, depreciation: 0, interestExpense: 0, ebit: 0,
    interestIncome: 0, otherIncome: 0, nonOperatingIncome: 0,
    profitBeforeTax: 0, taxProvision: 0,
    netProfit: 0, netProfitPct: 0, cashProfit: 0,
    prev: {
      revenue: 0, cogs: 0, grossProfit: 0, sgaAdmin: 0, otherOperatingIncome: 0,
      ebitda: 0, depreciation: 0, interestExpense: 0, ebit: 0,
      interestIncome: 0, otherIncome: 0, nonOperatingIncome: 0,
      profitBeforeTax: 0, taxProvision: 0, netProfit: 0, cashProfit: 0,
    },
  };

  const [drill, setDrill] = useState<{ open: boolean; title: string; line: PLLine | null }>({ open: false, title: "", line: null });
  const filtered = useMemo(
    () => drill.line ? expenses.filter((e) => ((e as any).pl_line || "sga_admin") === drill.line) : [],
    [drill.line, expenses]
  );
  const openDrill = (line: PLLine) => {
    const label = PL_LINES.find((p) => p.value === line)?.label || line;
    setDrill({ open: true, title: label, line });
  };

  const isLoss = s.netProfit < 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-lg font-bold">Income Statement</h2>
          <p className="text-xs text-muted-foreground">Period: {dateRangeLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => handlePrint("income-statement")}>
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF("income-statement", `income-statement-${dateRangeLabel.replace(/\s/g, "-")}.pdf`)}>
            <Download className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Revenue" value={formatOMR(s.revenue)} sub={`Prev: ${formatOMR(s.prev.revenue)}`} />
        <SummaryCard label="Gross Profit %" value={pct(s.grossProfitPct)} sub={`GP: ${formatOMR(s.grossProfit)}`} accent={s.grossProfit >= 0 ? "profit" : "loss"} />
        <SummaryCard label="EBITDA %" value={pct(s.ebitdaPct)} sub={`EBITDA: ${formatOMR(s.ebitda)}`} accent={s.ebitda >= 0 ? "profit" : "loss"} />
        <SummaryCard label={isLoss ? "Net Loss" : "Net Profit"} value={fmt(s.netProfit)} sub={`Margin: ${pct(s.netProfitPct)}`} accent={isLoss ? "loss" : "profit"} />
      </div>

      <Card id="income-statement">
        <CardContent className="p-4 sm:p-6">
          <div className="text-center mb-4">
            <h3 className="text-base font-bold uppercase tracking-wider">LAVANDERIA</h3>
            <p className="text-xs text-muted-foreground">Income Statement — {dateRangeLabel}</p>
          </div>

          <div className="grid grid-cols-[1fr_auto_auto] gap-6 px-2 pb-2 mb-2 border-b text-xs uppercase tracking-wider text-muted-foreground">
            <span>Line Item</span>
            <span className="w-28 text-right">Previous</span>
            <span className="w-32 text-right">Current</span>
          </div>

          <div className="space-y-2">
            {/* GROSS SALES / REVENUE */}
            <Section title="Revenue">
              <Line
                label="Gross Sales / Revenue"
                current={s.revenue} previous={s.prev.revenue} indent
                onClick={() => openDrill("revenue")}
              />
            </Section>

            {/* COGS → Gross Profit */}
            <Section title="Cost of Sales">
              <Line
                label="(Cost of Goods Sold)"
                current={s.cogs} previous={s.prev.cogs} indent negative
                onClick={() => openDrill("cogs")}
              />
              <Subtotal
                label="Gross Profit"
                current={s.grossProfit} previous={s.prev.grossProfit}
                pctValue={s.grossProfitPct}
                accent={s.grossProfit >= 0 ? "profit" : "loss"}
              />
            </Section>

            {/* OPERATING EXPENSES → EBITDA */}
            <Section title="Operating">
              <Line
                label="(S, G & A) incl depcn - admn"
                current={s.sgaAdmin} previous={s.prev.sgaAdmin} indent negative
                onClick={() => openDrill("sga_admin")}
              />
              <Line
                label="Other Operating Income"
                current={s.otherOperatingIncome} previous={s.prev.otherOperatingIncome} indent
                onClick={() => openDrill("other_operating_income")}
              />
              <Subtotal
                label="EBITDA"
                current={s.ebitda} previous={s.prev.ebitda}
                pctValue={s.ebitdaPct}
                accent={s.ebitda >= 0 ? "profit" : "loss"}
              />
            </Section>

            {/* DEPRECIATION & INTEREST → EBIT */}
            <Section title="Depreciation & Interest">
              <Line
                label="(Depreciation / Amortization) - total"
                current={s.depreciation} previous={s.prev.depreciation} indent negative
                onClick={() => openDrill("depreciation")}
              />
              <Line
                label="(Interest Expenses)"
                current={s.interestExpense} previous={s.prev.interestExpense} indent negative
                onClick={() => openDrill("interest_expense")}
              />
              <Subtotal
                label="Operating Profit (OP) [EBIT]"
                current={s.ebit} previous={s.prev.ebit}
                accent={s.ebit >= 0 ? "profit" : "loss"}
              />
            </Section>

            {/* NON-OPERATING INCOME → PBT */}
            <Section title="Non-operating Income" defaultOpen={false}>
              <Line
                label="Interest Income"
                current={s.interestIncome} previous={s.prev.interestIncome} indent
                onClick={() => openDrill("interest_income")}
              />
              <Line
                label="Other Income"
                current={s.otherIncome} previous={s.prev.otherIncome} indent
                onClick={() => openDrill("other_income")}
              />
              <Subtotal
                label="Profit / (Loss) before Tax"
                current={s.profitBeforeTax} previous={s.prev.profitBeforeTax}
                accent={s.profitBeforeTax >= 0 ? "profit" : "loss"}
              />
            </Section>

            {/* TAX → NET PROFIT */}
            <Section title="Tax">
              <Line
                label="(Provision for Tax)"
                current={s.taxProvision} previous={s.prev.taxProvision} indent negative
                onClick={() => openDrill("tax_provision")}
              />
            </Section>

            {/* RESULT */}
            <div className="pt-4 border-t-2 mt-4">
              <Subtotal
                label={isLoss ? "Net Loss" : "Net Profit / (Loss)"}
                current={s.netProfit} previous={s.prev.netProfit}
                pctValue={s.netProfitPct}
                accent={isLoss ? "loss" : "profit"}
              />
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-6 py-2 px-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  {isLoss ? <TrendingDown className="h-4 w-4 text-destructive" /> : <TrendingUp className="h-4 w-4 text-[hsl(142,72%,40%)]" />}
                  Cash Profit / (Loss) — Net Profit + Depreciation
                </span>
                <span className="text-xs w-28 text-right tabular-nums">{fmt(s.prev.cashProfit)}</span>
                <span className={`font-semibold w-32 text-right tabular-nums ${profitClass(s.cashProfit)}`}>{fmt(s.cashProfit)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <DrillDownModal
        open={drill.open}
        onClose={() => setDrill({ open: false, title: "", line: null })}
        title={drill.title}
        expenses={filtered}
      />
    </div>
  );
}
