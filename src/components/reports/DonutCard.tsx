import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

interface DonutCardProps {
  title: string;
  data: DonutSlice[];
  centerValue: string | number;
  centerLabel: string;
  formatValue?: (v: number) => string;
  emptyMessage?: string;
  colors?: string[];
}

const DEFAULT_COLORS = [
  "hsl(var(--primary))",
  "hsl(142, 72%, 40%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(200, 70%, 50%)",
  "hsl(280, 50%, 55%)",
  "hsl(170, 60%, 45%)",
  "hsl(15, 80%, 55%)",
];

export function DonutCard({
  title,
  data,
  centerValue,
  centerLabel,
  formatValue = (v) => String(v),
  emptyMessage = "No data",
  colors = DEFAULT_COLORS,
}: DonutCardProps) {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardContent className="pt-6 pb-5">
        <h3 className="text-sm font-semibold mb-4">{title}</h3>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">{emptyMessage}</p>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center gap-5">
            {/* Donut with center value */}
            <div className="relative shrink-0 mx-auto md:mx-0">
              <ChartContainer
                config={{ value: { label: title } }}
                className="h-[170px] w-[170px] aspect-square"
              >
                <PieChart>
                  <Pie
                    data={filtered}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={58}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {filtered.map((d, i) => (
                      <Cell key={i} fill={d.color || colors[i % colors.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-6 text-center">
                <p className="text-base font-bold tracking-tight leading-tight break-words">{centerValue}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{centerLabel}</p>
              </div>
            </div>

            {/* Legend table */}
            <div className="flex-1 w-full min-w-0">
              <div className="space-y-1.5">
                {filtered.map((d, i) => {
                  const pct = total > 0 ? (d.value / total) * 100 : 0;
                  return (
                    <div
                      key={d.name}
                      className="grid grid-cols-[12px_minmax(0,1fr)_auto_48px] items-center gap-2 text-sm py-1"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: d.color || colors[i % colors.length] }}
                      />
                      <span className="truncate text-foreground" title={d.name}>{d.name}</span>
                      <span className="font-semibold tabular-nums whitespace-nowrap">{formatValue(d.value)}</span>
                      <span className="text-xs text-muted-foreground tabular-nums text-right">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
