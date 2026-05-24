import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const backfill: boolean = !!body?.backfill;

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const currentDay = today.getDate();

    const { data: recurring, error: fetchErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("is_recurring", true)
      .eq("is_auto_generated", false)
      .not("billing_day", "is", null);

    if (fetchErr) throw fetchErr;

    let generated = 0;

    for (const rec of recurring || []) {
      const targetDates: string[] = [];

      if (backfill) {
        // Catch-up: generate for every missing month between created_at month and current month
        const startDate = new Date(rec.created_at);
        let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const endCursor = new Date(today.getFullYear(), today.getMonth(), 1);
        while (cursor <= endCursor) {
          const maxDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
          const day = Math.min(rec.billing_day, maxDay);
          const occurrence = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          if (occurrence <= today) {
            targetDates.push(occurrence.toISOString().split("T")[0]);
          }
          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }
      } else {
        // Standard daily run: only today's occurrence if due
        if (rec.next_run_date && rec.next_run_date > todayStr) continue;
        if (!rec.next_run_date && rec.billing_day !== currentDay) continue;
        targetDates.push(todayStr);
      }

      for (const targetDate of targetDates) {
        const monthStart = `${targetDate.slice(0, 7)}-01`;
        const monthEnd = new Date(parseInt(targetDate.slice(0, 4)), parseInt(targetDate.slice(5, 7)), 0)
          .toISOString().split("T")[0];

        const { data: existing } = await supabase
          .from("expenses")
          .select("id")
          .eq("parent_recurring_id", rec.id)
          .gte("expense_date", monthStart)
          .lte("expense_date", monthEnd)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { error: insertErr } = await supabase.from("expenses").insert({
          expense_date: targetDate,
          due_date: targetDate,
          category: rec.category,
          description: `${rec.description || rec.category} (auto-generated)`,
          amount: rec.amount,
          paid_amount: 0,
          remaining_amount: rec.amount,
          is_recurring: false,
          recurring_period: null,
          is_auto_generated: true,
          parent_recurring_id: rec.id,
          expense_status: "accrued",
          pl_line: rec.pl_line || "sga_admin",
          income_category: rec.income_category || "other_opex",
          payment_source: rec.payment_source || "cash",
          cash_amount: 0,
          bank_amount: 0,
        });

        if (insertErr) {
          console.error(`Failed to generate expense for ${rec.id}:`, insertErr);
          continue;
        }
        generated++;
      }

      // Advance template scheduling
      const nextDate = calcNextRunDate(rec.billing_day, rec.recurring_period, todayStr);
      await supabase.from("expenses").update({
        next_run_date: nextDate,
        last_run_date: todayStr,
      }).eq("id", rec.id);
    }

    return new Response(JSON.stringify({ success: true, generated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-recurring-expenses error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function calcNextRunDate(billingDay: number, period: string | null, fromDate: string): string {
  const d = new Date(fromDate);
  switch (period) {
    case "Weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "Yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    case "Monthly":
    default:
      d.setMonth(d.getMonth() + 1);
      const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(billingDay, maxDay));
      break;
  }
  return d.toISOString().split("T")[0];
}
