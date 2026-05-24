import { useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Users, Download, Search, Filter, ChevronUp, ChevronDown, MessageSquare,
  StickyNote, ExternalLink, X, Crown, AlertTriangle, Clock, UserCheck, UserX,
} from "lucide-react";
import { formatOMR } from "@/lib/currency";
import { downloadCSV } from "@/lib/report-exports";
import type { CustomerRecord } from "@/types/customer";
import { useNavigate } from "react-router-dom";

type CustomerSegment = "all" | "vip" | "returning" | "new" | "at-risk" | "dormant";
type SortKey = "name" | "orders" | "spent" | "avgOrder" | "lastDate" | "balance";
type SortDir = "asc" | "desc";

interface EnrichedCustomer {
  name: string;
  phone: string;
  orders: number;
  spent: number;
  avgOrder: number;
  lastDate: string;
  balance: number;
  segment: CustomerSegment;
  daysSinceLastOrder: number;
}

interface CustomersTabProps {
  allCustomers: CustomerRecord[];
  newCustomers: CustomerRecord[];
  topCustomers: { name: string; phone: string; spent: number; orders: number; balance: number; lastDate: string }[];
}

function classifyCustomer(c: { orders: number; spent: number; daysSinceLastOrder: number }): CustomerSegment {
  if (c.daysSinceLastOrder > 90) return "dormant";
  if (c.daysSinceLastOrder > 45) return "at-risk";
  if (c.orders >= 5 && c.spent >= 10) return "vip";
  if (c.orders > 1) return "returning";
  return "new";
}

const SEGMENT_CONFIG: Record<CustomerSegment, { label: string; color: string; icon: React.ElementType }> = {
  all: { label: "All", color: "bg-muted text-muted-foreground", icon: Users },
  vip: { label: "VIP", color: "bg-amber-500/15 text-amber-600 border-amber-500/30", icon: Crown },
  returning: { label: "Returning", color: "bg-primary/15 text-primary border-primary/30", icon: UserCheck },
  new: { label: "New", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: UserCheck },
  "at-risk": { label: "At Risk", color: "bg-orange-500/15 text-orange-600 border-orange-500/30", icon: AlertTriangle },
  dormant: { label: "Dormant", color: "bg-destructive/15 text-destructive border-destructive/30", icon: UserX },
};

