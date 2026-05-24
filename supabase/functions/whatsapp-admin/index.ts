import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function mask(value: string | undefined | null, keep = 4): string {
  if (!value) return "";
  if (value.length <= keep) return "•".repeat(value.length);
  return "•".repeat(Math.max(value.length - keep, 4)) + value.slice(-keep);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth: require admin
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden: admin only" }, 403);

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || (await safeJson(req))?.action;
    const body = req.method === "POST" ? await safeJson(req) : null;

    const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
    const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
    const VERIFY_TOKEN = Deno.env.get("VERIFY_TOKEN") || Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
    const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") || "";

    // Load settings (graph version)
    const { data: settings } = await admin.from("whatsapp_settings").select("*").limit(1).maybeSingle();
    const GRAPH_VERSION = settings?.graph_api_version || "v18.0";

    if (action === "status") {
      // Last success / failure from notification_logs
      const [{ data: lastSuccess }, { data: lastFailure }, { data: lastIncoming }] = await Promise.all([
        admin.from("notification_logs").select("created_at").eq("send_status", "sent")
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("notification_logs").select("created_at, error_message").eq("send_status", "failed")
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        admin.from("whatsapp_messages").select("created_at").eq("type", "incoming")
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      // Token health: hit Graph API
      let tokenHealthy = false;
      let displayPhone = "";
      let healthError = "";
      if (TOKEN && PHONE_ID) {
        try {
          const res = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}?fields=display_phone_number,verified_name`,
            { headers: { Authorization: `Bearer ${TOKEN}` } },
          );
          const data = await res.json();
          if (res.ok) {
            tokenHealthy = true;
            displayPhone = data.display_phone_number || "";
          } else {
            healthError = data?.error?.message || `HTTP ${res.status}`;
          }
        } catch (e) {
          healthError = String(e);
        }
      } else {
        healthError = "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID";
      }

      const projectId = supabaseUrl.replace("https://", "").split(".")[0];
      const webhookUrl = `https://${projectId}.functions.supabase.co/whatsapp-webhook`;

      return json({
        connected: tokenHealthy,
        token_healthy: tokenHealthy,
        token_health_error: healthError,
        masked_token: mask(TOKEN, 6),
        masked_phone_number_id: mask(PHONE_ID, 4),
        display_phone_number: displayPhone,
        graph_api_version: GRAPH_VERSION,
        last_success_at: lastSuccess?.created_at || null,
        last_failure_at: lastFailure?.created_at || null,
        last_failure_message: lastFailure?.error_message || null,
        last_incoming_at: lastIncoming?.created_at || null,
        webhook_url: webhookUrl,
        masked_verify_token: mask(VERIFY_TOKEN, 4),
        masked_app_secret: mask(APP_SECRET, 4),
        has_verify_token: !!VERIFY_TOKEN,
        has_app_secret: !!APP_SECRET,
      });
    }

    if (action === "test_connection") {
      if (!TOKEN || !PHONE_ID) return json({ success: false, error: "Missing credentials" });
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${TOKEN}` } },
      );
      const data = await res.json();
      return json({ success: res.ok, status: res.status, data });
    }

    if (action === "test_template") {
      const phone = String(body?.phone || "").replace(/\D/g, "");
      const templateName = String(body?.template_name || "");
      const language = String(body?.language || "ar");
      if (!phone || !templateName) return json({ success: false, error: "phone and template_name required" }, 400);
      if (!TOKEN || !PHONE_ID) return json({ success: false, error: "Missing credentials" }, 400);

      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: { name: templateName, language: { code: language } },
          }),
        },
      );
      const data = await res.json();
      return json({ success: res.ok, status: res.status, data });
    }

    // Validate proposed credentials WITHOUT storing them.
    // Used by the admin UI to verify a token/phone-id pair against Graph API
    // before the admin manually saves them in Lovable Cloud secrets.
    if (action === "validate_secrets") {
      const proposedToken = String(body?.access_token || "").trim();
      const proposedPhoneId = String(body?.phone_number_id || "").trim();
      if (!proposedToken || !proposedPhoneId) {
        return json({ success: false, error: "access_token and phone_number_id required" }, 400);
      }
      try {
        const res = await fetch(
          `https://graph.facebook.com/${GRAPH_VERSION}/${proposedPhoneId}?fields=display_phone_number,verified_name,quality_rating`,
          { headers: { Authorization: `Bearer ${proposedToken}` } },
        );
        const data = await res.json();
        if (!res.ok) {
          return json({
            success: false,
            status: res.status,
            error: data?.error?.message || `HTTP ${res.status}`,
          });
        }
        return json({
          success: true,
          display_phone_number: data?.display_phone_number || "",
          verified_name: data?.verified_name || "",
          quality_rating: data?.quality_rating || "",
          requires_manual_update: true,
          instructions: [
            "Open Lovable Cloud → Backend → Edge Function Secrets.",
            "Update WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, VERIFY_TOKEN, WHATSAPP_APP_SECRET as needed.",
            "Save changes. Then click 'Test Connection' here to verify.",
          ],
        });
      } catch (e) {
        return json({ success: false, error: String(e) });
      }
    }


    if (action === "dashboard_stats") {
      const from = String(body?.from || "");
      const to = String(body?.to || "");
      if (!from || !to) return json({ error: "from and to required (ISO)" }, 400);

      const costRates = (settings?.cost_rates as any) || {};
      const outstanding = Number(settings?.outstanding_unpaid_cost || 0);

      // Outgoing notification logs in window
      const { data: logs } = await admin
        .from("notification_logs")
        .select("*")
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false });

      // Incoming whatsapp_messages in window
      const { data: incomingRows } = await admin
        .from("notification_logs")
        .select("id")
        .gte("created_at", from)
        .lte("created_at", to)
        .eq("direction", "incoming");

      const { data: waMessages } = await admin
        .from("whatsapp_messages")
        .select("type, created_at, phone")
        .gte("created_at", from)
        .lte("created_at", to);

      const all = logs || [];
      const outgoing = all.filter((r: any) => (r.direction || "outgoing") === "outgoing");
      const incoming = (waMessages || []).filter((m: any) => m.type === "incoming");
      const outgoingChat = (waMessages || []).filter((m: any) => m.type === "outgoing");

      const counts = {
        sent: 0, delivered: 0, read: 0, failed: 0, pending: 0, skipped: 0,
      };
      let estimatedCost = 0;
      for (const r of outgoing) {
        const s = String(r.send_status || "pending");
        if (s in counts) (counts as any)[s]++;
        estimatedCost += Number(r.estimated_cost || 0);
      }

      const totalSent = outgoing.length;
      const deliveredOrRead = counts.delivered + counts.read;
      const deliveryRate = totalSent ? (deliveredOrRead + counts.sent) / totalSent : 0;

      // Status breakdown with %
      const statusBreakdown = Object.entries(counts).map(([k, v]) => ({
        status: k,
        count: v,
        percent: totalSent ? Math.round((v / totalSent) * 1000) / 10 : 0,
      }));

      // Daily series
      const dayMap: Record<string, { date: string; sent: number; failed: number; cost: number }> = {};
      for (const r of outgoing) {
        const d = String(r.created_at).slice(0, 10);
        if (!dayMap[d]) dayMap[d] = { date: d, sent: 0, failed: 0, cost: 0 };
        if (r.send_status === "failed") dayMap[d].failed++;
        else dayMap[d].sent++;
        dayMap[d].cost += Number(r.estimated_cost || 0);
      }
      const daily = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

      // Template usage
      const tplMap: Record<string, any> = {};
      for (const r of outgoing) {
        const name = r.template_name || r.message_type || "unknown";
        const k = `${name}|${r.template_language || ""}|${r.event_type || ""}`;
        if (!tplMap[k]) {
          tplMap[k] = {
            template_name: name,
            language: r.template_language || "",
            event_type: r.event_type || "",
            category: r.template_category || "",
            sent: 0, delivered: 0, failed: 0, cost: 0,
          };
        }
        const t = tplMap[k];
        if (r.send_status === "failed") t.failed++;
        else if (r.send_status === "delivered" || r.send_status === "read") {
          t.delivered++; t.sent++;
        } else if (r.send_status === "sent") t.sent++;
        t.cost += Number(r.estimated_cost || 0);
      }
      const templateUsage = Object.values(tplMap).map((t: any) => ({
        ...t,
        success_rate: t.sent ? Math.round((t.delivered / t.sent) * 1000) / 10 : 0,
      }));

      // Error groups
      const errMap: Record<string, any> = {};
      const failedRows = outgoing.filter((r: any) => r.send_status === "failed");
      for (const r of failedRows) {
        const code = r.error_code || "UNKNOWN";
        if (!errMap[code]) {
          errMap[code] = { code, count: 0, last_at: null, last_message: r.error_message };
        }
        errMap[code].count++;
        if (!errMap[code].last_at || r.created_at > errMap[code].last_at) {
          errMap[code].last_at = r.created_at;
          errMap[code].last_message = r.error_message;
        }
      }
      const errorGroups = Object.values(errMap).sort((a: any, b: any) => b.count - a.count);

      const latestFailures = failedRows.slice(0, 20).map((r: any) => ({
        id: r.id,
        created_at: r.created_at,
        phone: r.recipient_phone,
        template_name: r.template_name || r.message_type,
        error_code: r.error_code,
        error_message: r.error_message,
      }));

      // Top recipient by message count
      const phoneMap: Record<string, number> = {};
      for (const r of outgoing) {
        const p = r.recipient_phone || "";
        phoneMap[p] = (phoneMap[p] || 0) + 1;
      }
      const topRecipient = Object.entries(phoneMap).sort((a, b) => b[1] - a[1])[0] || null;

      // Top templates
      const topTemplate = templateUsage.sort((a: any, b: any) => b.sent - a.sent)[0] || null;
      const topFailureTemplate = templateUsage.sort((a: any, b: any) => b.failed - a.failed)[0] || null;

      // Month-to-date cost
      const now = new Date();
      const mtdFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: mtdLogs } = await admin
        .from("notification_logs")
        .select("estimated_cost")
        .gte("created_at", mtdFrom);
      const mtdCost = (mtdLogs || []).reduce((s: number, r: any) => s + Number(r.estimated_cost || 0), 0);

      return json({
        kpis: {
          total_messages: totalSent + incoming.length,
          outgoing: totalSent,
          incoming: incoming.length,
          sent: counts.sent + counts.delivered + counts.read,
          delivered: deliveredOrRead,
          failed: counts.failed,
          pending: counts.pending,
          delivery_rate: Math.round(deliveryRate * 1000) / 10,
          estimated_cost: estimatedCost,
          mtd_cost: mtdCost,
          outstanding_cost: outstanding,
          currency: costRates.currency || "OMR",
        },
        status_breakdown: statusBreakdown,
        daily,
        template_usage: templateUsage,
        error_groups: errorGroups,
        latest_failures: latestFailures,
        insights: {
          top_template: topTemplate,
          top_failure_template: topFailureTemplate,
          top_recipient: topRecipient ? { phone: topRecipient[0], count: topRecipient[1] } : null,
          last_success_at: outgoing.find((r: any) => r.send_status !== "failed")?.created_at || null,
          last_failure_at: failedRows[0]?.created_at || null,
          last_incoming_at: incoming[0]?.created_at || null,
        },
        cost_rates: costRates,
        outstanding_unpaid_cost: outstanding,
      });
    }

    if (action === "retry_failed_message") {
      const logId = String(body?.log_id || "");
      if (!logId) return json({ error: "log_id required" }, 400);
      const { data: log } = await admin.from("notification_logs").select("*").eq("id", logId).maybeSingle();
      if (!log) return json({ error: "Log not found" }, 404);

      // Re-invoke send-whatsapp for ready_for_pickup; otherwise simple template send
      try {
        if (log.order_id && (log.message_type === "ready_for_pickup" || log.template_name === "order_ready_pdf_ar")) {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({
              order_id: log.order_id,
              customer_id: log.customer_id,
              customer_phone: log.recipient_phone,
              message_type: log.message_type,
              template_name: log.template_name || "order_ready_pdf_ar",
              template_language: log.template_language || "ar",
              template_category: log.template_category || "utility",
              event_type: log.event_type,
            }),
          });
          const data = await res.json();
          return json({ success: !!data.success, data });
        }
        // Generic template retry
        if (TOKEN && PHONE_ID && log.template_name) {
          const r = await fetch(
            `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: log.recipient_phone,
                type: "template",
                template: {
                  name: log.template_name,
                  language: { code: log.template_language || "ar" },
                },
              }),
            },
          );
          const data = await r.json();
          return json({ success: r.ok, data });
        }
        return json({ success: false, error: "Cannot retry: missing template/order info" });
      } catch (e) {
        return json({ success: false, error: String(e) });
      }
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("whatsapp-admin error:", error);
    return json({ error: String(error) }, 500);
  }
});

async function safeJson(req: Request): Promise<any> {
  try {
    return await req.clone().json();
  } catch {
    return null;
  }
}
