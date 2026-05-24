import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Loader2, Bot, Pencil, Wallet, AlertTriangle } from "lucide-react";
import { formatOMR } from "@/lib/currency";
import {
  type Expense, PL_LINES, deriveLifecycleStatus, statusBadgeClass, statusLabel,
} from "@/lib/expense-queries";

interface ExpenseTableProps {
  expenses: Expense[];
  loading: boolean;
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onPay: (expense: Expense) => void;
}

const PL_LABEL: Record<string, string> = Object.fromEntries(PL_LINES.map((l) => [l.value, l.label]));

export function ExpenseTable({ expenses, loading, onDelete, onEdit, onPay }: ExpenseTableProps) {
  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (expenses.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No expenses for this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Due</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-24">P&amp;L</TableHead>
            <TableHead className="w-16">Source</TableHead>
            <TableHead className="w-32 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((exp) => {
            const status = deriveLifecycleStatus(exp);
            const due = exp.due_date || exp.expense_date;
            return (
              <TableRow key={exp.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {due}
                  {status === "overdue" && (
                    <span className="block text-[10px] text-destructive flex items-center gap-0.5 mt-0.5">
                      <AlertTriangle className="h-3 w-3" /> Overdue
                    </span>
                  )}
                </TableCell>
                <TableCell><Badge variant="secondary">{exp.category}</Badge></TableCell>
                <TableCell className="text-sm">{exp.description || "—"}</TableCell>
                <TableCell className="text-right font-semibold">{formatOMR(exp.amount)}</TableCell>
                <TableCell className="text-right text-success">{formatOMR(exp.paid_amount)}</TableCell>
                <TableCell className={`text-right ${exp.remaining_amount > 0.001 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {formatOMR(exp.remaining_amount)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${statusBadgeClass(status)}`}>
                    {statusLabel(status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-[11px] text-muted-foreground">
                    {PL_LABEL[exp.pl_line] || exp.pl_line || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  {exp.is_auto_generated ? (
                    <Badge variant="outline" className="text-[10px] gap-1"><Bot className="h-3 w-3" /> Auto</Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Manual</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {exp.remaining_amount > 0.001 && (
                      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onPay(exp)} title="Add payment">
                        <Wallet className="h-3.5 w-3.5 mr-1" /> Pay
                      </Button>
                    )}
                    {exp.remaining_amount <= 0.001 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onPay(exp)} title="View payments">
                        <Wallet className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(exp)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(exp.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