function daysBetween(dateStr: string): number {
  if (!dateStr) return 9999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

export function CustomersTab({ allCustomers, newCustomers, topCustomers }: CustomersTabProps) {
  const navigate = useNavigate();

  // Filters
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<CustomerSegment>("all");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "with" | "without" | "above">("all");
  const [balanceThreshold, setBalanceThreshold] = useState("");
  const [minOrders, setMinOrders] = useState("");
  const [maxOrders, setMaxOrders] = useState("");
  const [minSpent, setMinSpent] = useState("");
  const [maxSpent, setMaxSpent] = useState("");
  const [inactiveDays, setInactiveDays] = useState("");
  const [activeDays, setActiveDays] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("spent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Enrich customers
  const enriched: EnrichedCustomer[] = useMemo(() => {
    return topCustomers.map((c) => {
      const days = daysBetween(c.lastDate);
      return {
        ...c,
        avgOrder: c.orders > 0 ? c.spent / c.orders : 0,
        daysSinceLastOrder: days,
        segment: classifyCustomer({ orders: c.orders, spent: c.spent, daysSinceLastOrder: days }),
      };
    });
  }, [topCustomers]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = enriched;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    }
    if (segmentFilter !== "all") {
      result = result.filter((c) => c.segment === segmentFilter);
    }
    if (balanceFilter === "with") result = result.filter((c) => c.balance > 0);
    if (balanceFilter === "without") result = result.filter((c) => c.balance <= 0);
    if (balanceFilter === "above" && balanceThreshold) {
      const th = parseFloat(balanceThreshold);
      if (!isNaN(th)) result = result.filter((c) => c.balance > th);
    }
    if (minOrders) { const v = parseInt(minOrders); if (!isNaN(v)) result = result.filter((c) => c.orders >= v); }
    if (maxOrders) { const v = parseInt(maxOrders); if (!isNaN(v)) result = result.filter((c) => c.orders <= v); }
    if (minSpent) { const v = parseFloat(minSpent); if (!isNaN(v)) result = result.filter((c) => c.spent >= v); }
    if (maxSpent) { const v = parseFloat(maxSpent); if (!isNaN(v)) result = result.filter((c) => c.spent <= v); }
    if (inactiveDays) { const v = parseInt(inactiveDays); if (!isNaN(v)) result = result.filter((c) => c.daysSinceLastOrder >= v); }
    if (activeDays) { const v = parseInt(activeDays); if (!isNaN(v)) result = result.filter((c) => c.daysSinceLastOrder <= v); }

    return result;
  }, [enriched, search, segmentFilter, balanceFilter, balanceThreshold, minOrders, maxOrders, minSpent, maxSpent, inactiveDays, activeDays]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "orders": cmp = a.orders - b.orders; break;
        case "spent": cmp = a.spent - b.spent; break;
        case "avgOrder": cmp = a.avgOrder - b.avgOrder; break;
        case "lastDate": cmp = (a.lastDate || "").localeCompare(b.lastDate || ""); break;
        case "balance": cmp = a.balance - b.balance; break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronDown className="h-3 w-3 opacity-30" />;
    return sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />;
  };

  // Segment counts
  const segmentCounts = useMemo(() => {
    const counts: Record<CustomerSegment, number> = { all: enriched.length, vip: 0, returning: 0, new: 0, "at-risk": 0, dormant: 0 };
    enriched.forEach((c) => { counts[c.segment]++; });
    return counts;
  }, [enriched]);

  // KPIs
  const kpis = useMemo(() => ({
    totalCustomers: enriched.length,
    totalRevenue: enriched.reduce((s, c) => s + c.spent, 0),
    avgLifetimeValue: enriched.length > 0 ? enriched.reduce((s, c) => s + c.spent, 0) / enriched.length : 0,
    totalOutstanding: enriched.reduce((s, c) => s + c.balance, 0),
    atRiskCount: segmentCounts["at-risk"] + segmentCounts.dormant,
  }), [enriched, segmentCounts]);

  // Bulk
  const toggleAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((c) => c.phone)));
  };
  const toggleOne = (phone: string) => {
    const next = new Set(selected);
    if (next.has(phone)) next.delete(phone); else next.add(phone);
    setSelected(next);
  };

  const exportSelected = () => {
    const rows = (selected.size > 0 ? sorted.filter((c) => selected.has(c.phone)) : sorted);
    downloadCSV(rows.map((c) => ({
      Name: c.name, Phone: c.phone, Orders: c.orders,
      "Total Spent": c.spent.toFixed(3), "Avg Order": c.avgOrder.toFixed(3),
      "Outstanding": c.balance.toFixed(3), "Last Order": c.lastDate, Segment: c.segment,
      "Days Since Last Order": c.daysSinceLastOrder === 9999 ? "Never" : c.daysSinceLastOrder,
    })), "customer-intelligence");
  };

  const clearFilters = () => {
    setSearch(""); setSegmentFilter("all"); setBalanceFilter("all");
    setBalanceThreshold(""); setMinOrders(""); setMaxOrders("");
    setMinSpent(""); setMaxSpent(""); setInactiveDays(""); setActiveDays("");
  };

  const hasActiveFilters = search || segmentFilter !== "all" || balanceFilter !== "all" || minOrders || maxOrders || minSpent || maxSpent || inactiveDays || activeDays;

  if (allCustomers.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">No customer data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Customers", value: kpis.totalCustomers.toString(), accent: "text-primary" },
          { label: "Total Revenue", value: formatOMR(kpis.totalRevenue), accent: "text-primary" },
          { label: "Avg Lifetime Value", value: formatOMR(kpis.avgLifetimeValue), accent: "text-[hsl(var(--success))]" },
          { label: "Outstanding Balance", value: formatOMR(kpis.totalOutstanding), accent: "text-destructive" },
          { label: "At Risk / Dormant", value: kpis.atRiskCount.toString(), accent: "text-orange-600" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-3">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{kpi.label}</span>
              <p className={`text-lg font-bold mt-0.5 ${kpi.accent}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Segment Pills */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(SEGMENT_CONFIG) as CustomerSegment[]).map((seg) => {
          const cfg = SEGMENT_CONFIG[seg];
          const Icon = cfg.icon;
          return (
            <button
              key={seg}
              onClick={() => setSegmentFilter(seg)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${segmentFilter === seg ? cfg.color + " ring-2 ring-offset-1 ring-primary/30" : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"}`}
            >
              <Icon className="h-3 w-3" />
              {cfg.label}
              <span className="ml-0.5 opacity-70">({segmentCounts[seg]})</span>
            </button>
          );
        })}
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="h-4 w-4 mr-1" />
          Filters
          {hasActiveFilters && <span className="ml-1 h-2 w-2 rounded-full bg-primary" />}
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={exportSelected}>
          <Download className="h-4 w-4 mr-1" />
          {selected.size > 0 ? `Export ${selected.size}` : `Export All (${sorted.length})`}
        </Button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Balance</label>
                <Select value={balanceFilter} onValueChange={(v: any) => setBalanceFilter(v)}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="with">With Balance</SelectItem>
                    <SelectItem value="without">Without Balance</SelectItem>
                    <SelectItem value="above">Balance Above...</SelectItem>
                  </SelectContent>
                </Select>
                {balanceFilter === "above" && (
                  <Input placeholder="OMR..." value={balanceThreshold} onChange={(e) => setBalanceThreshold(e.target.value)} className="h-8 text-xs mt-1" />
                )}
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Orders Range</label>
                <div className="flex gap-1 mt-1">
                  <Input placeholder="Min" value={minOrders} onChange={(e) => setMinOrders(e.target.value)} className="h-8 text-xs" />
                  <Input placeholder="Max" value={maxOrders} onChange={(e) => setMaxOrders(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Spending Range (OMR)</label>
                <div className="flex gap-1 mt-1">
                  <Input placeholder="Min" value={minSpent} onChange={(e) => setMinSpent(e.target.value)} className="h-8 text-xs" />
                  <Input placeholder="Max" value={maxSpent} onChange={(e) => setMaxSpent(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Activity (Days)</label>
                <div className="flex gap-1 mt-1">
                  <Input placeholder="Inactive ≥" value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} className="h-8 text-xs" />
                  <Input placeholder="Active ≤" value={activeDays} onChange={(e) => setActiveDays(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {sorted.length} of {enriched.length} customers
          {selected.size > 0 && <span className="ml-2 font-medium text-primary">• {selected.size} selected</span>}
        </p>
      </div>

      {/* Customer Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={sorted.length > 0 && selected.size === sorted.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    <span className="inline-flex items-center gap-1">Customer <SortIcon col="name" /></span>
                  </TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort("orders")}>
                    <span className="inline-flex items-center gap-1">Orders <SortIcon col="orders" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("spent")}>
                    <span className="inline-flex items-center gap-1 justify-end">Total Spent <SortIcon col="spent" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("avgOrder")}>
                    <span className="inline-flex items-center gap-1 justify-end">Avg Order <SortIcon col="avgOrder" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastDate")}>
                    <span className="inline-flex items-center gap-1">Last Order <SortIcon col="lastDate" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("balance")}>
                    <span className="inline-flex items-center gap-1 justify-end">Balance <SortIcon col="balance" /></span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      No customers match the current filters
                    </TableCell>
                  </TableRow>
                ) : sorted.map((c) => {
                  const seg = SEGMENT_CONFIG[c.segment];
                  return (
                    <TableRow key={c.phone} className={selected.has(c.phone) ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Checkbox checked={selected.has(c.phone)} onCheckedChange={() => toggleOne(c.phone)} />
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{c.phone}</TableCell>
                      <TableCell className="text-center">{c.orders}</TableCell>
                      <TableCell className="text-right font-medium">{formatOMR(c.spent)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatOMR(c.avgOrder)}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {c.lastDate || "—"}
                          {c.daysSinceLastOrder < 9999 && (
                            <span className="block text-[10px] text-muted-foreground">{c.daysSinceLastOrder}d ago</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.balance > 0
                          ? <span className="text-destructive font-medium">{formatOMR(c.balance)}</span>
                          : <span className="text-muted-foreground">{formatOMR(0)}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${seg.color}`}>
                          {seg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            title="View Orders"
                            onClick={() => navigate(`/customers?search=${encodeURIComponent(c.phone)}`)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            title="WhatsApp"
                            onClick={() => window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}`, "_blank")}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
